export interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showVertices: boolean;
  showBoundingBoxes: boolean;
  showPaths: boolean;
  showClipping: boolean;
  showPhysics: boolean;
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
  showPathConstraints: boolean;
}

export class DebugFlagsManager {
  private flags: DebugFlags;

  constructor() {
    // Initialize default flags - all debug visualizations disabled by default
    this.flags = {
      showBones: false,
      showRegionAttachments: false,
      showMeshTriangles: false,
      showMeshHull: false,
      showVertices: false,
      showBoundingBoxes: false,
      showPaths: false,
      showClipping: false,
      showPhysics: false,
      showIkConstraints: false,
      showTransformConstraints: false,
      showPathConstraints: false,
    };
  }

  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.flags = { ...this.flags, ...flags };
  }

  public getDebugFlags(): DebugFlags {
    return { ...this.flags };
  }

  public isLayerVisible(layerType: string): boolean {
    // Map debug flags to layer visibility
    switch(layerType) {
      case 'bones':
        return this.flags.showBones;
      case 'pathConstraints':
        return this.flags.showPathConstraints;
      case 'ikConstraints':
        return this.flags.showIkConstraints;
      case 'meshes':
        return this.flags.showMeshTriangles || this.flags.showMeshHull || this.flags.showVertices;
      case 'transformConstraints':
        return this.flags.showTransformConstraints;
      case 'physics':
        return this.flags.showPhysics;
      default:
        return false;
    }
  }

  // Convenience methods for toggling specific debug features
  public togglePathConstraints(visible?: boolean): void {
    const newValue = visible ?? !this.flags.showPathConstraints;
    this.setDebugFlags({ showPathConstraints: newValue });
  }

  public toggleIkConstraints(visible?: boolean): void {
    const newValue = visible ?? !this.flags.showIkConstraints;
    this.setDebugFlags({ showIkConstraints: newValue });
  }

  public toggleMeshes(visible?: boolean): void {
    const newValue = visible ?? !this.flags.showMeshTriangles;
    this.setDebugFlags({
      showMeshTriangles: newValue,
      showMeshHull: newValue,
      showVertices: newValue,
      showRegionAttachments: newValue,
      showBoundingBoxes: newValue,
      showPaths: newValue,
      showClipping: newValue
    });
  }

  public togglePhysics(visible?: boolean): void {
    const newValue = visible ?? !this.flags.showPhysics;
    this.setDebugFlags({
      showPhysics: newValue
    });
  }

  public toggleTransformConstraints(visible?: boolean): void {
    const newValue = visible ?? !this.flags.showTransformConstraints;
    this.setDebugFlags({
      showTransformConstraints: newValue
    });
  }
}
