import React from 'react';
import './ClusterListTable.css';

const ClusterListTable = ({ clusters, selectedClusters, onClusterToggle }) => {
  return (
    <div className="cluster-list-table">
      <div className="cluster-list-header">
        <h3>Cluster List</h3>
      </div>
      <div className="cluster-list-content">
        <table>
          <thead>
            <tr>
              <th>Checkbox</th>
              <th>ID number of the cluster</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((cluster) => (
              <tr key={cluster.id}>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    checked={selectedClusters.includes(cluster.id)}
                    onChange={() => onClusterToggle(cluster.id)}
                  />
                </td>
                <td className="cluster-id-cell">{cluster.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClusterListTable;
