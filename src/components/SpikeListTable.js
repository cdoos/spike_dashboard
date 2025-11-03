import React from 'react';
import './SpikeListTable.css';

const SpikeListTable = ({ spikes, selectedSpike, onSpikeSelect, selectedClusters }) => {
  // Filter spikes based on selected clusters
  const filteredSpikes = selectedClusters.length > 0
    ? spikes.filter(spike => selectedClusters.includes(spike.clusterId))
    : spikes;

  return (
    <div className="spike-list-table">
      <div className="spike-list-header">
        <h3>Spike List Table</h3>
        <span className="spike-count">{filteredSpikes.length} spikes</span>
      </div>
      <div className="spike-list-content">
        <table>
          <thead>
            <tr>
              <th>Spike Time Stamp</th>
              <th>Assigned Cluster ID</th>
            </tr>
          </thead>
          <tbody>
            {filteredSpikes.length > 0 ? (
              filteredSpikes.map((spike, index) => (
                <tr
                  key={index}
                  className={selectedSpike === index ? 'selected' : ''}
                  onClick={() => onSpikeSelect(index, spike)}
                >
                  <td className="spike-time-cell">{spike.time}</td>
                  <td className="spike-cluster-cell">{spike.clusterId}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="2" className="no-data-cell">
                  {selectedClusters.length > 0 ? 'No spikes for selected clusters' : '...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SpikeListTable;
