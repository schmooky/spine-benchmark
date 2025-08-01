import { useEffect, useCallback, useRef } from 'react';

export interface WindowState {
  commandPalette: boolean;
  benchmarkInfo: boolean;
  benchmarkTab?: string;
}

export interface UseUrlHashReturn {
  updateHash: (state: Partial<WindowState>) => void;
  clearHash: () => void;
  getStateFromHash: () => WindowState;
  onHashChange: (callback: (state: WindowState) => void) => () => void;
}

/**
 * Custom hook to manage URL hash based on window/panel states
 */
export function useUrlHash(): UseUrlHashReturn {
  const hashChangeCallbacks = useRef<Set<(state: WindowState) => void>>(new Set());
  
  const parseHashToState = useCallback((hash: string): WindowState => {
    const state: WindowState = {
      commandPalette: false,
      benchmarkInfo: false
    };
    
    if (!hash || hash === '#') {
      return state;
    }
    
    // Remove the # and split by & for multiple states
    const hashParts = hash.substring(1).split('&');
    
    hashParts.forEach(part => {
      if (part === 'command-palette') {
        state.commandPalette = true;
      } else if (part === 'benchmark-info') {
        state.benchmarkInfo = true;
      } else if (part.startsWith('benchmark-tab=')) {
        state.benchmarkTab = part.split('=')[1];
        state.benchmarkInfo = true; // If tab is specified, panel should be open
      }
    });
    
    return state;
  }, []);
  
  const stateToHash = useCallback((state: WindowState): string => {
    const hashParts: string[] = [];
    
    if (state.commandPalette) {
      hashParts.push('command-palette');
    }
    
    if (state.benchmarkInfo) {
      if (state.benchmarkTab) {
        hashParts.push(`benchmark-tab=${state.benchmarkTab}`);
      } else {
        hashParts.push('benchmark-info');
      }
    }
    
    return hashParts.length > 0 ? `#${hashParts.join('&')}` : '';
  }, []);
  
  const updateHash = useCallback((newState: Partial<WindowState>) => {
    const currentState = parseHashToState(window.location.hash);
    const updatedState = { ...currentState, ...newState };
    
    // Clean up state - if benchmarkInfo is false, remove benchmarkTab
    if (!updatedState.benchmarkInfo) {
      delete updatedState.benchmarkTab;
    }
    
    const newHash = stateToHash(updatedState);
    
    // Only update if hash actually changed
    if (window.location.hash !== newHash) {
      if (newHash) {
        window.history.replaceState(null, '', newHash);
      } else {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, [parseHashToState, stateToHash]);
  
  const clearHash = useCallback(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  
  const getStateFromHash = useCallback((): WindowState => {
    return parseHashToState(window.location.hash);
  }, [parseHashToState]);

  const onHashChange = useCallback((callback: (state: WindowState) => void) => {
    hashChangeCallbacks.current.add(callback);
    
    // Return cleanup function
    return () => {
      hashChangeCallbacks.current.delete(callback);
    };
  }, []);

  // Listen for browser navigation (back/forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const newState = parseHashToState(window.location.hash);
      hashChangeCallbacks.current.forEach(callback => callback(newState));
    };

    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [parseHashToState]);
  
  return {
    updateHash,
    clearHash,
    getStateFromHash,
    onHashChange
  };
}