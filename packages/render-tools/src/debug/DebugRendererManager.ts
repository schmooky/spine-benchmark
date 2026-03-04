import { Container, Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer } from './DebugLayer.js';
import { DebugLayerFactory, DebugLayerType } from './DebugLayerFactory.js';
import { DebugFlagsManager, DebugFlags } from './DebugFlagsManager.js';
import { MeshDebugLayer } from './layers/MeshDebugLayer.js';

export class DebugRendererManager {
  private app: Application;
  private container: Container;
  private layers: Map<string, DebugLayer> = new Map();
  private flagsManager: DebugFlagsManager;
  private currentSpine: Spine | null = null;
  private isDisposed = false;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.flagsManager = new DebugFlagsManager();
    
    // Initialize debug layers
    this.initializeLayers();
  }

  private initializeLayers(): void {
    // Define all supported layer types
    const layerTypes: DebugLayerType[] = [
      'bones', 
      'pathConstraints', 
      'ikConstraints',
      'meshes',
      'transformConstraints',
      'physics'
    ];
    
    // Create all layers using the factory
    layerTypes.forEach(type => {
      try {
        const layer = DebugLayerFactory.createLayer(type, 
          DebugLayerFactory.getDefaultOptions(type, this.app));
        this.layers.set(type, layer);
        this.container.addChild(layer.getContainer());
      } catch (error) {
        console.warn(`DebugRendererManager: Failed to create ${type} layer:`, error);
      }
    });
  }

  public getContainer(): Container {
    return this.container;
  }

  public setSpine(spine: Spine | null): void {
    if (this.isDisposed) return;
    this.currentSpine = spine;
    if (!spine) {
      this.clearAll();
    }
  }

  public update(): void {
    if (this.isDisposed) return;
    const spine = this.currentSpine;
    if (!spine) return;

    // Update each layer based on its flag
    if (this.flagsManager.isLayerVisible('bones')) {
      this.layers.get('bones')?.update(spine);
    }

    if (this.flagsManager.isLayerVisible('pathConstraints')) {
      this.layers.get('pathConstraints')?.update(spine);
    }

    if (this.flagsManager.isLayerVisible('ikConstraints')) {
      this.layers.get('ikConstraints')?.update(spine);
    }

    // Update mesh layers based on their flags
    if (this.flagsManager.isLayerVisible('meshes')) {
      this.layers.get('meshes')?.update(spine);
    }
    
    // Update transform constraint layer
    if (this.flagsManager.isLayerVisible('transformConstraints')) {
      this.layers.get('transformConstraints')?.update(spine);
    }
    
    // Update physics constraint layer
    if (this.flagsManager.isLayerVisible('physics')) {
      this.layers.get('physics')?.update(spine);
    }
  }

  public setDebugFlags(flags: Partial<DebugFlags>): void {
    if (this.isDisposed) return;
    this.flagsManager.setDebugFlags(flags);
    
    // Update layer visibility based on flags
    this.layers.forEach((layer, type) => {
      const visible = this.flagsManager.isLayerVisible(type);
      layer.setVisible(visible);
    });

    // Force update if we have a spine
    if (this.currentSpine) {
      this.update();
    }
  }

  public getDebugFlags(): DebugFlags {
    return this.flagsManager.getDebugFlags();
  }

  public clearAll(): void {
    if (this.isDisposed) return;
    this.layers.forEach(layer => layer.clear());
  }

  public getLayer<T extends DebugLayer>(name: string): T | undefined {
    return this.layers.get(name) as T | undefined;
  }

  public destroy(): void {
    if (this.isDisposed) return;
    this.currentSpine = null;
    this.clearAll();
    this.layers.forEach(layer => layer.destroy());
    this.layers.clear();
    this.container.destroy({ children: true });
    this.isDisposed = true;
  }

  // Convenience methods for toggling specific debug features
  public togglePathConstraints(visible?: boolean): void {
    if (this.isDisposed) return;
    this.flagsManager.togglePathConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleIkConstraints(visible?: boolean): void {
    if (this.isDisposed) return;
    this.flagsManager.toggleIkConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleMeshes(visible?: boolean): void {
    if (this.isDisposed) return;
    this.flagsManager.toggleMeshes(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public togglePhysics(visible?: boolean): void {
    if (this.isDisposed) return;
    this.flagsManager.togglePhysics(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleTransformConstraints(visible?: boolean): void {
    if (this.isDisposed) return;
    this.flagsManager.toggleTransformConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public setHighlightedMeshSlot(slotName: string | null): void {
    if (this.isDisposed) return;
    const meshLayer = this.layers.get('meshes') as MeshDebugLayer | undefined;
    if (meshLayer) {
      meshLayer.setHighlightedSlot(slotName);
    }
  }
}
