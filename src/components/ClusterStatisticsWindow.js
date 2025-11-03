import React from 'react';
import './ClusterStatisticsWindow.css';

const ClusterStatisticsWindow = ({ selectedClusters, clusterStats }) => {
  // Filter stats for selected clusters
  const selectedStats = selectedClusters.map(clusterId => {
    const stats = clusterStats[clusterId];
    return { clusterId, ...stats };
  }).filter(s => s);

  return (
    <div className="cluster-statistics-window">
      <div className="cluster-stats-header">
        <h3>Cluster Statistics Window</h3>
      </div>
      <div className="cluster-stats-content">
        {selectedStats.length > 0 ? (
          selectedStats.map((stats, index) => (
            <div key={stats.clusterId} className="cluster-stat-panel">
              <div className="cluster-stat-title">
                Window {index + 1} (Cluster #{stats.clusterId}):
              </div>
              <div className="cluster-stat-items">
                <div className="stat-item">
                  <span className="stat-label">ISI violation rate =</span>
                  <span className="stat-value">{stats.isiViolationRate?.toFixed(3) || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Number of spikes =</span>
                  <span className="stat-value">{stats.numSpikes || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Peak Channel =</span>
                  <span className="stat-value">{stats.peakChannel || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Probe Position =</span>
                  <span className="stat-value">
                    {stats.probePosition ? `(${stats.probePosition.x}, ${stats.probePosition.y})` : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-cluster-selected">
            <p>Select clusters to view statistics</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClusterStatisticsWindow;
