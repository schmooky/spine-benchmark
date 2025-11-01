import { Container, Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { DebugLayer } from './DebugLayer';
import { DebugLayerFactory, DebugLayerType } from './DebugLayerFactory';
import { DebugFlagsManager, DebugFlags } from './DebugFlagsManager';

export class DebugRendererManager {
  private app: Application;
  private container: Container;
  private layers: Map<string, DebugLayer> = new Map();
  private flagsManager: DebugFlagsManager;
  private currentSpine: Spine | null = null;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.flagsManager = new DebugFlagsManager();
    
    this.initializeLayers();
  }

  private initializeLayers(): void {
    const layerTypes: DebugLayerType[] = [
      'bones', 
      'pathConstraints', 
      'ikConstraints',
      'meshes',
      'transformConstraints',
      'physics'
    ];
    
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
    this.currentSpine = spine;
    if (!spine) {
      this.clearAll();
    }
  }

  public update(): void {
    if (this.flagsManager.isLayerVisible('bones')) {
      this.layers.get('bones')?.update(this.currentSpine);
    }

    if (this.flagsManager.isLayerVisible('pathConstraints')) {
      this.layers.get('pathConstraints')?.update(this.currentSpine);
    }

    if (this.flagsManager.isLayerVisible('ikConstraints')) {
      this.layers.get('ikConstraints')?.update(this.currentSpine);
    }

    if (this.flagsManager.isLayerVisible('meshes')) {
      this.layers.get('meshes')?.update(this.currentSpine);
    }
    
    if (this.flagsManager.isLayerVisible('transformConstraints')) {
      this.layers.get('transformConstraints')?.update(this.currentSpine);
    }
    
    if (this.flagsManager.isLayerVisible('physics')) {
      this.layers.get('physics')?.update(this.currentSpine);
    }
  }

  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.flagsManager.setDebugFlags(flags);
    
    this.layers.forEach((layer, type) => {
      const visible = this.flagsManager.isLayerVisible(type);
      layer.setVisible(visible);
    });

    if (this.currentSpine) {
      this.update();
    }
  }

  public getDebugFlags(): DebugFlags {
    return this.flagsManager.getDebugFlags();
  }

  public clearAll(): void {
    this.layers.forEach(layer => layer.clear());
  }

  public getLayer<T extends DebugLayer>(name: string): T | undefined {
    return this.layers.get(name) as T | undefined;
  }

  public destroy(): void {
    this.clearAll();
    this.layers.forEach(layer => layer.destroy());
    this.layers.clear();
    this.container.destroy({ children: true });
  }

  public togglePathConstraints(visible?: boolean): void {
    this.flagsManager.togglePathConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleIkConstraints(visible?: boolean): void {
    this.flagsManager.toggleIkConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleMeshes(visible?: boolean): void {
    this.flagsManager.toggleMeshes(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public togglePhysics(visible?: boolean): void {
    this.flagsManager.togglePhysics(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }

  public toggleTransformConstraints(visible?: boolean): void {
    this.flagsManager.toggleTransformConstraints(visible);
    this.setDebugFlags(this.flagsManager.getDebugFlags());
  }
}