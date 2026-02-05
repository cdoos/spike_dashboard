/**
 * useClusterData Hook
 * 
 * Manages cluster data fetching, statistics, and waveforms.
 */

import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';

/**
 * Hook for cluster data management
 * 
 * @param {Object} options - Hook options
 * @param {string} options.mode - Data mode ('synthetic', 'real', 'algorithm_results')
 * @param {string} options.algorithm - Currently selected algorithm
 * @param {Object} options.clusteringResults - Results from clustering algorithm
 * @returns {Object} Cluster data and operations
 */
export function useClusterData({ mode = 'real', algorithm = '', clusteringResults = null } = {}) {
  const [clusters, setClusters] = useState([]);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [waveforms, setWaveforms] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch cluster data from API
   */
  const fetchClusters = useCallback(async (channelMapping = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.getClusterData(mode, channelMapping);
      setClusters(data.clusters || []);
      
      // Auto-select first 3 clusters
      if (data.clusters && data.clusters.length > 0) {
        const initialSelection = data.clusters.slice(0, 3).map(c => c.clusterId);
        setSelectedClusters(initialSelection);
      }
      
      return data;
    } catch (err) {
      console.error('Error fetching cluster data:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  /**
   * Fetch statistics for selected clusters
   */
  const fetchStatistics = useCallback(async (clusterIds = selectedClusters) => {
    if (!clusterIds || clusterIds.length === 0) {
      return {};
    }

    try {
      const data = await apiClient.getClusterStatistics(clusterIds, algorithm);
      setStatistics(prev => ({ ...prev, ...data.statistics }));
      return data.statistics;
    } catch (err) {
      console.error('Error fetching cluster statistics:', err);
      return {};
    }
  }, [selectedClusters, algorithm]);

  /**
   * Fetch waveforms for selected clusters
   */
  const fetchWaveforms = useCallback(async (clusterIds = selectedClusters, maxWaveforms = 100) => {
    if (!clusterIds || clusterIds.length === 0) {
      return {};
    }

    try {
      const data = await apiClient.getClusterWaveforms({
        clusterIds,
        maxWaveforms,
        algorithm,
      });
      setWaveforms(prev => ({ ...prev, ...data.waveforms }));
      return data.waveforms;
    } catch (err) {
      console.error('Error fetching waveforms:', err);
      return {};
    }
  }, [selectedClusters, algorithm]);

  /**
   * Fetch multi-channel waveforms for a single cluster
   */
  const fetchMultiChannelWaveforms = useCallback(async (clusterId, maxWaveforms = 50) => {
    try {
      const data = await apiClient.getClusterMultiChannelWaveforms({
        clusterId,
        maxWaveforms,
        algorithm,
      });
      return data;
    } catch (err) {
      console.error('Error fetching multi-channel waveforms:', err);
      return null;
    }
  }, [algorithm]);

  /**
   * Toggle cluster selection
   */
  const toggleCluster = useCallback((clusterId) => {
    setSelectedClusters(prev => {
      if (prev.includes(clusterId)) {
        return prev.filter(id => id !== clusterId);
      }
      return [...prev, clusterId];
    });
  }, []);

  /**
   * Select a single cluster (deselect others)
   */
  const selectCluster = useCallback((clusterId) => {
    setSelectedClusters([clusterId]);
  }, []);

  /**
   * Clear all selections
   */
  const clearSelection = useCallback(() => {
    setSelectedClusters([]);
  }, []);

  /**
   * Select all clusters
   */
  const selectAll = useCallback(() => {
    setSelectedClusters(clusters.map(c => c.clusterId));
  }, [clusters]);

  /**
   * Get cluster by ID
   */
  const getClusterById = useCallback((clusterId) => {
    return clusters.find(c => c.clusterId === clusterId);
  }, [clusters]);

  /**
   * Check if cluster is selected
   */
  const isClusterSelected = useCallback((clusterId) => {
    return selectedClusters.includes(clusterId);
  }, [selectedClusters]);

  // Auto-fetch statistics when selection changes
  useEffect(() => {
    if (selectedClusters.length > 0) {
      fetchStatistics(selectedClusters);
    }
  }, [selectedClusters, fetchStatistics]);

  return {
    // State
    clusters,
    selectedClusters,
    statistics,
    waveforms,
    isLoading,
    error,

    // Actions
    fetchClusters,
    fetchStatistics,
    fetchWaveforms,
    fetchMultiChannelWaveforms,
    toggleCluster,
    selectCluster,
    clearSelection,
    selectAll,

    // Utilities
    getClusterById,
    isClusterSelected,

    // Setters
    setClusters,
    setSelectedClusters,
  };
}

export default useClusterData;
