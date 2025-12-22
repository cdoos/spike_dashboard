import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import DockableWidget from './DockableWidget';
import './MultiPanelView.css';

const MultiPanelView = forwardRef(({ selectedDataset, clusteringResults, selectedAlgorithm, datasetInfo }, ref) => {
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

  // Widget state management
  const [widgetStates, setWidgetStates] = useState({
    clusterList: { visible: true, minimized: false, maximized: false, order: 1 },
    spikeList: { visible: true, minimized: false, maximized: false, order: 2 },
    clusterStats: { visible: true, minimized: false, maximized: false, order: 3 },
    signalView: { visible: true, minimized: false, maximized: false, order: 4 },
    dimReduction: { visible: true, minimized: false, maximized: false, order: 5 },
    waveform: { visible: true, minimized: false, maximized: false, order: 6 }
  });

  // Clear all data when algorithm changes
  useEffect(() => {
    console.log(`[${selectedAlgorithm}] Algorithm changed, clearing all data`);
    setClusters([]);
    setSelectedClusters([]);
    setSpikes([]);
    setSelectedSpike(null);
    setClusterStats({});
    setClusterData(null);
    setClusterWaveforms({});
    setNeighboringChannels({});
    setHighlightedSpikes([]);
  }, [selectedAlgorithm]);

  // Fetch cluster list on mount or when clustering results change
  useEffect(() => {
    fetchClusterList();
  }, [selectedDataset, clusteringResults, selectedAlgorithm]);

  // Auto-select clusters 0, 1, 2 for Preprocessed Kilosort
  useEffect(() => {
    if (selectedAlgorithm === 'preprocessed_kilosort' && clusters.length > 0 && selectedClusters.length === 0) {
      const defaultClusters = [0, 1, 2].filter(id => clusters.some(c => c.id === id));
      if (defaultClusters.length > 0) {
        setSelectedClusters(defaultClusters);
        console.log('Auto-selected clusters:', defaultClusters);
      }
    }
  }, [clusters, selectedAlgorithm]);

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

  // Fetch spikes when clusters are selected or when clusterData becomes available
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
  }, [selectedClusters, clusterData, clusteringResults]);

  // Fetch cluster list from API
  const fetchClusterList = async () => {
    try {
      console.log(`[${selectedAlgorithm}] Fetching cluster list...`);
      
      // Use algorithm results if available (TorchBCI JimsAlgorithm or Kilosort4)
      if (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') {
        if (clusteringResults && clusteringResults.available) {
          console.log(`Using ${selectedAlgorithm} results for cluster list`);
          
          // Convert clustering results to cluster list format
          const clusterList = clusteringResults.clusters.map((clusterSummary) => ({
            id: clusterSummary.clusterId,
            size: clusterSummary.numSpikes
          }));
          
          setClusters(clusterList);
          console.log(`Loaded ${clusterList.length} clusters from ${selectedAlgorithm}`);
        } else {
          console.log(`${selectedAlgorithm} selected but not run yet - keeping cluster list empty`);
          setClusters([]);
        }
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
      
      // Use algorithm results if available (TorchBCI JimsAlgorithm or Kilosort4)
      if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
        console.log(`Using ${selectedAlgorithm} results for spike list`);
        
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

    let pointIndex = -1;

    // Convert spike time to number for consistent comparison
    const spikeTimeNum = Number(spike.time);

    // Find the point index in the appropriate data structure
    if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
      // For algorithm results, search in clusteringResults
      if (clusteringResults.fullData && clusteringResults.fullData[spike.clusterId]) {
        const clusterSpikes = clusteringResults.fullData[spike.clusterId];
        // Use tolerant comparison to handle floating point precision issues
        pointIndex = clusterSpikes.findIndex(s => Math.abs(Number(s.time) - spikeTimeNum) < 0.01);
        
        if (pointIndex === -1) {
          console.warn(`Could not find spike at time ${spikeTimeNum} in cluster ${spike.clusterId}`);
          console.log('Available times:', clusterSpikes.map(s => s.time).slice(0, 10));
        }
      }
    } else if (clusterData && clusterData.clusters) {
      // For Preprocessed Kilosort, search in clusterData
      const cluster = clusterData.clusters.find(c => c.clusterId === spike.clusterId);
      if (cluster && cluster.spikeTimes) {
        // Use tolerant comparison to handle floating point precision issues
        pointIndex = cluster.spikeTimes.findIndex(t => Math.abs(Number(t) - spikeTimeNum) < 0.01);
        
        if (pointIndex === -1) {
          console.warn(`Could not find spike at time ${spikeTimeNum} in cluster ${spike.clusterId}`);
          console.log('Available times:', cluster.spikeTimes.slice(0, 10));
        }
      }
    }

    if (pointIndex !== -1) {
      // Highlight in dimensionality reduction plot and waveform view
      setHighlightedSpikes([{
        clusterId: spike.clusterId,
        pointIndex: pointIndex,
        time: spike.time
      }]);

      // Update time range to center on spike
      const newStart = Math.max(0, spike.time - 500);
      const newEnd = spike.time + 500;
      setTimeRange({ start: newStart, end: newEnd });
    } else {
      console.error(`Failed to find point index for spike at time ${spikeTimeNum}, cluster ${spike.clusterId}`);
    }
  };

  // Handle spike click from dimensionality reduction plot
  const handleDimReductionSpikeClick = (clusterId, pointIndex) => {
    let spikeTime = null;

    // Get spike time from the appropriate data structure
    if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
      // For algorithm results, get from clusteringResults
      if (clusteringResults.fullData && clusteringResults.fullData[clusterId] && clusteringResults.fullData[clusterId][pointIndex]) {
        spikeTime = clusteringResults.fullData[clusterId][pointIndex].time;
      }
    } else if (clusterData && clusterData.clusters) {
      // For Preprocessed Kilosort, get from clusterData
      const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
      if (cluster && cluster.spikeTimes && cluster.spikeTimes[pointIndex]) {
        spikeTime = cluster.spikeTimes[pointIndex];
      }
    }

    if (spikeTime !== null) {
      const spikeTimeNum = Number(spikeTime);
      // Find spike in spike list with tolerant comparison
      const spikeIndex = spikes.findIndex(s => 
        s.clusterId === clusterId && Math.abs(Number(s.time) - spikeTimeNum) < 0.01
      );
      
      if (spikeIndex !== -1) {
        handleSpikeSelect(spikeIndex, spikes[spikeIndex]);
      } else {
        console.warn(`Could not find spike in spike list at time ${spikeTimeNum}, cluster ${clusterId}`);
      }
    }
  };


  // Widget management handlers
  const handleToggleWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: !prev[widgetId].visible,
        minimized: false
      }
    }));
  };

  const handleMinimizeWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        minimized: !prev[widgetId].minimized,
        maximized: false
      }
    }));
  };

  const handleMaximizeWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        maximized: !prev[widgetId].maximized,
        minimized: false
      }
    }));
  };

  const handleCloseWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: false
      }
    }));
  };

  const handleResetLayout = () => {
    setWidgetStates({
      clusterList: { visible: true, minimized: false, maximized: false, order: 1 },
      spikeList: { visible: true, minimized: false, maximized: false, order: 2 },
      clusterStats: { visible: true, minimized: false, maximized: false, order: 3 },
      signalView: { visible: true, minimized: false, maximized: false, order: 4 },
      dimReduction: { visible: true, minimized: false, maximized: false, order: 5 },
      waveform: { visible: true, minimized: false, maximized: false, order: 6 }
    });
    
    // Reset widget sizes and positions by removing inline styles
    document.querySelectorAll('.dockable-widget').forEach(widget => {
      widget.style.width = '';
      widget.style.height = '';
      widget.style.flex = '';
      widget.style.zIndex = '';
    });
    
    // Reset panel positions
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.left = '';
      panel.style.top = '';
    });
  };

  // Get widget list for toolbar
  const getWidgetList = () => [
    { id: 'clusterList', name: 'Cluster List', visible: widgetStates.clusterList.visible },
    { id: 'spikeList', name: 'Spike List Table', visible: widgetStates.spikeList.visible },
    { id: 'clusterStats', name: 'Cluster Statistics Window', visible: widgetStates.clusterStats.visible },
    { id: 'signalView', name: 'Signal View', visible: widgetStates.signalView.visible },
    { id: 'dimReduction', name: 'Dimensionality Reduction Plot View (PCA)', visible: widgetStates.dimReduction.visible },
    { id: 'waveform', name: 'Waveform View', visible: widgetStates.waveform.visible }
  ];

  // Expose methods and state to parent component via ref
  useImperativeHandle(ref, () => ({
    getWidgetList,
    handleToggleWidget,
    handleResetLayout,
    widgetStates
  }), [widgetStates]);

  // Trigger resize event for child components when widget size changes
  useEffect(() => {
    const handleWidgetResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    
    // Small delay to allow DOM to update
    const timer = setTimeout(handleWidgetResize, 100);
    return () => clearTimeout(timer);
  }, [widgetStates]);

  return (
    <div className="multi-panel-view">
      {/* Top Row */}
      <div className="panel-row panel-row-top">
        {widgetStates.clusterList.visible && (
          <div className="panel panel-cluster-list">
            <DockableWidget
              id="clusterList"
              title="Cluster List"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.clusterList.minimized}
              isMaximized={widgetStates.clusterList.maximized}
            >
              <ClusterListTable
                clusters={clusters}
                selectedClusters={selectedClusters}
                onClusterToggle={handleClusterToggle}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.spikeList.visible && (
          <div className="panel panel-spike-list">
            <DockableWidget
              id="spikeList"
              title="Spike List Table"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.spikeList.minimized}
              isMaximized={widgetStates.spikeList.maximized}
            >
              <SpikeListTable
                spikes={spikes}
                selectedSpike={selectedSpike}
                onSpikeSelect={handleSpikeSelect}
                selectedClusters={selectedClusters}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.clusterStats.visible && (
          <div className="panel panel-cluster-stats">
            <DockableWidget
              id="clusterStats"
              title="Cluster Statistics Window"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.clusterStats.minimized}
              isMaximized={widgetStates.clusterStats.maximized}
            >
              <ClusterStatisticsWindow
                selectedClusters={selectedClusters}
                clusterStats={clusterStats}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.signalView.visible && (
          <div className="panel panel-signal-view">
            <DockableWidget
              id="signalView"
              title="Signal View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.signalView.minimized}
              isMaximized={widgetStates.signalView.maximized}
            >
              <SignalViewPanel
                highlightedSpikes={highlightedSpikes}
                datasetInfo={datasetInfo}
              />
            </DockableWidget>
          </div>
        )}
      </div>

      {/* Bottom Row */}
      <div className="panel-row panel-row-bottom">
        {widgetStates.dimReduction.visible && (
          <div className="panel panel-dim-reduction">
            <DockableWidget
              id="dimReduction"
              title="Dimensionality Reduction Plot View (PCA)"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.dimReduction.minimized}
              isMaximized={widgetStates.dimReduction.maximized}
            >
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
            </DockableWidget>
          </div>
        )}

        {widgetStates.waveform.visible && (
          <div className="panel panel-waveform">
            <DockableWidget
              id="waveform"
              title="Waveform View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              isMinimized={widgetStates.waveform.minimized}
              isMaximized={widgetStates.waveform.maximized}
            >
              <div className="waveform-view-toggle">
                <button
                  className={waveformViewMode === 'single' ? 'active' : ''}
                  onClick={() => setWaveformViewMode('single')}
                >
                  Single Channel
                </button>
                <button
                  className={waveformViewMode === 'neighboring' ? 'active' : ''}
                  onClick={() => setWaveformViewMode('neighboring')}
                >
                  Multi Channel
                </button>
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
                  selectedAlgorithm={selectedAlgorithm}
                />
              )}
            </DockableWidget>
          </div>
        )}
      </div>
    </div>
  );
});

MultiPanelView.displayName = 'MultiPanelView';

export default MultiPanelView;
