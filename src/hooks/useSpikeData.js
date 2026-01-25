/**
 * useSpikeData Hook
 * 
 * Custom hook for managing spike data fetching and caching.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import apiClient from '../api/client';
import LRUCache from '../utils/LRUCache';
import { CACHE_SIZE, FETCH_DEBOUNCE_MS, MAX_DATA_POINTS } from '../constants/config';

/**
 * Generate cache key for spike data
 */
function getCacheKey(channels, startTime, endTime, options) {
  const { spikeThreshold, invertData, usePrecomputed, dataType, filterType } = options;
  return `${channels.join(',')}_${startTime}_${endTime}_${spikeThreshold}_${invertData}_${usePrecomputed}_${dataType}_${filterType}`;
}

/**
 * Hook for spike data management
 * @param {Object} options - Hook options
 * @param {number} options.cacheSize - Size of the LRU cache
 */
export function useSpikeData({ cacheSize = CACHE_SIZE } = {}) {
  const [spikeData, setSpikeData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const cache = useRef(new LRUCache(cacheSize));
  const fetchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  /**
   * Clear the data cache
   */
  const clearCache = useCallback(() => {
    cache.current.clear();
  }, []);

  /**
   * Fetch spike data from API
   * @param {Object} params - Fetch parameters
   */
  const fetchSpikeData = useCallback(async ({
    channels,
    startTime,
    endTime,
    spikeThreshold = null,
    invertData = false,
    usePrecomputed = false,
    dataType = 'raw',
    filterType = 'highpass',
  }) => {
    if (!channels || channels.length === 0) {
      return {};
    }

    // Limit data points
    const limitedEndTime = Math.min(endTime, startTime + MAX_DATA_POINTS);
    
    // Check cache
    const cacheKey = getCacheKey(channels, startTime, limitedEndTime, {
      spikeThreshold,
      invertData,
      usePrecomputed,
      dataType,
      filterType,
    });
    
    const cachedData = cache.current.get(cacheKey);
    if (cachedData) {
      setSpikeData(cachedData);
      return cachedData;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiClient.getSpikeData({
        channels,
        startTime,
        endTime: limitedEndTime,
        spikeThreshold,
        invertData,
        usePrecomputed,
        dataType,
        filterType,
      });

      // Cache the result
      cache.current.set(cacheKey, data);
      setSpikeData(data);
      
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        return null;
      }
      console.error('Error fetching spike data:', err);
      setError(err.message);
      return {};
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch spike data with debouncing
   * @param {Object} params - Same as fetchSpikeData
   * @param {number} debounceMs - Debounce delay
   */
  const fetchSpikeDataDebounced = useCallback((params, debounceMs = FETCH_DEBOUNCE_MS) => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    return new Promise((resolve) => {
      fetchTimeoutRef.current = setTimeout(async () => {
        const result = await fetchSpikeData(params);
        resolve(result);
      }, debounceMs);
    });
  }, [fetchSpikeData]);

  /**
   * Check if precomputed spike times are available
   */
  const checkPrecomputedAvailable = useCallback(async () => {
    try {
      const data = await apiClient.checkSpikeTimesAvailable();
      return data.available;
    } catch (err) {
      console.error('Error checking precomputed spikes:', err);
      return false;
    }
  }, []);

  /**
   * Navigate to next or previous spike
   * @param {number} currentTime - Current time position
   * @param {string} direction - 'next' or 'prev'
   * @param {number[]} channels - Channels to search
   */
  const navigateSpike = useCallback(async (currentTime, direction, channels) => {
    try {
      const result = await apiClient.navigateSpike(currentTime, direction, channels);
      return result;
    } catch (err) {
      console.error('Error navigating spike:', err);
      setError(err.message);
      return null;
    }
  }, []);

  /**
   * Get spike preview waveform
   * @param {Object} params - Preview parameters
   */
  const getSpikePreview = useCallback(async (params) => {
    try {
      return await apiClient.getSpikePreview(params);
    } catch (err) {
      console.error('Error getting spike preview:', err);
      return null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    spikeData,
    isLoading,
    error,
    
    // Actions
    fetchSpikeData,
    fetchSpikeDataDebounced,
    checkPrecomputedAvailable,
    navigateSpike,
    getSpikePreview,
    clearCache,
    
    // Setters
    setSpikeData,
  };
}

export default useSpikeData;
