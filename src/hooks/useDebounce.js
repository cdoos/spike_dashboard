/**
 * useDebounce Hook
 * 
 * Debounces a value or callback to limit how often it updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Debounce a value
 * 
 * @param {any} value - Value to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {any} Debounced value
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 500);
 * 
 * useEffect(() => {
 *   // This will only run 500ms after the user stops typing
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Create a debounced callback function
 * 
 * @param {Function} callback - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {Array} deps - Dependencies array
 * @returns {Function} Debounced function
 * 
 * @example
 * const debouncedSave = useDebouncedCallback(
 *   (data) => saveToServer(data),
 *   500,
 *   []
 * );
 */
export function useDebouncedCallback(callback, delay, deps = []) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Debounce with immediate option (leading edge)
 * 
 * @param {any} value - Value to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {boolean} immediate - Whether to update immediately on first change
 * @returns {any} Debounced value
 */
export function useDebounceImmediate(value, delay, immediate = false) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const isFirstRef = useRef(true);

  useEffect(() => {
    if (immediate && isFirstRef.current) {
      setDebouncedValue(value);
      isFirstRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay, immediate]);

  return debouncedValue;
}

export default useDebounce;
