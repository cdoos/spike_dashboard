/**
 * useLocalStorage Hook
 * 
 * Syncs state with localStorage for persistence across sessions.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to persist state in localStorage
 * 
 * @param {string} key - localStorage key
 * @param {any} initialValue - Initial value if no stored value exists
 * @returns {[any, Function, Function]} [storedValue, setValue, removeValue]
 * 
 * @example
 * const [settings, setSettings, removeSettings] = useLocalStorage('user-settings', {});
 */
export function useLocalStorage(key, initialValue) {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when value changes
  const setValue = useCallback((value) => {
    try {
      // Allow value to be a function for same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // Remove value from localStorage
  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for changes in other tabs/windows
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === key && event.newValue !== null) {
        try {
          setStoredValue(JSON.parse(event.newValue));
        } catch (error) {
          console.warn(`Error parsing localStorage change for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook variant with expiration support
 * 
 * @param {string} key - localStorage key
 * @param {any} initialValue - Initial value
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {[any, Function, Function]}
 */
export function useLocalStorageWithExpiry(key, initialValue, ttlMs) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      
      const { value, expiry } = JSON.parse(item);
      
      if (expiry && Date.now() > expiry) {
        window.localStorage.removeItem(key);
        return initialValue;
      }
      
      return value;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      const item = {
        value: valueToStore,
        expiry: Date.now() + ttlMs,
      };
      
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue, ttlMs]);

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
