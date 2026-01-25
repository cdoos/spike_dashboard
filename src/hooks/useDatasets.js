/**
 * useDatasets Hook
 * 
 * Custom hook for managing dataset state and operations.
 * Provides a clean interface for dataset listing, selection, upload, and deletion.
 */

import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';
import { DEFAULT_DATASET } from '../constants/config';

/**
 * Hook for dataset management
 * @param {Object} options - Hook options
 * @param {boolean} options.autoFetch - Automatically fetch datasets on mount
 * @param {string} options.initialDataset - Initial dataset to load
 */
export function useDatasets({ autoFetch = true, initialDataset = DEFAULT_DATASET } = {}) {
  const [datasets, setDatasets] = useState([]);
  const [currentDataset, setCurrentDataset] = useState(initialDataset);
  const [datasetInfo, setDatasetInfo] = useState({ totalDataPoints: 3500000, totalChannels: 385 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch list of available datasets
   */
  const fetchDatasets = useCallback(async () => {
    try {
      const data = await apiClient.getDatasets();
      setDatasets(data.datasets || []);
      if (data.current) {
        setCurrentDataset(data.current);
      }
      setError(null);
      return data;
    } catch (err) {
      console.error('Error fetching datasets:', err);
      setError(err.message);
      return null;
    }
  }, []);

  /**
   * Fetch current dataset info
   */
  const fetchDatasetInfo = useCallback(async () => {
    try {
      const data = await apiClient.getDatasetInfo();
      setDatasetInfo({
        totalDataPoints: data.totalDataPoints || data.maxTimeRange,
        totalChannels: data.totalChannels,
      });
      setError(null);
      return data;
    } catch (err) {
      console.error('Error fetching dataset info:', err);
      setError(err.message);
      return null;
    }
  }, []);

  /**
   * Change current dataset
   * @param {string} datasetName - Name of dataset to switch to
   */
  const changeDataset = useCallback(async (datasetName) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.setDataset(datasetName);
      
      if (result.success) {
        setCurrentDataset(datasetName);
        setDatasetInfo({
          totalDataPoints: result.totalDataPoints,
          totalChannels: result.totalChannels,
        });
        return { success: true, data: result };
      }
      
      setError(result.error || 'Failed to change dataset');
      return { success: false, error: result.error };
    } catch (err) {
      console.error('Error changing dataset:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Upload a new dataset
   * @param {File} file - Dataset file to upload
   * @param {File} spikeTimesFile - Optional spike times file
   * @param {Function} onProgress - Progress callback
   */
  const uploadDataset = useCallback(async (file, spikeTimesFile = null, onProgress = null) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.uploadDataset(file, spikeTimesFile, onProgress);
      
      if (result.success) {
        // Refresh dataset list after upload
        await fetchDatasets();
        return { success: true, data: result };
      }
      
      setError(result.error || 'Upload failed');
      return { success: false, error: result.error };
    } catch (err) {
      console.error('Error uploading dataset:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [fetchDatasets]);

  /**
   * Delete a dataset
   * @param {string} datasetName - Name of dataset to delete
   */
  const deleteDataset = useCallback(async (datasetName) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.deleteDataset(datasetName);
      
      if (result.success) {
        // Update current dataset if it was deleted
        if (result.newCurrentDataset) {
          setCurrentDataset(result.newCurrentDataset);
        } else if (datasetName === currentDataset) {
          setCurrentDataset(null);
        }
        
        // Refresh dataset list
        await fetchDatasets();
        return { success: true, data: result };
      }
      
      setError(result.error || 'Delete failed');
      return { success: false, error: result.error };
    } catch (err) {
      console.error('Error deleting dataset:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [currentDataset, fetchDatasets]);

  /**
   * Refresh all dataset information
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchDatasets(), fetchDatasetInfo()]);
    setIsLoading(false);
  }, [fetchDatasets, fetchDatasetInfo]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchDatasets();
    }
  }, [autoFetch, fetchDatasets]);

  return {
    // State
    datasets,
    currentDataset,
    datasetInfo,
    isLoading,
    error,
    
    // Actions
    fetchDatasets,
    fetchDatasetInfo,
    changeDataset,
    uploadDataset,
    deleteDataset,
    refresh,
    
    // Setters for external updates
    setDatasetInfo,
    setCurrentDataset,
  };
}

export default useDatasets;
