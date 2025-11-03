import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import './DimensionalityReductionPanel.css';

const DimensionalityReductionPanel = ({
  clusterData,
  selectedClusters,
  selectedSpike,
  onSpikeClick,
  clusteringResults,
  selectedAlgorithm
}) => {
  const plotData = useMemo(() => {
    console.log(`[${selectedAlgorithm}] Rendering PCA plot for clusters:`, selectedClusters);
    
    // Use TorchBCI JimsAlgorithm results if available
    if (selectedAlgorithm === 'torchbci_jims' && clusteringResults && clusteringResults.available) {
      console.log('Using TorchBCI JimsAlgorithm results for PCA plot');
      
      const traces = [];
      
      // Filter to show only selected clusters
      selectedClusters.forEach((clusterId) => {
        if (clusterId >= clusteringResults.fullData.length) return;
        
        const clusterSpikes = clusteringResults.fullData[clusterId];
        
        // Separate selected spike from others
        const regularX = [];
        const regularY = [];
        const regularIndices = [];
        let highlightedPoint = null;
        
        clusterSpikes.forEach((spike, spikeIdx) => {
          const isHighlighted = selectedSpike &&
                               selectedSpike.clusterId === clusterId &&
                               selectedSpike.pointIndex === spikeIdx;
          
          if (isHighlighted) {
            highlightedPoint = { x: spike.x, y: spike.y, spikeIdx };
          } else {
            regularX.push(spike.x);
            regularY.push(spike.y);
            regularIndices.push(spikeIdx);
          }
        });
        
        const color = `hsl(${(clusterId * 137) % 360}, 70%, 60%)`;
        const opacity = 0.85;
        
        // Add regular points
        if (regularX.length > 0) {
          traces.push({
            x: regularX,
            y: regularY,
            mode: 'markers',
            type: 'scatter',
            name: `Cluster ${clusterId}`,
            marker: {
              size: 8,
              color: color,
              opacity: opacity,
              line: {
                color: 'rgba(0, 0, 0, 0.5)',
                width: 1.0
              }
            },
            customdata: regularIndices.map(idx => ({
              clusterIdx: clusterId,
              pointIdx: idx,
              clusterId: clusterId
            })),
            hovertemplate: `<b>Cluster ${clusterId}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
            showlegend: highlightedPoint === null
          });
        }
        
        // Add highlighted point
        if (highlightedPoint) {
          traces.push({
            x: [highlightedPoint.x],
            y: [highlightedPoint.y],
            mode: 'markers',
            type: 'scatter',
            name: `Cluster ${clusterId}`,
            marker: {
              size: 14,
              color: color,
              symbol: 'star',
              line: {
                color: '#fff',
                width: 2
              }
            },
            customdata: [{
              clusterIdx: clusterId,
              pointIdx: highlightedPoint.spikeIdx,
              clusterId: clusterId
            }],
            hovertemplate: `<b>Cluster ${clusterId} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
            showlegend: true
          });
        }
      });
      
      return traces;
    }
    
    // Otherwise use clusterData from API (Preprocessed Kilosort)
    if (!clusterData || !clusterData.clusters) return [];

    const traces = [];

    // Filter clusters: show only selected ones
    const clustersToShow = selectedClusters.length > 0
      ? clusterData.clusters.filter(cluster => selectedClusters.includes(cluster.clusterId))
      : [];

    clustersToShow.forEach((cluster) => {
      // Separate selected spike from others
      const regularX = [];
      const regularY = [];
      const regularIndices = [];
      let highlightedPoint = null;

      cluster.points.forEach((point, pointIdx) => {
        const isHighlighted = selectedSpike &&
                             selectedSpike.clusterId === cluster.clusterId &&
                             selectedSpike.pointIndex === pointIdx;

        if (isHighlighted) {
          highlightedPoint = { x: point[0], y: point[1], pointIdx };
        } else {
          regularX.push(point[0]);
          regularY.push(point[1]);
          regularIndices.push(pointIdx);
        }
      });

      const color = cluster.color || `hsl(${(cluster.clusterId * 137) % 360}, 70%, 60%)`;
      const opacity = 0.85;

      // Add regular points
      if (regularX.length > 0) {
        traces.push({
          x: regularX,
          y: regularY,
          mode: 'markers',
          type: 'scatter',  // Changed from scattergl for sharper rendering
          name: `Cluster ${cluster.clusterId}`,
          marker: {
            size: 8,  // Increased for better visibility
            color: color,
            opacity: opacity,
            line: {
              color: 'rgba(0, 0, 0, 0.5)',  // Darker outline for definition
              width: 1.0
            }
          },
          customdata: regularIndices.map(idx => ({
            clusterIdx: cluster.clusterId,
            pointIdx: idx,
            clusterId: cluster.clusterId
          })),
          hovertemplate: `<b>Cluster ${cluster.clusterId}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
          showlegend: highlightedPoint === null
        });
      }

      // Add highlighted point
      if (highlightedPoint) {
        traces.push({
          x: [highlightedPoint.x],
          y: [highlightedPoint.y],
          mode: 'markers',
          type: 'scatter',  // Changed from scattergl
          name: `Cluster ${cluster.clusterId}`,
          marker: {
            size: 16,  // Larger for visibility
            color: color,
            opacity: 1,
            line: {
              color: '#FFFFFF',
              width: 3
            },
            symbol: 'x'
          },
          customdata: [{
            clusterIdx: cluster.clusterId,
            pointIdx: highlightedPoint.pointIdx,
            clusterId: cluster.clusterId
          }],
          hovertemplate: `<b>Cluster ${cluster.clusterId} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`
        });
      }
    });

    return traces;
  }, [clusterData, selectedClusters, selectedSpike, clusteringResults, selectedAlgorithm]);

  const handlePointClick = (event) => {
    if (event.points && event.points.length > 0 && onSpikeClick) {
      const point = event.points[0];
      const customdata = point.customdata;
      onSpikeClick(customdata.clusterId, customdata.pointIdx);
    }
  };

  return (
    <div className="dimensionality-reduction-panel">
      <div className="dim-reduction-header">
        <h3>Dimensionality Reduction Plot View (PCA)</h3>
      </div>
      <div className="dim-reduction-plot-container">
        {clusterData && clusterData.clusters && clusterData.clusters.length > 0 ? (
          <Plot
            data={plotData}
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
            onClick={handlePointClick}
          />
        ) : selectedClusters.length === 0 ? (
          <div className="no-data-message">
            <p>Select clusters from the Cluster List to view PCA plot</p>
          </div>
        ) : (
          <div className="no-data-message">
            <p>Loading cluster data...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DimensionalityReductionPanel;
