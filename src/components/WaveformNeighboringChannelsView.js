import React from 'react';
import Plot from 'react-plotly.js';
import './WaveformNeighboringChannelsView.css';

const WaveformNeighboringChannelsView = ({
  selectedClusters,
  clusterWaveforms,
  neighboringChannels,
  highlightedSpike
}) => {
  const generateNeighboringChannelPlots = () => {
    if (selectedClusters.length === 0 || !neighboringChannels) return [];

    const traces = [];
    const colors = ['#FF6B6B', '#4ECDC4', '#FFD700', '#9B59B6', '#E67E22'];

    selectedClusters.forEach((clusterId, clusterIndex) => {
      const clusterColor = colors[clusterIndex % colors.length];
      const channels = neighboringChannels[clusterId] || [];

      channels.forEach((channelData) => {
        const waveforms = channelData.waveforms || [];
        const isPeakChannel = channelData.isPeak;

        waveforms.forEach((waveform, waveformIdx) => {
          const opacity = highlightedSpike &&
                         highlightedSpike.clusterId === clusterId &&
                         highlightedSpike.waveformIdx === waveformIdx ? 1.0 : 0.15;

          const lineWidth = isPeakChannel ? 2 : 1;

          traces.push({
            x: waveform.timePoints,
            y: waveform.amplitude.map(val => val + channelData.channelOffset), // Offset for visualization
            type: 'scatter',
            mode: 'lines',
            name: waveformIdx === 0 ? `Cluster ${clusterId} - CH${channelData.channelId}` : undefined,
            showlegend: waveformIdx === 0,
            line: {
              color: clusterColor,
              width: lineWidth
            },
            opacity: opacity,
            hovertemplate: `<b>Cluster ${clusterId} - CH${channelData.channelId}</b>${isPeakChannel ? ' (Peak)' : ''}<br>Waveform ${waveformIdx}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
          });
        });

        // Add mean waveform for this channel
        if (waveforms.length > 0) {
          const meanWaveform = calculateMeanWaveform(waveforms);
          traces.push({
            x: meanWaveform.timePoints,
            y: meanWaveform.amplitude.map(val => val + channelData.channelOffset),
            type: 'scatter',
            mode: 'lines',
            name: `Mean CH${channelData.channelId}`,
            line: {
              color: '#000000',
              width: isPeakChannel ? 3 : 2
            },
            opacity: 1.0,
            showlegend: false,
            hovertemplate: `<b>Mean CH${channelData.channelId}</b>${isPeakChannel ? ' (Peak)' : ''}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
          });
        }
      });
    });

    return traces;
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

  return (
    <div className="waveform-neighboring-channels-view">
      <div className="waveform-header">
        <h3>Waveform View - Peak and Neighboring Channels</h3>
        <div className="waveform-info">
          {selectedClusters.length > 0 ? (
            <span>Showing {selectedClusters.length} cluster{selectedClusters.length !== 1 ? 's' : ''} with neighboring channels</span>
          ) : (
            <span>Select clusters to view waveforms</span>
          )}
        </div>
      </div>
      <div className="waveform-plot-container">
        {selectedClusters.length > 0 ? (
          <Plot
            data={generateNeighboringChannelPlots()}
            layout={{
              autosize: true,
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed', size: 11 },
              xaxis: {
                title: 'Time (ms)',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Waveforms (offset by channel)',
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
          />
        ) : (
          <div className="no-data-message">
            <p>Select clusters from the Cluster List to view neighboring channel waveforms</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveformNeighboringChannelsView;
