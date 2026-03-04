import { Application } from 'pixi.js';
import { DebugLayer } from './DebugLayer.js';
import { PathConstraintDebugLayer } from './layers/PathConstraintDebugLayer.js';
import { IkConstraintDebugLayer } from './layers/IkConstraintDebugLayer.js';
import { BoneDebugLayer } from './layers/BoneDebugLayer.js';
import { MeshDebugLayer } from './layers/MeshDebugLayer.js';
import { TransformConstraintDebugLayer } from './layers/TransformConstraintDebugLayer.js';
import { PhysicsConstraintDebugLayer } from './layers/PhysicsConstraintDebugLayer.js';

/**
 * DebugLayerFactory - Factory for creating consistent debug layers
 * 
 * This factory provides a consistent interface for creating debug layers
 * and helps reduce complexity in DebugRendererManager.
 */

// Define layer types
export type DebugLayerType = 
  'bones' | 
  'meshes' | 
  'physics' | 
  'ikConstraints' | 
  'pathConstraints' | 
  'transformConstraints' |
  'clipping' |
  'blendModes' |
  'boundingBoxes';

// Define options for each layer type
interface BaseLayerOptions {
  app: Application;
  alpha?: number;
  strokeWidth?: number;
}

interface BoneLayerOptions extends BaseLayerOptions {
  boneColor?: number;
  jointColor?: number;
  jointRadius?: number;
  showBones?: boolean;
  showJoints?: boolean;
  showHierarchy?: boolean;
}

interface PathConstraintLayerOptions extends BaseLayerOptions {
  pathColor?: number;
  showPath?: boolean;
  showStartEnd?: boolean;
  showBoneConnections?: boolean;
  showTarget?: boolean;
}

interface IkConstraintLayerOptions extends BaseLayerOptions {
  boneColor?: number;
  targetColor?: number;
  startCircleColor?: number;
  showBoneChain?: boolean;
  showTarget?: boolean;
  showStartCircle?: boolean;
}

interface MeshLayerOptions extends BaseLayerOptions {
  triangleColor?: number;
  hullColor?: number;
  vertexColor?: number;
  highlightColor?: number;
  highlightLineWidth?: number;
  showTriangles?: boolean;
  showHull?: boolean;
  showVertices?: boolean;
  triangleAlpha?: number;
  hullAlpha?: number;
  vertexAlpha?: number;
  vertexRadius?: number;
}

interface TransformConstraintLayerOptions extends BaseLayerOptions {
  constraintBoneColor?: number;
  targetBoneColor?: number;
  limitColor?: number;
  showConstraints?: boolean;
  showTargets?: boolean;
  showLimits?: boolean;
  constraintBoneAlpha?: number;
  targetBoneAlpha?: number;
  limitAlpha?: number;
}

interface PhysicsConstraintLayerOptions extends BaseLayerOptions {
  boundsColor?: number;
  gravityColor?: number;
  windColor?: number;
  motionColor?: number;
  showBounds?: boolean;
  showGravity?: boolean;
  showWind?: boolean;
  showMotion?: boolean;
  boundsAlpha?: number;
  gravityAlpha?: number;
  windAlpha?: number;
  motionAlpha?: number;
}

type LayerOptions = 
  BoneLayerOptions | 
  PathConstraintLayerOptions | 
  IkConstraintLayerOptions | 
  MeshLayerOptions | 
  TransformConstraintLayerOptions | 
  PhysicsConstraintLayerOptions | 
  BaseLayerOptions;

/**
 * DebugLayerFactory class
 * Provides a consistent interface for creating debug layers
 */
export class DebugLayerFactory {
  /**
   * Create a debug layer of the specified type
   * @param type - The type of layer to create
   * @param options - Options for the layer
   * @returns DebugLayer instance
   */
  static createLayer(type: DebugLayerType, options: LayerOptions): DebugLayer {
    switch(type) {
      case 'bones':
        return new BoneDebugLayer({
          app: options.app,
          boneColor: (options as BoneLayerOptions).boneColor ?? 0xFFFFFF,
          jointColor: (options as BoneLayerOptions).jointColor ?? 0xFFFFFF,
          jointRadius: (options as BoneLayerOptions).jointRadius ?? 3,
          alpha: options.alpha ?? 0.6,
          strokeWidth: options.strokeWidth ?? 2,
          showBones: (options as BoneLayerOptions).showBones ?? true,
          showJoints: (options as BoneLayerOptions).showJoints ?? true
        });
      
      case 'pathConstraints':
        return new PathConstraintDebugLayer({
          app: options.app,
          pathColor: (options as PathConstraintLayerOptions).pathColor ?? 0x00ff00,
          alpha: options.alpha ?? 1.0,
          strokeWidth: options.strokeWidth ?? 1,
          showPath: (options as PathConstraintLayerOptions).showPath ?? true,
          showStartEnd: (options as PathConstraintLayerOptions).showStartEnd ?? true,
          showBoneConnections: (options as PathConstraintLayerOptions).showBoneConnections ?? true,
          showTarget: (options as PathConstraintLayerOptions).showTarget ?? true
        });
      
      case 'ikConstraints':
        return new IkConstraintDebugLayer({
          app: options.app,
          boneColor: (options as IkConstraintLayerOptions).boneColor ?? 0x00ffff,
          targetColor: (options as IkConstraintLayerOptions).targetColor ?? 0x00ffff,
          startCircleColor: (options as IkConstraintLayerOptions).startCircleColor ?? 0x00ffff,
          alpha: options.alpha ?? 1.0,
          strokeWidth: options.strokeWidth ?? 1,
          showBoneChain: (options as IkConstraintLayerOptions).showBoneChain ?? true,
          showTarget: (options as IkConstraintLayerOptions).showTarget ?? true,
          showStartCircle: (options as IkConstraintLayerOptions).showStartCircle ?? true
        });
      
      case 'meshes':
        return new MeshDebugLayer({
          app: options.app,
          triangleColor: (options as MeshLayerOptions).triangleColor ?? 0x00FF00,
          hullColor: (options as MeshLayerOptions).hullColor ?? 0xFF00FF,
          vertexColor: (options as MeshLayerOptions).vertexColor ?? 0xFFFF00,
          highlightColor: (options as MeshLayerOptions).highlightColor ?? 0x2DD4A8,
          highlightLineWidth: (options as MeshLayerOptions).highlightLineWidth ?? 1,
          alpha: options.alpha ?? 1.0,
          strokeWidth: options.strokeWidth ?? 1,
          showTriangles: (options as MeshLayerOptions).showTriangles ?? true,
          showHull: (options as MeshLayerOptions).showHull ?? true,
          showVertices: (options as MeshLayerOptions).showVertices ?? false,
          triangleAlpha: (options as MeshLayerOptions).triangleAlpha ?? 0.3,
          hullAlpha: (options as MeshLayerOptions).hullAlpha ?? 0.5,
          vertexAlpha: (options as MeshLayerOptions).vertexAlpha ?? 0.6,
          vertexRadius: (options as MeshLayerOptions).vertexRadius ?? 2
        });
      
      case 'transformConstraints':
        return new TransformConstraintDebugLayer({
          app: options.app,
          constraintBoneColor: (options as TransformConstraintLayerOptions).constraintBoneColor ?? 0x00FFFF,
          targetBoneColor: (options as TransformConstraintLayerOptions).targetBoneColor ?? 0xADD8E6,
          limitColor: (options as TransformConstraintLayerOptions).limitColor ?? 0x00FFFF,
          alpha: options.alpha ?? 1.0,
          strokeWidth: options.strokeWidth ?? 1,
          showConstraints: (options as TransformConstraintLayerOptions).showConstraints ?? true,
          showTargets: (options as TransformConstraintLayerOptions).showTargets ?? true,
          showLimits: (options as TransformConstraintLayerOptions).showLimits ?? false,
          constraintBoneAlpha: (options as TransformConstraintLayerOptions).constraintBoneAlpha ?? 0.6,
          targetBoneAlpha: (options as TransformConstraintLayerOptions).targetBoneAlpha ?? 0.7,
          limitAlpha: (options as TransformConstraintLayerOptions).limitAlpha ?? 0.5
        });
      
      case 'physics':
        return new PhysicsConstraintDebugLayer({
          app: options.app,
          boundsColor: (options as PhysicsConstraintLayerOptions).boundsColor ?? 0x800080,
          gravityColor: (options as PhysicsConstraintLayerOptions).gravityColor ?? 0x4B0082,
          windColor: (options as PhysicsConstraintLayerOptions).windColor ?? 0x9370DB,
          motionColor: (options as PhysicsConstraintLayerOptions).motionColor ?? 0x800080,
          alpha: options.alpha ?? 1.0,
          strokeWidth: options.strokeWidth ?? 1,
          showBounds: (options as PhysicsConstraintLayerOptions).showBounds ?? true,
          showGravity: (options as PhysicsConstraintLayerOptions).showGravity ?? true,
          showWind: (options as PhysicsConstraintLayerOptions).showWind ?? true,
          showMotion: (options as PhysicsConstraintLayerOptions).showMotion ?? true,
          boundsAlpha: (options as PhysicsConstraintLayerOptions).boundsAlpha ?? 0.5,
          gravityAlpha: (options as PhysicsConstraintLayerOptions).gravityAlpha ?? 0.7,
          windAlpha: (options as PhysicsConstraintLayerOptions).windAlpha ?? 0.6,
          motionAlpha: (options as PhysicsConstraintLayerOptions).motionAlpha ?? 0.6
        });
      
      case 'clipping':
      case 'blendModes':
      case 'boundingBoxes':
        throw new Error(`Layer type '${type}' not yet implemented`);
      
      default:
        throw new Error(`Unknown layer type: ${type}`);
    }
  }

  /**
   * Get default options for a layer type
   * @param type - The type of layer
   * @returns Default options for the layer type
   */
  static getDefaultOptions(type: DebugLayerType, app: Application): LayerOptions {
    switch(type) {
      case 'bones':
        return {
          app,
          boneColor: 0xFFFFFF,
          jointColor: 0xFFFFFF,
          jointRadius: 3,
          alpha: 0.6,
          strokeWidth: 2,
          showBones: true,
          showJoints: true
        };
      
      case 'pathConstraints':
        return {
          app,
          pathColor: 0x00ff00,
          alpha: 1.0,
          strokeWidth: 1,
          showPath: true,
          showStartEnd: true,
          showBoneConnections: true,
          showTarget: true
        };
      
      case 'ikConstraints':
        return {
          app,
          boneColor: 0x00ffff,
          targetColor: 0x00ffff,
          startCircleColor: 0x00ffff,
          alpha: 1.0,
          strokeWidth: 1,
          showBoneChain: true,
          showTarget: true,
          showStartCircle: true
        };
      
      case 'meshes':
        return {
          app,
          triangleColor: 0x00FF00,
          hullColor: 0xFF00FF,
          vertexColor: 0xFFFF00,
          highlightColor: 0x2DD4A8,
          highlightLineWidth: 1,
          alpha: 0.6,
          strokeWidth: 1,
          showTriangles: true,
          showHull: true,
          showVertices: false,
          triangleAlpha: 0.3,
          hullAlpha: 0.5,
          vertexAlpha: 0.6,
          vertexRadius: 2
        };
      
      case 'transformConstraints':
        return {
          app,
          constraintBoneColor: 0x00FFFF,
          targetBoneColor: 0xADD8E6,
          limitColor: 0x00FFFF,
          alpha: 1.0,
          strokeWidth: 1,
          showConstraints: true,
          showTargets: true,
          showLimits: false,
          constraintBoneAlpha: 0.6,
          targetBoneAlpha: 0.7,
          limitAlpha: 0.5
        };
      
      case 'physics':
        return {
          app,
          boundsColor: 0x800080,
          gravityColor: 0x4B0082,
          windColor: 0x9370DB,
          motionColor: 0x800080,
          alpha: 1.0,
          strokeWidth: 1,
          showBounds: true,
          showGravity: true,
          showWind: true,
          showMotion: true,
          boundsAlpha: 0.5,
          gravityAlpha: 0.7,
          windAlpha: 0.6,
          motionAlpha: 0.6
        };
      
      default:
        return {
          app,
          alpha: 1.0,
          strokeWidth: 1
        };
    }
  }
}
