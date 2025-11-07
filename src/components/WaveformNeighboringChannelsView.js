import React, { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import './WaveformNeighboringChannelsView.css';

const WaveformNeighboringChannelsView = ({
  selectedClusters,
  selectedAlgorithm
}) => {
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [multiChannelData, setMultiChannelData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-select first cluster when selectedClusters changes
  useEffect(() => {
    if (selectedClusters.length > 0 && selectedClusterId === null) {
      setSelectedClusterId(selectedClusters[0]);
    } else if (selectedClusters.length === 0) {
      setSelectedClusterId(null);
      setMultiChannelData(null);
    } else if (!selectedClusters.includes(selectedClusterId)) {
      setSelectedClusterId(selectedClusters[0]);
    }
  }, [selectedClusters]);
  
  // Fetch multi-channel waveforms when cluster selection changes
  useEffect(() => {
    if (selectedClusterId !== null) {
      fetchMultiChannelWaveforms(selectedClusterId);
    }
  }, [selectedClusterId, selectedAlgorithm]);
  
  const fetchMultiChannelWaveforms = async (clusterId) => {
    setIsLoading(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/cluster-multi-channel-waveforms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterId: clusterId,
          maxWaveforms: 50,
          windowSize: 30,
          algorithm: selectedAlgorithm
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMultiChannelData(data);
        console.log(`Loaded multi-channel waveforms for cluster ${clusterId}`, data);
      }
    } catch (error) {
      console.error('Error fetching multi-channel waveforms:', error);
    } finally {
      setIsLoading(false);
    }
  };
  const calculateMeanWaveform = (waveforms) => {
    if (waveforms.length === 0) return { timePoints: [], amplitude: [] };

    const timePoints = waveforms[0].timePoints;
    const meanAmplitude = timePoints.map((_, idx) => {
      const sum = waveforms.reduce((acc, wf) => acc + wf.amplitude[idx], 0);
      return sum / waveforms.length;
    });

    return { timePoints, amplitude: meanAmplitude };
  };

  const getClusterColor = (clusterId) => {
    return `hsl(${(clusterId * 137) % 360}, 70%, 60%)`;
  };

  const channelPlots = useMemo(() => {
    if (!multiChannelData || !multiChannelData.channels) return [];
    
    const channelIds = Object.keys(multiChannelData.channels).map(Number).sort((a, b) => a - b);
    const clusterColor = getClusterColor(multiChannelData.clusterId);
    
    return channelIds.map(channelId => {
      const channelData = multiChannelData.channels[channelId];
      const waveforms = channelData.waveforms || [];
      const isPeakChannel = channelData.isPeak;
      
      const traces = [];
      
      // Add individual waveforms
      waveforms.forEach((waveform, idx) => {
        traces.push({
          x: waveform.timePoints,
          y: waveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          line: {
            color: clusterColor,
            width: 1
          },
          opacity: 0.3,
          showlegend: false,
          hovertemplate: `Waveform ${idx}<br>Time: %{x:.2f} ms<br>Amplitude: %{y:.2f}<extra></extra>`
        });
      });
      
      // Add mean waveform
      if (waveforms.length > 0) {
        const meanWaveform = calculateMeanWaveform(waveforms);
        traces.push({
          x: meanWaveform.timePoints,
          y: meanWaveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          line: {
            color: clusterColor,
            width: 3
          },
          opacity: 1.0,
          showlegend: false,
          name: 'Mean',
          hovertemplate: `Mean<br>Time: %{x:.2f} ms<br>Amplitude: %{y:.2f}<extra></extra>`
        });
      }
      
      return {
        channelId,
        isPeakChannel,
        traces
      };
    });
  }, [multiChannelData]);

  return (
    <div className="waveform-neighboring-channels-view">
      {/* Cluster Selector */}
      {selectedClusters.length > 0 && (
        <div className="cluster-selector-bar">
          <label htmlFor="cluster-select">Select Cluster:</label>
          <select
            id="cluster-select"
            value={selectedClusterId || ''}
            onChange={(e) => setSelectedClusterId(Number(e.target.value))}
          >
            {selectedClusters.map(clusterId => (
              <option key={clusterId} value={clusterId}>
                Cluster {clusterId}
              </option>
            ))}
          </select>
          {multiChannelData && (
            <span className="peak-channel-info">
              Peak Channel: {multiChannelData.peakChannel}
            </span>
          )}
        </div>
      )}
      
      {/* Channel Plots */}
      <div className="multi-channel-plots-container">
        {selectedClusters.length === 0 ? (
          <div className="no-data-message">
            <p>Select clusters from the Cluster List to view multi-channel waveforms</p>
          </div>
        ) : isLoading ? (
          <div className="no-data-message">
            <p>Loading multi-channel waveforms...</p>
          </div>
        ) : channelPlots.length === 0 ? (
          <div className="no-data-message">
            <p>No waveform data available</p>
          </div>
        ) : (
          <div className="channel-plots-grid">
            {channelPlots.map(({ channelId, isPeakChannel, traces }) => (
              <div key={channelId} className={`channel-plot-item ${isPeakChannel ? 'peak-channel' : ''}`}>
                <div className="channel-plot-header">
                  CH{channelId} {isPeakChannel && '(Peak)'}
                </div>
                <Plot
                  data={traces}
                  layout={{
                    autosize: true,
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'rgba(0, 0, 0, 0.2)',
                    font: { color: '#e0e6ed', size: 10 },
                    xaxis: {
                      title: '',
                      gridcolor: 'rgba(64, 224, 208, 0.2)',
                      zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                      color: '#e0e6ed',
                      showticklabels: true
                    },
                    yaxis: {
                      title: '',
                      gridcolor: 'rgba(64, 224, 208, 0.2)',
                      zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                      color: '#e0e6ed',
                      showticklabels: true
                    },
                    hovermode: 'closest',
                    showlegend: false,
                    margin: { l: 40, r: 10, t: 10, b: 30 }
                  }}
                  config={{
                    displayModeBar: false,
                    responsive: true
                  }}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveformNeighboringChannelsView;
