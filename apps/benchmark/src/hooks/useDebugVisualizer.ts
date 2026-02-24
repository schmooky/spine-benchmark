import { useState, useCallback } from 'react';

/**
 * useDebugVisualizer - Custom hook for handling debug visualization operations
 * 
 * This hook encapsulates all debug visualization logic to reduce complexity in useSpineApp
 * and improve separation of concerns.
 */
export function useDebugVisualizer() {
  // Separate flags for each debug visualization type
  const [meshesVisible, setMeshesVisible] = useState(false);
  const [physicsVisible, setPhysicsVisible] = useState(false);
  const [ikVisible, setIkVisible] = useState(false);
  const [transformConstraintsVisible, setTransformConstraintsVisible] = useState(false);
  const [pathConstraintsVisible, setPathConstraintsVisible] = useState(false);

  /**
   * Toggle meshes visualization
   * @param visible - Optional boolean to set visibility state
   */
  const toggleMeshes = useCallback((visible?: boolean) => {
    setMeshesVisible(prev => visible ?? !prev);
  }, []);

  /**
   * Toggle physics visualization
   * @param visible - Optional boolean to set visibility state
   */
  const togglePhysics = useCallback((visible?: boolean) => {
    setPhysicsVisible(prev => visible ?? !prev);
  }, []);

  /**
   * Toggle IK constraints visualization
   * @param visible - Optional boolean to set visibility state
   */
  const toggleIk = useCallback((visible?: boolean) => {
    setIkVisible(prev => visible ?? !prev);
  }, []);

  /**
   * Toggle transform constraints visualization
   * @param visible - Optional boolean to set visibility state
   */
  const toggleTransformConstraints = useCallback((visible?: boolean) => {
    setTransformConstraintsVisible(prev => visible ?? !prev);
  }, []);

  /**
   * Toggle path constraints visualization
   * @param visible - Optional boolean to set visibility state
   */
  const togglePathConstraints = useCallback((visible?: boolean) => {
    setPathConstraintsVisible(prev => visible ?? !prev);
  }, []);

  return {
    meshesVisible,
    physicsVisible,
    ikVisible,
    transformConstraintsVisible,
    pathConstraintsVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints
  };
}