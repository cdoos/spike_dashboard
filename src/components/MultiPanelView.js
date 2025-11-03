import React, { useState, useEffect, useRef } from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import './MultiPanelView.css';

const MultiPanelView = ({ selectedDataset, clusteringResults, selectedAlgorithm }) => {
  // State management
  const [clusters, setClusters] = useState([]);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [selectedSpike, setSelectedSpike] = useState(null);
  const [clusterStats, setClusterStats] = useState({});
  const [clusterData, setClusterData] = useState(null);
  const [clusterWaveforms, setClusterWaveforms] = useState({});
  const [neighboringChannels, setNeighboringChannels] = useState({});
  const [signalData, setSignalData] = useState(null);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 1000 });
  const [highlightedSpikes, setHighlightedSpikes] = useState([]);
  const [waveformViewMode, setWaveformViewMode] = useState('single'); // 'single' or 'neighboring'

  // Panel size state
  const [panelSizes, setPanelSizes] = useState({
    topRow: {
      clusterList: 180,
      spikeList: 220,
      clusterStats: null, // flex: 1
      signalView: null // flex: 2
    },
    rowSplit: 35, // percentage - adjusted for better balance
    bottomRow: {
      dimReduction: null, // flex: 1
      waveform: null // flex: 1
    }
  });

  // Refs for resize
  const resizeRef = useRef({
    isResizing: false,
    resizeType: null,
    startX: 0,
    startY: 0,
    startSize: 0
  });

  // Fetch cluster list on mount or when clustering results change
  useEffect(() => {
    fetchClusterList();
  }, [selectedDataset, clusteringResults, selectedAlgorithm]);

  // Cleanup Plotly instances on unmount
  useEffect(() => {
    return () => {
      // Clean up Plotly instances to prevent memory leaks
      const plotlyElements = document.querySelectorAll('.js-plotly-plot');
      plotlyElements.forEach((el) => {
        if (window.Plotly && window.Plotly.purge) {
          window.Plotly.purge(el);
        }
      });
    };
  }, []);

  // Fetch spikes when clusters are selected
  useEffect(() => {
    if (selectedClusters.length > 0) {
      fetchSpikesForClusters();
      fetchClusterStatistics();
      fetchClusterWaveforms();
    } else {
      setSpikes([]);
      setClusterStats({});
      setClusterWaveforms({});
    }
  }, [selectedClusters]);

  // Fetch cluster list from API
  const fetchClusterList = async () => {
    try {
      console.log(`[${selectedAlgorithm}] Fetching cluster list...`);
      
      // Use TorchBCI JimsAlgorithm results if available
      if (selectedAlgorithm === 'torchbci_jims' && clusteringResults && clusteringResults.available) {
        console.log('Using TorchBCI JimsAlgorithm results for cluster list');
        
        // Convert clustering results to cluster list format
        const clusterList = clusteringResults.clusters.map((clusterSummary) => ({
          id: clusterSummary.clusterId,
          size: clusterSummary.numSpikes
        }));
        
        setClusters(clusterList);
        console.log(`Loaded ${clusterList.length} clusters from JimsAlgorithm`);
        return;
      }
      
      // Otherwise fetch from API (Preprocessed Kilosort)
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/cluster-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'real',
          channelMapping: {},
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterData(data);

        // Create cluster list for table
        const clusterList = data.clusterIds.map(id => ({ id }));
        setClusters(clusterList);

        console.log(`Loaded ${clusterList.length} clusters`);
      }
    } catch (error) {
      console.error('Error fetching cluster list:', error);
    }
  };

  // Fetch spikes for selected clusters
  const fetchSpikesForClusters = async () => {
    try {
      console.log(`[${selectedAlgorithm}] Fetching spikes for clusters:`, selectedClusters);
      
      // Use TorchBCI JimsAlgorithm results if available
      if (selectedAlgorithm === 'torchbci_jims' && clusteringResults && clusteringResults.available) {
        console.log('Using TorchBCI JimsAlgorithm results for spike list');
        
        const allSpikes = [];
        
        selectedClusters.forEach(clusterId => {
          if (clusterId < clusteringResults.fullData.length) {
            const clusterSpikes = clusteringResults.fullData[clusterId];
            clusterSpikes.forEach((spike) => {
              allSpikes.push({
                time: spike.time,
                clusterId: clusterId,
                channel: spike.channel
              });
            });
          }
        });
        
        // Sort by time
        allSpikes.sort((a, b) => a.time - b.time);
        
        setSpikes(allSpikes);
        console.log(`Loaded ${allSpikes.length} spikes from JimsAlgorithm for ${selectedClusters.length} clusters`);
        return;
      }
      
      // Otherwise use clusterData from API (Preprocessed Kilosort)
      if (!clusterData || !clusterData.clusters) return;

      const allSpikes = [];

      selectedClusters.forEach(clusterId => {
        const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
        if (cluster && cluster.spikeTimes) {
          cluster.spikeTimes.forEach(time => {
            if (time !== null) {
              allSpikes.push({
                time: time,
                clusterId: clusterId
              });
            }
          });
        }
      });

      // Sort by time
      allSpikes.sort((a, b) => a.time - b.time);

      setSpikes(allSpikes);
      console.log(`Loaded ${allSpikes.length} spikes for ${selectedClusters.length} clusters`);
    } catch (error) {
      console.error('Error fetching spikes:', error);
    }
  };

  // Fetch cluster statistics
  const fetchClusterStatistics = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/cluster-statistics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterIds: selectedClusters,
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterStats(data.statistics || {});
        console.log(`[${selectedAlgorithm}] Loaded cluster statistics:`, data.statistics);
      }
    } catch (error) {
      console.error('Error fetching cluster statistics:', error);
    }
  };

  // Fetch cluster waveforms
  const fetchClusterWaveforms = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/cluster-waveforms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterIds: selectedClusters,
          maxWaveforms: 50,
          windowSize: 30,
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterWaveforms(data.waveforms || {});
        console.log(`[${selectedAlgorithm}] Loaded cluster waveforms:`, Object.keys(data.waveforms || {}).length, 'clusters');
      }
    } catch (error) {
      console.error('Error fetching cluster waveforms:', error);
    }
  };

  // Handle cluster selection toggle
  const handleClusterToggle = (clusterId) => {
    setSelectedClusters(prev => {
      if (prev.includes(clusterId)) {
        return prev.filter(id => id !== clusterId);
      } else {
        return [...prev, clusterId];
      }
    });
  };

  // Handle spike selection from table
  const handleSpikeSelect = (index, spike) => {
    setSelectedSpike(index);

    // Find the point index in the cluster data
    if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find(c => c.clusterId === spike.clusterId);
      if (cluster && cluster.spikeTimes) {
        const pointIndex = cluster.spikeTimes.findIndex(t => t === spike.time);

        // Highlight in dimensionality reduction plot
        setHighlightedSpikes([{
          clusterId: spike.clusterId,
          pointIndex: pointIndex,
          time: spike.time
        }]);

        // Update time range to center on spike
        const newStart = Math.max(0, spike.time - 500);
        const newEnd = spike.time + 500;
        setTimeRange({ start: newStart, end: newEnd });
      }
    }
  };

  // Handle spike click from dimensionality reduction plot
  const handleDimReductionSpikeClick = (clusterId, pointIndex) => {
    if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
      if (cluster && cluster.spikeTimes && cluster.spikeTimes[pointIndex]) {
        const spikeTime = cluster.spikeTimes[pointIndex];

        // Find spike in spike list
        const spikeIndex = spikes.findIndex(s => s.clusterId === clusterId && s.time === spikeTime);
        if (spikeIndex !== -1) {
          handleSpikeSelect(spikeIndex, spikes[spikeIndex]);
        }
      }
    }
  };

  // Resize handlers
  const handleResizeStart = (e, resizeType) => {
    e.preventDefault();
    resizeRef.current = {
      isResizing: true,
      resizeType: resizeType,
      startX: e.clientX,
      startY: e.clientY,
      startSize: resizeType.includes('cluster-list') ? panelSizes.topRow.clusterList :
                 resizeType.includes('spike-list') ? panelSizes.topRow.spikeList :
                 resizeType.includes('row-split') ? panelSizes.rowSplit : 0
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e) => {
    if (!resizeRef.current.isResizing) return;

    const { resizeType, startX, startY, startSize } = resizeRef.current;

    if (resizeType === 'cluster-list') {
      const deltaX = e.clientX - startX;
      const newSize = Math.max(120, Math.min(350, startSize + deltaX));
      setPanelSizes(prev => ({
        ...prev,
        topRow: { ...prev.topRow, clusterList: newSize }
      }));
    } else if (resizeType === 'spike-list') {
      const deltaX = e.clientX - startX;
      const newSize = Math.max(170, Math.min(400, startSize + deltaX));
      setPanelSizes(prev => ({
        ...prev,
        topRow: { ...prev.topRow, spikeList: newSize }
      }));
    } else if (resizeType === 'row-split') {
      const deltaY = e.clientY - startY;
      const containerHeight = document.querySelector('.multi-panel-view').clientHeight;
      const deltaPercent = (deltaY / containerHeight) * 100;
      const newPercent = Math.max(15, Math.min(70, startSize + deltaPercent));
      setPanelSizes(prev => ({
        ...prev,
        rowSplit: newPercent
      }));
    }
  };

  const handleResizeEnd = () => {
    resizeRef.current.isResizing = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  };

  return (
    <div className="multi-panel-view">
      {/* Top Row */}
      <div
        className="panel-row panel-row-top"
        style={{ flex: `0 0 ${panelSizes.rowSplit}%` }}
      >
        <div
          className="panel panel-cluster-list"
          style={{ flex: `0 0 ${panelSizes.topRow.clusterList}px` }}
        >
          <ClusterListTable
            clusters={clusters}
            selectedClusters={selectedClusters}
            onClusterToggle={handleClusterToggle}
          />
          <div
            className="resize-handle resize-handle-vertical"
            onMouseDown={(e) => handleResizeStart(e, 'cluster-list')}
          />
        </div>

        <div
          className="panel panel-spike-list"
          style={{ flex: `0 0 ${panelSizes.topRow.spikeList}px` }}
        >
          <SpikeListTable
            spikes={spikes}
            selectedSpike={selectedSpike}
            onSpikeSelect={handleSpikeSelect}
            selectedClusters={selectedClusters}
          />
          <div
            className="resize-handle resize-handle-vertical"
            onMouseDown={(e) => handleResizeStart(e, 'spike-list')}
          />
        </div>

        <div className="panel panel-cluster-stats">
          <ClusterStatisticsWindow
            selectedClusters={selectedClusters}
            clusterStats={clusterStats}
          />
        </div>

        <div className="panel panel-signal-view">
          <SignalViewPanel
            highlightedSpikes={highlightedSpikes}
          />
        </div>
      </div>

      {/* Row Split Resize Handle */}
      <div
        className="resize-handle resize-handle-horizontal"
        style={{
          position: 'relative',
          height: '6px',
          cursor: 'row-resize',
          background: 'transparent',
          zIndex: 100
        }}
        onMouseDown={(e) => handleResizeStart(e, 'row-split')}
      />

      {/* Bottom Row */}
      <div className="panel-row panel-row-bottom">
        <div className="panel panel-dim-reduction">
          <DimensionalityReductionPanel
            clusterData={clusterData}
            selectedClusters={selectedClusters}
            clusteringResults={clusteringResults}
            selectedAlgorithm={selectedAlgorithm}
            selectedSpike={highlightedSpikes.length > 0 ? {
              clusterId: highlightedSpikes[0].clusterId,
              pointIndex: highlightedSpikes[0].pointIndex
            } : null}
            onSpikeClick={handleDimReductionSpikeClick}
          />
        </div>

        <div className="panel panel-waveform">
          <div className="waveform-view-toggle">
            <button
              className={waveformViewMode === 'single' ? 'active' : ''}
              onClick={() => setWaveformViewMode('single')}
            >
              Single Channel
            </button>
            {/* Neighboring Channels - Not implemented yet */}
            {/* <button
              className={waveformViewMode === 'neighboring' ? 'active' : ''}
              onClick={() => setWaveformViewMode('neighboring')}
            >
              Neighboring Channels
            </button> */}
          </div>

          {waveformViewMode === 'single' ? (
            <WaveformSingleChannelView
              selectedClusters={selectedClusters}
              clusterWaveforms={clusterWaveforms}
              highlightedSpike={highlightedSpikes.length > 0 ? {
                clusterId: highlightedSpikes[0].clusterId,
                waveformIdx: highlightedSpikes[0].pointIndex
              } : null}
            />
          ) : (
            <WaveformNeighboringChannelsView
              selectedClusters={selectedClusters}
              clusterWaveforms={clusterWaveforms}
              neighboringChannels={neighboringChannels}
              highlightedSpike={highlightedSpikes.length > 0 ? {
                clusterId: highlightedSpikes[0].clusterId,
                waveformIdx: highlightedSpikes[0].pointIndex
              } : null}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiPanelView;
