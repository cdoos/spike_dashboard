/**
 * useClickOutside Hook
 * 
 * Detects clicks outside of a referenced element.
 * Commonly used for closing dropdowns, modals, and menus.
 */

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to detect clicks outside of a referenced element
 * 
 * @param {Function} onClickOutside - Callback when click outside is detected
 * @param {boolean} isActive - Whether the listener is active (default: true)
 * @param {Array} excludeRefs - Additional refs to exclude from outside click detection
 * @returns {React.RefObject} Ref to attach to the target element
 * 
 * @example
 * function Dropdown({ isOpen, onClose }) {
 *   const dropdownRef = useClickOutside(onClose, isOpen);
 *   return <div ref={dropdownRef}>...</div>;
 * }
 */
export function useClickOutside(onClickOutside, isActive = true, excludeRefs = []) {
  const ref = useRef(null);
  
  const handleClickOutside = useCallback((event) => {
    // Check if click is inside the main ref
    if (ref.current && ref.current.contains(event.target)) {
      return;
    }
    
    // Check if click is inside any excluded refs
    for (const excludeRef of excludeRefs) {
      if (excludeRef.current && excludeRef.current.contains(event.target)) {
        return;
      }
    }
    
    // Click is outside, call the callback
    onClickOutside(event);
  }, [onClickOutside, excludeRefs]);
  
  useEffect(() => {
    if (!isActive) return;
    
    // Use mousedown for immediate response
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive, handleClickOutside]);
  
  return ref;
}

/**
 * Hook variant that accepts an existing ref
 * 
 * @param {React.RefObject} ref - Existing ref to use
 * @param {Function} onClickOutside - Callback when click outside is detected
 * @param {boolean} isActive - Whether the listener is active
 * 
 * @example
 * function Component() {
 *   const ref = useRef(null);
 *   useClickOutsideRef(ref, handleClose, isOpen);
 *   return <div ref={ref}>...</div>;
 * }
 */
export function useClickOutsideRef(ref, onClickOutside, isActive = true) {
  const handleClickOutside = useCallback((event) => {
    if (ref.current && !ref.current.contains(event.target)) {
      onClickOutside(event);
    }
  }, [ref, onClickOutside]);
  
  useEffect(() => {
    if (!isActive) return;
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive, handleClickOutside]);
}

export default useClickOutside;
