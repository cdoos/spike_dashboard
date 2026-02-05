import React, { useState, useEffect, useRef } from 'react';
import Plot from 'react-plotly.js';
import './ClusterView.css';

const ClusterView = ({ selectedDataset, onNavigateToSpike, clusteringResults, selectedAlgorithm }) => {
  const [clusterData, setClusterData] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [spikePreview, setSpikePreview] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState({ 0: 179, 1: 181, 2: 183 });
  const [filterType, setFilterType] = useState('highpass');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [overlaySpikes, setOverlaySpikes] = useState([]);
  const [isLoadingOverlay, setIsLoadingOverlay] = useState(false);
  const [mode, setMode] = useState('synthetic'); // 'synthetic', 'real', or 'algorithm'
  const [channelMapping, setChannelMapping] = useState({}); // clusterId -> channelId mapping
  const [showChannelMappingModal, setShowChannelMappingModal] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState([]); // Track which clusters are selected
  const clickTimeoutRef = useRef(null);
  const lastClickRef = useRef(null);

  // Determine which data source to use based on selected algorithm
  useEffect(() => {
    // Algorithm results (TorchBCI JimsAlgorithm or Kilosort4) - only use data if Run button was clicked
    if (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') {
      if (clusteringResults && clusteringResults.available) {
        console.log(`Using ${selectedAlgorithm} results`);
        setMode('algorithm');
        setClusterData(convertClusteringResultsToClusterData(clusteringResults));
      } else {
        console.log(`Waiting for ${selectedAlgorithm} to run...`);
        setClusterData(null); // Clear any previous data
      }
    }
    // Kilosort4 - only use data if Run button was clicked
    else if (selectedAlgorithm === 'kilosort4') {
      console.log('ClusterView: Kilosort4 selected');
      console.log('  - clusteringResults:', !!clusteringResults);
      console.log('  - clusteringResults.available:', clusteringResults?.available);
      console.log('  - clusteringResults.fullData:', !!clusteringResults?.fullData);
      console.log('  - fullData length:', clusteringResults?.fullData?.length);
      
      if (clusteringResults && clusteringResults.available) {
        console.log('Using Kilosort4 results - converting to cluster data...');
        try {
          const converted = convertClusteringResultsToClusterData(clusteringResults);
          console.log('Conversion successful:', converted.numClusters, 'clusters');
          setMode('algorithm');
          setClusterData(converted);
        } catch (error) {
          console.error('Error converting clustering results:', error);
        }
      } else {
        console.log('Waiting for Kilosort4 to run...');
        setClusterData(null); // Clear any previous data
      }
    }
    // Preprocessed TorchBCI - fetch from API (precomputed results)
    else if (selectedAlgorithm === 'preprocessed_torchbci') {
      console.log('Using Preprocessed TorchBCI data');
      fetchClusterData('preprocessed_torchbci');
    }
    // Preprocessed Kilosort4 - fetch from API (precomputed results)
    else if (selectedAlgorithm === 'preprocessed_kilosort4') {
      console.log('Using Preprocessed Kilosort4 data');
      fetchClusterData('preprocessed_kilosort4');
    }
    // Default fallback
    else {
      fetchClusterData();
    }

    // Reset channels to default for c46 dataset
    if (selectedDataset === 'c46') {
      setSelectedChannels({ 0: 179, 1: 181, 2: 183 });
    }
  }, [selectedDataset, mode, channelMapping, clusteringResults, selectedAlgorithm]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  // Re-fetch spike preview when filter type changes
  useEffect(() => {
    if (hoveredPoint) {
      fetchSpikePreview(hoveredPoint.cluster, hoveredPoint.index);
    }
  }, [filterType]);

  const convertClusteringResultsToClusterData = (results) => {
    // Convert from backend clustering results format to ClusterView format
    const clusters = results.fullData.map((clusterSpikes, clusterIdx) => {
      // For PCA plot: x, y are the PCA coordinates
      // For spike list/waveforms: we need the actual time and channel from metadata
      return {
        x: clusterSpikes.map(spike => spike.x),  // PCA x-coordinate
        y: clusterSpikes.map(spike => spike.y),  // PCA y-coordinate
        points: clusterSpikes.map(spike => [spike.x, spike.y]),  // For compatibility
        spikeTimes: clusterSpikes.map(spike => spike.time),  // Actual spike time in samples
        spikeChannels: clusterSpikes.map(spike => spike.channel),  // Actual channel number
        clusterLabel: `Cluster ${clusterIdx}`,
        clusterId: clusterIdx,
        size: clusterSpikes.length,
        pointCount: clusterSpikes.length
      };
    });

    console.log(`Converted ${clusters.length} clusters from JimsAlgorithm results`);
    
    return {
      clusters: clusters,
      numClusters: results.numClusters,
      totalSpikes: results.totalSpikes,
      totalPoints: results.totalSpikes
    };
  };

  const fetchClusterData = async (algorithmOverride = null) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      let requestBody;
      if (mode === 'real') {
        // For real data, send mode and channel mapping
        requestBody = {
          mode: 'real',
          channelMapping: channelMapping
        };
      } else {
        // For synthetic data, send channel IDs
        const channelIds = [
          selectedChannels[0],
          selectedChannels[1],
          selectedChannels[2]
        ];
        requestBody = {
          mode: 'synthetic',
          channelIds: channelIds
        };
      }

      // Pass algorithm name to backend when needed (e.g. preprocessed_torchbci)
      if (algorithmOverride) {
        requestBody.algorithm = algorithmOverride;
      }

      const response = await fetch(`${apiUrl}/api/cluster-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        setClusterData(data);
        console.log('Cluster data loaded:', data);
      }
    } catch (error) {
      console.error('Error fetching cluster data:', error);
    }
  };

  const fetchSpikePreview = async (clusterIndex, pointIndex) => {
    setIsLoadingPreview(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      // Get cluster and channel info
      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        setIsLoadingPreview(false);
        return;
      }

      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];

      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        setIsLoadingPreview(false);
        return;
      }

      // Get channel ID based on mode
      let channelId;
      if (mode === 'algorithm' && (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4')) {
        // For algorithm results, channel comes from the clustering results
        channelId = cluster.spikeChannels && cluster.spikeChannels[pointIndex] 
          ? cluster.spikeChannels[pointIndex] 
          : 181;
      } else if (mode === 'real') {
        channelId = cluster.channelId || channelMapping[cluster.clusterId] || 181;
      } else {
        channelId = selectedChannels[clusterIndex];
      }
      
      console.log(`[${selectedAlgorithm}] Fetching spike preview - Cluster: ${clusterIndex}, Point: ${pointIndex}, Time: ${spikeTime}, Channel: ${channelId}`);
      
      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex,
          algorithm: selectedAlgorithm,  // Pass which algorithm is being used
          mode: mode  // Pass the mode (algorithm, real, synthetic)
        })
      });
      
      if (response.ok) {
        const preview = await response.json();
        setSpikePreview(preview);
      }
    } catch (error) {
      console.error('Error fetching spike preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePointHover = (event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const clusterIndex = point.customdata.clusterIdx;
      const pointIndex = point.customdata.pointIdx;
      
      setHoveredPoint({
        cluster: clusterIndex,
        index: pointIndex,
        x: point.x,
        y: point.y
      });
      
      fetchSpikePreview(clusterIndex, pointIndex);
    }
  };

  const handlePointUnhover = () => {
    setHoveredPoint(null);
    setSpikePreview(null);
  };

  const handlePointClick = (event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const clusterIndex = point.customdata.clusterIdx;
      const pointIndex = point.customdata.pointIdx;
      const channelId = selectedChannels[clusterIndex];
      
      // Detect double-click by checking if this is a second click within 300ms
      const now = Date.now();
      const lastClick = lastClickRef.current;
      
      if (lastClick && 
          lastClick.clusterIndex === clusterIndex && 
          lastClick.pointIndex === pointIndex &&
          now - lastClick.time < 300) {
        // Double click detected
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        lastClickRef.current = null;
        
        // Navigate to spike in spike detection view
        fetchSpikePreviewForNavigation(clusterIndex, pointIndex, channelId);
      } else {
        // First click - wait to see if there's a second click
        lastClickRef.current = { clusterIndex, pointIndex, time: now };
        
        // Clear any existing timeout
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
        
        // Set timeout for single click action
        clickTimeoutRef.current = setTimeout(() => {
          // Single click: Add spike to overlay
          addSpikeToOverlay(clusterIndex, pointIndex, channelId);
          lastClickRef.current = null;
          clickTimeoutRef.current = null;
        }, 300);
      }
    }
  };

  const addSpikeToOverlay = async (clusterIndex, pointIndex, channelId) => {
    setIsLoadingOverlay(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      
      // Get spike time from cluster data
      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        setIsLoadingOverlay(false);
        return;
      }
      
      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];
      
      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        setIsLoadingOverlay(false);
        return;
      }
      
      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex
        })
      });
      
      if (response.ok) {
        const preview = await response.json();
        
        // Check if this spike is already in the overlay
        const isDuplicate = overlaySpikes.some(
          s => s.spikeTime === spikeTime && s.channelId === channelId
        );
        
        if (!isDuplicate) {
          setOverlaySpikes(prev => [...prev, {
            ...preview,
            clusterIndex: clusterIndex,
            pointIndex: pointIndex,
            color: ['#FF6B6B', '#4ECDC4', '#FFD700'][clusterIndex]
          }]);
        }
      }
    } catch (error) {
      console.error('Error adding spike to overlay:', error);
    } finally {
      setIsLoadingOverlay(false);
    }
  };

  const removeSpikeFromOverlay = (index) => {
    setOverlaySpikes(prev => prev.filter((_, i) => i !== index));
  };

  const clearOverlay = () => {
    setOverlaySpikes([]);
  };

  const handleNavigateToSpikeFromOverlay = (spike) => {
    if (onNavigateToSpike) {
      const allClusterChannels = [selectedChannels[0], selectedChannels[1], selectedChannels[2]];
      onNavigateToSpike(spike.spikeTime, spike.channelId, allClusterChannels);
    }
  };

  const fetchSpikePreviewForNavigation = async (clusterIndex, pointIndex, channelId) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      
      // Get spike time from cluster data
      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        return;
      }
      
      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];
      
      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        return;
      }
      
      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex
        })
      });
      
      if (response.ok) {
        const preview = await response.json();
        // Navigate to the spike in Detected Spikes view with all 3 cluster channels
        if (onNavigateToSpike) {
          const allClusterChannels = [selectedChannels[0], selectedChannels[1], selectedChannels[2]];
          onNavigateToSpike(preview.spikeTime, channelId, allClusterChannels);
        }
      }
    } catch (error) {
      console.error('Error fetching spike for navigation:', error);
    }
  };

  const generatePlotData = () => {
    if (!clusterData) return [];

    const traces = [];
    const totalClusters = clusterData.numClusters || clusterData.clusters.length;
    const totalPoints = clusterData.totalPoints || 0;

    // Calculate dynamic point size based on total points
    let basePointSize = 10;
    if (totalPoints > 10000) basePointSize = 4;
    else if (totalPoints > 5000) basePointSize = 6;
    else if (totalPoints > 1000) basePointSize = 8;

    clusterData.clusters.forEach((cluster, clusterIdx) => {
      // Create a set of selected point indices for this cluster
      const selectedIndicesSet = new Set(
        overlaySpikes
          .filter(spike => spike.clusterIndex === clusterIdx)
          .map(spike => spike.pointIndex)
      );

      // Separate points into selected and unselected
      const unselectedX = [];
      const unselectedY = [];
      const unselectedIndices = [];
      const selectedX = [];
      const selectedY = [];
      const selectedPointIndices = [];

      cluster.points.forEach((point, pointIdx) => {
        if (selectedIndicesSet.has(pointIdx)) {
          selectedX.push(point[0]);
          selectedY.push(point[1]);
          selectedPointIndices.push(pointIdx);
        } else {
          unselectedX.push(point[0]);
          unselectedY.push(point[1]);
          unselectedIndices.push(pointIdx);
        }
      });

      const color = `hsl(${(cluster.clusterId * 137) % 360}, 70%, 60%)`;
      const clusterName = mode === 'real' ? `Cluster ${cluster.clusterId}` : `Cluster ${clusterIdx + 1}`;

      // Add unselected points trace
      if (unselectedX.length > 0) {
        traces.push({
          x: unselectedX,
          y: unselectedY,
          mode: 'markers',
          type: 'scattergl', // Use WebGL for better performance
          name: clusterName,
          marker: {
            size: basePointSize,
            color: color,
            opacity: 0.7,
            line: {
              color: color,
              width: 1
            }
          },
          customdata: unselectedIndices.map(idx => ({ clusterIdx, pointIdx: idx + 1, clusterId: cluster.clusterId })),
          hovertemplate: `<b>${clusterName}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
          showlegend: selectedX.length === 0 // Only show in legend if no selected points
        });
      }

      // Add selected points trace with different styling
      if (selectedX.length > 0) {
        traces.push({
          x: selectedX,
          y: selectedY,
          mode: 'markers',
          type: 'scattergl', // Use WebGL for better performance
          name: clusterName,
          marker: {
            size: basePointSize + 4,
            color: color,
            opacity: 1,
            line: {
              color: '#FFFFFF',
              width: 2
            },
            symbol: 'circle'
          },
          customdata: selectedPointIndices.map(idx => ({ clusterIdx, pointIdx: idx + 1, clusterId: cluster.clusterId })),
          hovertemplate: `<b>${clusterName} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`
        });
      }
    });

    return traces;
  };

  const generatePreviewPlot = () => {
    if (!spikePreview || !spikePreview.waveform) return null;

    // Calculate actual time points relative to spike time
    const spikeTime = spikePreview.spikeTime;
    const window = spikePreview.window || 10;
    const startTime = spikeTime - window;
    const timePoints = Array.from(
      { length: spikePreview.waveform.length }, 
      (_, i) => startTime + i
    );

    return {
      data: [
        {
          x: timePoints,
          y: spikePreview.waveform,
          type: 'scatter',
          mode: 'lines',
          line: { color: '#40e0d0', width: 2 },
          fill: 'tozeroy',
          fillcolor: 'rgba(64, 224, 208, 0.2)'
        },
        {
          // Vertical line at spike time
          x: [spikeTime, spikeTime],
          y: [Math.min(...spikePreview.waveform), Math.max(...spikePreview.waveform)],
          type: 'scatter',
          mode: 'lines',
          line: { color: 'rgba(255, 255, 255, 0.5)', width: 2, dash: 'dash' },
          hoverinfo: 'skip',
          showlegend: false
        }
      ],
      layout: {
        width: 300,
        height: 200,
        margin: { l: 40, r: 20, t: 30, b: 50 },
        paper_bgcolor: 'rgba(26, 26, 46, 0.95)',
        plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
        font: { color: '#e0e6ed', size: 10 },
        xaxis: {
          title: {
            text: 'Time (samples)',
            standoff: 15
          },
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          color: '#e0e6ed'
        },
        yaxis: {
          title: 'Amplitude',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          color: '#e0e6ed'
        },
        title: {
          text: `CH${spikePreview.channelId} - Point ${spikePreview.pointIndex}`,
          font: { size: 12, color: '#40e0d0' }
        },
        annotations: [{
          x: spikeTime,
          y: Math.max(...spikePreview.waveform),
          text: 'Spike',
          showarrow: false,
          yshift: 10,
          font: { color: 'rgba(255, 255, 255, 0.7)', size: 9 }
        }]
      },
      config: {
        displayModeBar: false,
        responsive: true
      }
    };
  };

  const generateOverlayPlot = () => {
    if (overlaySpikes.length === 0) return null;

    // Normalize all waveforms to start at time 0 (relative to spike)
    const traces = overlaySpikes.map((spike, idx) => {
      const window = spike.window || 10;
      const relativeTimePoints = Array.from(
        { length: spike.waveform.length },
        (_, i) => i - window
      );

      return {
        x: relativeTimePoints,
        y: spike.waveform,
        type: 'scatter',
        mode: 'lines',
        name: `Cluster ${spike.clusterIndex + 1} - CH${spike.channelId}`,
        line: { color: spike.color, width: 2 },
        hovertemplate: `<b>Cluster ${spike.clusterIndex + 1}</b><br>CH${spike.channelId} - Point ${spike.pointIndex}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
      };
    });

    // Add a vertical line at spike time (time 0)
    const allAmplitudes = overlaySpikes.flatMap(s => s.waveform);
    traces.push({
      x: [0, 0],
      y: [Math.min(...allAmplitudes), Math.max(...allAmplitudes)],
      type: 'scatter',
      mode: 'lines',
      line: { color: 'rgba(255, 255, 255, 0.3)', width: 2, dash: 'dash' },
      hoverinfo: 'skip',
      showlegend: false
    });

    return {
      data: traces,
      layout: {
        autosize: true,
        paper_bgcolor: 'rgba(26, 26, 46, 0.95)',
        plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
        font: { color: '#e0e6ed', size: 11 },
        xaxis: {
          title: 'Time Relative to Spike (samples)',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        yaxis: {
          title: 'Amplitude',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        hovermode: 'closest',
        showlegend: false,
        margin: { l: 60, r: 20, t: 20, b: 60 }
      },
      config: {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
      }
    };
  };

  const handleChannelChange = (clusterIndex, channelId) => {
    setSelectedChannels(prev => ({
      ...prev,
      [clusterIndex]: parseInt(channelId)
    }));
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setOverlaySpikes([]); // Clear overlay when switching modes
  };

  const handleChannelMappingChange = (clusterId, channelId) => {
    setChannelMapping(prev => ({
      ...prev,
      [clusterId]: parseInt(channelId) || null
    }));
  };

  const applyChannelMappings = () => {
    setShowChannelMappingModal(false);
    // Trigger re-fetch with new mappings
    fetchClusterData();
  };

  // Show message if waiting for algorithm to run
  if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && (!clusterData || !clusteringResults)) {
    const algorithmName = selectedAlgorithm === 'kilosort4' ? 'Kilosort4' : 'TorchBCI JimsAlgorithm';
    return (
      <div className="cluster-view">
        <div className="cluster-header">
          <h2>Spike Cluster Visualization</h2>
        </div>
        <div className="cluster-content" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: '1.2rem',
          color: '#888'
        }}>
          <div style={{ textAlign: 'center' }}>
            <p>No clustering results available</p>
            <p style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
              Click the <strong>Run</strong> button in the header to run {algorithmName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cluster-view">
      <div className="cluster-header">
        <h2>Spike Cluster Visualization</h2>
        <div className="cluster-controls">
          <div className="filter-selector">
            <label>Mode:</label>
            <select
              className="filter-select"
              value={mode}
              onChange={(e) => handleModeChange(e.target.value)}
            >
              <option value="synthetic">Synthetic (Demo)</option>
              <option value="real">Kilosort Data</option>
            </select>
          </div>
          <div className="filter-selector">
            <label>Filter Type:</label>
            <select
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="none">None (Raw Data)</option>
              <option value="highpass">High-pass (300 Hz)</option>
              <option value="lowpass">Low-pass (3000 Hz)</option>
              <option value="bandpass">Band-pass (300-3000 Hz)</option>
            </select>
          </div>
          {mode === 'synthetic' && (
            <div className="channel-selectors">
              {[0, 1, 2].map(clusterIdx => (
                <div key={clusterIdx} className="cluster-channel-select">
                  <label style={{ color: ['#FF6B6B', '#4ECDC4', '#FFD700'][clusterIdx] }}>
                    Cluster {clusterIdx + 1} Channel:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="385"
                    value={selectedChannels[clusterIdx]}
                    onChange={(e) => handleChannelChange(clusterIdx, e.target.value)}
                    className="channel-input"
                  />
                </div>
              ))}
            </div>
          )}
          {mode === 'real' && (
            <button
              className="channel-mapping-btn"
              onClick={() => setShowChannelMappingModal(true)}
            >
              Configure Channel Mapping
            </button>
          )}
        </div>
      </div>

      <div className="cluster-content">
        <div className="cluster-plot-container">
          <Plot
            data={generatePlotData()}
            layout={{
              autosize: true,
              uirevision: 'true',
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed' },
              xaxis: {
                title: 'Principal Component 1',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Principal Component 2',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              hovermode: 'closest',
              showlegend: true,
              legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(26, 26, 46, 0.8)',
                bordercolor: 'rgba(64, 224, 208, 0.3)',
                borderwidth: 1
              },
              margin: { l: 60, r: 20, t: 20, b: 60 }
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: '100%' }}
            onHover={handlePointHover}
            onUnhover={handlePointUnhover}
            onClick={handlePointClick}
          />
        </div>

        {overlaySpikes.length > 0 && (
          <div className="spike-overlay-container">
            <div className="overlay-header">
              <h3>Spike Overlay Comparison</h3>
              <div className="overlay-controls">
                <span className="spike-count">{overlaySpikes.length} spike{overlaySpikes.length !== 1 ? 's' : ''}</span>
                <button className="clear-overlay-btn" onClick={clearOverlay}>
                  Clear All
                </button>
              </div>
            </div>
            
            <div className="overlay-plot">
              {isLoadingOverlay ? (
                <div className="overlay-loading">Loading spike...</div>
              ) : (
                <Plot
                  data={generateOverlayPlot().data}
                  layout={generateOverlayPlot().layout}
                  config={generateOverlayPlot().config}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>
            
            <div className="overlay-spike-list-compact">
              <h4>Selected Spikes:</h4>
              <div className="spike-list-items-compact">
                {overlaySpikes.map((spike, idx) => (
                  <div key={idx} className="spike-list-item-compact" style={{ borderLeftColor: spike.color }}>
                    <div className="spike-item-info-compact">
                      <span className="spike-item-label-compact">
                        Cluster {spike.clusterIndex + 1} - CH{spike.channelId}
                      </span>
                      <span className="spike-item-time-compact">
                        Point {spike.pointIndex} (t={spike.spikeTime})
                      </span>
                    </div>
                    <div className="spike-item-actions-compact">
                      <button 
                        className="spike-item-nav-btn-compact" 
                        onClick={() => handleNavigateToSpikeFromOverlay(spike)}
                        title="Navigate to spike"
                      >
                        →
                      </button>
                      <button 
                        className="spike-item-remove-btn-compact" 
                        onClick={() => removeSpikeFromOverlay(idx)}
                        title="Remove from overlay"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {hoveredPoint && (
          <div className={`spike-preview-panel ${overlaySpikes.length > 0 ? 'with-overlay' : ''}`}>
            <div className="preview-info">
              <h3>Spike Preview</h3>
              <p>Cluster {hoveredPoint.cluster + 1} - Point {hoveredPoint.index}</p>
              <p>Channel: {selectedChannels[hoveredPoint.cluster]}</p>
              {spikePreview && <p>Time: {spikePreview.spikeTime} samples</p>}
              <p className="click-hint">Click: Add to overlay</p>
              <p className="click-hint">Double-click: Navigate to spike</p>
            </div>
            {isLoadingPreview ? (
              <div className="preview-loading">Loading...</div>
            ) : spikePreview && (
              <div className="preview-plot">
                <Plot
                  data={generatePreviewPlot().data}
                  layout={generatePreviewPlot().layout}
                  config={generatePreviewPlot().config}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Channel Mapping Modal for Kilosort Data */}
      {showChannelMappingModal && mode === 'real' && clusterData && (
        <div className="channel-mapping-modal-overlay" onClick={() => setShowChannelMappingModal(false)}>
          <div className="channel-mapping-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Channel Mapping Configuration</h3>
              <button className="modal-close" onClick={() => setShowChannelMappingModal(false)}>×</button>
            </div>
            <div className="modal-info">
              <p>Assign neural channels to each cluster for spike preview and navigation.</p>
              <p className="modal-hint">{clusterData.numClusters} clusters found • Leave blank to use default channel 181</p>
            </div>
            <div className="channel-mapping-list">
              {clusterData.clusterIds && clusterData.clusterIds.map((clusterId) => {
                const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
                const color = cluster ? `hsl(${(clusterId * 137) % 360}, 70%, 60%)` : '#888';
                return (
                  <div key={clusterId} className="channel-mapping-item">
                    <div className="cluster-info">
                      <div className="cluster-color-indicator" style={{ backgroundColor: color }}></div>
                      <span className="cluster-label">Cluster {clusterId}</span>
                      <span className="cluster-point-count">({cluster ? cluster.pointCount : 0} points)</span>
                    </div>
                    <div className="channel-input-container">
                      <label>Channel:</label>
                      <input
                        type="number"
                        min="1"
                        max="385"
                        placeholder="181"
                        value={channelMapping[clusterId] || ''}
                        onChange={(e) => handleChannelMappingChange(clusterId, e.target.value)}
                        className="channel-input-modal"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="modal-btn-secondary" onClick={() => setShowChannelMappingModal(false)}>
                Cancel
              </button>
              <button className="modal-btn-primary" onClick={applyChannelMappings}>
                Apply Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusterView;

