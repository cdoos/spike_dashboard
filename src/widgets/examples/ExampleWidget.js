/**
 * ExampleWidget - A Template for Custom Widgets
 * 
 * This is a complete example widget that demonstrates all the features
 * and patterns you can use when creating custom widgets for the dashboard.
 * 
 * Copy this file as a starting point for your own widgets!
 * 
 * @module widgets/examples/ExampleWidget
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import BaseWidget from '../BaseWidget';
import apiClient from '../../api/client';
import { getClusterColor } from '../../utils/colors';

/**
 * ExampleWidget Component
 * 
 * A sample widget that displays cluster summary information.
 * Use this as a template for creating your own widgets.
 * 
 * Features demonstrated:
 * - Using BaseWidget for common functionality
 * - Fetching data from API
 * - Handling loading/error/empty states
 * - Responding to prop changes
 * - Interactive elements
 * - Toolbar buttons
 */
const ExampleWidget = ({
  // Data props - passed from MultiPanelView
  clusters,
  selectedClusters,
  selectedAlgorithm,
  
  // Callback props - for communicating with parent
  onClusterSelect,
  
  // Optional configuration props
  showPercentages = true,
  maxDisplayCount = 10,
}) => {
  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clusterSummary, setClusterSummary] = useState(null);
  const [sortOrder, setSortOrder] = useState('size'); // 'size' | 'id' | 'quality'

  /**
   * Fetch cluster summary data from API
   * Called on mount and when clusters change
   */
  const fetchSummary = useCallback(async () => {
    if (!clusters || clusters.length === 0) {
      setClusterSummary(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Example API call - replace with your actual endpoint
      // const data = await apiClient.getClusterStatistics(
      //   clusters.map(c => c.clusterId),
      //   selectedAlgorithm
      // );
      
      // For demonstration, we'll compute summary locally
      const totalSpikes = clusters.reduce((sum, c) => sum + (c.size || c.pointCount || 0), 0);
      
      const summary = {
        totalClusters: clusters.length,
        totalSpikes,
        avgSpikesPerCluster: Math.round(totalSpikes / clusters.length),
        clusterSizes: clusters.map(c => ({
          id: c.clusterId,
          size: c.size || c.pointCount || 0,
          percentage: ((c.size || c.pointCount || 0) / totalSpikes * 100).toFixed(1),
        })),
      };

      setClusterSummary(summary);
    } catch (err) {
      console.error('Error fetching cluster summary:', err);
      setError(err.message || 'Failed to load cluster summary');
    } finally {
      setIsLoading(false);
    }
  }, [clusters, selectedAlgorithm]);

  // Fetch data when clusters change
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  /**
   * Handle cluster click
   */
  const handleClusterClick = (clusterId) => {
    if (onClusterSelect) {
      onClusterSelect(clusterId);
    }
  };

  /**
   * Sort clusters based on current sort order
   */
  const getSortedClusters = () => {
    if (!clusterSummary?.clusterSizes) return [];
    
    const sorted = [...clusterSummary.clusterSizes];
    
    switch (sortOrder) {
      case 'size':
        sorted.sort((a, b) => b.size - a.size);
        break;
      case 'id':
        sorted.sort((a, b) => a.id - b.id);
        break;
      default:
        break;
    }
    
    return sorted.slice(0, maxDisplayCount);
  };

  /**
   * Toolbar content - sort buttons
   */
  const toolbar = (
    <div className="example-widget-toolbar">
      <select 
        value={sortOrder} 
        onChange={(e) => setSortOrder(e.target.value)}
        className="example-widget-sort"
      >
        <option value="size">Sort by Size</option>
        <option value="id">Sort by ID</option>
      </select>
    </div>
  );

  /**
   * Footer content - summary stats
   */
  const footer = clusterSummary ? (
    <span>
      {clusterSummary.totalClusters} clusters • {clusterSummary.totalSpikes.toLocaleString()} total spikes
    </span>
  ) : null;

  // Determine if data is empty
  const isEmpty = !clusters || clusters.length === 0;

  return (
    <BaseWidget
      title="Cluster Summary"
      className="example-widget"
      isLoading={isLoading}
      loadingMessage="Loading cluster data..."
      error={error}
      onRetry={fetchSummary}
      isEmpty={isEmpty}
      emptyMessage="No clusters available. Run spike sorting first."
      emptyIcon="📊"
      toolbar={toolbar}
      footer={footer}
      onRefresh={fetchSummary}
    >
      {/* Main widget content */}
      <div className="example-widget-content">
        {/* Summary header */}
        {clusterSummary && (
          <div className="summary-header">
            <div className="summary-stat">
              <span className="stat-value">{clusterSummary.totalClusters}</span>
              <span className="stat-label">Clusters</span>
            </div>
            <div className="summary-stat">
              <span className="stat-value">{clusterSummary.avgSpikesPerCluster.toLocaleString()}</span>
              <span className="stat-label">Avg Spikes</span>
            </div>
          </div>
        )}

        {/* Cluster list */}
        <div className="cluster-bars">
          {getSortedClusters().map((cluster) => {
            const isSelected = selectedClusters?.includes(cluster.id);
            const barWidth = `${Math.min(100, parseFloat(cluster.percentage) * 2)}%`;
            
            return (
              <div 
                key={cluster.id}
                className={`cluster-bar-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleClusterClick(cluster.id)}
              >
                <div className="cluster-bar-label">
                  <span 
                    className="cluster-color-dot"
                    style={{ backgroundColor: getClusterColor(cluster.id) }}
                  />
                  <span className="cluster-name">Cluster {cluster.id}</span>
                </div>
                <div className="cluster-bar-wrapper">
                  <div 
                    className="cluster-bar"
                    style={{ 
                      width: barWidth,
                      backgroundColor: getClusterColor(cluster.id),
                    }}
                  />
                </div>
                <div className="cluster-bar-value">
                  {cluster.size.toLocaleString()}
                  {showPercentages && (
                    <span className="percentage">({cluster.percentage}%)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline styles for this example - in production, use a CSS file */}
      <style>{`
        .example-widget-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .example-widget-toolbar {
          display: flex;
          gap: 8px;
        }
        
        .example-widget-sort {
          padding: 4px 8px;
          background: rgba(64, 224, 208, 0.1);
          border: 1px solid rgba(64, 224, 208, 0.2);
          border-radius: 4px;
          color: #e0e6ed;
          font-size: 11px;
          cursor: pointer;
        }
        
        .example-widget-sort:hover {
          background: rgba(64, 224, 208, 0.2);
        }
        
        .summary-header {
          display: flex;
          gap: 24px;
          padding: 12px;
          background: rgba(64, 224, 208, 0.05);
          border-radius: 6px;
        }
        
        .summary-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #40e0d0;
        }
        
        .stat-label {
          font-size: 11px;
          color: rgba(224, 230, 237, 0.6);
          text-transform: uppercase;
        }
        
        .cluster-bars {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .cluster-bar-item {
          display: grid;
          grid-template-columns: 100px 1fr 80px;
          align-items: center;
          gap: 12px;
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .cluster-bar-item:hover {
          background: rgba(64, 224, 208, 0.1);
        }
        
        .cluster-bar-item.selected {
          background: rgba(64, 224, 208, 0.15);
          border: 1px solid rgba(64, 224, 208, 0.3);
        }
        
        .cluster-bar-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
        }
        
        .cluster-color-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        
        .cluster-name {
          color: #e0e6ed;
        }
        
        .cluster-bar-wrapper {
          height: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          overflow: hidden;
        }
        
        .cluster-bar {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s ease;
        }
        
        .cluster-bar-value {
          font-size: 12px;
          text-align: right;
          color: #e0e6ed;
        }
        
        .percentage {
          margin-left: 4px;
          color: rgba(224, 230, 237, 0.5);
          font-size: 10px;
        }
      `}</style>
    </BaseWidget>
  );
};

/**
 * PropTypes - Document all props for better developer experience
 */
ExampleWidget.propTypes = {
  /** Array of cluster objects from clustering results */
  clusters: PropTypes.arrayOf(PropTypes.shape({
    clusterId: PropTypes.number.isRequired,
    size: PropTypes.number,
    pointCount: PropTypes.number,
  })),
  /** Array of currently selected cluster IDs */
  selectedClusters: PropTypes.arrayOf(PropTypes.number),
  /** Currently selected algorithm */
  selectedAlgorithm: PropTypes.string,
  /** Callback when a cluster is selected */
  onClusterSelect: PropTypes.func,
  /** Whether to show percentage values */
  showPercentages: PropTypes.bool,
  /** Maximum number of clusters to display */
  maxDisplayCount: PropTypes.number,
};

/**
 * Default props
 */
ExampleWidget.defaultProps = {
  clusters: [],
  selectedClusters: [],
  selectedAlgorithm: '',
  onClusterSelect: null,
  showPercentages: true,
  maxDisplayCount: 10,
};

/**
 * Widget metadata - used when registering the widget
 * Export this so it can be used in the registration
 */
export const WIDGET_METADATA = {
  id: 'exampleWidget',
  name: 'Cluster Summary',
  description: 'Visual summary of cluster sizes and statistics',
  icon: '📊',
  category: 'analysis',
  defaultSize: { width: 350, height: 400 },
  minWidth: 280,
  minHeight: 250,
  requiredData: ['clusters'],
};

export default ExampleWidget;
