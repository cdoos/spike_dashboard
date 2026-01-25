import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VisualizationArea from './components/VisualizationArea';
import ClusterView from './components/ClusterView';
import MultiPanelView from './components/MultiPanelView';
import RuntimeAnalysisView from './components/RuntimeAnalysisView';
import Upload from './components/Upload';
import ConfirmDialog from './components/ConfirmDialog';
import AlgorithmParametersMenu from './components/AlgorithmParametersMenu';
import LRUCache from './utils/LRUCache';
import './App.css';

function App() {
  const [selectedChannels, setSelectedChannels] = useState([179, 181, 183]);
  const [channelScrollOffset, setChannelScrollOffset] = useState(0);
  const [spikeData, setSpikeData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 1000 });
  const [windowSize, setWindowSize] = useState(1000);
  const [spikeThreshold, setSpikeThreshold] = useState(-25);
  const [invertData, setInvertData] = useState(false);
  const [datasetInfo, setDatasetInfo] = useState({ totalDataPoints: 3500000, totalChannels: 385 });
  const [datasets, setDatasets] = useState([]);
  const [currentDataset, setCurrentDataset] = useState('c46_data_5percent.pt');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [usePrecomputedSpikes, setUsePrecomputedSpikes] = useState(false);
  const [precomputedAvailable, setPrecomputedAvailable] = useState(false);
  const [selectedView, setSelectedView] = useState('multipanel'); // 'signal', 'clusters', or 'multipanel'
  const [selectedDataType, setSelectedDataType] = useState('raw'); // 'raw', 'filtered', or 'spikes'
  const [filterType, setFilterType] = useState('highpass'); // 'none', 'highpass', 'lowpass', 'bandpass', 'bandstop'
  const [filteredLineColor, setFilteredLineColor] = useState('#FFD700'); // Color for filtered data line
  const [algorithms, setAlgorithms] = useState([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('');
  const [isRunningAlgorithm, setIsRunningAlgorithm] = useState(false);
  const [clusteringResults, setClusteringResults] = useState(null);
  const [showParametersMenu, setShowParametersMenu] = useState(false);
  const [algorithmParameters, setAlgorithmParameters] = useState({
    window_size: 3,
    threshold: 36,
    frame_size: 13,
    normalize: 'zscore',
    sort_by: 'value',
    leniency_channel: 7,
    leniency_time: 32,
    similarity_mode: 'cosine',
    outlier_threshold: 0.8,
    n_clusters: 8,
    cluster_feature_size: 7,
    n_jims_features: 7,
    pad_value: 0
  });

  const dataCache = React.useRef(new LRUCache(50));

  useEffect(() => {
    const initializeApp = async () => {
      await fetchDatasets();
      await fetchAlgorithms();
      // Load c46 dataset by default on initial mount
      await handleDatasetChange('c46_data_5percent.pt');
    };
    initializeApp();
  }, []);

  useEffect(() => {
    if (selectedChannels.length > 0) {
      dataCache.current.clear();
      fetchSpikeData();
    }
  }, [selectedChannels, spikeThreshold, invertData, usePrecomputedSpikes, selectedDataType, filterType]);

  const fetchTimeoutRef = React.useRef(null);

  useEffect(() => {
    if (selectedChannels.length > 0) {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      fetchTimeoutRef.current = setTimeout(() => {
        fetchSpikeData();
      }, 200);
      
      return () => {
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
      };
    }
  }, [timeRange]);

  const fetchDatasets = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/datasets`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Available datasets:', data);
        setDatasets(data.datasets);
        setCurrentDataset(data.current);
      }
    } catch (error) {
      console.error('Error fetching datasets:', error);
    }
  };

  const fetchAlgorithms = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/spike-sorting/algorithms`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Available algorithms:', data);
        setAlgorithms(data.algorithms || []);
        // Select Preprocessed Kilosort by default
        const preprocessedKilosort = data.algorithms?.find(a => a.name === 'preprocessed_kilosort' && a.available);
        if (preprocessedKilosort) {
          setSelectedAlgorithm(preprocessedKilosort.name);
        } else {
          // Fallback to first available algorithm
          const firstAvailable = data.algorithms?.find(a => a.available);
          if (firstAvailable) {
            setSelectedAlgorithm(firstAvailable.name);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching algorithms:', error);
    }
  };

  const handleAlgorithmChange = (algorithmName) => {
    setSelectedAlgorithm(algorithmName);
  };

  const fetchClusteringResults = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/clustering-results`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          setClusteringResults(data);
          console.log('✓ Clustering results loaded:', data.numClusters, 'clusters,', data.totalSpikes, 'spikes');
          return data;
        } else {
          console.log('No clustering results available yet');
          setClusteringResults(null);
          return null;
        }
      }
    } catch (error) {
      console.error('Error fetching clustering results:', error);
      setClusteringResults(null);
      return null;
    }
  };

  const handleRunAlgorithm = async () => {
    if (!selectedAlgorithm || isRunningAlgorithm) {
      console.warn('Cannot run algorithm: missing requirements');
      return;
    }

    setIsRunningAlgorithm(true);
    console.log(`\n${'='.repeat(60)}`);
    console.log('Starting JimsAlgorithm...');
    console.log(`${'='.repeat(60)}`);
    console.log('Running on entire loaded dataset...');
    console.log('Parameters:', algorithmParameters);

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/spike-sorting/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          algorithm: selectedAlgorithm,
          parameters: algorithmParameters
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('\n' + '='.repeat(60));
        console.log(`${selectedAlgorithm} COMPLETED!`);
        console.log('='.repeat(60));
        console.log('Data Shape:', result.dataShape);
        console.log('Number of Clusters:', result.numClusters);
        console.log('Number of Spikes:', result.numSpikes);
        console.log('Response has fullData?', !!result.fullData);
        console.log('Response has available?', result.available);
        
        if (result.fullData) {
          console.log('fullData length:', result.fullData.length);
          console.log('First cluster sample:', result.fullData[0]?.slice(0, 2));
        }
        
        console.log('\nCluster Details:');
        result.clusters.forEach((cluster, i) => {
          console.log(`\nCluster ${cluster.clusterId}:`);
          console.log(`  Spikes: ${cluster.numSpikes}`);
          if (cluster.centroidShape) {
            console.log(`  Centroid Shape: ${cluster.centroidShape}`);
          }
          if (cluster.spikeTimes && cluster.spikeTimes.length > 0) {
            console.log(`  First spike time: ${cluster.spikeTimes[0]}`);
          }
          if (cluster.spikeChannels && cluster.spikeChannels.length > 0) {
            console.log(`  First spike channel: ${cluster.spikeChannels[0]}`);
          }
        });
        console.log('='.repeat(60) + '\n');

        // Use results directly from the response if available (includes fullData)
        if (result.available && result.fullData) {
          console.log('Setting clustering results...');
          setClusteringResults(result);
          console.log('✓ Clustering results set directly from algorithm response');
          console.log('ClusteringResults state should now have', result.fullData.length, 'clusters');
        } else {
          console.warn('Result missing fullData or available flag!');
          console.log('  - available:', result.available);
          console.log('  - fullData:', !!result.fullData);
          // Fallback: fetch clustering results separately
          await fetchClusteringResults();
        }
      } else {
        const error = await response.json();
        console.error('Error running algorithm:', error);
      }
    } catch (error) {
      console.error('Error running algorithm:', error);
    } finally {
      setIsRunningAlgorithm(false);
    }
  };

  const handleOpenParameters = () => {
    setShowParametersMenu(true);
  };

  const handleCloseParameters = () => {
    setShowParametersMenu(false);
  };

  const handleSaveParameters = (newParameters) => {
    setAlgorithmParameters(newParameters);
    console.log('Algorithm parameters updated:', newParameters);
  };

  const fetchDatasetInfo = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/dataset-info`);
      
      if (response.ok) {
        const info = await response.json();
        console.log('Dataset info:', info);
        setDatasetInfo(info);
      }
    } catch (error) {
      console.error('Error fetching dataset info:', error);
    }
  };

  const checkSpikeTimesAvailable = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/spike-times-available`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Spike times check response:', data);
        console.log('Setting precomputedAvailable to:', data.available);
        setPrecomputedAvailable(data.available);
        if (!data.available) {
          setUsePrecomputedSpikes(false);
        } else {
          console.log('✓ Spike times are available! Checkbox should appear.');
        }
      }
    } catch (error) {
      console.error('Error checking spike times:', error);
      setPrecomputedAvailable(false);
    }
  };

  const handleDatasetChange = async (datasetName) => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/dataset/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: datasetName })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Dataset changed:', result);
        setCurrentDataset(datasetName);
        setDatasetInfo({
          totalChannels: result.totalChannels,
          totalDataPoints: result.totalDataPoints
        });
        
        // Set default channels for c46 dataset
        if (datasetName === 'c46_data_5percent.pt') {
          setSelectedChannels([179, 181, 183]);
        }

        dataCache.current.clear();

        // Wait a bit longer for backend to fully load dataset and spike times
        // then check if precomputed spikes are available
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkSpikeTimesAvailable();
        
        // Fetch data after everything is initialized
        fetchSpikeData();
      }
    } catch (error) {
      console.error('Error changing dataset:', error);
    }
  };

  const handleUploadComplete = (uploadResult) => {
    console.log('Upload complete:', uploadResult);
    setShowUploadModal(false);
    fetchDatasets();
    setTimeout(() => {
      checkSpikeTimesAvailable();
    }, 1000);
  };

  const [datasetToDelete, setDatasetToDelete] = React.useState(null);

  const handleDatasetDelete = (datasetName) => {
    setDatasetToDelete(datasetName);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!datasetToDelete) return;

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/dataset/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: datasetToDelete })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log('Dataset deleted:', result);
        setShowDeleteConfirm(false);
        setDatasetToDelete(null);
        
        await fetchDatasets();
        
        if (datasetToDelete === currentDataset) {
          await fetchDatasetInfo();
        }
      } else {
        alert(`Error: ${result.error}`);
        setShowDeleteConfirm(false);
        setDatasetToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      alert('Failed to delete dataset');
      setShowDeleteConfirm(false);
      setDatasetToDelete(null);
    }
  };

  const fetchSpikeData = async () => {
    const buffer = windowSize;
    const fetchStart = Math.max(0, Math.floor(timeRange.start) - buffer);
    const fetchEnd = Math.min(datasetInfo.totalDataPoints, Math.ceil(timeRange.end) + buffer);

    const cacheKey = `${fetchStart}-${fetchEnd}-${spikeThreshold}-${invertData}-${usePrecomputedSpikes}-${selectedDataType}-${filterType}`;
    const needsFetch = selectedChannels.some(ch => !dataCache.current.has(`${ch}-${cacheKey}`));

    if (!needsFetch) {
      const cachedData = {};
      selectedChannels.forEach(ch => {
        cachedData[ch] = dataCache.current.get(`${ch}-${cacheKey}`);
      });
      setSpikeData(cachedData);
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/spike-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channels: selectedChannels,
          spikeThreshold: spikeThreshold,
          invertData: invertData,
          startTime: fetchStart,
          endTime: fetchEnd,
          usePrecomputed: usePrecomputedSpikes,
          dataType: selectedDataType,
          filterType: filterType
        })
      });

      if (response.ok) {
        const data = await response.json();

        selectedChannels.forEach(ch => {
          if (data[ch]) {
            dataCache.current.set(`${ch}-${cacheKey}`, data[ch]);
          }
        });

        setSpikeData(data);
      } else {
        console.error('Failed to fetch spike data');
      }
    } catch (error) {
      console.error('Error fetching spike data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChannelToggle = (channelId) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
    setChannelScrollOffset(0);
  };

  const handleChannelScroll = (newOffset) => {
    setChannelScrollOffset(newOffset);
  };

  const handleWindowSizeChange = (newSize) => {
    const currentStart = timeRange.start;
    setWindowSize(newSize);
    setTimeRange({ start: currentStart, end: currentStart + newSize });
  };

  const handleInvertDataChange = (newInvertState) => {
    setInvertData(newInvertState);
    if (spikeThreshold !== null) {
      setSpikeThreshold(-spikeThreshold);
    }
  };

  const handleNavigateToSpike = async (spikeTime, channelId, allClusterChannels = null) => {
    try {
      // Switch to signal view with spikes mode
      setSelectedView('signal');
      setSelectedDataType('spikes');

      // Enable precomputed spikes
      setUsePrecomputedSpikes(true);

      // Set all 3 cluster channels as selected (deselect others)
      if (allClusterChannels) {
        setSelectedChannels(allClusterChannels);
      } else {
        setSelectedChannels([channelId]);
      }

      // Center the view on the spike time
      const halfWindow = Math.floor(windowSize / 2);
      const newStart = Math.max(0, spikeTime - halfWindow);
      const newEnd = Math.min(datasetInfo.totalDataPoints, spikeTime + halfWindow);

      setTimeRange({ start: newStart, end: newEnd });

      console.log(`Navigating to spike at time ${spikeTime} on channel ${channelId}, selected channels: ${allClusterChannels || [channelId]}`);

    } catch (error) {
      console.error('Error navigating to spike:', error);
    }
  };

  const handleSpikeNavigation = async (direction) => {
    if (!usePrecomputedSpikes) return;

    try {
      // Get current center of the view
      const currentCenter = Math.floor((timeRange.start + timeRange.end) / 2);
      
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/navigate-spike`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentTime: currentCenter,
          direction: direction,
          channels: selectedChannels
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const targetSpike = data.spikeTime;
        
        // Center the view on the target spike
        const halfWindow = Math.floor(windowSize / 2);
        const newStart = Math.max(0, targetSpike - halfWindow);
        const newEnd = Math.min(datasetInfo.totalDataPoints, newStart + windowSize);
        setTimeRange({ start: newStart, end: newEnd });
        
        console.log(`Navigated to spike at ${targetSpike} (${data.totalSpikes} total spikes)`);
      } else {
        console.error('Failed to navigate spike');
      }
    } catch (error) {
      console.error('Error navigating spike:', error);
    }
  };

  // Widget toolbar ref to pass to MultiPanelView
  const multiPanelViewRef = React.useRef(null);

  return (
    <div className="app">
      <Header
        datasets={datasets}
        currentDataset={currentDataset}
        onDatasetChange={handleDatasetChange}
        onUploadClick={() => setShowUploadModal(true)}
        onDatasetDelete={handleDatasetDelete}
        selectedView={selectedView}
        onViewChange={setSelectedView}
        selectedSignalType={selectedDataType}
        onSignalTypeChange={setSelectedDataType}
      />
      <div className="main-container">
        {selectedView === 'multipanel' ? (
          <MultiPanelView
            ref={multiPanelViewRef}
            selectedDataset={currentDataset}
            clusteringResults={clusteringResults}
            selectedAlgorithm={selectedAlgorithm}
            datasetInfo={datasetInfo}
            algorithms={algorithms}
            onAlgorithmChange={handleAlgorithmChange}
            onRunAlgorithm={handleRunAlgorithm}
            isRunningAlgorithm={isRunningAlgorithm}
            onOpenParameters={handleOpenParameters}
          />
        ) : selectedView === 'runtime' ? (
          <RuntimeAnalysisView />
        ) : (
          <>
            {selectedView === 'signal' && (
              <Sidebar
                selectedChannels={selectedChannels}
                onChannelToggle={handleChannelToggle}
              />
            )}
            {selectedView === 'clusters' ? (
              <ClusterView
                selectedDataset={currentDataset}
                onNavigateToSpike={handleNavigateToSpike}
                clusteringResults={clusteringResults}
                selectedAlgorithm={selectedAlgorithm}
              />
            ) : selectedView === 'signal' ? (
              <VisualizationArea
                spikeData={spikeData}
                selectedChannels={selectedChannels}
                channelScrollOffset={channelScrollOffset}
                timeRange={timeRange}
                windowSize={windowSize}
                spikeThreshold={spikeThreshold}
                invertData={invertData}
                totalDataPoints={datasetInfo.totalDataPoints}
                onTimeRangeChange={setTimeRange}
                onWindowSizeChange={handleWindowSizeChange}
                onChannelScroll={handleChannelScroll}
                onSpikeThresholdChange={setSpikeThreshold}
                onInvertDataChange={handleInvertDataChange}
                isLoading={isLoading}
                usePrecomputedSpikes={usePrecomputedSpikes}
                onUsePrecomputedChange={setUsePrecomputedSpikes}
                precomputedAvailable={precomputedAvailable}
                selectedDataType={selectedDataType}
                filterType={filterType}
                onFilterTypeChange={setFilterType}
                filteredLineColor={filteredLineColor}
                onFilteredLineColorChange={setFilteredLineColor}
                onSpikeNavigation={handleSpikeNavigation}
              />
            ) : null}
          </>
        )}
      </div>
      {showUploadModal && (
        <Upload 
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUploadModal(false)}
        />
      )}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Dataset"
        message={`Are you sure you want to delete "${datasetToDelete}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDatasetToDelete(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <AlgorithmParametersMenu
        isOpen={showParametersMenu}
        onClose={handleCloseParameters}
        parameters={algorithmParameters}
        onSave={handleSaveParameters}
        algorithm={selectedAlgorithm}
      />
    </div>
  );
}

export default App;

