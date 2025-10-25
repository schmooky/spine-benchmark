import { useState, useCallback } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { useSafeLocalStorage } from './useSafeLocalStorage';

export function useTimeScale(spineInstance: Spine | null) {
  const [currentTimeScale, setCurrentTimeScaleState] = useSafeLocalStorage('spine-benchmark-time-scale', 1.0);
  const [isTimeScalePanelOpen, setIsTimeScalePanelOpen] = useState(false);

  const setTimeScale = useCallback((scale: number) => {
    // Clamp the scale to reasonable bounds
    const clampedScale = Math.max(0.1, Math.min(3.0, scale));
    
    setCurrentTimeScaleState(clampedScale);
    
    // Apply to spine instance if available and not paused
    if (spineInstance && spineInstance.state.timeScale !== 0) {
      spineInstance.state.timeScale = clampedScale;
    }
  }, [spineInstance, setCurrentTimeScaleState]);

  const toggleTimeScalePanel = useCallback(() => {
    setIsTimeScalePanelOpen(prev => !prev);
  }, []);

  const closeTimeScalePanel = useCallback(() => {
    setIsTimeScalePanelOpen(false);
  }, []);

  const resetTimeScale = useCallback(() => {
    setTimeScale(1.0);
  }, [setTimeScale]);

  return {
    currentTimeScale,
    isTimeScalePanelOpen,
    setTimeScale,
    toggleTimeScalePanel,
    closeTimeScalePanel,
    resetTimeScale
  };
}