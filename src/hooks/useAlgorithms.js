/**
 * useAlgorithms Hook
 * 
 * Custom hook for managing spike sorting algorithms.
 * Handles algorithm listing, selection, parameter configuration, and execution.
 */

import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';
import { DEFAULT_JIMS_PARAMETERS, DEFAULT_KILOSORT_PARAMETERS } from '../constants/config';

/**
 * Get default parameters for an algorithm
 * @param {string} algorithmName - Algorithm name
 */
function getDefaultParameters(algorithmName) {
  switch (algorithmName) {
    case 'torchbci_jims':
      return { ...DEFAULT_JIMS_PARAMETERS };
    case 'kilosort4':
      return { ...DEFAULT_KILOSORT_PARAMETERS };
    default:
      return {};
  }
}

/**
 * Hook for algorithm management
 * @param {Object} options - Hook options
 * @param {boolean} options.autoFetch - Automatically fetch algorithms on mount
 */
export function useAlgorithms({ autoFetch = true } = {}) {
  const [algorithms, setAlgorithms] = useState([]);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('');
  const [parameters, setParameters] = useState(DEFAULT_JIMS_PARAMETERS);
  const [isRunning, setIsRunning] = useState(false);
  const [clusteringResults, setClusteringResults] = useState(null);
  const [error, setError] = useState(null);
  const [lastRunInfo, setLastRunInfo] = useState(null);

  /**
   * Fetch available algorithms from API
   */
  const fetchAlgorithms = useCallback(async () => {
    try {
      const data = await apiClient.getAlgorithms();
      const algorithmList = data.algorithms || [];
      setAlgorithms(algorithmList);
      
      // Auto-select first available algorithm
      if (algorithmList.length > 0 && !selectedAlgorithm) {
        const availableAlgorithm = algorithmList.find(a => a.available) || algorithmList[0];
        setSelectedAlgorithm(availableAlgorithm.name);
        setParameters(getDefaultParameters(availableAlgorithm.name));
      }
      
      setError(null);
      return algorithmList;
    } catch (err) {
      console.error('Error fetching algorithms:', err);
      setError(err.message);
      return [];
    }
  }, [selectedAlgorithm]);

  /**
   * Fetch stored clustering results
   */
  const fetchClusteringResults = useCallback(async () => {
    try {
      const data = await apiClient.getClusteringResults();
      
      if (data.available) {
        setClusteringResults(data);
        return data;
      }
      
      return null;
    } catch (err) {
      console.error('Error fetching clustering results:', err);
      return null;
    }
  }, []);

  /**
   * Change selected algorithm
   * @param {string} algorithmName - Name of algorithm to select
   */
  const selectAlgorithm = useCallback((algorithmName) => {
    setSelectedAlgorithm(algorithmName);
    setParameters(getDefaultParameters(algorithmName));
    setError(null);
  }, []);

  /**
   * Update algorithm parameters
   * @param {Object} newParameters - Parameters to merge
   */
  const updateParameters = useCallback((newParameters) => {
    setParameters(prev => ({ ...prev, ...newParameters }));
  }, []);

  /**
   * Reset parameters to defaults
   */
  const resetParameters = useCallback(() => {
    setParameters(getDefaultParameters(selectedAlgorithm));
  }, [selectedAlgorithm]);

  /**
   * Run spike sorting algorithm
   * @param {Object} customParameters - Optional custom parameters
   */
  const runAlgorithm = useCallback(async (customParameters = null) => {
    if (!selectedAlgorithm) {
      setError('No algorithm selected');
      return { success: false, error: 'No algorithm selected' };
    }
    
    // Find the algorithm info
    const algorithmInfo = algorithms.find(a => a.name === selectedAlgorithm);
    if (!algorithmInfo?.available) {
      setError('Selected algorithm is not available');
      return { success: false, error: 'Selected algorithm is not available' };
    }
    
    setIsRunning(true);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      const paramsToUse = customParameters || parameters;
      const result = await apiClient.runSpikeSorting(selectedAlgorithm, paramsToUse);
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        setClusteringResults(result);
        setLastRunInfo({
          algorithm: selectedAlgorithm,
          parameters: paramsToUse,
          duration,
          numClusters: result.numClusters,
          numSpikes: result.numSpikes,
          timestamp: new Date().toISOString(),
        });
        
        return { success: true, data: result };
      }
      
      setError(result.error || 'Algorithm execution failed');
      return { success: false, error: result.error };
    } catch (err) {
      console.error('Error running algorithm:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsRunning(false);
    }
  }, [selectedAlgorithm, algorithms, parameters]);

  /**
   * Clear clustering results
   */
  const clearResults = useCallback(() => {
    setClusteringResults(null);
    setLastRunInfo(null);
  }, []);

  /**
   * Get algorithm info by name
   * @param {string} name - Algorithm name
   */
  const getAlgorithmInfo = useCallback((name) => {
    return algorithms.find(a => a.name === name);
  }, [algorithms]);

  /**
   * Check if current algorithm supports parameters
   */
  const supportsParameters = useCallback(() => {
    const algo = algorithms.find(a => a.name === selectedAlgorithm);
    return algo && (algo.name === 'torchbci_jims' || algo.name === 'kilosort4') && algo.available;
  }, [algorithms, selectedAlgorithm]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchAlgorithms();
      fetchClusteringResults();
    }
  }, [autoFetch, fetchAlgorithms, fetchClusteringResults]);

  return {
    // State
    algorithms,
    selectedAlgorithm,
    parameters,
    isRunning,
    clusteringResults,
    error,
    lastRunInfo,
    
    // Actions
    fetchAlgorithms,
    fetchClusteringResults,
    selectAlgorithm,
    updateParameters,
    resetParameters,
    runAlgorithm,
    clearResults,
    
    // Utilities
    getAlgorithmInfo,
    supportsParameters,
    
    // Setters
    setClusteringResults,
  };
}

export default useAlgorithms;
