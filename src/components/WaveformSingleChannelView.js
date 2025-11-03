import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import './WaveformSingleChannelView.css';

const WaveformSingleChannelView = ({
  selectedClusters,
  clusterWaveforms,
  highlightedSpike
}) => {
  const calculateMeanWaveform = (waveforms) => {
    if (waveforms.length === 0) return { timePoints: [], amplitude: [] };

    const timePoints = waveforms[0].timePoints;
    const meanAmplitude = timePoints.map((_, idx) => {
      const sum = waveforms.reduce((acc, wf) => acc + wf.amplitude[idx], 0);
      return sum / waveforms.length;
    });

    return { timePoints, amplitude: meanAmplitude };
  };

  const waveformPlots = useMemo(() => {
    if (selectedClusters.length === 0) return [];

    const traces = [];
    const colors = ['#FF6B6B', '#4ECDC4', '#FFD700', '#9B59B6', '#E67E22'];

    selectedClusters.forEach((clusterId, index) => {
      const waveforms = clusterWaveforms[clusterId];
      if (!waveforms || waveforms.length === 0) return;

      const color = colors[index % colors.length];

      // Plot all waveforms for this cluster with reduced opacity
      waveforms.forEach((waveform, waveformIdx) => {
        const opacity = highlightedSpike &&
                       highlightedSpike.clusterId === clusterId &&
                       highlightedSpike.waveformIdx === waveformIdx ? 1.0 : 0.15;

        const lineWidth = highlightedSpike &&
                         highlightedSpike.clusterId === clusterId &&
                         highlightedSpike.waveformIdx === waveformIdx ? 3 : 1;

        traces.push({
          x: waveform.timePoints,
          y: waveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          name: waveformIdx === 0 ? `Cluster ${clusterId}` : undefined,
          showlegend: waveformIdx === 0,
          line: {
            color: color,
            width: lineWidth
          },
          opacity: opacity,
          hovertemplate: `<b>Cluster ${clusterId}</b><br>Waveform ${waveformIdx}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
        });
      });

      // Add mean waveform (bold black line)
      if (waveforms.length > 0) {
        const meanWaveform = calculateMeanWaveform(waveforms);
        traces.push({
          x: meanWaveform.timePoints,
          y: meanWaveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          name: `Cluster ${clusterId} Mean`,
          line: {
            color: '#000000',
            width: 3
          },
          opacity: 1.0,
          hovertemplate: `<b>Cluster ${clusterId} Mean</b><br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
        });
      }
    });

    return traces;
  }, [selectedClusters, clusterWaveforms, highlightedSpike]);

  return (
    <div className="waveform-single-channel-view">
      <div className="waveform-header">
        <h3>Waveform View - Single Channel</h3>
        <div className="waveform-info">
          {selectedClusters.length > 0 ? (
            <span>Showing {selectedClusters.length} cluster{selectedClusters.length !== 1 ? 's' : ''}</span>
          ) : (
            <span>Select clusters to view waveforms</span>
          )}
        </div>
      </div>
      <div className="waveform-plot-container">
        {selectedClusters.length > 0 ? (
          <Plot
            data={waveformPlots}
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
                title: 'Waveforms (z-scored)',
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
            <p>Select clusters from the Cluster List to view waveforms</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveformSingleChannelView;
