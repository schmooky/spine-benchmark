

## src\App.tsx

```
import { Application } from 'pixi.js';
import React, { useEffect, useRef, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Layout, Menu, Button, Space, Drawer, Tabs, Card, Progress, Typography, Tooltip, ColorPicker, Select, Switch, Spin } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  PictureOutlined,
  CloseOutlined,
  BgColorsOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ReloadOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  LineChartOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { AnimationControls } from './components/AnimationControls';
import { InfoPanel } from './components/InfoPanel';
import EventTimeline from './components/EventTimeline';
import { useToast } from './hooks/ToastContext';
import { useSafeLocalStorage } from './hooks/useSafeLocalStorage';
import { useSpineApp } from './hooks/useSpineApp';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const App: React.FC = () => {
  const [app, setApp] = useState<Application | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [backgroundColor, setBackgroundColor] = useSafeLocalStorage('spine-benchmark-bg-color', '#282b30');
  const [hasBackgroundImage, setHasBackgroundImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState('');
  const [showEventTimeline, setShowEventTimeline] = useState(false);
  
  const { addToast } = useToast();
  const { 
    spineInstance, 
    loadSpineFiles,
    isLoading: spineLoading,
    benchmarkData,
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible
  } = useSpineApp(app);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    let cleanupFunction: (() => void) | undefined;
    
    const initApp = async () => {
      try {
        const pixiApp = new Application();
        await pixiApp.init({
          backgroundColor: parseInt(backgroundColor.replace('#', '0x')),
          canvas: canvasRef.current!,
          resizeTo: canvasRef.current!.parentElement || undefined,
          antialias: true,
          resolution: 2,
          autoDensity: true,
        });
        
        app?.destroy();
        setApp(pixiApp);
        
        cleanupFunction = () => {
          pixiApp.destroy();
        };
      } catch (error) {
        console.error("Failed to initialize Pixi application:", error);
        addToast(`Failed to initialize graphics: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
    };
    
    initApp();
    
    return () => {
      if (cleanupFunction) cleanupFunction();
    };
  }, []);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    e.currentTarget.classList.remove('highlight');
    
    try {
      setIsLoading(true);
      
      const items = e.dataTransfer?.items;
      if (!items || items.length === 0) {
        if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
          addToast('No files were dropped', 'error');
          return;
        }
        handleSpineFiles(e.dataTransfer.files);
        return;
      }
      
      const itemsArray = Array.from(items);
      const fileList: File[] = [];
      
      const promises = itemsArray.map(item => {
        const entry = item.webkitGetAsEntry();
        if (entry) {
            return traverseFileTree(entry, "", fileList);
        } else {
            return Promise.resolve();
        }
      });
      
      await Promise.all(promises);
      
      if (fileList.length === 0) {
        addToast('No valid files found in the dropped items', 'error');
        return;
      }
      
      const dataTransfer = new DataTransfer();
      fileList.forEach(file => dataTransfer.items.add(file));
      const files = dataTransfer.files;
      
      await handleSpineFiles(files);
      
    } catch (error) {
      console.error('Error processing dropped items:', error);
      addToast(`Error processing dropped files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('highlight');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('highlight');
  };

  const handleSpineFiles = async (files: FileList) => {
    try {
      const jsonFile = Array.from(files).find(file => file.name.endsWith('.json'));
      if (jsonFile) {
        const content = await jsonFile.text();
        if (content.includes('"spine":"4.1')) {
          addToast('Warning: This file uses Spine 4.1. The benchmark is designed for Spine 4.2. Version will be adjusted automatically.', 'warning');
          
          const modifiedContent = content.replace(/"spine":"4.1[^"]*"/, '"spine":"4.2.0"');
          const modifiedFile = new File([modifiedContent], jsonFile.name, { type: 'application/json' });
          
          const newFileList = Array.from(files);
          const index = newFileList.findIndex(f => f.name === jsonFile.name);
          if (index !== -1) {
            newFileList[index] = modifiedFile;
            
            const dataTransfer = new DataTransfer();
            newFileList.forEach(file => dataTransfer.items.add(file));
            
            await loadSpineFiles(dataTransfer.files);
            return;
          }
        }
      }
      
      await loadSpineFiles(files);
    } catch (error) {
      console.error("Error handling Spine files:", error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      if (!file.type.startsWith('image/')) {
        addToast('Please select an image file.', 'error');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target && typeof e.target.result === 'string') {
          const base64Data = e.target.result;
          
          try {
            await setBackgroundImage(base64Data);
            setHasBackgroundImage(true);
          } catch (error) {
            console.error('Error setting background image:', error);
            addToast('Failed to set background image.', 'error');
          }
        } else {
          addToast('Failed to read image file.', 'error');
        }
      };
      
      reader.onerror = () => {
        addToast('Error reading the image file.', 'error');
      };
      
      reader.readAsDataURL(file);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveBackground = () => {
    clearBackgroundImage();
    setHasBackgroundImage(false);
  };

  useEffect(() => {
    if (app) {
      app.renderer.background.color = parseInt(backgroundColor.replace('#', '0x'));
    }
  }, [backgroundColor, app]);

  const menuItems = [
    {
      key: 'info',
      icon: <InfoCircleOutlined />,
      label: 'Information',
      children: [
        {
          key: 'benchmark',
          icon: <DashboardOutlined />,
          label: 'Benchmark Info',
          onClick: () => setShowBenchmark(!showBenchmark)
        },
        {
          key: 'docs',
          icon: <FileTextOutlined />,
          label: 'Documentation',
          onClick: () => window.open('https://github.com/schmooky/spine-benchmark/blob/main/README.md', '_blank')
        },
        {
          key: 'timeline',
          icon: <LineChartOutlined />,
          label: 'Event Timeline',
          onClick: () => setShowEventTimeline(!showEventTimeline)
        }
      ]
    },
    {
      key: 'visuals',
      icon: <SettingOutlined />,
      label: 'Visual Settings',
      children: [
        {
          key: 'background',
          icon: <PictureOutlined />,
          label: 'Background Image',
          onClick: () => fileInputRef.current?.click()
        },
        {
          key: 'bgcolor',
          icon: <BgColorsOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Background Color
              <ColorPicker 
                value={backgroundColor} 
                onChange={(color) => setBackgroundColor(color.toHexString())}
                size="small"
                presets={[
                  {
                    label: 'Dark Theme',
                    colors: [
                      '#282b30', '#1a1a1a', '#333333', '#121212', '#2c2c2c',
                      '#2b2d42', '#1d3557', '#3c096c', '#240046', '#1b263b'
                    ],
                  },
                ]}
              />
            </div>
          )
        }
      ]
    },
    {
      key: 'debug',
      icon: <ApiOutlined />,
      label: 'Debug Visualization',
      children: [
        {
          key: 'meshes',
          icon: <AppstoreOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Mesh Visualization</span>
              <Switch checked={meshesVisible} onChange={toggleMeshes} size="small" />
            </div>
          )
        },
        {
          key: 'physics',
          icon: <ThunderboltOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>Physics Constraints</span>
              <Switch checked={physicsVisible} onChange={togglePhysics} size="small" />
            </div>
          )
        },
        {
          key: 'ik',
          icon: <LinkOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>IK Constraints</span>
              <Switch checked={ikVisible} onChange={toggleIk} size="small" />
            </div>
          )
        }
      ]
    }
  ];

  function traverseFileTree(item: any, path: string, fileList: File[]): Promise<void> {
    path = path || "";
    
    return new Promise((resolve, reject) => {
        if (item.isFile) {
            item.file((file: File) => {
                console.log("File found:", path + file.name);
                Object.defineProperty(file, 'fullPath', {
                    value: path + file.name,
                    writable: false
                });
                fileList.push(file);
                resolve();
            }, reject);
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            
            const readAllEntries = (entries: any[] = []): Promise<any[]> => {
                return new Promise((resolveEntries, rejectEntries) => {
                    dirReader.readEntries((results: any[]) => {
                        if (results.length) {
                            entries = entries.concat(Array.from(results));
                            readAllEntries(entries).then(resolveEntries).catch(rejectEntries);
                        } else {
                            resolveEntries(entries);
                        }
                    }, rejectEntries);
                });
            };
            
            readAllEntries().then((entries) => {
                console.log(`Directory found: ${path + item.name}/ (${entries.length} entries)`);
                
                const promises = entries.map(entry => 
                    traverseFileTree(entry, path + item.name + "/", fileList)
                );
                
                Promise.all(promises)
                    .then(() => resolve())
                    .catch(reject);
            }).catch(reject);
        } else {
            resolve();
        }
    });
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        style={{
          background: '#1f1f1f',
          borderRight: '1px solid #303030'
        }}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: '1px solid #303030'
        }}>
          <Title level={4} style={{ margin: 0, color: '#fff' }}>
            {collapsed ? 'SB' : 'Spine Benchmark'}
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          style={{ background: 'transparent' }}
        />
      </Sider>
      
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: '#141414',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #303030'
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
              color: '#fff'
            }}
          />
          
          {hasBackgroundImage && (
            <Button 
              type="text"
              icon={<CloseOutlined />}
              onClick={handleRemoveBackground}
              style={{ color: '#fff' }}
            >
              Remove Background
            </Button>
          )}
        </Header>
        
        <Content style={{ 
          position: 'relative',
          background: backgroundColor,
          overflow: 'hidden'
        }}>
          <div 
            className="canvas-container"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <canvas ref={canvasRef} id="pixiCanvas" />
            
            {!spineInstance && (
              <div className="drop-area">
                <AppstoreOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p>Drop Spine files or folders here (JSON, Atlas, and Images)</p>
              </div>
            )}
            
            {(isLoading || spineLoading) && (
              <div className="loading-indicator">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <p>Loading...</p>
              </div>
            )}
          </div>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          
          {spineInstance && (
            <div className="playback-controls-container">
              <AnimationControls 
                spineInstance={spineInstance} 
                onAnimationChange={setCurrentAnimation} 
              />
            </div>
          )}
        </Content>
      </Layout>
      
      <Drawer
        title="Spine Benchmark Analysis"
        placement="right"
        width={800}
        onClose={() => setShowBenchmark(false)}
        open={showBenchmark}
        bodyStyle={{ padding: 0 }}
      >
        {benchmarkData && <InfoPanel data={benchmarkData} onClose={() => setShowBenchmark(false)} />}
      </Drawer>
      
      <Drawer
        title="Animation Event Timeline"
        placement="bottom"
        height={600}
        onClose={() => setShowEventTimeline(false)}
        open={showEventTimeline}
      >
        {spineInstance && (
          <EventTimeline 
            spineInstance={spineInstance} 
            currentAnimation={currentAnimation}
          />
        )}
      </Drawer>
      
      <ToastContainer
        position="top-center"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </Layout>
  );
};

export default App;
```


## src\CameraContainer.ts

```
import gsap from "gsap";
import { Application, Container } from "pixi.js";
import { SpineMeshOutline } from "./Outline";
import { Spine, SpineDebugRenderer } from "@esotericsoftware/spine-pixi-v8";

export class CameraContainer extends Container {
  originalWidth: any;
  originalHeight: any;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  
  meshOutline: SpineMeshOutline | null = null;
  
  
  
  private isMeshVisible: boolean = false;
  private onMeshVisibilityChange?: (isVisible: boolean) => void;
  
  
  //@ts-ignore
  contextMenu: HTMLDivElement;
  
  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
    
    // Initialize context menu
    this.createContextMenu();
    
    // Setup event listeners
    this.setupEventListeners();
    
    window.addEventListener('resize', () => this.onResize());
  }
  
  
  // Add this method to set the callback
  public setMeshVisibilityCallback(callback: (isVisible: boolean) => void) {
    this.onMeshVisibilityChange = callback;
  }
  
  
  private createContextMenu() {
    // Create context menu element
    this.contextMenu = document.createElement('div');
    this.contextMenu.style.position = 'fixed';
    this.contextMenu.style.display = 'none';
    this.contextMenu.style.backgroundColor = '#282b30';
    this.contextMenu.style.border = '1px solid #ccc';
    this.contextMenu.style.padding = '5px';
    this.contextMenu.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.2)';
    this.contextMenu.style.zIndex = '1000';
    
    // Create Center Viewport button
    const centerButton = document.createElement('div');
    centerButton.innerText = 'Center Viewport';
    centerButton.style.padding = '5px 10px';
    centerButton.style.cursor = 'pointer';
    centerButton.style.userSelect = 'none';
    
    centerButton.addEventListener('mouseenter', () => {
      centerButton.style.backgroundColor = '#383b40';
    });
    
    centerButton.addEventListener('mouseleave', () => {
      centerButton.style.backgroundColor = 'transparent';
    });
    
    centerButton.addEventListener('click', () => {
      this.centerViewport();
      this.hideContextMenu();
    });
    
    // Create separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.backgroundColor = '#383b40';
    separator.style.margin = '5px 0';
    
    // Create Show Mesh toggle button
    const meshToggleContainer = document.createElement('div');
    meshToggleContainer.style.padding = '5px 10px';
    meshToggleContainer.style.cursor = 'pointer';
    meshToggleContainer.style.userSelect = 'none';
    meshToggleContainer.style.display = 'flex';
    meshToggleContainer.style.alignItems = 'center';
    meshToggleContainer.style.gap = '8px';
    
    const checkbox = document.createElement('div');
    checkbox.style.width = '14px';
    checkbox.style.height = '14px';
    checkbox.style.border = '2px solid #666';
    checkbox.style.display = 'flex';
    checkbox.style.alignItems = 'center';
    checkbox.style.justifyContent = 'center';
    
    const checkmark = document.createElement('div');
    checkmark.style.width = '8px';
    checkmark.style.height = '8px';
    checkmark.style.backgroundColor = '#666';
    checkmark.style.display = this.isMeshVisible ? 'block' : 'none';
    
    const label = document.createElement('span');
    label.innerText = 'Show Mesh';
    
    checkbox.appendChild(checkmark);
    meshToggleContainer.appendChild(checkbox);
    meshToggleContainer.appendChild(label);
    
    meshToggleContainer.addEventListener('mouseenter', () => {
      meshToggleContainer.style.backgroundColor = '#383b40';
    });
    
    meshToggleContainer.addEventListener('mouseleave', () => {
      meshToggleContainer.style.backgroundColor = 'transparent';
    });
    
    meshToggleContainer.addEventListener('click', () => {
      this.isMeshVisible = !this.isMeshVisible;
      checkmark.style.display = this.isMeshVisible ? 'block' : 'none';
      
      // Call the callback if it exists
      if (this.onMeshVisibilityChange) {
        this.onMeshVisibilityChange(this.isMeshVisible);
      }
    });
    
    // Add all elements to context menu
    this.contextMenu.appendChild(centerButton);
    this.contextMenu.appendChild(separator);
    this.contextMenu.appendChild(meshToggleContainer);
    
    document.body.appendChild(this.contextMenu);
  }
  
  private setupEventListeners() {
    const view = document.getElementById('leftPanel')!;
    
    // Mouse down event for panning
    view.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = true;
        this.lastPosition = { x: e.clientX, y: e.clientY };
        view.style.cursor = 'grabbing';
      }
    });
    
    // Mouse move event for panning
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging && this.lastPosition) {
        const dx = e.clientX - this.lastPosition.x;
        const dy = e.clientY - this.lastPosition.y;
        
        this.x += dx;
        this.y += dy;
        
        this.lastPosition = { x: e.clientX, y: e.clientY };
      }
    });
    
    // Mouse up event to stop panning
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = false;
        this.lastPosition = null;
        view.style.cursor = 'default';
      }
    });
    
    // Context menu event
    view.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });
    
    // Hide context menu when clicking outside
    window.addEventListener('click', (e: MouseEvent) => {
      if (!this.contextMenu.contains(e.target as Node)) {
        this.hideContextMenu();
      }
    });
  }
  
  private showContextMenu(x: number, y: number) {
    this.contextMenu.style.display = 'block';
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
  }
  
  private hideContextMenu() {
    this.contextMenu.style.display = 'none';
  }
  
  private centerViewport() {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    gsap.to(this, {
      x: w / 2,
      y: h / 2,
      duration: 0.5,
      ease: "power2.out",
    });
  }
  
  onResize() {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    this.x = w / 2;
    this.y = h / 2;
  }
  
  lookAtChild(spine: Spine) {
    const debugRenderer = new SpineDebugRenderer();
    debugRenderer.registerSpine(spine);

    this.app.ticker.add(() => {
      if(this.isMeshVisible)      debugRenderer.renderDebug(spine);
      else {
        const debugDisplayObjects = debugRenderer['registeredSpines'].get(spine);
        debugDisplayObjects.skeletonXY.clear();
        debugDisplayObjects.regionAttachmentsShape.clear();
        debugDisplayObjects.meshTrianglesLine.clear();
        debugDisplayObjects.meshHullLine.clear();
        debugDisplayObjects.clippingPolygon.clear();
        debugDisplayObjects.boundingBoxesRect.clear();
        debugDisplayObjects.boundingBoxesCircle.clear();
        debugDisplayObjects.boundingBoxesPolygon.clear();
        debugDisplayObjects.pathsCurve.clear();
        debugDisplayObjects.pathsLine.clear();
        for (let len = debugDisplayObjects.bones.children.length; len > 0; len--) {
          debugDisplayObjects.bones.children[len - 1].destroy({ children: true, texture: true, textureSource: true });
      }
      }
    });
    console.log(`Looking at: `, spine)

    const padding = 20;
    // Get the bounds of the object in global space
    let bounds: { width: number; height: number; x: number; y: number } =
    spine.getBounds();
    if (bounds.width == 0 || bounds.height == 0) {
      bounds.width = spine.skeleton.data.width / 2;
      bounds.height = spine.skeleton.data.height / 2;
    }
    
    // Calculate the scale needed to fit the object within the screen
    const scaleX = (this.app.screen.width - padding * 2) / bounds.width;
    const scaleY = (this.app.screen.height - padding * 2) / bounds.height;
    let scale = Math.min(scaleX, scaleY);
    spine.scale = scale;
    
    const minScale = 0.2;
    const maxScale = 10;
    const scaleStep = 0.1;
    
    // Calculate the position to center the object
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;
    
    // Animate the camera to look at the object
    gsap.to(this, {
      x: x,
      y: y,
      duration: 1,
      ease: "power2.out",
    });
    
    scale = +(Math.ceil(scale*20)/20).toFixed(2);
    this.scale.set(scale);
    this.setCanvasScaleDebugInfo(scale);
    document
    .getElementById("leftPanel")!
    .addEventListener("wheel", (event) => {
      event.preventDefault();
      
      // Determine scroll direction
      const scrollDirection = Math.sign(event.deltaY);
      
      // Update scale based on scroll direction
      scale -= scrollDirection * scaleStep;
      
      scale = +(Math.ceil(scale*20)/20).toFixed(2);
      
      // Clamp scale between minScale and maxScale
      scale = Math.max(minScale, Math.min(maxScale, scale));
      
      // Apply the new scale to the container
      this.scale.set(scale);
      
      this.setCanvasScaleDebugInfo(scale);
    });
  }
  
  setCanvasScaleDebugInfo(scale: number) {
    const debug = document.getElementById("canvasScale");
    if (!debug) return;
    debug.innerText = `Scale: x${scale.toFixed(2)}`;
  }
  
  public destroy() {
    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    
    // Remove context menu from DOM
    if (this.contextMenu && this.contextMenu.parentNode) {
      this.contextMenu.parentNode.removeChild(this.contextMenu);
    }
    
    // Call parent destroy method
    super.destroy();
  }
  
  // Add getter for mesh visibility state
  public getMeshVisibility(): boolean {
    return this.isMeshVisible;
  }
  
  // Add setter for mesh visibility state
  public setMeshVisibility(isVisible: boolean) {
    this.isMeshVisible = isVisible;
    // Update checkbox visual if context menu exists
    const checkmark = this.contextMenu.querySelector('div > div > div') as HTMLDivElement;
    if (checkmark) {
      checkmark.style.display = isVisible ? 'block' : 'none';
    }
    // Call the callback if it exists
    if (this.onMeshVisibilityChange) {
      this.onMeshVisibilityChange(isVisible);
    }
  }
  
}

```


## src\Outline.ts

```
import { Application, Container, Graphics } from "pixi.js";
import {NumberArrayLike, Spine, VertexAttachment} from '@esotericsoftware/spine-pixi-v8'


const areaThreshold = 72;

const outlineColor = 0x2a2a2a;

export class SpineMeshOutline {
    app: Application;
    spine: Spine;
    graphics: Graphics;
    scale: number = 1;

    constructor(app: Application, spineInstance: Spine) {
        this.spine = spineInstance;
        this.graphics = new Graphics();
        this.spine.addChild(this.graphics as unknown as Container);
        
        // Bind the update method to maintain correct context
        this.update = this.update.bind(this);
        this.app = app;
        // Start updating
        app.ticker.add(this.update);
    }

        // Add this helper function to calculate triangle area
        private calculateTriangleArea(v1: [number, number], v2: [number, number], v3: [number, number]): number {
            // Using the formula: Area = |x1(y2 - y3) + x2(y3 - y1) + x3(y1 - y2)| / 2
            const area = Math.abs(
                v1[0] * (v2[1] - v3[1]) +
                v2[0] * (v3[1] - v1[1]) +
                v3[0] * (v1[1] - v2[1])
            ) / 2;
            return area;
        }

    drawMeshOutline(vertices: NumberArrayLike, triangles: Array<number>, color = outlineColor, thickness = 2, alpha = 0.8) {
        const graphics = this.graphics;
        if(!triangles) return;
        // Clear previous drawings
        
        // Set line style
        graphics.lineStyle(thickness*this.scale, color, alpha);

        // Create a Set to store unique edges
        const edges = new Set<string>();

        

        // Process triangles to find edges
        for (let i = 0; i < triangles.length; i += 3) {
            const vertices1 = [
                vertices[triangles[i] * 2],
                vertices[triangles[i] * 2 + 1]
            ];
            const vertices2 = [
                vertices[triangles[i + 1] * 2],
                vertices[triangles[i + 1] * 2 + 1]
            ];
            const vertices3 = [
                vertices[triangles[i + 2] * 2],
                vertices[triangles[i + 2] * 2 + 1]
            ];

                        // Calculate triangle area
                        const area = this.calculateTriangleArea(vertices1  as [number,number], vertices2  as [number,number], vertices3  as [number,number]);
                        // If area is less than threshold, fill the triangle with semi-transparent red
                        if (area < areaThreshold) {
                            graphics.beginFill(outlineColor, 0.2); // Red color with 20% opacity
                            graphics.moveTo(vertices1[0], vertices1[1]);
                            graphics.lineTo(vertices2[0], vertices2[1]);
                            graphics.lineTo(vertices3[0], vertices3[1]);
                            graphics.lineTo(vertices1[0], vertices1[1]);
                            graphics.endFill();
                        }

            // Add edges (sorted to avoid duplicates)
            this.addEdge(edges, vertices1 as [number,number], vertices2 as [number,number]);
            this.addEdge(edges, vertices2 as [number,number], vertices3 as [number,number]);
            this.addEdge(edges, vertices3 as [number,number], vertices1 as [number,number]);
        }

        // Draw all unique edges
        for (const edge of edges) {
            const [x1, y1, x2, y2] = edge.split(',').map(Number);
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
        }
    }

    addEdge(edges:Set<string>, point1: [number,number], point2:  [number,number]) {
        // Sort points to ensure consistent edge representation
        const [x1, y1] = point1;
        const [x2, y2] = point2;
        
        if (x1 === x2 && y1 === y2) return; // Skip zero-length edges
        
        const edgeKey = x1 < x2 || (x1 === x2 && y1 < y2)
            ? `${x1},${y1},${x2},${y2}`
            : `${x2},${y2},${x1},${y1}`;
            
        edges.add(edgeKey);
    }

    update() {
    // Clear previous drawings
    this.graphics?.clear();

    // Iterate through all slots
    for (const slot of this.spine.skeleton.slots) {
        const attachment = slot.attachment;
        
        // Check if attachment is a mesh
        if (attachment && (attachment as VertexAttachment).vertices) {
            // Skip if slot is invisible or attachment has no name
            if(slot.color.a === 0 || attachment.name == null) continue;

            // Get mesh vertices
            const vertices = new Float32Array((attachment as VertexAttachment).vertices.length);
            (attachment as VertexAttachment).computeWorldVertices(
                slot,
                0,
                (attachment as VertexAttachment).vertices.length,
                vertices,
                0,
                2
            );

            // Draw outline for this mesh
            this.drawMeshOutline(
                vertices,
                (attachment as any).triangles, // Cast to any to access triangles
                outlineColor, // Red color
                0.75, // Line thickness
                0.75 // Alpha
            );
        }
    }
}

    destroy() {
        this.app.ticker.remove(this.update);
        this.graphics.destroy();
    }
}
```


## src\PerformanceMonitor.ts

```
export class PerformanceMonitor {
    private lastTime: number;
    private frames: number;

    constructor() {
        this.lastTime = performance.now();
        this.frames = 0;
    }

    public getPerformanceInfo() {
        const now = performance.now();
        this.frames++;

        if (now > this.lastTime + 1000) {
            const fps = (this.frames * 1000) / (now - this.lastTime);
            this.lastTime = now;
            this.frames = 0;

            return { fps };
        }

        return { fps: 0 };
    }
}
```


## src\SpineAnalyzer.ts

```
import { analyzeClipping } from "./analyze/clipping";
import { analyzeSpineBlendModes } from "./analyze/blendModes";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { analyzeMeshes } from "./analyze/mesh";
import { analyzePhysics } from "./analyze/physics";
import { createSkeletonTree } from "./analyze/skeleton";

export class SpineAnalyzer {
  static analyze(spineInstance: Spine) {
      analyzeClipping(spineInstance);
      analyzeSpineBlendModes(spineInstance);
      analyzeMeshes(spineInstance);
      analyzePhysics(spineInstance);
      createSkeletonTree(spineInstance);
  }
}

```


## src\SpineBenchmark.ts

```
import { Application, Assets } from "pixi.js";
import { SpineAnalyzer } from "./SpineAnalyzer";
import { CameraContainer } from "./CameraContainer";

import {
  AtlasAttachmentLoader,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import { extensions, ExtensionType, Texture } from 'pixi.js';

const blobParser = {
    extension: ExtensionType.LoadParser,
    test: (url: string) => url.startsWith('blob:'),
    async load(url: string) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(Texture.from(img));
            img.onerror = reject;
            img.src = url;
        });
    }
};

extensions.add(blobParser);

export class SpineBenchmark {
  private app: Application;
  private spineInstance: Spine | null = null; // Store the single Spine instance
  private isBinary = false;

  constructor(app: Application) {
    this.app = app;
  }

  public async loadSpineFiles(files: FileList) {
    const acceptedFiles = Array.from(files);
    const imageFiles = acceptedFiles.filter(file => file.type.match(/image/));
    
    try {
        // Load textures
        const assetBundle: Record<string, any> = {};
        
        await Promise.all(imageFiles.map(async (file) => {
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.readAsDataURL(file);
            });
            
            assetBundle[file.name] = {
                src: base64,
                data: { type: file.type }
            };
        }));
        
        // Add and load bundle
        Assets.addBundle('spineAssets', assetBundle);
        const textures = await Assets.loadBundle('spineAssets');

        // Load skeleton and atlas files
        const skelFile = acceptedFiles.find(file => /^.+\.skel$/.test(file.name));
        const jsonFile = acceptedFiles.find(file => file.type === "application/json");
        const atlasFile = acceptedFiles.find(file => file.name.endsWith('.atlas'));
        
        let skeletonData;
        if (skelFile) {
            this.isBinary = true;
            skeletonData = await this.readFileAsArrayBuffer(skelFile);
        } else if (jsonFile) {
            const jsonText = await this.readFileAsText(jsonFile);
            skeletonData = JSON.parse(jsonText);
        } else {
            throw new Error('No skeleton file (.skel or .json) found');
        }
        
        if (!atlasFile) {
            throw new Error('No atlas file found');
        }
        const atlasText = await this.readFileAsText(atlasFile);
        
        // Create spine asset
        await this.createSpineAsset(skeletonData, atlasText, textures);
        
    } catch (error) {
        console.error('Error loading Spine files:', error);
    }
}

private readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
  });
}

private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
  });
}

private async createSpineAsset(
  data: any, 
  atlasText: string, 
  textures: Record<string, Texture>
): Promise<void> {
  console.log("Creating Spine Asset");
  // Create atlas
  const spineAtlas = new TextureAtlas(atlasText);
  
  // Process each page in the atlas
  for (const page of spineAtlas.pages) {
      const pageName = page.name;
      const texture = textures[pageName];

      if (!texture) {
          console.error(`Missing texture for page: ${pageName}`);
          throw new Error(`Missing texture for page: ${pageName}`);
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);
      
      // Set the texture for the page
      page.setTexture(spineTexture);

      // Handle PMA (Premultiplied Alpha) if needed
      // if (page.pma) {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLIED_ALPHA;
      // } else {
      //     texture.alphaMode = ALPHA_MODES.PREMULTIPLY_ON_UPLOAD;
      // }
      
  }

  // Create attachment loader
  const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

  // Create skeleton data
  const skeletonJson = new SkeletonJson(atlasLoader);
  const skeletonData = skeletonJson.readSkeletonData(data);

  // Create spine instance
  const spine = new Spine(skeletonData);
  this.app.stage.addChild(spine
  );

  const camera = this.app.stage.children[0] as CameraContainer;

  // Remove previous Spine instance if exists
  if (this.spineInstance) {
    camera.removeChild(this.spineInstance);
  }

  camera.addChild(spine);
  camera.lookAtChild(spine);

  SpineAnalyzer.analyze(spine)

  this.createAnimationButtons(spine);
  this.createSkinButtons(spine);
}

  // UI functions:
  private createAnimationButtons(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    const container = document.getElementById("sidebarAnimations")!;

    container.classList.remove("hidden");

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    animations.forEach((animation) => {
      const button = document.createElement("button");
      button.textContent = animation.name;

      button.addEventListener("click", () => {
        console.log(`Set ${animation.name}`)
        spineInstance.state.setAnimation(0, animation.name, false);
      });

      container.appendChild(button);
    });
  }

  private createSkinButtons(spineInstance: Spine) {
    const skins = spineInstance.skeleton.data.skins;
    const container = document.getElementById("sidebarSkins")!;

    container.classList.remove("hidden");

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    skins.forEach((skin) => {
      const button = document.createElement("button");
      button.textContent = skin.name;

      button.addEventListener("click", () => {
        spineInstance.skeleton.setSkinByName(skin.name);
        spineInstance.skeleton.setSlotsToSetupPose();
      });

      container.appendChild(button);
    });
  }

  // Usage example:
  // Assuming you have a Spine instance called 'spineInstance'
  // const spineInstance = new PIXI.spine.Spine(spineData);
  // const analysis = analyzeSpineSkeleton(spineInstance);

  playSpineAnimationsInSequence(spineInstance: Spine) {
    const animations = spineInstance.skeleton.data.animations;
    let currentIndex = 0;
    spineInstance.state.addListener({
      complete: function () {
        currentIndex++;
        setTimeout(playNextAnimation, 250);
      },
    });
    function playNextAnimation() {
      if (currentIndex < animations.length) {
        const animation = animations[currentIndex];

        document.getElementById(
          "currentAnimation"
        )!.innerHTML = `Animation: ${animation.name}`;
        spineInstance.state.setAnimation(0, animation.name, false);
      } else {
        currentIndex = 0;
        setTimeout(playNextAnimation, 250);
      }
    }

    playNextAnimation();
  }
}

```


## src\analyze\blendModes.ts

```
import { html } from "../text/blend.md";
import { BlendMode, Spine } from "@esotericsoftware/spine-pixi-v8";


document.querySelector("#blendModesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeSpineBlendModes(spine: Spine): void {
  console.log('Analyze: Blend Modes')
  const skeletonData = spine.skeleton.data;
  const animations = skeletonData.animations;
  const slots = skeletonData.slots;
  
  // Helper function to check if a blend mode is non-normal
  const isNonNormalBlendMode = (blendMode: BlendMode): boolean => {
    return blendMode !== BlendMode.Normal;
  };
  
  const nonNormalBlendModeSlots = checkSkeletonForNonNormalBlendModes(spine);
  appendBlendModeWarning(nonNormalBlendModeSlots);
  
  // Analyze each animation
  animations.forEach(animation => {
    let maxVisibleNonNormalBlendModes = 0;
    const nonNormalBlendModeSlots: Set<string> = new Set();
    
    // Check each keyframe of the animation
    for (let time = 0; time <= animation.duration; time += 1/60) { // Assuming 30 FPS
      let visibleNonNormalBlendModes = 0;
      
      slots.forEach(slot => {
        if(!slot.attachmentName) return
        const attachment = spine.skeleton.getAttachmentByName(slot.name,slot.attachmentName);
        if (attachment && slot.visible && slot.color.a > 0) {
          const blendMode = slot.blendMode;
          if (isNonNormalBlendMode(blendMode)) {
            visibleNonNormalBlendModes++;
            nonNormalBlendModeSlots.add(slot.name);
          }
        }
      });
      
      maxVisibleNonNormalBlendModes = Math.max(maxVisibleNonNormalBlendModes, visibleNonNormalBlendModes);
    }
    
    // If more than two non-normal blend modes are visible simultaneously
    if (maxVisibleNonNormalBlendModes > 2) {
      appendBlendModeAnimationWarning(animation.name, maxVisibleNonNormalBlendModes, Array.from(nonNormalBlendModeSlots));
    }
  });
}

function appendBlendModeAnimationWarning(
  animationName: string,
  maxVisibleNonNormalBlendModes: number,
  affectedSlots: string[]
): void {
  const container = document.getElementById("blendModesContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "warning";
  infoBlock.innerHTML = `
    <h3>Blend Mode Problems in ${animationName}</h3>
  `;
  
  container.appendChild(infoBlock);
}
function checkSkeletonForNonNormalBlendModes(spine: Spine): Map<string,BlendMode> {
  const nonNormalBlendModeSlots = new Map<string,BlendMode>();
  const skeletonData = spine.skeleton.data;
  
  for (let i = 0; i < skeletonData.slots.length; i++) {
    const slotData = skeletonData.slots[i];
    const blendMode = slotData.blendMode;
    if (blendMode !== BlendMode.Normal) {
      nonNormalBlendModeSlots.set(slotData.name, blendMode);
    }
  }
  
  return nonNormalBlendModeSlots;
}

function appendBlendModeWarning(
  blendModeMap: Map<string, BlendMode>
): void {
  const container = document.getElementById("blendModesContainer");
  if (!container) return;
  
  // Count occurrences of each blend mode
  const blendModeCount = new Map<BlendMode, number>();
  let nonNormalCount = 0;
  
  blendModeMap.forEach((blendMode, slotName) => {
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    if (blendMode !== BlendMode.Normal) {
      nonNormalCount++;
    }
  });
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "";
  infoBlock.innerHTML = `
    <p><strong>Total non-normal blend modes:</strong> ${nonNormalCount}</p>
          ${Array.from(blendModeCount).map(([mode, count]) => `
        <p>${BlendMode[mode]} blend mode: ${count}</p>
      `).join('')}
  `;
  
  document.getElementById('benchmarkSummary')!.appendChild(infoBlock);
}
```


## src\analyze\clipping.ts

```
import { ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import { html } from "../text/clipping.md";

document.querySelector("#clippingContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeClipping(spine: Spine): void {
  console.log('Analyze: Clipping')
  console.log(spine.skeleton.slots)
  const masks: [string,number][] = []
  spine.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
      appendMaskInfo(slot.data.name, verticesCount);
      masks.push([slot.data.name, verticesCount])
    }
  });
  appendMaskSummary(masks)
}

function appendMaskInfo(slotName: string, verticesCount: number): void {
  const container = document.getElementById("clippingContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.className = verticesCount > 4 ? "warning" : "info";
  infoBlock.innerHTML = `
    <h3>Mask Detected</h3>
    <p><strong>Slot name:</strong> ${slotName}</p>
    <p><strong>Vertices count:</strong> ${verticesCount}</p>
  `;
  
  container.appendChild(infoBlock);
}


function appendMaskSummary(masks: [string,number][]): void {
  const container = document.getElementById("clippingContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.innerHTML = `
    <h3><strong>Mask Count: ${masks.length}</strong></h3>
    <p>Mask Vertice Counts: ${masks.map((_)=>_[1]).join(', ')}</p>
  `;

  document.getElementById('benchmarkSummary')!.appendChild(infoBlock);
}
```


## src\analyze\mesh.ts

```
import { DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import { attributes, html } from "../text/mesh.md";

document.querySelector("#meshTableContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

function mergeMaps(
  map1: Map<string, any>,
  map2: Map<string, any>,
  map3: Map<string, any>,
  map4: Map<string, boolean>
): Map<string, Record<string, any>> {
  const mergedMap = new Map();

  // Merge keys from both maps
  const allKeys = new Set([...map1.keys(), ...map2.keys(), ...map3.keys()]);

  allKeys.forEach((key) => {
    mergedMap.set(key, {
      vertices: map1.get(key) ?? "",
      isChanged: map2.get(key) ?? "",
      isBoneWeighted: map3.get(key) ?? 0,
      isUsedInMeshSequence: map4.get(key) ?? false,
    });
  });

  return mergedMap;
}

function createTable(
  mergedMap: Map<string, Record<string, any>>,
  columns: string[]
) {
  const table = document.createElement("table");
  table.className = "merged-table";

  // Create table header
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  columns.forEach((text) => {
    const th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });

  // Create table body
  const tbody = table.createTBody();
  mergedMap.forEach((value, key) => {
    const row = tbody.insertRow();
    const cellKey = row.insertCell();
    const cellValue1 = row.insertCell();
    const cellValue2 = row.insertCell();
    const cellValue3 = row.insertCell();
    const cellValue4 = row.insertCell();

    cellKey.textContent = key;
    cellValue1.textContent = value.vertices;
    cellValue2.textContent = value.isChanged;
    cellValue3.textContent = value.isBoneWeighted;
    cellValue4.textContent = value.isUsedInMeshSequence;

    // if ((!value.isChanged && !value.isBoneWeighted) || value.vertices > 64) {
    //   row.classList.add("error");
    // } else if (value.vertices > 8) {
    //   row.classList.add("warn");
    // }

    function interpolateColor(color1: [number,number,number], color2: [number,number,number], factor: number) {
      const result = color1.slice();
      for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
      }
      return result;
    }

    // Set color based on vertex count
    function setRowColor(row: HTMLTableRowElement, vertexCount: number) {
      const minVertices = 1;
      const maxVertices = 2000;
      const colorStart: [number,number,number] = [255, 243, 224]; // #fff3e0
      const colorMiddle: [number,number,number] = [255, 204, 128]; // #ffcc80
      const colorEnd: [number,number,number] = [239, 154, 154]; // #ef9a9a

      // Calculate logarithmic factor
      const logFactor = Math.log(vertexCount) / Math.log(maxVertices);

      let color;
      if (logFactor <= 0.5) {
        color = interpolateColor(colorStart, colorMiddle, logFactor * 2);
      } else {
        color = interpolateColor(colorMiddle, colorEnd, (logFactor - 0.5) * 2);
      }

      // Make color darker as it approaches maxVertices
      const darkenFactor = Math.min(logFactor * 0.08, 0.08);
      color = color.map((c) => Math.round(c * (1 - darkenFactor)));

      row.style.backgroundColor = rgbToRgba(`rgb(${color})`);
    }

    // Apply color to the row
    setRowColor(row, value.vertices);
  });

  return table;
}

export function analyzeMeshes(spineInstance: Spine) {
  if (!spineInstance || !spineInstance.skeleton) {
    console.error("Invalid Spine instance provided");
    return;
  }
  console.group("analyzeMeshes");
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.skeleton.data.animations;

  let totalMeshCount = 0;
  let changedMeshCount = 0;
  const meshesWithChangesInTimelines = new Map();
  const meshWorldVerticesLengths = new Map<string, number>();
  const meshesWithBoneWeights = new Map<string, number>();
  const meshesWithParents = new Map<string, boolean>();
  // Count total meshes
  skeleton.slots.forEach((slot) => {
    const attachment = slot.getAttachment();
    if (
      attachment &&
      attachment instanceof MeshAttachment
    ) {
      totalMeshCount++;
      if (attachment.bones?.length)
        meshesWithBoneWeights.set(slot.data.name, attachment.bones.length);
      meshWorldVerticesLengths.set(
        slot.data.name,
        attachment.worldVerticesLength
      );
      meshesWithChangesInTimelines.set(slot.data.name, false);
      meshesWithParents.set(slot.data.name, attachment.getParentMesh() != null);
    }
  });
  console.table(
    Array.from(meshWorldVerticesLengths).reduce(
      (acc: Record<string, number>, [slotName, value]) => {
        acc[slotName] = value;
        return acc;
      },
      {}
    )
  );
  // Analyze animations for mesh changes
  animations.forEach((animation) => {
    const timelines = animation.timelines;

    timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const slotIndex = timeline.slotIndex;
        const slot = skeleton.slots[slotIndex];
        const attachment = slot.getAttachment();

        if (
          attachment &&
          attachment instanceof MeshAttachment
        ) {
          meshesWithChangesInTimelines.set(slot.data.name, true);
        }
      }
    });
  });

  const allKeys = new Set([
    ...meshWorldVerticesLengths.keys(),
    ...meshesWithChangesInTimelines.keys(),
    ...meshesWithBoneWeights.keys(),
    ...meshesWithParents.keys(),
  ]);

  const combinedArray = Array.from(allKeys, (key) => ({
    Key: key,
    "Mesh Vertices": meshWorldVerticesLengths.get(key) || "",
    "Is Changed in Animation": meshesWithChangesInTimelines.get(key),
    "Is Affected By Bones": meshesWithBoneWeights.get(key) ?? 0,
    "Is Used in Mesh Sequence": meshesWithParents.get(key) ?? false,
  }));

  console.table(combinedArray);

  const mergedMap = mergeMaps(
    meshWorldVerticesLengths,
    meshesWithChangesInTimelines,
    meshesWithBoneWeights,
    meshesWithParents
  );
  const table = createTable(mergedMap, [
    "Слот",
    "Вершины",
    "Деформируется в таймлайнах",
    "Связан с костями",
    "Имеет родительский меш",
  ]);

  document.getElementById("meshTableContainer")!.appendChild(table);

  console.groupEnd();
}

function appendMeshMisuseInfo(
  slotName: string,
  isUsedInMeshSequence: boolean
): void {
  const container = document.getElementById("meshTableContainer");
  if (!container) return;

  const infoBlock = document.createElement("div");
  infoBlock.className = "warning";
  infoBlock.innerHTML = `
        <h3>Potential Mesh Misuse Detected</h3>
        <p><strong>Slot name:</strong> ${slotName}</p>
        <p><strong>Deformed in timeline:</strong> false</p>
        <p><strong>Affected by bones</strong> false</p>
        <p><strong>Used in sequence:</strong> ${isUsedInMeshSequence}</p>
  
  `;

  container.appendChild(infoBlock);
}


function rgbToRgba(rgbString: string, alpha = 0.8) {
  // Regular expression to match the RGB values
  const rgbRegex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/;
  
  // Extract RGB values from the input string
  const match = rgbString.match(rgbRegex);
  
  if (!match) {
    throw new Error("Invalid RGB string format. Expected 'rgb(r, g, b)'");
  }
  
  // Parse the RGB values
  const [, r, g, b] = match.map(Number);
  
  // Validate RGB values
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    throw new Error("RGB values must be between 0 and 255");
  }
  
  // Validate alpha value
  if (alpha < 0 || alpha > 1) {
    throw new Error("Alpha value must be between 0 and 1");
  }
  
  // Construct the RGBA string
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```


## src\analyze\physics.ts

```
import { Spine } from "@esotericsoftware/spine-pixi-v8"

export function analyzePhysics(spine: Spine): void {
  console.log('Analyze: Physics')
  console.log(spine.skeleton.physicsConstraints)
  
}
```


## src\analyze\skeleton.ts

```
import { Spine, Bone, Slot } from "@esotericsoftware/spine-pixi-v8";

export function createSkeletonTree(spineInstance: Spine) {
  if (!spineInstance || !spineInstance.skeleton) {
    console.error("Invalid Spine instance provided");
    return;
  }

  console.group("createSkeletonTree");
  const skeleton = spineInstance.skeleton;
  
  // Create the tree container
  const treeContainer = document.createElement("div");
  treeContainer.className = "skeleton-tree-container";
  
  // Create tree root
  const treeUl = document.createElement("ul");
  treeUl.className = "skeleton-tree";
  
  // Add skeleton root node
  const rootLi = document.createElement("li");
  rootLi.className = "tree-node skeleton-root";
  
  const rootSpan = document.createElement("span");
  rootSpan.textContent = `Skeleton (${skeleton.data.name || "unnamed"})`;
  rootSpan.className = "node-label";
  rootLi.appendChild(rootSpan);
  
  // Build bones hierarchy
  const bonesUl = document.createElement("ul");
  const rootBones = skeleton.bones.filter(bone => !bone.parent);
  
  rootBones.forEach(rootBone => {
    bonesUl.appendChild(buildBoneNode(rootBone));
  });
  
  rootLi.appendChild(bonesUl);
  treeUl.appendChild(rootLi);
  treeContainer.appendChild(treeUl);
  
  // Add slots information
  const slotsUl = document.createElement("ul");
  slotsUl.className = "slots-list";
  
  skeleton.slots.forEach(slot => {
    const slotLi = buildSlotNode(slot);
    slotsUl.appendChild(slotLi);
  });
  
  rootLi.appendChild(slotsUl);
  
  // Append to document
  document.getElementById("skeletonTreeContainer")?.appendChild(treeContainer) || 
    document.body.appendChild(treeContainer);
  
  // Add basic styling
  addTreeStyles();
  
  console.groupEnd();
}

function buildBoneNode(bone: Bone): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tree-node bone-node";
  
  const span = document.createElement("span");
  span.className = "node-label";
  span.textContent = `Bone: ${bone.data.name} (x: ${bone.x.toFixed(2)}, y: ${bone.y.toFixed(2)})`;
  li.appendChild(span);
  
  // Add children bones
  const children = bone.children;
  if (children.length > 0) {
    const ul = document.createElement("ul");
    children.forEach(childBone => {
      ul.appendChild(buildBoneNode(childBone));
    });
    li.appendChild(ul);
  }
  
  // Make node collapsible
  span.addEventListener("click", (e) => {
    e.stopPropagation();
    li.classList.toggle("collapsed");
  });
  
  return li;
}

function buildSlotNode(slot: Slot): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tree-node slot-node";
  
  const span = document.createElement("span");
  span.className = "node-label";
  span.textContent = `Slot: ${slot.data.name} (Bone: ${slot.bone.data.name})`;
  
  const attachment = slot.getAttachment();
  if (attachment) {
    const attachmentSpan = document.createElement("span");
    attachmentSpan.className = "attachment-label";
    attachmentSpan.textContent = `Attachment: ${attachment.name}`;
    li.appendChild(attachmentSpan);
  }
  
  li.appendChild(span);
  
  return li;
}

function addTreeStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .skeleton-tree-container {
      margin: 20px;
      font-family: Arial, sans-serif;
    }
    .skeleton-tree {
      list-style: none;
      padding-left: 0;
    }
    .tree-node {
      margin: 5px 0;
      position: relative;
    }
    .node-label {
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 3px;
    }
    .node-label:hover {
      background-color: #f0f0f0;
    }
    .bone-node ul {
      padding-left: 20px;
      margin: 5px 0;
    }
    .slots-list {
      padding-left: 20px;
      margin: 5px 0;
      border-left: 1px dashed #ccc;
    }
    .collapsed > ul {
      display: none;
    }
    .attachment-label {
      display: block;
      padding-left: 25px;
      font-size: 0.9em;
      color: #666;
    }
    .skeleton-root > .node-label {
      font-weight: bold;
      background-color: #e0e0e0;
    }
  `;
  document.head.appendChild(style);
}

// Usage example:
// const spine = new Spine(spineData);
// createSkeletonTree(spine);
```


## src\components\AnimationControls.tsx

```
import React, { useState, useEffect } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Button, Space, Select, Switch, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ReloadOutlined
} from '@ant-design/icons';

interface AnimationControlsProps {
  spineInstance: Spine;
  onAnimationChange?: (animationName: string) => void;
}

export const AnimationControls: React.FC<AnimationControlsProps> = ({ 
  spineInstance, 
  onAnimationChange 
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState<string>('');
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  
  useEffect(() => {
    if (!spineInstance) return;
    
    const animationNames = spineInstance.skeleton.data.animations.map(anim => anim.name);
    setAnimations(animationNames);
    
    if (animationNames.length > 0) {
      setCurrentAnimation(animationNames[0]);
      playAnimation(animationNames[0], false);
    }
    
    return () => {
      // Cleanup if needed
    };
  }, [spineInstance]);
  
  useEffect(() => {
    if (!spineInstance) return;
    
    if (isPlaying) {
      spineInstance.state.timeScale = 1;
    } else {
      spineInstance.state.timeScale = 0;
    }
  }, [isPlaying, spineInstance]);
  
  const playAnimation = (name: string, loop: boolean = isLooping) => {
    if (!spineInstance) return;
    
    spineInstance.state.setAnimation(currentTrack, name, loop);
    setCurrentAnimation(name);
    setIsPlaying(true);
    
    if (onAnimationChange) {
      onAnimationChange(name);
    }
  };
  
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };
  
  const toggleLoop = () => {
    setIsLooping(!isLooping);
    
    if (currentAnimation) {
      playAnimation(currentAnimation, !isLooping);
    }
  };
  
  const stopAnimation = () => {
    if (!spineInstance) return;
    
    spineInstance.state.clearTrack(currentTrack);
    setIsPlaying(false);
  };
  
  const rewindAnimation = () => {
    if (!spineInstance || !currentAnimation) return;
    
    playAnimation(currentAnimation);
  };
  
  const previousAnimation = () => {
    if (!spineInstance || animations.length === 0) return;
    
    const currentIndex = animations.indexOf(currentAnimation);
    const newIndex = currentIndex > 0 ? currentIndex - 1 : animations.length - 1;
    playAnimation(animations[newIndex]);
  };
  
  const nextAnimation = () => {
    if (!spineInstance || animations.length === 0) return;
    
    const currentIndex = animations.indexOf(currentAnimation);
    const newIndex = currentIndex < animations.length - 1 ? currentIndex + 1 : 0;
    playAnimation(animations[newIndex]);
  };
  
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 20, 
      left: '50%', 
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.7)',
      padding: '12px 24px',
      borderRadius: 8,
      backdropFilter: 'blur(10px)',
      zIndex: 1000
    }}>
      <Space size="large">
        <Select
          value={currentAnimation}
          onChange={(value) => playAnimation(value)}
          style={{ width: 180 }}
          options={animations.map(name => ({ label: name, value: name }))}
          placeholder="Select animation"
        />
        
        <Space>
          <Tooltip title="Previous Animation">
            <Button icon={<StepBackwardOutlined />} onClick={previousAnimation} />
          </Tooltip>
          
          <Tooltip title="Stop">
            <Button icon={<StopOutlined />} onClick={stopAnimation} />
          </Tooltip>
          
          <Tooltip title={isPlaying ? "Pause" : "Play"}>
            <Button 
              type="primary" 
              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} 
              onClick={togglePlay}
              size="large"
            />
          </Tooltip>
          
          <Tooltip title="Restart Animation">
            <Button icon={<ReloadOutlined />} onClick={rewindAnimation} />
          </Tooltip>
          
          <Tooltip title="Next Animation">
            <Button icon={<StepForwardOutlined />} onClick={nextAnimation} />
          </Tooltip>
        </Space>
        
        <Switch 
          checkedChildren="Loop" 
          unCheckedChildren="Once" 
          checked={isLooping} 
          onChange={toggleLoop} 
        />
      </Space>
    </div>
  );
};
```


## src\components\BackgroundImage.tsx

```
import React, { useRef } from 'react';
import { ImageIcon } from '../components/Icons';
import { IconButton } from './IconButton';

interface BackgroundImageProps {
  onImageSelect: (imageUrl: string) => void;
}

export const BackgroundImageUploader: React.FC<BackgroundImageProps> = ({ onImageSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if the file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      
      // Create a URL for the selected image
      const imageUrl = URL.createObjectURL(file);
      onImageSelect(imageUrl);
      
      // Reset the input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="background-image-uploader">
      <IconButton 
        icon={<ImageIcon />} 
        onClick={handleButtonClick}
        tooltip="Upload Background Image"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
};
```


## src\components\BackgroundImageUploader.tsx

```
import React, { useRef } from 'react';
import { ImageIcon } from './Icons';
import { IconButton } from './IconButton';

interface BackgroundImageUploaderProps {
  onImageSelect: (imageUrl: string) => void;
}

export const BackgroundImageUploader: React.FC<BackgroundImageUploaderProps> = ({ onImageSelect }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Check if the file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }
      
      // Create a URL for the selected image
      const imageUrl = URL.createObjectURL(file);
      onImageSelect(imageUrl);
      
      // Reset the input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="background-image-uploader">
      <IconButton 
        icon={<ImageIcon />} 
        onClick={handleButtonClick}
        tooltip="Upload Background Image"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
};
```


## src\components\ColorPicker.tsx

```
import React, { useState } from 'react';
import { SwatchIcon } from './Icons';
import { IconButton } from './IconButton';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const predefinedColors = [
    '#282b30', // Default dark
    '#1a1a1a', // Darker
    '#333333', // Dark gray
    '#121212', // Almost black
    '#2c2c2c', // Charcoal
    '#2b2d42', // Navy blue
    '#1d3557', // Dark blue
    '#3c096c', // Dark purple
    '#240046', // Deep purple
    '#1b263b', // Slate blue
  ];
  
  const togglePicker = () => {
    setIsOpen(!isOpen);
  };
  
  const handleColorSelect = (selectedColor: string) => {
    onChange(selectedColor);
    setIsOpen(false);
  };
  
  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };
  
  return (
    <div className="color-picker-container">
      <IconButton 
        icon={<SwatchIcon />} 
        onClick={togglePicker}
        tooltip="Change Background Color"
        active={isOpen}
      />
      
      {isOpen && (
        <div className="color-picker-dropdown">
          <div className="color-picker-swatches">
            {predefinedColors.map((c, index) => (
              <button
                key={index}
                className={`color-swatch ${c === color ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => handleColorSelect(c)}
                title={c}
              />
            ))}
          </div>
          
          <div className="color-picker-custom">
            <input
              type="color"
              value={color}
              onChange={handleCustomColorChange}
              title="Custom color"
            />
            <input 
              type="text"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
              title="Hex color code (e.g. #282b30)"
            />
          </div>
        </div>
      )}
    </div>
  );
};
```


## src\components\DebugToggle.tsx

```
import React from 'react';

// Icon for the meshes debug button
export const MeshIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
  </svg>
);

// Icon for the physics debug button
export const PhysicsIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19.5 14.5M9.75 3.104c.14.049.282.1.423.152m.423-.152a5.96 5.96 0 0 1 1.905 0c.14.049.282.1.423.152M9.75 17.5l-4-2.5v-6M19.5 17.5l-4-2.5v-6" />
  </svg>
);

// Icon for the IK constraints debug button
export const IkIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="bold">IK</text>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10Z" strokeOpacity="0.6" />
  </svg>
);

interface DebugToggleProps {
  onClick: () => void;
  active: boolean;
  tooltip: string;
  icon: React.ReactNode;
}

export const DebugToggle: React.FC<DebugToggleProps> = ({ onClick, active, tooltip, icon }) => {
  return (
    <button 
      className={`icon-button ${active ? 'active' : ''}`} 
      onClick={onClick}
      title={tooltip}
    >
      {icon}
    </button>
  );
};
```


## src\components\EventTimeline.tsx

```
import React, { useState, useEffect, useRef } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Card, Typography, Progress, Tag, Table, Space, Row, Col, Empty, Slider, Tooltip } from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface EventTimelineProps {
  spineInstance: Spine;
  currentAnimation: string;
}

interface AnimationEvent {
  name: string;
  time: number;
  value: string | number | boolean | object | null;
  valueType: 'string' | 'number' | 'boolean' | 'object' | 'default';
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  string: 'green',
  number: 'blue',
  boolean: 'orange',
  object: 'purple',
  default: 'default'
};

const EventTimeline: React.FC<EventTimelineProps> = ({ spineInstance, currentAnimation }) => {
  const [events, setEvents] = useState<AnimationEvent[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;
    
    const animation = spineInstance.skeleton.data.findAnimation(currentAnimation);
    if (!animation) return;

    setDuration(animation.duration);
    
    const extractedEvents: AnimationEvent[] = [];
    
    animation.timelines.forEach((timeline: any) => {
      if (timeline.events) {
        timeline.events.forEach((evt: any) => {
          const value = evt.data.stringValue || evt.data.intValue || evt.data.floatValue || evt.data.audioPath || null;
          let valueType: AnimationEvent['valueType'] = 'default';
          
          if (typeof value === 'string') valueType = 'string';
          else if (typeof value === 'number') valueType = 'number';
          else if (typeof value === 'boolean') valueType = 'boolean';
          else if (typeof value === 'object' && value !== null) valueType = 'object';
          
          extractedEvents.push({
            name: evt.data.name,
            time: evt.time,
            value: value,
            valueType: valueType
          });
        });
      }
    });
    
    extractedEvents.sort((a, b) => a.time - b.time);
    setEvents(extractedEvents);
  }, [spineInstance, currentAnimation]);

  useEffect(() => {
    if (!spineInstance || !currentAnimation) return;

    let lastTime = 0;
    
    const updateAnimation = (time: number) => {
      if (!lastTime) {
        lastTime = time;
        animationFrameRef.current = requestAnimationFrame(updateAnimation);
        return;
      }

      if (isPlaying && spineInstance && spineInstance.state) {
        const track = spineInstance.state.tracks[0];
        if (track) {
          const animationTime = track.getAnimationTime();
          setCurrentTime(animationTime);
        }
      }
      
      animationFrameRef.current = requestAnimationFrame(updateAnimation);
    };
    
    animationFrameRef.current = requestAnimationFrame(updateAnimation);
    
    const listener = {
      start: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(true);
        }
      },
      complete: (entry: any) => {
        if (entry.animation.name === currentAnimation) {
          setIsPlaying(false);
        }
      },
      event: (entry: any, event: any) => {
        console.log('Event fired:', event.data.name, event.time, event.data);
      }
    };
    
    spineInstance.state.addListener(listener);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      spineInstance.state.removeListener(listener);
    };
  }, [spineInstance, currentAnimation, isPlaying]);

  const handleSliderChange = (value: number) => {
    if (!spineInstance || !currentAnimation) return;
    
    const targetTime = (value / 100) * duration;
    const track = spineInstance.state.setAnimation(0, currentAnimation, false);
    if (track) {
      track.trackTime = targetTime;
      setCurrentTime(targetTime);
    }
  };

  const formatTime = (time: number) => {
    return time.toFixed(2) + 's';
  };

  const columns = [
    {
      title: <Text style={{ color: '#fff' }}>Time</Text>,
      dataIndex: 'time',
      key: 'time',
      width: 100,
      render: (time: number) => (
        <Tag color={currentTime >= time && currentTime < time + 0.1 ? 'blue' : 'default'}>
          {formatTime(time)}
        </Tag>
      ),
    },
    {
      title: <Text style={{ color: '#fff' }}>Name</Text>,
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text style={{ color: '#fff' }}>{name}</Text>,
    },
    {
      title: <Text style={{ color: '#fff' }}>Type</Text>,
      dataIndex: 'valueType',
      key: 'valueType',
      width: 100,
      render: (type: string) => (
        <Tag color={EVENT_TYPE_COLORS[type] || 'default'}>
          {type}
        </Tag>
      ),
    },
    {
      title: <Text style={{ color: '#fff' }}>Value</Text>,
      dataIndex: 'value',
      key: 'value',
      render: (value: any) => (
        <Text code={value !== null} style={{ color: value !== null ? '#52c41a' : '#fff' }}>
          {value !== null ? String(value) : '-'}
        </Text>
      ),
    },
  ];

  if (!currentAnimation) {
    return (
      <Empty 
        description={<Text style={{ color: 'rgba(255, 255, 255, 0.45)' }}>No animation selected</Text>}
        style={{ marginTop: 48 }}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', padding: 24 }}>
      <Card style={{ background: '#141414', borderColor: '#303030' }}>
        <Row gutter={24} align="middle">
          <Col span={16}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Title level={4} style={{ margin: 0, color: '#fff' }}>
                {isPlaying ? <PlayCircleOutlined /> : <PauseCircleOutlined />} {currentAnimation}
              </Title>
              <Slider
                value={(currentTime / duration) * 100}
                onChange={handleSliderChange}
                tooltip={{
                  formatter: (value) => value ? formatTime((value / 100) * duration) : '0s'
                }}
                marks={events.reduce((acc, evt) => {
                  const percent = (evt.time / duration) * 100;
                  acc[percent] = {
                    style: { color: '#fff' },
                    label: <Tooltip title={evt.name}><div style={{ width: 2, height: 16, background: '#1890ff' }} /></Tooltip>
                  };
                  return acc;
                }, {} as any)}
                style={{ margin: '20px 0' }}
              />
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" align="center" style={{ width: '100%' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontFamily: 'monospace' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
              <Progress 
                type="circle" 
                percent={Math.round((currentTime / duration) * 100)} 
                size={80}
                format={() => (
                  <Text style={{ color: '#fff' }}>{Math.round((currentTime / duration) * 100)}%</Text>
                )}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card 
        title={<Text style={{ color: '#fff' }}>Events ({events.length})</Text>}
        style={{ background: '#141414', borderColor: '#303030' }}
        bodyStyle={{ padding: 0 }}
      >
        {events.length > 0 ? (
          <Table
            columns={columns}
            dataSource={events}
            rowKey={(record) => `${record.name}-${record.time}`}
            pagination={false}
            size="small"
            style={{ background: '#141414' }}
            rowClassName={(record) => 
              currentTime >= record.time && currentTime < record.time + 0.1 ? 'active-event' : ''
            }
          />
        ) : (
          <Empty 
            description={<Text style={{ color: 'rgba(255, 255, 255, 0.45)' }}>No events found in this animation</Text>}
            style={{ padding: 24 }}
          />
        )}
      </Card>

      <Card style={{ background: '#141414', borderColor: '#303030' }}>
        <Title level={5} style={{ color: '#fff' }}>Event Type Legend</Title>
        <Space wrap>
          {Object.entries(EVENT_TYPE_COLORS).map(([type, color]) => (
            <Tag key={type} color={color}>
              {type}
            </Tag>
          ))}
        </Space>
      </Card>
    </Space>
  );
};

export default EventTimeline;
```


## src\components\IconButton.tsx

```
import React from 'react';

interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  tooltip,
  active = false,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      className={`icon-button ${active ? 'active' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
    >
      {icon}
    </button>
  );
};
```


## src\components\Icons.tsx

```
import React from 'react';

// Common SVG props that all icons share
interface IconProps {
  className?: string;
  size?: number;
}

const defaultProps = {
  className: '',
  size: 24,
};

// Helper function to create icon components
const createIcon = (path: React.ReactNode, viewBox = '0 0 24 24') => {
  return ({ className = '', size = 24 }: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
};

// Document Icon
export const DocumentTextIcon = createIcon(
  <>
    <path d="M8 14H16M8 10H16M13 18H8C6.89543 18 6 17.1046 6 16V8C6 6.89543 6.89543 6 8 6H16C17.1046 6 18 6.89543 18 8V13" />
    <path d="M15 18L18 21M18 21L21 18M18 21V15" />
  </>
);

// Question Mark Circle Icon
export const QuestionMarkCircleIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16V16.01M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12V12.5C11 12.7761 11.2239 13 11.5 13H12Z" />
  </>
);

// Play Icon
export const PlayIcon = createIcon(
  <path d="M5 3L19 12L5 21V3Z" />
);

// Pause Icon
export const PauseIcon = createIcon(
  <>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </>
);

// Stop Icon
export const StopIcon = createIcon(
  <rect x="5" y="5" width="14" height="14" />
);

// Rewind Icon
export const RewindIcon = createIcon(
  <>
    <path d="M4 16V8L10 12L4 16Z" />
    <path d="M12 16V8L18 12L12 16Z" />
  </>
);

// Forward Icon
export const ForwardIcon = createIcon(
  <>
    <path d="M6 16V8L12 12L6 16Z" />
    <path d="M14 16V8L20 12L14 16Z" />
  </>
);

// Arrow Path (Refresh) Icon
export const ArrowPathIcon = createIcon(
  <path d="M16.023 9h4.977v-4M7.977 15h-4.977v4M16.5 7.5c-1.333-1.333-3.5-3-6.5-3-4.142 0-7.5 3.358-7.5 7.5 0 1.487.433 2.873 1.179 4.038M7.5 16.5c1.333 1.333 3.5 3 6.5 3 4.142 0 7.5-3.358 7.5-7.5 0-1.487-.433-2.873-1.179-4.038" />
);

// X Mark (Close) Icon
export const XMarkIcon = createIcon(
  <path d="M6 18L18 6M6 6L18 18" />
);

// Swatch (Color Palette) Icon
export const SwatchIcon = createIcon(
  <>
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
    <path d="M15 10l5 5" />
  </>
);

// Image Icon
export const ImageIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </>
);

// Cog (Settings) Icon 
export const CogIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </>
);

export const TimelineIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
    <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    <circle cx="15" cy="15.75" r="1.5" fill="currentColor" />
    <rect x="6" y="7.5" width="1" height="9" rx="0.5" fill="currentColor" />
    <rect x="12" y="7.5" width="1" height="9" rx="0.5" fill="currentColor" />
    <rect x="18" y="7.5" width="1" height="9" rx="0.5" fill="currentColor" />
  </svg>
);
```


## src\components\InfoPanel.tsx

```
import React, { useState } from 'react';
import { Tabs, Typography, Table, Progress, Tag, Collapse, Space, Statistic, Row, Col, Card, Alert } from 'antd';
import { 
  CheckCircleOutlined, 
  WarningOutlined, 
  CloseCircleOutlined,
  InfoCircleOutlined 
} from '@ant-design/icons';
import { BenchmarkData } from '../hooks/useSpineApp';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface InfoPanelProps {
  data: BenchmarkData;
  onClose: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState('summary');
  
  // Parse the HTML data to extract metrics (in a real app, this would come as structured data)
  const parseScore = (html: string): number => {
    const match = html.match(/Score: (\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 85) return '#52c41a';
    if (score >= 70) return '#73d13d';
    if (score >= 55) return '#faad14';
    if (score >= 40) return '#fa8c16';
    return '#f5222d';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 85) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (score >= 55) return <WarningOutlined style={{ color: '#faad14' }} />;
    return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
  };

  const renderSummaryTab = () => {
    const overallScore = parseScore(data.summary || '');
    const scoreColor = getScoreColor(overallScore);

    return (
      <div style={{ padding: 24 }}>
        <Card style={{ marginBottom: 24, background: '#141414', borderColor: '#303030' }}>
          <Row gutter={24} align="middle">
            <Col span={8}>
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Overall Performance Score</Text>}
                value={overallScore}
                suffix={<Text style={{ color: scoreColor, fontSize: 24 }}>/ 100</Text>}
                valueStyle={{ color: scoreColor, fontSize: 48 }}
                prefix={getScoreIcon(overallScore)}
              />
            </Col>
            <Col span={16}>
              <Progress
                percent={overallScore}
                strokeColor={{
                  '0%': scoreColor,
                  '100%': scoreColor,
                }}
                format={() => ''}
                style={{ marginBottom: 16 }}
              />
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color={overallScore >= 85 ? 'success' : overallScore >= 55 ? 'warning' : 'error'}>
                  {overallScore >= 85 ? 'Excellent' : overallScore >= 55 ? 'Moderate' : 'Poor'} Performance
                </Tag>
                <Text type="secondary" style={{ color: 'rgba(255, 255, 255, 0.65)' }}>
                  {overallScore >= 85 
                    ? 'Suitable for all platforms and continuous animations'
                    : overallScore >= 55 
                    ? 'May cause performance dips, especially with multiple instances'
                    : 'Performance issues likely on most devices'}
                </Text>
              </Space>
            </Col>
          </Row>
        </Card>

        <Title level={4} style={{ color: '#fff', marginBottom: 16 }}>
          <InfoCircleOutlined /> Performance Breakdown
        </Title>
        
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Bone Structure</Text>}
                value={85}
                suffix={<Text style={{ color: '#52c41a', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#52c41a', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Mesh Complexity</Text>}
                value={72}
                suffix={<Text style={{ color: '#73d13d', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#73d13d', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Clipping Masks</Text>}
                value={90}
                suffix={<Text style={{ color: '#52c41a', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#52c41a', fontSize: 24 }}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card 
              size="small" 
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Blend Modes</Text>}
                value={65}
                suffix={<Text style={{ color: '#faad14', fontSize: 16 }}>%</Text>}
                valueStyle={{ color: '#faad14', fontSize: 24 }}
              />
            </Card>
          </Col>
        </Row>

        <Alert
          message={<Text style={{ color: '#fff' }}>Optimization Recommendations</Text>}
          description={
            <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Reduce the number of non-normal blend modes to minimize render state changes</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Consider simplifying mesh structures with high vertex counts</Text></li>
              <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Optimize bone hierarchy depth for better transformation performance</Text></li>
            </ul>
          }
          type="info"
          showIcon
          style={{ marginTop: 24, background: '#1f1f1f', borderColor: '#303030' }}
        />
      </div>
    );
  };

  const renderMeshAnalysisTab = () => {
    const meshData = [
      { slot: 'body', vertices: 124, deformed: true, boneWeights: 4, hasParent: false },
      { slot: 'head', vertices: 86, deformed: true, boneWeights: 2, hasParent: false },
      { slot: 'arm_left', vertices: 42, deformed: false, boneWeights: 1, hasParent: true },
      { slot: 'arm_right', vertices: 42, deformed: false, boneWeights: 1, hasParent: true },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Slot</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Vertices</Text>,
        dataIndex: 'vertices',
        key: 'vertices',
        sorter: (a: any, b: any) => a.vertices - b.vertices,
        render: (vertices: number) => (
          <Tag color={vertices > 100 ? 'error' : vertices > 50 ? 'warning' : 'success'}>
            {vertices}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Deformed</Text>,
        dataIndex: 'deformed',
        key: 'deformed',
        render: (deformed: boolean) => (
          <Tag color={deformed ? 'warning' : 'default'}>
            {deformed ? 'Yes' : 'No'}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Bone Weights</Text>,
        dataIndex: 'boneWeights',
        key: 'boneWeights',
        render: (weights: number) => <Text style={{ color: '#fff' }}>{weights}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Has Parent Mesh</Text>,
        dataIndex: 'hasParent',
        key: 'hasParent',
        render: (hasParent: boolean) => (
          <Tag color={hasParent ? 'blue' : 'default'}>
            {hasParent ? 'Yes' : 'No'}
          </Tag>
        ),
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Meshes</Text>}
                  value={4} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Vertices</Text>}
                  value={294} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Deformed Meshes</Text>}
                  value={2} 
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
              <Col span={6}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Weighted Meshes</Text>}
                  value={4} 
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={meshData}
            rowKey="slot"
            pagination={false}
            style={{ background: '#141414' }}
            rowClassName={(record) => {
              if (record.vertices > 100) return 'ant-table-row-error';
              if (record.vertices > 50) return 'ant-table-row-warning';
              return '';
            }}
          />

          <Collapse 
            defaultActiveKey={['1']} 
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <Panel 
              header={<Text style={{ color: '#fff' }}>Mesh Performance Impact</Text>}
              key="1"
              style={{ background: '#1f1f1f', borderColor: '#303030' }}
            >
              <Space direction="vertical">
                <Text style={{ color: '#fff' }}><strong>Vertex Count:</strong> Each vertex requires memory and processing time. High vertex counts (&gt;50) have significant impact.</Text>
                <Text style={{ color: '#fff' }}><strong>Deformation:</strong> Deforming meshes requires extra calculations per frame - 1.5× more costly than static meshes.</Text>
                <Text style={{ color: '#fff' }}><strong>Bone Weights:</strong> Each bone weight adds matrix multiplication operations - 2× more impact per weighted vertex.</Text>
                <Text type="warning" style={{ color: '#faad14' }}><strong>Optimization Tip:</strong> Use fewer vertices for meshes that deform or have bone weights.</Text>
              </Space>
            </Panel>
          </Collapse>
        </Space>
      </div>
    );
  };

  const renderClippingTab = () => {
    const clippingData = [
      { slot: 'mask_1', vertices: 4, status: 'optimal' },
      { slot: 'mask_2', vertices: 6, status: 'acceptable' },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Slot Name</Text>,
        dataIndex: 'slot',
        key: 'slot',
        render: (text: string) => <Text style={{ color: '#fff' }}>{text}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Vertex Count</Text>,
        dataIndex: 'vertices',
        key: 'vertices',
        render: (vertices: number) => (
          <Tag color={vertices <= 4 ? 'success' : vertices <= 8 ? 'warning' : 'error'}>
            {vertices}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Status</Text>,
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => {
          const color = status === 'optimal' ? 'success' : status === 'acceptable' ? 'warning' : 'error';
          const icon = status === 'optimal' ? <CheckCircleOutlined /> : <WarningOutlined />;
          return <Tag color={color} icon={icon}>{status.toUpperCase()}</Tag>;
        },
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            message={<Text style={{ color: '#fff' }}>Clipping Performance Impact</Text>}
            description={<Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Clipping masks are one of the most expensive operations in Spine rendering. Each mask requires additional GPU rendering passes.</Text>}
            type="warning"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />

          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Masks</Text>}
                  value={2} 
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Vertices</Text>}
                  value={10} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Complex Masks (&gt;4 vertices)</Text>}
                  value={1} 
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={clippingData}
            rowKey="slot"
            pagination={false}
            style={{ background: '#141414' }}
          />

          <Card 
            title={<Text style={{ color: '#fff' }}>Optimization Guidelines</Text>}
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <Space direction="vertical">
              <Text style={{ color: '#fff' }}>✓ Use triangular or quadrilateral masks (3-4 vertices) whenever possible</Text>
              <Text style={{ color: '#fff' }}>✓ Limit to 2-3 masks per skeleton</Text>
              <Text style={{ color: '#fff' }}>✓ Each vertex in a mask increases computational cost</Text>
              <Text type="danger" style={{ color: '#f5222d' }}>✗ Avoid complex masks with many vertices</Text>
            </Space>
          </Card>
        </Space>
      </div>
    );
  };

  const renderBlendModesTab = () => {
    const blendModeData = [
      { mode: 'Normal', count: 12, impact: 'low' },
      { mode: 'Additive', count: 2, impact: 'high' },
      { mode: 'Multiply', count: 1, impact: 'high' },
    ];

    const columns = [
      {
        title: <Text style={{ color: '#fff' }}>Blend Mode</Text>,
        dataIndex: 'mode',
        key: 'mode',
        render: (mode: string) => (
          <Tag color={mode === 'Normal' ? 'success' : 'warning'}>
            {mode}
          </Tag>
        ),
      },
      {
        title: <Text style={{ color: '#fff' }}>Count</Text>,
        dataIndex: 'count',
        key: 'count',
        render: (count: number) => <Text style={{ color: '#fff' }}>{count}</Text>,
      },
      {
        title: <Text style={{ color: '#fff' }}>Performance Impact</Text>,
        dataIndex: 'impact',
        key: 'impact',
        render: (impact: string) => {
          const color = impact === 'low' ? 'success' : 'error';
          const icon = impact === 'low' ? <CheckCircleOutlined /> : <WarningOutlined />;
          return <Tag color={color} icon={icon}>{impact.toUpperCase()}</Tag>;
        },
      },
    ];

    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Non-Normal Blend Modes</Text>}
                  value={3} 
                  valueStyle={{ color: '#faad14' }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Additive Blend Modes</Text>}
                  value={2} 
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Performance Score</Text>}
                  value={75} 
                  suffix={<Text style={{ color: '#73d13d', fontSize: 16 }}>/ 100</Text>}
                  valueStyle={{ color: '#73d13d' }}
                />
              </Col>
            </Row>
          </Card>

          <Table
            columns={columns}
            dataSource={blendModeData}
            rowKey="mode"
            pagination={false}
            style={{ background: '#141414' }}
          />

          <Alert
            message={<Text style={{ color: '#fff' }}>Blend Mode Recommendations</Text>}
            description={
              <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Normal Blend Mode: Most efficient, requires a single rendering pass</Text></li>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Non-Normal Blend Modes: Each requires a separate render pass or shader switch</Text></li>
                <li><Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>Recommendation: Limit to 2 non-normal blend modes per skeleton</Text></li>
              </ul>
            }
            type="info"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />
        </Space>
      </div>
    );
  };

  const renderSkeletonTreeTab = () => {
    return (
      <div style={{ padding: 24 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card style={{ background: '#141414', borderColor: '#303030' }}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Total Bones</Text>}
                  value={7} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Root Bones</Text>}
                  value={1} 
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic 
                  title={<Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Max Depth</Text>}
                  value={3} 
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
            </Row>
          </Card>

          <Card 
            title={<Text style={{ color: '#fff' }}>Bone Hierarchy</Text>}
            style={{ background: '#141414', borderColor: '#303030' }}
          >
            <div style={{ 
              background: '#1f1f1f', 
              padding: 16, 
              borderRadius: 8,
              fontFamily: 'monospace'
            }}>
              <pre style={{ margin: 0, color: '#52c41a' }}>
{`root
├── spine (x: 0.00, y: 100.00)
│   ├── chest (x: 0.00, y: 50.00)
│   └── head (x: 0.00, y: 75.00)
└── hips (x: 0.00, y: 0.00)
    ├── leg_left (x: -25.00, y: -50.00)
    └── leg_right (x: 25.00, y: -50.00)`}
              </pre>
            </div>
          </Card>

          <Alert
            message={<Text style={{ color: '#fff' }}>Bone Structure Notes</Text>}
            description={
              <Space direction="vertical">
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Each bone requires matrix computations every frame</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Deep hierarchies increase transformation complexity exponentially</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.85)' }}>• Keep bone hierarchies under 5 levels deep when possible</Text>
              </Space>
            }
            type="info"
            showIcon
            style={{ background: '#1f1f1f', borderColor: '#303030' }}
          />
        </Space>
      </div>
    );
  };

  const tabs = [
    {
      key: 'summary',
      label: 'Summary',
      children: renderSummaryTab(),
    },
    {
      key: 'meshAnalysis',
      label: 'Mesh Analysis',
      children: renderMeshAnalysisTab(),
    },
    {
      key: 'clippingAnalysis',
      label: 'Clipping',
      children: renderClippingTab(),
    },
    {
      key: 'blendModeAnalysis',
      label: 'Blend Modes',
      children: renderBlendModesTab(),
    },
    {
      key: 'skeletonTree',
      label: 'Skeleton Tree',
      children: renderSkeletonTreeTab(),
    },
  ];
  
  return (
    <Tabs 
      activeKey={activeTab} 
      onChange={setActiveTab}
      items={tabs}
      style={{ height: '100%' }}
      tabBarStyle={{ color: '#fff' }}
    />
  );
};
```


## src\core\BackgroundManager.ts

```
import { Application, Sprite, Texture, Container, Assets } from 'pixi.js';

export class BackgroundManager {
  private app: Application;
  private bgSprite: Sprite | null = null;
  private container: Container;
  private textureId: string | null = null;

  constructor(app: Application) {
    this.app = app;
    
    // Create a container that will be positioned at the bottom of the render stack
    this.container = new Container();
    
    // Add the container to the stage
    // Insert at index 0 to ensure it's behind everything else
    if (this.app.stage.children.length > 0) {
      this.app.stage.addChildAt(this.container, 0);
    } else {
      this.app.stage.addChild(this.container);
    }
    
    // Listen for resize events to update the background size
    window.addEventListener('resize', this.resizeBackground.bind(this));
  }

  /**
   * Sets a background image from a base64 string
   * @param base64Data The base64 encoded image data
   */
  public async setBackgroundImage(base64Data: string): Promise<void> {
    try {
      // Clean up old image if exists
      this.clearBackground();
      
      // Generate a unique ID for this texture
      this.textureId = `bg_${Date.now()}`;
      
      // Add the base64 image to the Assets cache
      await Assets.add({alias: this.textureId, src: base64Data});
      
      // Load the texture
      const texture = await Assets.load(this.textureId);
      
      // Create a sprite with the texture
      this.bgSprite = new Sprite(texture);
      
      // Add the sprite to the container
      this.container.addChild(this.bgSprite);
      
      // Adjust the size
      this.resizeBackground();
    } catch (error) {
      console.error('Error loading background image:', error);
      throw error;
    }
  }

  /**
   * Resizes the background to fit within the canvas
   */
  private resizeBackground(): void {
    if (!this.bgSprite) return;
    
    const renderer = this.app.renderer;
    const stageWidth = renderer.width;
    const stageHeight = renderer.height;
    
    // Calculate scale to fit the image inside the screen (contain)
    const imageRatio = this.bgSprite.texture.width / this.bgSprite.texture.height;
    const screenRatio = stageWidth / stageHeight;
    
    if (imageRatio > screenRatio) {
      // Image is wider than screen ratio - fit width
      this.bgSprite.width = stageWidth;
      this.bgSprite.height = stageWidth / imageRatio;
    } else {
      // Image is taller than screen ratio - fit height
      this.bgSprite.height = stageHeight;
      this.bgSprite.width = stageHeight * imageRatio;
    }
    
    // Center the background
    this.bgSprite.x = (stageWidth - this.bgSprite.width) / 2;
    this.bgSprite.y = (stageHeight - this.bgSprite.height) / 2;
  }

  /**
   * Clears the current background image
   */
  public clearBackground(): void {
    if (this.bgSprite) {
      this.container.removeChild(this.bgSprite);
      this.bgSprite.destroy({ texture: true });
      this.bgSprite = null;
    }
    
    // Unload the texture from Assets cache if it exists
    if (this.textureId) {
      Assets.unload(this.textureId);
      this.textureId = null;
    }
  }

  /**
   * Cleans up resources
   */
  public destroy(): void {
    this.clearBackground();
    window.removeEventListener('resize', this.resizeBackground.bind(this));
    this.app.stage.removeChild(this.container);
    this.container.destroy();
  }
}
```


## src\core\CameraContainer.ts

```
import { ISpineDebugRenderer, Physics, Spine, SpineDebugRenderer } from "@esotericsoftware/spine-pixi-v8";
import gsap from "gsap";
import { Application, Container, Graphics, Text } from "pixi.js";

// Define debug visualization flags
interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showBoundingBoxes: boolean;
  showPaths: boolean;
  showClipping: boolean;
  showPhysics: boolean; // New flag for physics constraints
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
  showPathConstraints: boolean;
}

// Extended SpineDebugRenderer with physics constraints support
class EnhancedSpineDebugRenderer implements ISpineDebugRenderer {
  private readonly baseRenderer: SpineDebugRenderer;
  private readonly registeredSpines: Map<Spine, PhysicsDebugDisplayObjects> = new Map();
  
  private flags: DebugFlags = {
    showBones: true,
    showRegionAttachments: true,
    showMeshTriangles: true,
    showMeshHull: true,
    showBoundingBoxes: true,
    showPaths: true,
    showClipping: true,
    showPhysics: true,
    showIkConstraints: true,
    showTransformConstraints: true,
    showPathConstraints: true
  };

  // Use SpineDebugRenderer for all standard debug rendering
  constructor() {
    this.baseRenderer = new SpineDebugRenderer();
  }
  
  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.flags = { ...this.flags, ...flags };
    
    // Apply standard flags to base renderer
    this.baseRenderer.drawBones = this.flags.showBones;
    this.baseRenderer.drawRegionAttachments = this.flags.showRegionAttachments;
    this.baseRenderer.drawMeshTriangles = this.flags.showMeshTriangles;
    this.baseRenderer.drawMeshHull = this.flags.showMeshHull;
    this.baseRenderer.drawBoundingBoxes = this.flags.showBoundingBoxes;
    this.baseRenderer.drawPaths = this.flags.showPaths;
    this.baseRenderer.drawClipping = this.flags.showClipping;
  }
  
  public getDebugFlags(): DebugFlags {
    return { ...this.flags };
  }
  
  public registerSpine(spine: Spine): void {
    // Register with the base renderer first
    this.baseRenderer.registerSpine(spine);
    
    // Create our custom physics debug graphics if not already exists
    if (!this.registeredSpines.has(spine)) {
      const parentContainer = new Container();
      spine.addChild(parentContainer);
      
      const physicsConstraints = new Graphics();
      const ikConstraints = new Graphics();
      const transformConstraints = new Graphics();
      const pathConstraints = new Graphics();
      
      parentContainer.addChild(physicsConstraints);
      parentContainer.addChild(ikConstraints);
      parentContainer.addChild(transformConstraints);
      parentContainer.addChild(pathConstraints);
      
      this.registeredSpines.set(spine, {
        physicsConstraints,
        ikConstraints,
        transformConstraints,
        pathConstraints,
        parentContainer
      });
    }
  }
  
  public unregisterSpine(spine: Spine): void {
    // Unregister from base renderer
    this.baseRenderer.unregisterSpine(spine);
    
    // Clean up our custom debug objects
    const debugObjects = this.registeredSpines.get(spine);
    if (debugObjects) {
      spine.removeChild(debugObjects.parentContainer);
      debugObjects.parentContainer.destroy({ children: true });
      this.registeredSpines.delete(spine);
    }
  }
  
    // A method to check if any debug visualization is active
  private isAnyDebugActive(): boolean {
    return this.flags.showBones || 
           this.flags.showRegionAttachments || 
           this.flags.showMeshTriangles || 
           this.flags.showMeshHull || 
           this.flags.showBoundingBoxes || 
           this.flags.showPaths || 
           this.flags.showClipping ||
           this.flags.showPhysics ||
           this.flags.showIkConstraints ||
           this.flags.showTransformConstraints ||
           this.flags.showPathConstraints;
  }

  public renderDebug(spine: Spine): void {
    // First, always clear all debug graphics
    this.clearAllDebugGraphics(spine);
    
    // If no debug flags are active, we're done - everything is already cleared
    if (!this.isAnyDebugActive()) {
      return;
    }
    
    // Use the base renderer for standard debug rendering
    if (this.flags.showBones || this.flags.showRegionAttachments || 
        this.flags.showMeshTriangles || this.flags.showMeshHull || 
        this.flags.showBoundingBoxes || this.flags.showPaths || 
        this.flags.showClipping) {
      this.baseRenderer.renderDebug(spine);
    }
    
    // Render custom constraint visualizations
    const debugObjects = this.registeredSpines.get(spine);
    if (!debugObjects) return;
    
    // Draw constraints based on flags
    if (this.flags.showPhysics) {
      this.drawPhysicsConstraints(spine, debugObjects);
    }
    
    if (this.flags.showIkConstraints) {
      this.drawIkConstraints(spine, debugObjects);
    }
    
    if (this.flags.showTransformConstraints) {
      this.drawTransformConstraints(spine, debugObjects);
    }
    
    if (this.flags.showPathConstraints) {
      this.drawPathConstraints(spine, debugObjects);
    }
  }
  
  // Helper method to clear all debug graphics
  private clearAllDebugGraphics(spine: Spine): void {
    // Clear base renderer graphics
    const debugDisplayObjects = this.baseRenderer['registeredSpines']?.get(spine);
    if (debugDisplayObjects) {
      // Clear standard debug objects
      if (debugDisplayObjects.skeletonXY) debugDisplayObjects.skeletonXY.clear();
      if (debugDisplayObjects.regionAttachmentsShape) debugDisplayObjects.regionAttachmentsShape.clear();
      if (debugDisplayObjects.meshTrianglesLine) debugDisplayObjects.meshTrianglesLine.clear();
      if (debugDisplayObjects.meshHullLine) debugDisplayObjects.meshHullLine.clear();
      if (debugDisplayObjects.clippingPolygon) debugDisplayObjects.clippingPolygon.clear();
      if (debugDisplayObjects.boundingBoxesRect) debugDisplayObjects.boundingBoxesRect.clear();
      if (debugDisplayObjects.boundingBoxesCircle) debugDisplayObjects.boundingBoxesCircle.clear();
      if (debugDisplayObjects.boundingBoxesPolygon) debugDisplayObjects.boundingBoxesPolygon.clear();
      if (debugDisplayObjects.pathsCurve) debugDisplayObjects.pathsCurve.clear();
      if (debugDisplayObjects.pathsLine) debugDisplayObjects.pathsLine.clear();
      
      // Remove bone dots
      if (debugDisplayObjects.bones) {
        const preserveChildren = [];
        
        // Get our custom graphics to preserve
        const customDebug = this.registeredSpines.get(spine);
        if (customDebug) {
          preserveChildren.push(
            customDebug.physicsConstraints,
            customDebug.ikConstraints,
            customDebug.transformConstraints,
            customDebug.pathConstraints
          );
        }
        
        // Remove all children except our custom graphics
        for (let i = debugDisplayObjects.bones.children.length - 1; i >= 0; i--) {
          const child = debugDisplayObjects.bones.children[i];
          if (!preserveChildren.includes(child)) {
            child.destroy({ children: true });
          }
        }
      }
    }
    
    // Clear custom constraint graphics
    const customDebug = this.registeredSpines.get(spine);
    if (customDebug) {
      customDebug.physicsConstraints.clear();
      customDebug.ikConstraints.clear();
      customDebug.transformConstraints.clear();
      customDebug.pathConstraints.clear();
    }
  }
  
  // Methods to draw various constraint types
  private drawPhysicsConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { physicsConstraints } = debugObjects;
    const physicsConstraintList = spine.skeleton.physicsConstraints;
    
    physicsConstraints.lineStyle(2, 0xFF00FF, 1); // Magenta for physics
    
    for (const constraint of physicsConstraintList) {
      if (!constraint.isActive()) continue;
      
      const bone = constraint.bone;
      const x = bone.worldX;
      const y = bone.worldY;
      
      // Draw a distinctive marker for physics constraints
      // Circle with cross
      physicsConstraints.beginFill(0xFF00FF, 0.3);
      physicsConstraints.drawCircle(x, y, 15);
      physicsConstraints.endFill();
      
      physicsConstraints.moveTo(x - 10, y - 10);
      physicsConstraints.lineTo(x + 10, y + 10);
      physicsConstraints.moveTo(x + 10, y - 10);
      physicsConstraints.lineTo(x - 10, y + 10);
      
      // Add spring visualization
      this.drawSpring(physicsConstraints, x, y, bone.data.length, bone.rotation);
    }
  }
  
  // Draw spring symbol to represent physics
  private drawSpring(graphics: Graphics, x: number, y: number, length: number, angle: number): void {
    const radians = angle * Math.PI / 180;
    const dx = length * Math.cos(radians);
    const dy = length * Math.sin(radians);
    
    const springLength = 30;
    const springX = x + (dx * 0.3);
    const springY = y + (dy * 0.3);
    
    // Draw spring coils
    graphics.lineStyle(1.5, 0xFF00FF, 1);
    graphics.moveTo(springX, springY);
    
    const coils = 5;
    const coilWidth = 10;
    const coilSpacing = springLength / coils;
    
    for (let i = 0; i <= coils; i++) {
      const coilX = springX + (i * coilSpacing);
      graphics.lineTo(coilX, springY + ((i % 2 === 0) ? -coilWidth : coilWidth));
    }
  }
  
  // Draw IK constraints
  private drawIkConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { ikConstraints } = debugObjects;
    const ikConstraintList = spine.skeleton.ikConstraints;
    
    ikConstraints.lineStyle(2, 0x00FFFF, 1); // Cyan for IK
    
    for (const constraint of ikConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Connect bones in IK chain
      for (let i = 0; i < bones.length - 1; i++) {
        const bone1 = bones[i];
        const bone2 = bones[i + 1];
        
        ikConstraints.moveTo(bone1.worldX, bone1.worldY);
        ikConstraints.lineTo(bone2.worldX, bone2.worldY);
      }
      
      // Draw connection to target
      const lastBone = bones[bones.length - 1];
      ikConstraints.moveTo(lastBone.worldX, lastBone.worldY);
      ikConstraints.lineTo(target.worldX, target.worldY);
      
      // Draw target marker
      ikConstraints.beginFill(0x00FFFF, 0.3);
      ikConstraints.drawCircle(target.worldX, target.worldY, 10);
      ikConstraints.endFill();
      
      ikConstraints.moveTo(target.worldX - 5, target.worldY);
      ikConstraints.lineTo(target.worldX + 5, target.worldY);
      ikConstraints.moveTo(target.worldX, target.worldY - 5);
      ikConstraints.lineTo(target.worldX, target.worldY + 5);
    }
  }
  
  // Draw transform constraints
  private drawTransformConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { transformConstraints } = debugObjects;
    const transformConstraintList = spine.skeleton.transformConstraints;
    
    transformConstraints.lineStyle(2, 0xFFFF00, 1); // Yellow for transform
    
    for (const constraint of transformConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Connect all constrained bones to target
      for (const bone of bones) {
        transformConstraints.moveTo(bone.worldX, bone.worldY);
        transformConstraints.lineTo(target.worldX, target.worldY);
      }
      
      // Draw target marker
      transformConstraints.beginFill(0xFFFF00, 0.3);
      transformConstraints.drawCircle(target.worldX, target.worldY, 10);
      transformConstraints.endFill();
      
      // Draw transform symbol
      transformConstraints.drawRect(target.worldX - 5, target.worldY - 5, 10, 10);
    }
  }
  
  // Draw path constraints
  private drawPathConstraints(spine: Spine, debugObjects: PhysicsDebugDisplayObjects): void {
    const { pathConstraints } = debugObjects;
    const pathConstraintList = spine.skeleton.pathConstraints;
    
    pathConstraints.lineStyle(2, 0x00FF00, 1); // Green for path
    
    for (const constraint of pathConstraintList) {
      if (!constraint.isActive()) continue;
      
      const target = constraint.target;
      const bones = constraint.bones;
      
      // Draw the path control points if available
      if (constraint.world && constraint.world.length > 0) {
        pathConstraints.moveTo(constraint.world[0], constraint.world[1]);
        
        for (let i = 3; i < constraint.world.length; i += 3) {
          const x = constraint.world[i];
          const y = constraint.world[i + 1];
          pathConstraints.lineTo(x, y);
          
          // Draw point markers
          pathConstraints.beginFill(0x00FF00, 0.5);
          pathConstraints.drawCircle(x, y, 4);
          pathConstraints.endFill();
        }
      }
      
      // Connect bones to their positions on the path
      for (const bone of bones) {
        pathConstraints.lineStyle(1, 0x00FF00, 0.5);
        pathConstraints.moveTo(bone.worldX, bone.worldY);
        
        // Find the closest point on the path (simplified)
        if (constraint.world && constraint.world.length > 0) {
          let closestIdx = 0;
          let closestDist = Number.MAX_VALUE;
          
          for (let i = 0; i < constraint.world.length; i += 3) {
            const pathX = constraint.world[i];
            const pathY = constraint.world[i + 1];
            const dist = Math.pow(pathX - bone.worldX, 2) + Math.pow(pathY - bone.worldY, 2);
            
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = i;
            }
          }
          
          pathConstraints.lineTo(
            constraint.world[closestIdx],
            constraint.world[closestIdx + 1]
          );
        }
      }
      
      // Highlight the target slot
      pathConstraints.lineStyle(2, 0x00FF00, 1);
      pathConstraints.beginFill(0x00FF00, 0.2);
      pathConstraints.drawCircle(target.bone.worldX, target.bone.worldY, 15);
      pathConstraints.endFill();
    }
  }
}

// Additional display objects for physics constraints
interface PhysicsDebugDisplayObjects {
  physicsConstraints: Graphics;
  ikConstraints: Graphics;
  transformConstraints: Graphics;
  pathConstraints: Graphics;
  parentContainer: Container;
}

export class CameraContainer extends Container {
  originalWidth: number;
  originalHeight: number;
  app: Application;
  isDragging: boolean = false;
  lastPosition: { x: number; y: number } | null = null;
  initialPosition: { x: number; y: number } | null = null;
  
  debugFlags: DebugFlags = {
    showBones: false,
    showRegionAttachments: false,
    showMeshTriangles: false,
    showMeshHull: false,
    showBoundingBoxes: false,
    showPaths: false,
    showClipping: false,
    showPhysics: false,
    showIkConstraints: false,
    showTransformConstraints: false,
    showPathConstraints: false
  };
  debugRenderer: EnhancedSpineDebugRenderer | null = null;
  currentSpine: Spine | null = null;
  
  constructor(options: { width: number; height: number; app: Application }) {
    super();
    this.originalWidth = options.width;
    this.originalHeight = options.height;
    this.app = options.app;
    this.debugRenderer = new EnhancedSpineDebugRenderer();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Center the container initially
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;
    
    // Listen for resize events
    window.addEventListener('resize', this.onResize.bind(this));
  }
  
  private setupEventListeners(): void {
    const view = this.app.view;
    
    if (!view) return;
    
    // Mouse down event for panning
    view.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = true;
        this.lastPosition = { x: e.clientX, y: e.clientY };
        view.style.cursor = 'grabbing';
      }
    });
    
    // Mouse move event for panning
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isDragging && this.lastPosition) {
        const dx = e.clientX - this.lastPosition.x;
        const dy = e.clientY - this.lastPosition.y;
        
        this.x += dx;
        this.y += dy;
        
        this.lastPosition = { x: e.clientX, y: e.clientY };
      }
    });
    
    // Mouse up event to stop panning
    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) { // Left mouse button
        this.isDragging = false;
        this.lastPosition = null;
        view.style.cursor = 'default';
      }
    });
    
    // Mouse wheel event for zooming
    view.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      
      // Determine scroll direction
      const scrollDirection = Math.sign(e.deltaY);
      
      // Calculate new scale
      const minScale = 0.2;
      const maxScale = 10;
      const scaleStep = 0.1;
      
      let newScale = this.scale.x - scrollDirection * scaleStep;
      newScale = Math.max(minScale, Math.min(maxScale, newScale));
      newScale = Number((Math.ceil(newScale * 20) / 20).toFixed(2));
      
      // Apply the new scale
      this.scale.set(newScale);
      
      // Update scale info if needed
      this.setCanvasScaleDebugInfo(newScale);
    });
  }
  
  public onResize(): void {
    // Center the container on resize
    this.x = this.app.renderer.width / 2;
    this.y = this.app.renderer.height / 2;
  }
  
  public lookAtChild(spine: Spine): void {
    this.currentSpine = spine;
    
    // Register spine with debug renderer
    if (this.debugRenderer) {
      this.debugRenderer.registerSpine(spine);
      
      // Add ticker for debug rendering
      this.app.ticker.add(() => {
        if (this.currentSpine && this.debugRenderer) {
          // Always call setDebugFlags to ensure flags are applied
          this.debugRenderer.setDebugFlags(this.debugFlags);
          
          // Check if any debug flags are enabled
          const anyDebugEnabled = Object.values(this.debugFlags).some(flag => flag);
          
          if (anyDebugEnabled) {
            // Only render if any debug flag is enabled
            this.debugRenderer.renderDebug(this.currentSpine);
          } else {
            // If no debug flags are enabled, forcefully clear any existing graphics
            this.clearAllDebugGraphics(this.currentSpine);
          }
        }
      });
    }
    
    // Calculate padding
    const padding = 20;
    
    // Get the bounds of the object in global space
    let bounds = spine.getBounds();
    if (bounds.width === 0 || bounds.height === 0) {
      bounds.width = spine.skeleton.data.width / 2;
      bounds.height = spine.skeleton.data.height / 2;
    }
    
    // Calculate the scale needed to fit the object within the screen
    const scaleX = (this.app.screen.width - padding * 2) / bounds.width;
    const scaleY = (this.app.screen.height - padding * 2) / bounds.height;
    let scale = Math.min(scaleX, scaleY);
    
    // Set spine scale
    spine.scale.set(1);
    
    // Calculate the position to center the object
    const x = this.app.screen.width / 2;
    const y = this.app.screen.height / 2;
    
    // Animate the camera to look at the object
    gsap.to(this, {
      x,
      y,
      duration: 1,
      ease: "power2.out",
    });
    
    // Round the scale for cleaner display
    scale = Number((Math.ceil(scale * 20) / 20).toFixed(2));
    this.scale.set(scale);
    this.setCanvasScaleDebugInfo(scale);
  }
  
  private setCanvasScaleDebugInfo(scale: number): void {
    // This would be handled by a React component in our new architecture
    const scaleInfo = document.getElementById("scale-info");
    if (scaleInfo) {
      scaleInfo.innerText = `Scale: x${scale.toFixed(2)}`;
    }
  }
  
  // Function to forcefully clear all debug graphics
  private clearAllDebugGraphics(spine: Spine): void {
    if (!this.debugRenderer) return;
    
    // Get access to the debug display objects
    const registeredSpines = (this.debugRenderer as any)['registeredSpines'];
    if (!registeredSpines) return;
    
    // Clear base renderer graphics
    const debugObjs = this.debugRenderer['baseRenderer']?.['registeredSpines']?.get(spine);
    if (debugObjs) {
      // Clear all standard debug objects
      if (debugObjs.skeletonXY) debugObjs.skeletonXY.clear();
      if (debugObjs.regionAttachmentsShape) debugObjs.regionAttachmentsShape.clear();
      if (debugObjs.meshTrianglesLine) debugObjs.meshTrianglesLine.clear();
      if (debugObjs.meshHullLine) debugObjs.meshHullLine.clear();
      if (debugObjs.clippingPolygon) debugObjs.clippingPolygon.clear();
      if (debugObjs.boundingBoxesRect) debugObjs.boundingBoxesRect.clear();
      if (debugObjs.boundingBoxesCircle) debugObjs.boundingBoxesCircle.clear();
      if (debugObjs.boundingBoxesPolygon) debugObjs.boundingBoxesPolygon.clear();
      if (debugObjs.pathsCurve) debugObjs.pathsCurve.clear();
      if (debugObjs.pathsLine) debugObjs.pathsLine.clear();
      
      // Remove bone dots
      if (debugObjs.bones && debugObjs.bones.children) {
        while (debugObjs.bones.children.length > 0) {
          const child = debugObjs.bones.children[0];
          debugObjs.bones.removeChild(child);
          if (child.destroy) {
            child.destroy({children: true});
          }
        }
      }
    }
    
    // Clear custom constraint graphics
    const customDebug = registeredSpines.get(spine);
    if (customDebug) {
      if (customDebug.physicsConstraints) customDebug.physicsConstraints.clear();
      if (customDebug.ikConstraints) customDebug.ikConstraints.clear();
      if (customDebug.transformConstraints) customDebug.transformConstraints.clear();
      if (customDebug.pathConstraints) customDebug.pathConstraints.clear();
    }
    
    // Force a render update
    this.app.renderer.render(this.app.stage);
  }
  
  // Set debug flags
  public setDebugFlags(flags: Partial<DebugFlags>): void {
    this.debugFlags = { ...this.debugFlags, ...flags };
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
  }
  
  // Get debug flags
  public getDebugFlags(): DebugFlags {
    return { ...this.debugFlags };
  }
  
  // Updated toggle methods that forcefully clear graphics when disabling
  public toggleMeshes(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showMeshTriangles;
    
    this.debugFlags.showMeshTriangles = newValue;
    this.debugFlags.showMeshHull = newValue;
    this.debugFlags.showRegionAttachments = newValue;
    this.debugFlags.showBoundingBoxes = newValue;
    this.debugFlags.showPaths = newValue;
    this.debugFlags.showClipping = newValue;
    this.debugFlags.showBones = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  public togglePhysics(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showPhysics;
    
    this.debugFlags.showPhysics = newValue;
    this.debugFlags.showTransformConstraints = newValue;
    this.debugFlags.showPathConstraints = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  public toggleIkConstraints(visible?: boolean): void {
    const newValue = visible !== undefined ? visible : !this.debugFlags.showIkConstraints;
    
    this.debugFlags.showIkConstraints = newValue;
    
    if (this.debugRenderer) {
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force clear graphics if turning off
    if (!newValue && this.currentSpine) {
      this.clearAllDebugGraphics(this.currentSpine);
    }
  }
  
  // Force reset debug graphics completely
  public forceResetDebugGraphics(): void {
    if (!this.currentSpine || !this.debugRenderer) return;
    
    // First, try to unregister the spine instance from the debug renderer
    this.debugRenderer.unregisterSpine(this.currentSpine);
    
    // Then create a new debug renderer instance to replace the old one
    this.debugRenderer = new EnhancedSpineDebugRenderer();
    
    // Register the spine instance with the new renderer
    if (this.currentSpine) {
      this.debugRenderer.registerSpine(this.currentSpine);
      this.debugRenderer.setDebugFlags(this.debugFlags);
    }
    
    // Force a render update
    this.app.renderer.render(this.app.stage);
  }
  
  // Center the view
  public centerViewport(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    
    gsap.to(this, {
      x: w / 2,
      y: h / 2,
      duration: 0.5,
      ease: "power2.out",
    });
  }
  
  public override destroy(): void {
    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    
    // Cleanup ticker
    if (this.currentSpine && this.debugRenderer) {
      this.debugRenderer.unregisterSpine(this.currentSpine);
    }
    
    // Call parent destroy method
    super.destroy();
  }
}
```


## src\core\SpineAnalyzer.ts

```
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { BenchmarkData } from "../hooks/useSpineApp";
import { analyzeMeshes } from "./analyzers/meshAnalyzer";
import { analyzeClipping } from "./analyzers/clippingAnalyzer";
import { analyzeBlendModes } from "./analyzers/blendModeAnalyzer";
import { createSkeletonTree } from "./analyzers/skeletonAnalyzer";
import { analyzePhysics } from "./analyzers/physicsAnalyzer";
import { PERFORMANCE_FACTORS } from "./constants/performanceFactors";
import { calculateOverallScore } from "./utils/scoreCalculator";
import { generateSummary } from "./generators/summaryGenerator";

/**
 * Main SpineAnalyzer class that coordinates analysis of Spine instances
 */
export class SpineAnalyzer {
  /**
   * Analyzes a Spine instance and returns comprehensive benchmark data
   * @param spineInstance The Spine instance to analyze
   * @returns Benchmark data with HTML and metrics for each component
   */
  static analyze(spineInstance: Spine): BenchmarkData {
    // Analyze all components
    const meshAnalysisResults = analyzeMeshes(spineInstance);
    const clippingAnalysisResults = analyzeClipping(spineInstance);
    const blendModeAnalysisResults = analyzeBlendModes(spineInstance);
    const skeletonAnalysisResults = createSkeletonTree(spineInstance);
    const physicsAnalysisResults = analyzePhysics(spineInstance);
    
    // Extract HTML output and metrics
    const { html: meshAnalysis, metrics: meshMetrics } = meshAnalysisResults;
    const { html: clippingAnalysis, metrics: clippingMetrics } = clippingAnalysisResults;
    const { html: blendModeAnalysis, metrics: blendModeMetrics } = blendModeAnalysisResults;
    const { html: skeletonTree, metrics: boneMetrics } = skeletonAnalysisResults;
    const { html: physicsAnalysis, metrics: constraintMetrics } = physicsAnalysisResults;
    
    // Calculate overall performance score
    const componentScores = {
      boneScore: boneMetrics.score,
      meshScore: meshMetrics.score,
      clippingScore: clippingMetrics.score,
      blendModeScore: blendModeMetrics.score,
      constraintScore: constraintMetrics.score
    };
    
    const overallScore = calculateOverallScore(componentScores);
    
    // Generate summary with overall score
    const summary = generateSummary(
      spineInstance,
      boneMetrics,
      meshMetrics,
      clippingMetrics,
      blendModeMetrics,
      constraintMetrics,
      overallScore
    );
    
    // Return all analysis data
    return {
      meshAnalysis,
      clippingAnalysis,
      blendModeAnalysis,
      skeletonTree,
      physicsAnalysis,
      summary
    };
  }
}
```


## src\core\SpineLoader.ts

```
import {
  AtlasAttachmentLoader,
  SkeletonBinary,
  SkeletonData,
  SkeletonJson,
  Spine,
  SpineTexture,
  TextureAtlas,
} from '@esotericsoftware/spine-pixi-v8';
import { Application, Assets, Texture } from 'pixi.js';

export class SpineLoader {
  private app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  public async loadSpineFiles(files: FileList): Promise<Spine | null> {
    try {
      const acceptedFiles = Array.from(files);
      console.log('Processing files:', acceptedFiles.map(f => (f as any).fullPath || f.name).join(', '));
      
      // Initialize tracking variables
      let atlasFile: File | undefined;
      let jsonFile: File | undefined;
      let skelFile: File | undefined;
      let imageFiles: File[] = [];
      
      // First pass - categorize files
      acceptedFiles.forEach((file) => {
        const fileName = file.name;
        const fullPath = (file as any).fullPath || file.name;
        
        if (fileName.endsWith('.atlas')) {
          atlasFile = file;
          console.log("Atlas file found:", fullPath);
        } else if (fileName.endsWith('.json')) {
          jsonFile = file;
          console.log("JSON file found:", fullPath);
        } else if (fileName.endsWith('.skel')) {
          skelFile = file;
          console.log("Skel file found:", fullPath);
        } else if (file.type.startsWith('image/') || 
                  fileName.endsWith('.png') || 
                  fileName.endsWith('.jpg') ||
                  fileName.endsWith('.jpeg') || 
                  fileName.endsWith('.webp')) {
          imageFiles.push(file);
          console.log("Image file found:", fullPath);
        } else {
          console.log("Unrecognized file type:", fullPath);
        }
      });
      
      // Validate required files
      if (!atlasFile) {
        throw new Error('Missing atlas file (.atlas). Please include an atlas file with your Spine data.');
      }
      
      if (!jsonFile && !skelFile) {
        throw new Error('Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.');
      }
      
      if (imageFiles.length === 0) {
        throw new Error('Missing image files. Please include image files referenced by your atlas.');
      }
      
      // Read atlas content
      const atlasText = await this.readFileAsText(atlasFile);
      
      // Load skeleton data
      let skeletonData;
      const isBinary = !!skelFile;
      
      if (skelFile) {
        console.log('Binary Format')
        // Binary format
        skeletonData = await this.readFileAsArrayBuffer(skelFile);
      } else if (jsonFile) {
        console.log('JSON Format')
        // JSON format
        const jsonText = await this.readFileAsText(jsonFile);
        try {
          skeletonData = JSON.parse(jsonText);
          
          // Check for Spine 4.1 vs 4.2 version
          if (skeletonData && skeletonData.spine && skeletonData.spine.startsWith('4.1')) {
            console.log('Updating Spine version from 4.1 to 4.2.0');
            skeletonData.spine = '4.2.0';
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
          throw new Error("Invalid JSON format in skeleton file");
        }
      }
      
      // Extract image names from atlas
      const imageNames = this.extractImageNamesFromAtlas(atlasText);
      console.log("Image names referenced in atlas:", imageNames);
      
      // Create asset bundle
      const assetBundle: Record<string, any> = {};
      
      // Process each image file
      for (const imageFile of imageFiles) {
        const base64 = await this.fileToBase64(imageFile);
        const fileName = this.getFileName(imageFile.name);
        
        // Store with filename as key
        assetBundle[fileName] = {
          src: base64,
          data: { type: imageFile.type || 'image/png' }
        };
        
        // Also store without extension for better matching
        const fileNameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
        if (fileNameWithoutExt) {
          assetBundle[fileNameWithoutExt] = {
            src: base64,
            data: { type: imageFile.type || 'image/png' }
          };
        }
      }
      
      // Load textures
      Assets.addBundle('spineAssets', assetBundle);
      const textures = await Assets.loadBundle('spineAssets');
      
      // Create spine asset
      return await this.createSpineAsset(skeletonData, atlasText, textures, isBinary);
      
    } catch (error) {
      console.error('Error loading Spine files:', error);
      throw error;
    }
  }

  private getFileName(path: string): string {
    // Extract just the filename without path
    return path.split('/').pop() || path;
  }
  
  private extractImageNamesFromAtlas(atlasText: string): string[] {
    const lines = atlasText.split('\n');
    const imageNames: string[] = [];
    
    // In spine atlas format, the image names are the first non-empty lines 
    // before each "size:" line
    let currentName = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') continue;
      
      if (line.startsWith('size:')) {
        if (currentName && !imageNames.includes(currentName)) {
          imageNames.push(currentName);
        }
        currentName = '';
      } else if (currentName === '') {
        // If we don't have a current name and this line is not a property,
        // it must be an image name
        if (!line.includes(':')) {
          currentName = line;
        }
      }
    }
    
    // Add the last image name if we have one
    if (currentName && !imageNames.includes(currentName)) {
      imageNames.push(currentName);
    }
    
    return imageNames;
  }
  
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  private async createSpineAsset(
    data: any, 
    atlasText: string, 
    textures: Record<string, Texture>,
    isBinary: boolean
  ): Promise<Spine> {
    console.log(`Creating ${isBinary ? 'Binary' : 'JSON'} Spine Asset`);

    // Create atlas
    const spineAtlas = new TextureAtlas(atlasText);
    
    // Process each page in the atlas
    for (const page of spineAtlas.pages) {
      const pageName = page.name;
      
      // Try different ways to match the texture
      let texture = textures[pageName];
      
      if (!texture) {
        // Try without path
        const baseFileName = this.getFileName(pageName);
        texture = textures[baseFileName];
        
        if (!texture) {
          // Try without extension
          const baseNameWithoutExt = baseFileName.substring(0, baseFileName.lastIndexOf('.'));
          if (baseNameWithoutExt) {
            texture = textures[baseNameWithoutExt];
          }
        }
      }

      if (!texture) {
        console.error(`Missing texture for page: ${pageName}`);
        console.log("Available textures:", Object.keys(textures).join(", "));
        throw new Error(`Missing texture for page: ${pageName}`);
      }

      // Create SpineTexture from the PIXI Texture
      const spineTexture = SpineTexture.from(texture.source);
      
      // Set the texture for the page
      page.setTexture(spineTexture);
    }

    // Create attachment loader
    const atlasLoader = new AtlasAttachmentLoader(spineAtlas);

    // Create skeleton data
    let skeletonData: SkeletonData | undefined = undefined;

    if(isBinary) {
      const skeletonBinary = new SkeletonBinary(atlasLoader);
      console.log(skeletonBinary)
     skeletonData = skeletonBinary.readSkeletonData(data);
    } else {
      const skeletonJson = new SkeletonJson(atlasLoader);
      console.log(skeletonJson)
     skeletonData = skeletonJson.readSkeletonData(data);
    }
    
    // Create spine instance
    return new Spine(skeletonData);
  }
}
```


## src\core\analyzers\blendModeAnalyzer.ts

```
import { BlendMode, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBlendModeScore, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes blend modes in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for blend mode analysis
 */
export function analyzeBlendModes(spineInstance: Spine): { html: string, metrics: any } {
  const blendModeCount = new Map<BlendMode, number>();
  const slotsWithNonNormalBlendMode = new Map<string, BlendMode>();
  
  // Initialize blend mode counts
  Object.values(BlendMode).forEach(mode => {
    if (typeof mode === 'number') {
      blendModeCount.set(mode as BlendMode, 0);
    }
  });
  
  // Count blend modes
  spineInstance.skeleton.slots.forEach(slot => {
    const blendMode = slot.data.blendMode;
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    
    if (blendMode !== BlendMode.Normal) {
      slotsWithNonNormalBlendMode.set(slot.data.name, blendMode);
    }
  });
  
  // Count specific blend mode types
  const additiveCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Additive).length;
  
  const multiplyCount = Array.from(slotsWithNonNormalBlendMode.values())
    .filter(mode => mode === BlendMode.Multiply).length;
  
  // Calculate blend mode score
  const blendModeScore = calculateBlendModeScore(slotsWithNonNormalBlendMode.size, additiveCount);
  
  const metrics = {
    nonNormalBlendModeCount: slotsWithNonNormalBlendMode.size,
    additiveCount,
    multiplyCount,
    score: blendModeScore
  };
  
  let html = `
    <div class="blend-mode-analysis">
      <h3>Blend Modes</h3>
      <p>Non-normal blend modes: ${slotsWithNonNormalBlendMode.size}</p>
      <p>Additive blend modes: ${additiveCount}</p>
      <p>Multiply blend modes: ${multiplyCount}</p>
      
      <div class="performance-score">
        <h4>Blend Mode Performance Score: ${blendModeScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${blendModeScore}%; background-color: ${getScoreColor(blendModeScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>blendModeScore = 100 - log₂(nonNormalCount/${PERFORMANCE_FACTORS.IDEAL_BLEND_MODE_COUNT} + 1) × 20 
          - (additiveCount × 2)</code>
      </div>
      
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Blend Mode</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  // Sort by frequency
  const sortedCounts = Array.from(blendModeCount.entries())
    .sort((a, b) => b[1] - a[1]);
  
  sortedCounts.forEach(([mode, count]) => {
    if (count > 0) {
      const modeName = BlendMode[mode];
      const rowClass = mode !== BlendMode.Normal && count > 0 
        ? 'row-warning' 
        : '';
      
      html += `
        <tr class="${rowClass}">
          <td>${modeName}</td>
          <td>${count}</td>
        </tr>
      `;
    }
  });
  
  html += `
        </tbody>
      </table>
  `;
  
  if (slotsWithNonNormalBlendMode.size > 0) {
    html += `
      <h4>Slots with Non-Normal Blend Modes:</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot Name</th>
            <th>Blend Mode</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    slotsWithNonNormalBlendMode.forEach((mode, slotName) => {
      html += `
        <tr>
          <td>${slotName}</td>
          <td>${BlendMode[mode]}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Notes on Blend Modes:</h4>
        <ul>
          <li><strong>Normal Blend Mode:</strong> Most efficient, requires a single rendering pass</li>
          <li><strong>Non-Normal Blend Modes:</strong> Each requires a separate render pass or shader switch</li>
          <li><strong>Rendering Cost:</strong> Each blend mode change forces a renderer "flush" operation</li>
          <li><strong>Additive Blend:</strong> Higher cost than normal blend due to blending calculations</li>
          <li><strong>Multiply Blend:</strong> Similar to additive, requires additional GPU operations</li>
          <li><strong>Recommendation:</strong> Limit to 2 non-normal blend modes per skeleton</li>
        </ul>
      </div>
    `;
  }
  
  html += `</div>`;
  
  return {html, metrics};
}
```


## src\core\analyzers\clippingAnalyzer.ts

```
import { ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';
import { PERFORMANCE_FACTORS } from '../constants/performanceFactors';
import { calculateClippingScore, getScoreColor } from '../utils/scoreCalculator';

/**
 * Analyzes clipping masks in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for clipping mask analysis
 */
export function analyzeClipping(spineInstance: Spine): { html: string, metrics: any } {
  const masks: [string, number][] = [];
  let totalVertices = 0;
  
  spineInstance.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
      masks.push([slot.data.name, verticesCount]);
      totalVertices += verticesCount;
    }
  });
  
  // Calculate complexity metrics
  const complexMasks = masks.filter(([_, vertexCount]) => vertexCount > 4).length;
  
  // Calculate clipping score
  const clippingScore = calculateClippingScore(masks.length, totalVertices, complexMasks);
  
  const metrics = {
    maskCount: masks.length,
    totalVertices,
    complexMasks,
    score: clippingScore
  };
  
  let html = `
    <div class="clipping-analysis">
      <h3>Clipping Masks</h3>
      <p>Total masks: ${masks.length}</p>
      <p>Total vertices in masks: ${totalVertices}</p>
      <p>Complex masks (>4 vertices): ${complexMasks}</p>
      
      <div class="performance-score">
        <h4>Clipping Performance Score: ${clippingScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${clippingScore}%; background-color: ${getScoreColor(clippingScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>clippingScore = 100 - log₂(maskCount/${PERFORMANCE_FACTORS.IDEAL_CLIPPING_COUNT} + 1) × 20 
          - log₂(vertexCount + 1) × 5 
          - (complexMasks × 10)</code>
      </div>
  `;
  
  if (masks.length > 0) {
    html += `
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot Name</th>
            <th>Vertex Count</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    masks.forEach(([slotName, vertexCount]) => {
      const status = vertexCount <= 4 
        ? 'Optimal' 
        : vertexCount <= 8 
          ? 'Acceptable' 
          : 'High Vertex Count';
      
      const rowClass = vertexCount <= 4 
        ? '' 
        : vertexCount <= 8 
          ? 'row-warning' 
          : 'row-danger';
      
      html += `
        <tr class="${rowClass}">
          <td>${slotName}</td>
          <td>${vertexCount}</td>
          <td>${status}</td>
        </tr>
      `;
    });
    
    html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Notes on Clipping Masks:</h4>
        <ul>
          <li><strong>High Impact:</strong> Clipping masks are one of the most expensive operations in Spine rendering</li>
          <li><strong>Vertex Count:</strong> Each vertex in a mask increases the computational cost</li>
          <li><strong>Optimal Configuration:</strong> Use triangular or quadrilateral masks (3-4 vertices) whenever possible</li>
          <li><strong>GPU Cost:</strong> Each clipping mask requires additional GPU rendering passes (stencil buffer operations)</li>
          <li><strong>Recommendation:</strong> Limit to 2-3 masks per skeleton, with fewer than 6 vertices each</li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>No clipping masks found in this skeleton.</p>`;
  }
  
  html += `</div>`;
  
  return {html, metrics};
}
```


## src\core\analyzers\meshAnalyzer.ts

```
import { DeformTimeline, MeshAttachment, Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateMeshScore, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes mesh attachments in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for mesh analysis
 */
export function analyzeMeshes(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.skeleton.data.animations;

  let totalMeshCount = 0;
  let totalVertices = 0;
  let weightedMeshCount = 0;
  let deformedMeshCount = 0;
  
  const meshesWithChangesInTimelines = new Map();
  const meshWorldVerticesLengths = new Map<string, number>();
  const meshesWithBoneWeights = new Map<string, number>();
  const meshesWithParents = new Map<string, boolean>();
  
  // Count total meshes and analyze properties
  skeleton.slots.forEach((slot) => {
    const attachment = slot.getAttachment();
    if (attachment && attachment instanceof MeshAttachment) {
      totalMeshCount++;
      
      // Count vertices
      const vertexCount = attachment.worldVerticesLength / 2;
      totalVertices += vertexCount;
      meshWorldVerticesLengths.set(slot.data.name, vertexCount);
      
      // Track meshes with bone weights
      if (attachment.bones?.length) {
        weightedMeshCount++;
        meshesWithBoneWeights.set(slot.data.name, attachment.bones.length);
      }
      
      meshesWithChangesInTimelines.set(slot.data.name, false);
      meshesWithParents.set(slot.data.name, attachment.getParentMesh() != null);
    }
  });
  
  // Analyze animations for mesh changes
  animations.forEach((animation) => {
    const timelines = animation.timelines;
    timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const slotIndex = timeline.slotIndex;
        const slot = skeleton.slots[slotIndex];
        const attachment = slot.getAttachment();
        
        if (attachment && attachment instanceof MeshAttachment) {
          if (!meshesWithChangesInTimelines.get(slot.data.name)) {
            deformedMeshCount++;
            meshesWithChangesInTimelines.set(slot.data.name, true);
          }
        }
      }
    });
  });
  
  // Convert to array for easier rendering in table
  const meshData = Array.from(meshWorldVerticesLengths.keys()).map(key => ({
    slotName: key,
    vertices: meshWorldVerticesLengths.get(key) || 0,
    isDeformed: meshesWithChangesInTimelines.get(key) || false,
    boneWeights: meshesWithBoneWeights.get(key) || 0,
    hasParentMesh: meshesWithParents.get(key) || false
  }));
  
  // Sort by vertex count descending
  meshData.sort((a, b) => b.vertices - a.vertices);
  
  // Calculate mesh complexity metrics for performance score
  const meshComplexityMetrics = {
    totalMeshCount,
    totalVertices,
    weightedMeshCount,
    deformedMeshCount,
    avgVerticesPerMesh: totalMeshCount > 0 ? totalVertices / totalMeshCount : 0,
    highVertexMeshes: meshData.filter(mesh => mesh.vertices > 50).length,
    complexMeshes: meshData.filter(mesh => mesh.vertices > 20 && (mesh.isDeformed || mesh.boneWeights > 0)).length,
    score: 0
  };
  
  // Calculate mesh score using logarithmic scale
  const meshScore = calculateMeshScore(meshComplexityMetrics);
  meshComplexityMetrics.score = meshScore;
  
  // Generate HTML for table
  let html = `
    <div class="mesh-analysis">
      <h3>Mesh Statistics</h3>
      <p>Total meshes: ${totalMeshCount}</p>
      <p>Total vertices: ${totalVertices}</p>
      <p>Meshes with deformation: ${deformedMeshCount}</p>
      <p>Meshes with bone weights: ${weightedMeshCount}</p>
      <p>Meshes with parent mesh: ${Array.from(meshesWithParents.values()).filter(Boolean).length}</p>
      
      <div class="performance-score">
        <h4>Mesh Performance Score: ${meshScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${meshScore}%; background-color: ${getScoreColor(meshScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>meshScore = 100 - log₂(totalMeshes/${PERFORMANCE_FACTORS.IDEAL_MESH_COUNT} + 1) × 15 
          - log₂(totalVertices/${PERFORMANCE_FACTORS.IDEAL_VERTEX_COUNT} + 1) × 10 
          - (deformedMeshes × ${PERFORMANCE_FACTORS.MESH_DEFORMED_FACTOR}) 
          - (weightedMeshes × ${PERFORMANCE_FACTORS.MESH_WEIGHTED_FACTOR})</code>
      </div>
      
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Vertices</th>
            <th>Deformed</th>
            <th>Bone Weights</th>
            <th>Has Parent Mesh</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  meshData.forEach(item => {
    // Determine row color based on vertex count and deformation
    let rowClass = '';
    if (item.vertices > 100 || (item.vertices > 50 && item.isDeformed)) {
      rowClass = 'row-danger';
    } else if (item.vertices > 50 || (item.vertices > 20 && item.isDeformed)) {
      rowClass = 'row-warning';
    }
    
    html += `
      <tr class="${rowClass}">
        <td>${item.slotName}</td>
        <td>${item.vertices}</td>
        <td>${item.isDeformed ? 'Yes' : 'No'}</td>
        <td>${item.boneWeights}</td>
        <td>${item.hasParentMesh ? 'Yes' : 'No'}</td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
      
      <div class="analysis-notes">
        <h4>Mesh Performance Impact:</h4>
        <ul>
          <li><strong>Vertex Count:</strong> Each vertex requires memory and processing time. High vertex counts (>50) have significant impact.</li>
          <li><strong>Deformation:</strong> Deforming meshes requires extra calculations per frame - ${PERFORMANCE_FACTORS.MESH_DEFORMED_FACTOR}× more costly than static meshes.</li>
          <li><strong>Bone Weights:</strong> Each bone weight adds matrix multiplication operations - ${PERFORMANCE_FACTORS.MESH_WEIGHTED_FACTOR}× more impact per weighted vertex.</li>
          <li><strong>Optimization Tip:</strong> Use fewer vertices for meshes that deform or have bone weights. Consider using Region attachments for simple shapes.</li>
        </ul>
      </div>
    </div>
  `;
  
  return {html, metrics: meshComplexityMetrics};
}
```


## src\core\analyzers\physicsAnalyzer.ts

```
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes physics and other constraints in a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for constraints analysis
 */
export function analyzePhysics(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  
  // Get all constraints
  const ikConstraints = skeleton.ikConstraints;
  const transformConstraints = skeleton.transformConstraints;
  const pathConstraints = skeleton.pathConstraints;
  const physicsConstraints = skeleton.physicsConstraints || [];  // May be undefined in older versions
  
  // Analyze IK Constraints
  const ikData = ikConstraints.map(constraint => ({
    name: constraint.data.name,
    target: constraint.target.data.name,
    bones: constraint.bones.map(bone => bone.data.name),
    mix: constraint.mix,
    softness: constraint.softness,
    bendDirection: constraint.bendDirection,
    compress: constraint.compress,
    stretch: constraint.stretch,
    isActive: constraint.isActive()
  }));
  
  // Analyze Transform Constraints
  const transformData = transformConstraints.map(constraint => ({
    name: constraint.data.name,
    target: constraint.target.data.name,
    bones: constraint.bones.map(bone => bone.data.name),
    mixRotate: constraint.mixRotate,
    mixX: constraint.mixX,
    mixY: constraint.mixY,
    mixScaleX: constraint.mixScaleX,
    mixScaleY: constraint.mixScaleY,
    mixShearY: constraint.mixShearY,
    isActive: constraint.isActive(),
    isLocal: constraint.data.local,
    isRelative: constraint.data.relative
  }));
  
  // Analyze Path Constraints
  const pathData = pathConstraints.map(constraint => {
    const positionMode = constraint.data.positionMode; // Fixed or Percent
    const spacingMode = constraint.data.spacingMode; // Length, Fixed, Percent, or Proportional
    const rotateMode = constraint.data.rotateMode; // Tangent, Chain, or ChainScale
    
    return {
      name: constraint.data.name,
      target: constraint.target.data.name,
      bones: constraint.bones.map(bone => bone.data.name),
      mixRotate: constraint.mixRotate,
      mixX: constraint.mixX,
      mixY: constraint.mixY,
      position: constraint.position,
      spacing: constraint.spacing,
      positionMode: positionMode,
      spacingMode: spacingMode,
      rotateMode: rotateMode,
      offsetRotation: constraint.data.offsetRotation,
      isActive: constraint.isActive(),
      // Track complexity: world positions, curves, segments arrays
      worldPositionsCount: constraint.world ? constraint.world.length / 3 : 0,
      hasSegments: constraint.segments && constraint.segments.length > 0,
      hasLengths: constraint.lengths && constraint.lengths.length > 0
    };
  });
  
  // Analyze Physics Constraints
  const physicsData = physicsConstraints.map(constraint => ({
    name: constraint.data.name,
    bone: constraint.bone.data.name,
    inertia: constraint.inertia,
    strength: constraint.strength,
    damping: constraint.damping,
    massInverse: constraint.massInverse,
    wind: constraint.wind,
    gravity: constraint.gravity,
    mix: constraint.mix,
    affectsX: constraint.data.x > 0,
    affectsY: constraint.data.y > 0,
    affectsRotation: constraint.data.rotate > 0,
    affectsScale: constraint.data.scaleX > 0,
    affectsShear: constraint.data.shearX > 0,
    isActive: constraint.isActive()
  }));
  
  // Calculate constraint performance impact scores
  const ikImpact = calculateIkImpact(ikData);
  const transformImpact = calculateTransformImpact(transformData);
  const pathImpact = calculatePathImpact(pathData);
  const physicsImpact = calculatePhysicsImpact(physicsData);
  
  // Total constraints
  const totalConstraints = ikConstraints.length + transformConstraints.length + 
                           pathConstraints.length + physicsConstraints.length;
  
  // Calculate constraint score based on weighted impacts
  let constraintScore = 100;
  
  if (totalConstraints > 0) {
    const totalWeightedImpact = 
      (ikImpact * PERFORMANCE_FACTORS.IK_WEIGHT) +
      (transformImpact * PERFORMANCE_FACTORS.TRANSFORM_WEIGHT) +
      (pathImpact * PERFORMANCE_FACTORS.PATH_WEIGHT) +
      (physicsImpact * PERFORMANCE_FACTORS.PHYSICS_WEIGHT);
    
    constraintScore = Math.max(0, 100 - (totalWeightedImpact * 0.5));
  }
  
  // Generate HTML output
  let html = `
    <div class="physics-analysis">
      <h3>Constraints Analysis</h3>
      <p>Total constraints: ${totalConstraints}</p>
      
      <div class="performance-score">
        <h4>Constraint Performance Score: ${constraintScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${constraintScore}%; background-color: ${getScoreColor(constraintScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>constraintScore = 100 - (constraintImpact * 0.5)</code>
        <p>Where constraintImpact is a weighted sum of IK, transform, path, and physics constraint impacts</p>
      </div>
      
      <div class="constraint-summary">
        <h4>Impact Breakdown:</h4>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Constraint Type</th>
              <th>Count</th>
              <th>Impact Level</th>
              <th>Weighted Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr class="${ikImpact > 50 ? 'row-warning' : ''}">
              <td>IK Constraints</td>
              <td>${ikConstraints.length}</td>
              <td>${ikImpact.toFixed(1)}%</td>
              <td>${(ikImpact * PERFORMANCE_FACTORS.IK_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${transformImpact > 50 ? 'row-warning' : ''}">
              <td>Transform Constraints</td>
              <td>${transformConstraints.length}</td>
              <td>${transformImpact.toFixed(1)}%</td>
              <td>${(transformImpact * PERFORMANCE_FACTORS.TRANSFORM_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${pathImpact > 50 ? 'row-warning' : ''}">
              <td>Path Constraints</td>
              <td>${pathConstraints.length}</td>
              <td>${pathImpact.toFixed(1)}%</td>
              <td>${(pathImpact * PERFORMANCE_FACTORS.PATH_WEIGHT).toFixed(1)}%</td>
            </tr>
            <tr class="${physicsImpact > 50 ? 'row-warning' : ''}">
              <td>Physics Constraints</td>
              <td>${physicsConstraints.length}</td>
              <td>${physicsImpact.toFixed(1)}%</td>
              <td>${(physicsImpact * PERFORMANCE_FACTORS.PHYSICS_WEIGHT).toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
  `;
  
  // Add constraint details if any exist
  if (totalConstraints > 0) {
    // IK Constraints Table
    if (ikData.length > 0) {
      html += createIkTable(ikData);
    }
    
    // Transform Constraints Table
    if (transformData.length > 0) {
      html += createTransformTable(transformData);
    }
    
    // Path Constraints Table
    if (pathData.length > 0) {
      html += createPathTable(pathData);
    }
    
    // Physics Constraints Table
    if (physicsData.length > 0) {
      html += createPhysicsTable(physicsData);
    }
    
    // Add general notes about constraints
    html += `
      <div class="analysis-notes">
        <h4>Notes on Constraints:</h4>
        <ul>
          <li><strong>IK Constraints:</strong> Cost increases with bone chain length and iteration count</li>
          <li><strong>Physics Constraints:</strong> Highest performance impact, especially with multiple affected properties</li>
          <li><strong>Path Constraints:</strong> Complex path curves and ChainScale rotate mode are more expensive</li>
          <li><strong>Transform Constraints:</strong> Each affected property (position, rotation, scale) adds calculation overhead</li>
          <li><strong>Recommendation:</strong> Use constraints sparingly and with minimal bone chains when possible</li>
        </ul>
      </div>
    `;
  } else {
    html += `<p>No constraints found in this skeleton.</p>`;
  }
  
  html += `</div>`;
  
  return {
    html, 
    metrics: {
      ikCount: ikConstraints.length,
      transformCount: transformConstraints.length,
      pathCount: pathConstraints.length,
      physicsCount: physicsConstraints.length,
      totalConstraints,
      ikImpact,
      transformImpact,
      pathImpact,
      physicsImpact,
      score: constraintScore
    }
  };
}

/**
 * Calculate the performance impact of IK constraints
 * @param ikData Array of IK constraint data
 * @returns Impact score from 0-100
 */
function calculateIkImpact(ikData: any[]): number {
  if (ikData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(ikData.length + 1) * 20;
  
  // Add impact from bone chain complexity
  let totalBones = 0;
  let maxChainLength = 0;
  
  ikData.forEach(ik => {
    totalBones += ik.bones.length;
    maxChainLength = Math.max(maxChainLength, ik.bones.length);
  });
  
  // Add impact based on total bones in constraints
  impact += Math.log2(totalBones + 1) * 10;
  
  // Add penalty for very long chains (exponential cost)
  if (maxChainLength > 2) {
    impact += Math.pow(maxChainLength, PERFORMANCE_FACTORS.IK_CHAIN_LENGTH_FACTOR) * 2;
  }
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of transform constraints
 * @param transformData Array of transform constraint data
 * @returns Impact score from 0-100
 */
function calculateTransformImpact(transformData: any[]): number {
  if (transformData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(transformData.length + 1) * 15;
  
  // Add impact from bone count
  let totalBones = 0;
  transformData.forEach(t => {
    totalBones += t.bones.length;
  });
  
  // Add impact based on total bones
  impact += Math.log2(totalBones + 1) * 8;
  
  // Add impact based on property complexity
  let propertyComplexity = 0;
  transformData.forEach(t => {
    // Count how many properties are affected (mixRotate, mixX, etc.)
    let affectedProps = 0;
    if (t.mixRotate > 0) affectedProps++;
    if (t.mixX > 0) affectedProps++;
    if (t.mixY > 0) affectedProps++;
    if (t.mixScaleX > 0) affectedProps++;
    if (t.mixScaleY > 0) affectedProps++;
    if (t.mixShearY > 0) affectedProps++;
    
    propertyComplexity += affectedProps;
  });
  
  // Add property complexity impact
  impact += propertyComplexity * 5;
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of path constraints
 * @param pathData Array of path constraint data
 * @returns Impact score from 0-100
 */
function calculatePathImpact(pathData: any[]): number {
  if (pathData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(pathData.length + 1) * 20;
  
  // Add impact from bone count
  let totalBones = 0;
  pathData.forEach(p => {
    totalBones += p.bones.length;
  });
  
  // Add impact based on total bones
  impact += Math.log2(totalBones + 1) * 10;
  
  // Add impact based on mode complexity
  let modeComplexity = 0;
  pathData.forEach(p => {
    // ChainScale is more expensive than Chain, which is more expensive than Tangent
    if (p.rotateMode === 2) modeComplexity += 3; // ChainScale
    else if (p.rotateMode === 1) modeComplexity += 2; // Chain
    else modeComplexity += 1; // Tangent
    
    // Proportional spacing is more complex
    if (p.spacingMode === 3) modeComplexity += 2; // Proportional
    else modeComplexity += 1; // Other modes
    
    // Complex paths with many world positions
    if (p.worldPositionsCount > 20) modeComplexity += 2;
  });
  
  // Add mode complexity impact
  impact += modeComplexity * 7;
  
  return Math.min(100, impact);
}

/**
 * Calculate the performance impact of physics constraints
 * @param physicsData Array of physics constraint data
 * @returns Impact score from 0-100
 */
function calculatePhysicsImpact(physicsData: any[]): number {
  if (physicsData.length === 0) return 0;
  
  // Base impact from constraint count (logarithmic scaling)
  let impact = Math.log2(physicsData.length + 1) * 30;
  
  // Add impact based on property complexity
  let propertiesComplexity = 0;
  physicsData.forEach(p => {
    // Count affected properties
    let affectedProps = 0;
    if (p.affectsX) affectedProps++;
    if (p.affectsY) affectedProps++;
    if (p.affectsRotation) affectedProps++;
    if (p.affectsScale) affectedProps++;
    if (p.affectsShear) affectedProps++;
    
    // Higher damping/strength values can increase iteration count
    const iterationFactor = Math.max(1, 3 - p.damping) * p.strength / 50;
    
    // Wind and gravity add complexity
    const forceComplexity = (Math.abs(p.wind) > 0 ? 1 : 0) + (Math.abs(p.gravity) > 0 ? 1 : 0);
    
    propertiesComplexity += affectedProps * (1 + iterationFactor + forceComplexity);
  });
  
  // Add properties complexity impact
  impact += propertiesComplexity * 5;
  
  return Math.min(100, impact);
}

/**
 * Creates an HTML table for IK constraints
 */
function createIkTable(ikData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>IK Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Mix</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${ikData.map(ik => {
            const complexityClass = ik.bones.length > 2 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${ik.name}</td>
                <td>${ik.target}</td>
                <td>${ik.bones.join(', ')}</td>
                <td>${ik.mix.toFixed(2)}</td>
                <td>${ik.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for transform constraints
 */
function createTransformTable(transformData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>Transform Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Properties</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${transformData.map(t => {
            // List affected properties
            const props = [];
            if (t.mixRotate > 0) props.push(`Rotate: ${t.mixRotate.toFixed(2)}`);
            if (t.mixX > 0) props.push(`X: ${t.mixX.toFixed(2)}`);
            if (t.mixY > 0) props.push(`Y: ${t.mixY.toFixed(2)}`);
            if (t.mixScaleX > 0) props.push(`ScaleX: ${t.mixScaleX.toFixed(2)}`);
            if (t.mixScaleY > 0) props.push(`ScaleY: ${t.mixScaleY.toFixed(2)}`);
            if (t.mixShearY > 0) props.push(`ShearY: ${t.mixShearY.toFixed(2)}`);
            
            const complexityClass = props.length > 3 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${t.name}</td>
                <td>${t.target}</td>
                <td>${t.bones.join(', ')}</td>
                <td>${props.join(', ')}</td>
                <td>${t.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for path constraints
 */
function createPathTable(pathData: any[]): string {
  // Helper function to get readable mode names
  const getRotateModeName = (mode: number): string => {
    switch(mode) {
      case 0: return 'Tangent';
      case 1: return 'Chain';
      case 2: return 'ChainScale';
      default: return `Unknown (${mode})`;
    }
  };
  
  const getSpacingModeName = (mode: number): string => {
    switch(mode) {
      case 0: return 'Length';
      case 1: return 'Fixed';
      case 2: return 'Percent';
      case 3: return 'Proportional';
      default: return `Unknown (${mode})`;
    }
  };
  
  return `
    <div class="constraint-details">
      <h4>Path Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Target</th>
            <th>Bones</th>
            <th>Modes</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${pathData.map(p => {
            const complexityClass = (p.rotateMode === 2 || p.bones.length > 3) ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${p.name}</td>
                <td>${p.target}</td>
                <td>${p.bones.join(', ')}</td>
                <td>Rotate: ${getRotateModeName(p.rotateMode)}, Spacing: ${getSpacingModeName(p.spacingMode)}</td>
                <td>${p.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Creates an HTML table for physics constraints
 */
function createPhysicsTable(physicsData: any[]): string {
  return `
    <div class="constraint-details">
      <h4>Physics Constraints</h4>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Bone</th>
            <th>Properties</th>
            <th>Parameters</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${physicsData.map(p => {
            // List affected properties
            const props = [];
            if (p.affectsX) props.push('X');
            if (p.affectsY) props.push('Y');
            if (p.affectsRotation) props.push('Rotation');
            if (p.affectsScale) props.push('Scale');
            if (p.affectsShear) props.push('Shear');
            
            // Properties that affect simulation
            const params = [
              `Inertia: ${p.inertia.toFixed(2)}`,
              `Strength: ${p.strength.toFixed(2)}`,
              `Damping: ${p.damping.toFixed(2)}`
            ];
            
            if (p.wind !== 0) params.push(`Wind: ${p.wind.toFixed(2)}`);
            if (p.gravity !== 0) params.push(`Gravity: ${p.gravity.toFixed(2)}`);
            
            const complexityClass = props.length > 2 ? 'row-warning' : '';
            
            return `
              <tr class="${complexityClass}">
                <td>${p.name}</td>
                <td>${p.bone}</td>
                <td>${props.join(', ')}</td>
                <td>${params.join(', ')}</td>
                <td>${p.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}
```


## src\core\analyzers\skeletonAnalyzer.ts

```
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";
import { calculateBoneScore, calculateMaxDepth, getScoreColor } from "../utils/scoreCalculator";

/**
 * Analyzes the skeleton structure of a Spine instance
 * @param spineInstance The Spine instance to analyze
 * @returns HTML output and metrics for skeleton structure analysis
 */
export function createSkeletonTree(spineInstance: Spine): { html: string, metrics: any } {
  const skeleton = spineInstance.skeleton;
  
  // Generate tree structure
  function buildBoneNode(bone: any): any {
    const children = bone.children || [];
    return {
      name: bone.data.name,
      type: 'bone',
      x: bone.x.toFixed(2),
      y: bone.y.toFixed(2),
      children: children.map(buildBoneNode)
    };
  }
  
  const rootBones = skeleton.bones.filter(bone => !bone.parent);
  const boneTree = rootBones.map(buildBoneNode);
  
  const maxDepth = calculateMaxDepth(boneTree);
  const totalBones = skeleton.bones.length;
  
  // Calculate bone score
  const boneScore = calculateBoneScore(totalBones, maxDepth);
  
  const metrics = {
    totalBones,
    rootBones: rootBones.length,
    maxDepth,
    score: boneScore
  };
  
  // Generate HTML for the tree
  function generateTreeHTML(nodes: any[]): string {
    if (nodes.length === 0) return '';
    
    let html = '<ul class="skeleton-tree">';
    
    nodes.forEach(node => {
      html += `<li class="tree-node">
        <span class="node-label">${node.name} (x: ${node.x}, y: ${node.y})</span>`;
      
      if (node.children && node.children.length > 0) {
        html += generateTreeHTML(node.children);
      }
      
      html += '</li>';
    });
    
    html += '</ul>';
    return html;
  }
  
  let html = `
    <div class="skeleton-tree-container">
      <h3>Skeleton Structure</h3>
      <p>Total bones: ${totalBones}</p>
      <p>Root bones: ${rootBones.length}</p>
      <p>Max depth: ${maxDepth}</p>
      
      <div class="performance-score">
        <h4>Bone Structure Performance Score: ${boneScore.toFixed(1)}/100</h4>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${boneScore}%; background-color: ${getScoreColor(boneScore)};"></div>
        </div>
      </div>
      
      <div class="analysis-metrics">
        <p><strong>Performance Impact Formula:</strong></p>
        <code>boneScore = 100 - log₂(totalBones/${PERFORMANCE_FACTORS.IDEAL_BONE_COUNT} + 1) × 15 
          - (maxDepth × ${PERFORMANCE_FACTORS.BONE_DEPTH_FACTOR})</code>
      </div>
      
      <div class="tree-view">
        ${generateTreeHTML(boneTree)}
      </div>
      
      <div class="analysis-notes">
        <h4>Notes on Bone Structure:</h4>
        <ul>
          <li><strong>Bone Count:</strong> Each bone requires matrix computations every frame</li>
          <li><strong>Hierarchy Depth:</strong> Deep hierarchies increase transformation complexity exponentially</li>
          <li><strong>Recommendation:</strong> Keep bone hierarchies under 5 levels deep when possible</li>
          <li><strong>Optimal Structure:</strong> Flat hierarchies with few parent-child relationships perform better</li>
        </ul>
      </div>
    </div>
  `;
  
  return {html, metrics};
}
```


## src\core\constants\performanceFactors.ts

```
/**
 * Performance factors and constants used for Spine benchmark scoring
 */
export const PERFORMANCE_FACTORS = {
    // Base weights
    BONE_WEIGHT: 0.15,             // Impact of bone count
    MESH_WEIGHT: 0.25,             // Impact of mesh count and complexity
    CLIPPING_WEIGHT: 0.20,         // Impact of clipping masks
    BLEND_MODE_WEIGHT: 0.15,       // Impact of blend modes
    CONSTRAINT_WEIGHT: 0.25,       // Impact of constraints (combined)
    
    // Constraint breakdown weights (these sum to 1.0)
    IK_WEIGHT: 0.20,               // IK constraints weight
    TRANSFORM_WEIGHT: 0.15,        // Transform constraints weight
    PATH_WEIGHT: 0.25,             // Path constraints weight
    PHYSICS_WEIGHT: 0.40,          // Physics constraints weight (highest impact)
    
    // Complexity scale factors
    BONE_DEPTH_FACTOR: 1.5,        // Multiplier for bone depth impact
    MESH_VERTEX_FACTOR: 0.03,      // Per-vertex impact
    MESH_WEIGHTED_FACTOR: 2.0,     // Multiplier for weighted meshes
    MESH_DEFORMED_FACTOR: 1.5,     // Multiplier for meshes with deformation
    CLIPPING_VERTEX_FACTOR: 1.5,   // Per-vertex impact for clipping masks
    
    // Reference values (ideal thresholds)
    IDEAL_BONE_COUNT: 30,          // Reference value for bones
    IDEAL_MESH_COUNT: 15,          // Reference value for meshes
    IDEAL_VERTEX_COUNT: 300,       // Reference value for total vertices
    IDEAL_CLIPPING_COUNT: 2,       // Reference value for clipping masks
    IDEAL_BLEND_MODE_COUNT: 2,     // Reference value for non-normal blend modes
    
    // Physics simulation complexity factors
    PHYSICS_ITERATION_COST: 3.0,   // Cost multiplier for physics iterations
    IK_CHAIN_LENGTH_FACTOR: 1.3,   // Exponential factor for IK chain length
    
    // Animation complexity
    ANIMATION_COUNT_FACTOR: 0.05,  // Impact of number of animations
    TIMELINE_DENSITY_FACTOR: 0.1,  // Impact of timeline density
  };
```


## src\core\generators\summaryGenerator.ts

```
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getScoreColor, getScoreRating, getScoreInterpretation } from "../utils/scoreCalculator";

/**
 * Generates a comprehensive HTML summary of the skeleton analysis
 * @param spineInstance The analyzed Spine instance
 * @param boneMetrics Bone analysis metrics
 * @param meshMetrics Mesh analysis metrics
 * @param clippingMetrics Clipping mask analysis metrics
 * @param blendModeMetrics Blend mode analysis metrics
 * @param constraintMetrics Constraint analysis metrics
 * @param overallScore The calculated overall performance score
 * @returns HTML string containing the summary
 */
export function generateSummary(
  spineInstance: Spine,
  boneMetrics: any,
  meshMetrics: any,
  clippingMetrics: any,
  blendModeMetrics: any,
  constraintMetrics: any,
  overallScore: number
): string {
  // Get the skeleton data
  const skeleton = spineInstance.skeleton;
  const skeletonData = skeleton.data;
  
  // Get performance rating and interpretation
  const performanceRating = getScoreRating(overallScore);
  const interpretation = getScoreInterpretation(overallScore);
  
  // Generate component score table
  const componentScores = [
    { name: 'Bone Structure', score: boneMetrics.score, weight: '15%' },
    { name: 'Mesh Complexity', score: meshMetrics.score, weight: '25%' },
    { name: 'Clipping Masks', score: clippingMetrics.score, weight: '20%' },
    { name: 'Blend Modes', score: blendModeMetrics.score, weight: '15%' },
    { name: 'Constraints', score: constraintMetrics.score, weight: '25%' },
  ];
  
  // Generate skeleton statistics
  const stats = [
    { name: 'Total Bones', value: boneMetrics.totalBones },
    { name: 'Max Bone Depth', value: boneMetrics.maxDepth },
    { name: 'Total Meshes', value: meshMetrics.totalMeshCount },
    { name: 'Total Vertices', value: meshMetrics.totalVertices },
    { name: 'Clipping Masks', value: clippingMetrics.maskCount },
    { name: 'Non-Normal Blend Modes', value: blendModeMetrics.nonNormalBlendModeCount },
    { name: 'Total Constraints', value: constraintMetrics.totalConstraints },
    { name: 'Animations', value: skeletonData.animations.length },
    { name: 'Skins', value: skeletonData.skins.length },
  ];
  
  // Generate optimization recommendations
  const recommendations: string[] = [];
  
  // Bone recommendations
  if (boneMetrics.maxDepth > 5) {
    recommendations.push('Reduce bone hierarchy depth by flattening the structure where possible.');
  }
  if (boneMetrics.totalBones > 50) {
    recommendations.push('Consider reducing the total number of bones by simplifying the skeleton.');
  }
  
  // Mesh recommendations
  if (meshMetrics.totalVertices > 500) {
    recommendations.push('Reduce the total number of vertices across all meshes.');
  }
  if (meshMetrics.deformedMeshCount > 5) {
    recommendations.push('Minimize the number of deformed meshes, especially those with high vertex counts.');
  }
  if (meshMetrics.weightedMeshCount > 5) {
    recommendations.push('Reduce the number of meshes with bone weights, as they require more calculations.');
  }
  
  // Clipping recommendations
  if (clippingMetrics.maskCount > 2) {
    recommendations.push('Limit the number of clipping masks as they significantly impact performance.');
  }
  if (clippingMetrics.complexMasks > 0) {
    recommendations.push('Simplify complex clipping masks to use fewer vertices (4 or less is optimal).');
  }
  
  // Blend mode recommendations
  if (blendModeMetrics.nonNormalBlendModeCount > 2) {
    recommendations.push('Reduce the number of non-normal blend modes to minimize render state changes.');
  }
  if (blendModeMetrics.additiveCount > 5) {
    recommendations.push('Minimize the use of additive blend modes as they are particularly expensive.');
  }
  
  // Constraint recommendations
  if (constraintMetrics.physicsCount > 1) {
    recommendations.push('Physics constraints are particularly expensive - consider reducing their number or complexity.');
  }
  if (constraintMetrics.ikImpact > 50) {
    recommendations.push('Simplify IK constraints by reducing chain length or number of affected bones.');
  }
  if (constraintMetrics.pathImpact > 50) {
    recommendations.push('Optimize path constraints by simplifying paths or reducing the number of constrained bones.');
  }
  
  // Generate HTML summary
  const scoreColor = getScoreColor(overallScore);
  
  return `
    <div class="benchmark-summary">
      <h2>Spine Performance Analysis</h2>
      <p>Skeleton: ${skeletonData.name || 'Unnamed'}</p>
      
      <div class="score-container">
        <div class="performance-score" style="color: ${scoreColor}">${Math.round(overallScore)}</div>
        <div class="score-label">${performanceRating} Performance</div>
        <p class="score-interpretation">${interpretation}</p>
      </div>
      
      <h3>Component Scores</h3>
      <table class="benchmark-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Score</th>
            <th>Weight</th>
            <th>Meter</th>
          </tr>
        </thead>
        <tbody>
          ${componentScores.map(component => `
            <tr>
              <td>${component.name}</td>
              <td>${component.score.toFixed(1)}</td>
              <td>${component.weight}</td>
              <td>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${component.score}%; background-color: ${getScoreColor(component.score)};"></div>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <h3>Skeleton Statistics</h3>
      <div class="stats-container">
        <table class="stats-table">
          <tbody>
            ${stats.map(stat => `
              <tr>
                <td>${stat.name}</td>
                <td>${stat.value}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${recommendations.length > 0 ? `
        <div class="optimization-tips">
          <h3>Optimization Recommendations</h3>
          <ul>
            ${recommendations.map(tip => `<li>${tip}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div class="performance-explanation">
        <h3>Performance Score Interpretation</h3>
        <table class="benchmark-table">
          <thead>
            <tr>
              <th>Score Range</th>
              <th>Rating</th>
              <th>Interpretation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>85-100</td>
              <td>Excellent</td>
              <td>Suitable for all platforms and continuous animations</td>
            </tr>
            <tr>
              <td>70-84</td>
              <td>Good</td>
              <td>Works well on most platforms but may have issues on low-end devices</td>
            </tr>
            <tr>
              <td>55-69</td>
              <td>Moderate</td>
              <td>May cause performance dips, especially with multiple instances</td>
            </tr>
            <tr>
              <td>40-54</td>
              <td>Poor</td>
              <td>Performance issues likely on most devices</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}
```


## src\core\utils\scoreCalculator.ts

```
import { PERFORMANCE_FACTORS } from "../constants/performanceFactors";

/**
 * Calculates the mesh performance score
 * @param metrics Mesh metrics
 * @returns Score from 0-100
 */
export function calculateMeshScore(metrics: any): number {
  // Formula from documentation:
  // meshScore = 100 - log₂(totalMeshes/idealMeshes + 1) * 15
  //             - log₂(totalVertices/idealVertices + 1) * 10
  //             - (deformedMeshes * deformationFactor)
  //             - (weightedMeshes * weightFactor)
  
  const { totalMeshCount, totalVertices, deformedMeshCount, weightedMeshCount } = metrics;
  const { IDEAL_MESH_COUNT, IDEAL_VERTEX_COUNT, MESH_DEFORMED_FACTOR, MESH_WEIGHTED_FACTOR } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  // Mesh count penalty (logarithmic)
  if (totalMeshCount > 0) {
    score -= Math.log2(totalMeshCount / IDEAL_MESH_COUNT + 1) * 15;
  }
  
  // Vertex count penalty (logarithmic)
  if (totalVertices > 0) {
    score -= Math.log2(totalVertices / IDEAL_VERTEX_COUNT + 1) * 10;
  }
  
  // Deformation penalty (linear)
  score -= deformedMeshCount * MESH_DEFORMED_FACTOR;
  
  // Weighted mesh penalty (linear)
  score -= weightedMeshCount * MESH_WEIGHTED_FACTOR;
  
  // Floor the score at 0
  return Math.max(0, score);
}

/**
 * Calculates the clipping mask performance score
 * @param maskCount Number of clipping masks
 * @param vertexCount Total vertices in all masks
 * @param complexMasks Number of masks with more than 4 vertices
 * @returns Score from 0-100
 */
export function calculateClippingScore(maskCount: number, vertexCount: number, complexMasks: number): number {
  // Formula from documentation:
  // clippingScore = 100 - log₂(maskCount/idealMasks + 1) * 20
  //                 - log₂(vertexCount + 1) * 5
  //                 - (complexMasks * 10)
  
  const { IDEAL_CLIPPING_COUNT } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  // Mask count penalty (logarithmic)
  if (maskCount > 0) {
    score -= Math.log2(maskCount / IDEAL_CLIPPING_COUNT + 1) * 20;
  }
  
  // Vertex count penalty (logarithmic)
  if (vertexCount > 0) {
    score -= Math.log2(vertexCount + 1) * 5;
  }
  
  // Complex mask penalty (linear)
  score -= complexMasks * 10;
  
  // Floor the score at 0
  return Math.max(0, score);
}

/**
 * Calculates the blend mode performance score
 * @param nonNormalCount Number of non-normal blend modes
 * @param additiveCount Number of additive blend modes
 * @returns Score from 0-100
 */
export function calculateBlendModeScore(nonNormalCount: number, additiveCount: number): number {
  // Formula from documentation:
  // blendModeScore = 100 - log₂(nonNormalCount/idealBlendModes + 1) * 20
  //                 - (additiveCount * 2)
  
  const { IDEAL_BLEND_MODE_COUNT } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  // Non-normal blend mode count penalty (logarithmic)
  if (nonNormalCount > 0) {
    score -= Math.log2(nonNormalCount / IDEAL_BLEND_MODE_COUNT + 1) * 20;
  }
  
  // Additive blend mode penalty (linear)
  score -= additiveCount * 2;
  
  // Floor the score at 0
  return Math.max(0, score);
}

/**
 * Calculates the bone structure performance score
 * @param totalBones Total number of bones
 * @param maxDepth Maximum depth of bone hierarchy
 * @returns Score from 0-100
 */
export function calculateBoneScore(totalBones: number, maxDepth: number): number {
  // Formula from documentation:
  // boneScore = 100 - log₂(totalBones/idealBones + 1) * 15 - (maxDepth * depthFactor)
  
  const { IDEAL_BONE_COUNT, BONE_DEPTH_FACTOR } = PERFORMANCE_FACTORS;
  
  let score = 100;
  
  // Bone count penalty (logarithmic)
  if (totalBones > 0) {
    score -= Math.log2(totalBones / IDEAL_BONE_COUNT + 1) * 15;
  }
  
  // Depth penalty (linear)
  score -= maxDepth * BONE_DEPTH_FACTOR;
  
  // Floor the score at 0
  return Math.max(0, score);
}

/**
 * Calculates the constraint performance score
 * @param ikImpact IK constraints impact
 * @param transformImpact Transform constraints impact
 * @param pathImpact Path constraints impact
 * @param physicsImpact Physics constraints impact
 * @returns Score from 0-100
 */
export function calculateConstraintScore(
  ikImpact: number, 
  transformImpact: number, 
  pathImpact: number, 
  physicsImpact: number
): number {
  // Calculate weighted impacts using constraint weights
  const { 
    IK_WEIGHT, 
    TRANSFORM_WEIGHT, 
    PATH_WEIGHT, 
    PHYSICS_WEIGHT 
  } = PERFORMANCE_FACTORS;
  
  // Calculate total weighted impact
  const totalImpact = 
    (ikImpact * IK_WEIGHT) + 
    (transformImpact * TRANSFORM_WEIGHT) + 
    (pathImpact * PATH_WEIGHT) + 
    (physicsImpact * PHYSICS_WEIGHT);
  
  // Formula from documentation:
  // constraintScore = 100 - (constraintImpact * 0.5)
  const score = 100 - (totalImpact * 0.5);
  
  // Floor the score at 0
  return Math.max(0, score);
}

/**
 * Helper function to calculate maximum depth of a tree structure
 * @param nodes Tree nodes
 * @returns Maximum depth of the tree
 */
export function calculateMaxDepth(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;
  
  return 1 + Math.max(...nodes.map(node => 
    node.children ? calculateMaxDepth(node.children) : 0
  ));
}

/**
 * Calculate overall performance score from component scores
 * @param componentScores Scores for each component
 * @returns Overall performance score (40-100)
 */
export function calculateOverallScore(componentScores: { [key: string]: number }): number {
  const { 
    BONE_WEIGHT, 
    MESH_WEIGHT, 
    CLIPPING_WEIGHT, 
    BLEND_MODE_WEIGHT, 
    CONSTRAINT_WEIGHT 
  } = PERFORMANCE_FACTORS;
  
  // Apply weights to each component score
  const weightedScore = 
    (componentScores.boneScore * BONE_WEIGHT) +
    (componentScores.meshScore * MESH_WEIGHT) +
    (componentScores.clippingScore * CLIPPING_WEIGHT) +
    (componentScores.blendModeScore * BLEND_MODE_WEIGHT) +
    (componentScores.constraintScore * CONSTRAINT_WEIGHT);
  
  // Ensure score has a floor of 40 (as per documentation)
  return Math.max(40, Math.round(weightedScore));
}

/**
 * Helper method to get a color for a score
 * @param score Performance score
 * @returns CSS color string
 */
export function getScoreColor(score: number): string {
  if (score >= 85) return '#4caf50'; // Green for excellent
  if (score >= 70) return '#8bc34a'; // Light green for good
  if (score >= 55) return '#ffb300'; // Amber for moderate
  if (score >= 40) return '#f57c00'; // Orange for poor
  return '#e53935'; // Red for very poor
}

/**
 * Helper method to get a rating label for a score
 * @param score Performance score
 * @returns Text rating
 */
export function getScoreRating(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Moderate';
  if (score >= 40) return 'Poor';
  return 'Very Poor';
}

/**
 * Helper method to get interpretation for a score
 * @param score Performance score
 * @returns Score interpretation text
 */
export function getScoreInterpretation(score: number): string {
  if (score >= 85) return 'Suitable for all platforms and continuous animations';
  if (score >= 70) return 'Works well on most platforms but may have issues on low-end devices';
  if (score >= 55) return 'May cause performance dips, especially with multiple instances';
  if (score >= 40) return 'Performance issues likely on most devices';
  return 'Significant performance issues on all devices';
}
```


## src\error.ts

```
export enum SpineErrorCode {
    FILE_READ_ERROR = 1001,
    IMAGE_LOAD_ERROR = 1002,
    JSON_PARSE_ERROR = 1003,
    UNSUPPORTED_VERSION = 1004,
    INVALID_SKELETON_STRUCTURE = 1005,
    BINARY_FILE_ERROR = 1006,
    ATLAS_READ_ERROR = 1007,
    INVALID_ATLAS_STRUCTURE = 1008,
    TEXTURE_NOT_FOUND = 1009,
    ATLAS_CREATE_ERROR = 1010,
    EMPTY_SKELETON = 1011,
    SKELETON_PARSE_ERROR = 1012,
    SPINE_INSTANCE_ERROR = 1013,
    CRITICAL_ASSET_ERROR = 1014,
    FILE_PROCESSING_ERROR = 1015,
    MISSING_SKELETON_FILE = 1016,
    MISSING_ATLAS_FILE = 1017,
  }
  
  interface SpineError {
    code: SpineErrorCode;
    message: string;
  }
  
  export class SpineErrorHandler extends Error {
    code: SpineErrorCode;
  
    constructor(error: SpineError) {
      super(error.message);
      this.code = error.code;
      this.name = "SpineError";
    }
  }
  
  export const SPINE_ERRORS: Record<SpineErrorCode, string> = {
    [SpineErrorCode.FILE_READ_ERROR]: "Ошибка чтения файла: {0}",
    [SpineErrorCode.IMAGE_LOAD_ERROR]: "Ошибка загрузки изображения {0}: {1}",
    [SpineErrorCode.JSON_PARSE_ERROR]:
      "Ошибка парсинга JSON файла скелета {0}: {1}",
    [SpineErrorCode.UNSUPPORTED_VERSION]:
      "Неподдерживаемая версия Spine: {0}. Максимальная поддерживаемая версия: 4.1",
    [SpineErrorCode.INVALID_SKELETON_STRUCTURE]:
      "Некорректная структура JSON файла скелета: {0}",
    [SpineErrorCode.BINARY_FILE_ERROR]:
      "Ошибка чтения бинарного файла скелета: {0}",
    [SpineErrorCode.ATLAS_READ_ERROR]: "Ошибка чтения файла атласа: {0}",
    [SpineErrorCode.INVALID_ATLAS_STRUCTURE]:
      "Некорректная структура файла атласа: {0}",
    [SpineErrorCode.TEXTURE_NOT_FOUND]: "Текстура не найдена: {0}",
    [SpineErrorCode.ATLAS_CREATE_ERROR]: "Ошибка создания атласа: {0}",
    [SpineErrorCode.EMPTY_SKELETON]: "Скелет не содержит костей",
    [SpineErrorCode.SKELETON_PARSE_ERROR]: "Ошибка парсинга скелета: {0}",
    [SpineErrorCode.SPINE_INSTANCE_ERROR]:
      "Ошибка создания экземпляра Spine: {0}",
    [SpineErrorCode.CRITICAL_ASSET_ERROR]:
      "Критическая ошибка при создании ассета: {0}",
    [SpineErrorCode.FILE_PROCESSING_ERROR]:
      "Произошла ошибка при обработке файла {0}: {1}",
    [SpineErrorCode.MISSING_SKELETON_FILE]:
      "Отсутствует файл скелета (.json или .skel). Загрузите файл скелета вместе с атласом.",
    [SpineErrorCode.MISSING_ATLAS_FILE]:
      "Отсутствует атлас файл (.atlas). Загрузите его вместе со скелетом.",
  };
  
  export function formatErrorMessage(
    code: SpineErrorCode,
    ...args: string[]
  ): string {
    let message = SPINE_ERRORS[code];
    args.forEach((arg, index) => {
      message = message.replace(`{${index}}`, arg);
    });
    return message;
  }
```


## src\hooks\ToastContext.tsx

```
import React, { createContext, useContext } from 'react';
import { toast, ToastContainer as ToastifyContainer, ToastOptions } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastContextType {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Configure default toast options
const toastOptions: ToastOptions = {
  position: "top-center",
  autoClose: 1000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "dark",
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const addToast = (message: string, type: ToastType = 'info') => {
    switch (type) {
      case 'success':
        toast.success(message, toastOptions);
        break;
      case 'warning':
        toast.warning(message, toastOptions);
        break;
      case 'error':
        toast.error(message, toastOptions);
        break;
      case 'info':
      default:
        toast.info(message, toastOptions);
    }
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// Custom ToastContainer component with dark theme
export const ToastContainer: React.FC = () => {
  return (
    <ToastifyContainer
      position="top-center"
      autoClose={1000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss
      draggable
      pauseOnHover
      theme="dark"
    />
  );
};
```


## src\hooks\useSafeLocalStorage.ts

```
import { useState, useEffect, Dispatch, SetStateAction } from 'react';

export function useSafeLocalStorage<T>(
  key: string, 
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Function to safely access localStorage
  const isLocalStorageAvailable = (): boolean => {
    try {
      const testKey = '__test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Initialize stored value from localStorage if available
  useEffect(() => {
    try {
      if (!isLocalStorageAvailable()) return;
      
      const item = localStorage.getItem(key);
      if (item !== null) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue: Dispatch<SetStateAction<T>> = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      
      // Save state
      setStoredValue(valueToStore);
      
      // Save to localStorage if available
      if (isLocalStorageAvailable()) {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
```


## src\hooks\useSpineApp.ts

```
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { BackgroundManager } from '../core/BackgroundManager';
import { CameraContainer } from '../core/CameraContainer';
import { SpineAnalyzer } from '../core/SpineAnalyzer';
import { SpineLoader } from '../core/SpineLoader';
import { useToast } from './ToastContext';

export interface BenchmarkData {
  meshAnalysis: any;
  clippingAnalysis: any;
  blendModeAnalysis: any;
  skeletonTree: any;
  summary: any;
  physicsAnalysis: any;
}

export interface DebugFlags {
  showBones: boolean;
  showRegionAttachments: boolean;
  showMeshTriangles: boolean;
  showMeshHull: boolean;
  showBoundingBoxes: boolean;
  showPaths: boolean;
  showClipping: boolean;
  showPhysics: boolean;
  showIkConstraints: boolean;
  showTransformConstraints: boolean;
  showPathConstraints: boolean;
}

export function useSpineApp(app: Application | null) {
  const [spineInstance, setSpineInstance] = useState<Spine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  
  // Separate flags for each debug visualization type
  const [meshesVisible, setMeshesVisible] = useState(false);
  const [physicsVisible, setPhysicsVisible] = useState(false);
  const [ikVisible, setIkVisible] = useState(false);
  
  const cameraContainerRef = useRef<CameraContainer | null>(null);
  const backgroundManagerRef = useRef<BackgroundManager | null>(null);
  const { addToast } = useToast();

  // This effect runs when the app instance changes
  useEffect(() => {
    if (!app) return;

    // Create and add camera container
    const cameraContainer = new CameraContainer({
      width: app.screen.width,
      height: app.screen.height,
      app,
    });
    
    app.stage.addChild(cameraContainer);
    cameraContainerRef.current = cameraContainer;
    
    // Create the background manager
    const backgroundManager = new BackgroundManager(app);
    backgroundManagerRef.current = backgroundManager;

    return () => {
      if (cameraContainer) {
        cameraContainer.destroy();
      }
      cameraContainerRef.current = null;
      
      if (backgroundManager) {
        backgroundManager.destroy();
      }
      backgroundManagerRef.current = null;
    };
  }, [app]);

  // Function to load spine files
  const loadSpineFiles = async (files: FileList) => {
    if (!app || !cameraContainerRef.current) {
      addToast('Application not initialized', 'error');
      return;
    }

    setIsLoading(true);
    
    try {
      // Log file information for debugging
      console.log(`Processing ${files.length} files:`);
      Array.from(files).forEach((file, index) => {
        console.log(`File ${index + 1}: ${file.name} (${file.type})`);
      });
      
      // Check if we have the basic required files
      const hasJsonFile = Array.from(files).some(file => 
        file.name.endsWith('.json') || file.type === 'application/json'
      );
      
      const hasSkelFile = Array.from(files).some(file => 
        file.name.endsWith('.skel')
      );
      
      const hasAtlasFile = Array.from(files).some(file => 
        file.name.endsWith('.atlas')
      );
      
      const hasImageFiles = Array.from(files).some(file => 
        file.type.startsWith('image/') || 
        file.name.endsWith('.png') || 
        file.name.endsWith('.jpg') || 
        file.name.endsWith('.jpeg') || 
        file.name.endsWith('.webp')
      );
      
      if (!hasAtlasFile) {
        throw new Error('Missing .atlas file. Please include an atlas file with your Spine data.');
      }
      
      if (!hasJsonFile && !hasSkelFile) {
        throw new Error('Missing skeleton file (.json or .skel). Please include a skeleton file with your Spine data.');
      }
      
      if (!hasImageFiles) {
        throw new Error('Missing image files. Please include image files referenced by your atlas.');
      }

      // Remove previous Spine instance if exists
      if (spineInstance) {
        cameraContainerRef.current.removeChild(spineInstance);
        setSpineInstance(null);
      }

      // Load spine files
      const loader = new SpineLoader(app);
      const newSpineInstance = await loader.loadSpineFiles(files);
      
      if (!newSpineInstance) {
        throw new Error('Failed to load Spine instance');
      }

      // Add to camera container and look at it
      cameraContainerRef.current.addChild(newSpineInstance);
      cameraContainerRef.current.lookAtChild(newSpineInstance);
      
      // Analyze spine data
      const analysisData = SpineAnalyzer.analyze(newSpineInstance);
      setBenchmarkData(analysisData);
      
      setSpineInstance(newSpineInstance);
      addToast('Spine files loaded successfully', 'success');
      
      // Reset all debug flags
      setMeshesVisible(false);
      setPhysicsVisible(false);
      setIkVisible(false);
      
      // Ensure debug visualization is turned off by default
      if (cameraContainerRef.current) {
        cameraContainerRef.current.setDebugFlags({
          showBones: false,
          showMeshTriangles: false,
          showMeshHull: false,
          showRegionAttachments: false,
          showBoundingBoxes: false,
          showPaths: false,
          showClipping: false,
          showPhysics: false,
          showIkConstraints: false,
          showTransformConstraints: false,
          showPathConstraints: false
        });
      }
      
    } catch (error) {
      console.error('Error loading Spine files:', error);
      addToast(`Error loading Spine files: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      throw error; // Re-throw to allow the calling code to handle it
    } finally {
      setIsLoading(false);
    }
  };
  
  // New function to forcefully remove all debug graphics
  const removeAllDebugGraphics = () => {
    if (!spineInstance || !cameraContainerRef.current) return;
    
    // Set all debug flags to false in the camera container
    if (cameraContainerRef.current.setDebugFlags) {
      cameraContainerRef.current.setDebugFlags({
        showBones: false,
        showRegionAttachments: false,
        showMeshTriangles: false,
        showMeshHull: false,
        showBoundingBoxes: false,
        showPaths: false,
        showClipping: false,
        showPhysics: false,
        showIkConstraints: false,
        showTransformConstraints: false,
        showPathConstraints: false
      });
    }
    
    // Get the debug renderer
    const debugRenderer = (cameraContainerRef.current as any).debugRenderer;
    if (!debugRenderer) return;
    
    // Get access to registered spines
    const registeredSpines = debugRenderer.registeredSpines;
    if (!registeredSpines) return;
    
    // Get debug display objects for our spine instance
    const debugObjs = registeredSpines.get(spineInstance);
    if (!debugObjs) return;
    
    // Clear all graphics objects
    const graphicsProps = [
      'skeletonXY', 
      'regionAttachmentsShape', 
      'meshTrianglesLine',
      'meshHullLine', 
      'clippingPolygon', 
      'boundingBoxesRect',
      'boundingBoxesCircle', 
      'boundingBoxesPolygon', 
      'pathsCurve',
      'pathsLine'
    ];
    
    graphicsProps.forEach(prop => {
      if (debugObjs[prop] && typeof debugObjs[prop].clear === 'function') {
        debugObjs[prop].clear();
      }
    });
    
    // Remove bone dots (which are children of the bones container)
    if (debugObjs.bones && debugObjs.bones.children) {
      while (debugObjs.bones.children.length > 0) {
        const bone = debugObjs.bones.children[0];
        debugObjs.bones.removeChild(bone);
        if (bone.destroy) {
          bone.destroy({children: true});
        }
      }
    }
    
    // Clear custom constraint graphics
    const customGraphicsProps = [
      'physicsConstraints',
      'ikConstraints',
      'transformConstraints',
      'pathConstraints'
    ];
    
    customGraphicsProps.forEach(prop => {
      if (debugObjs[prop] && typeof debugObjs[prop].clear === 'function') {
        debugObjs[prop].clear();
      }
    });
    
    // Force a render update
    if (app) {
      app.renderer.render(app.stage);
    }
  };

  // Updated toggle functions
  const toggleMeshes = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !meshesVisible;
    setMeshesVisible(newValue);
    
    if (newValue) {
      // Turn on meshes visualization
      cameraContainerRef.current.toggleMeshes(true);
    } else {
      // Turn off and forcefully clear
      cameraContainerRef.current.toggleMeshes(false);
      removeAllDebugGraphics();
    }
  };
  
  const togglePhysics = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !physicsVisible;
    setPhysicsVisible(newValue);
    
    if (newValue) {
      // Turn on physics visualization
      cameraContainerRef.current.togglePhysics(true);
    } else {
      // Turn off and forcefully clear
      cameraContainerRef.current.togglePhysics(false);
      removeAllDebugGraphics();
    }
  };
  
  const toggleIk = () => {
    if (!cameraContainerRef.current) return;
    
    const newValue = !ikVisible;
    setIkVisible(newValue);
    
    if (newValue) {
      // Turn on IK constraints visualization
      cameraContainerRef.current.toggleIkConstraints(true);
    } else {
      // Turn off and forcefully clear
      cameraContainerRef.current.toggleIkConstraints(false);
      removeAllDebugGraphics();
    }
  };
  
  // Function to set the background image using base64 data
  const setBackgroundImage = async (base64Data: string) => {
    if (!backgroundManagerRef.current) {
      addToast('Background manager not initialized', 'error');
      return;
    }
    
    try {
      await backgroundManagerRef.current.setBackgroundImage(base64Data);
      addToast('Background image set successfully', 'success');
    } catch (error) {
      console.error('Error setting background image:', error);
      addToast(`Error setting background image: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };
  
  // Function to clear the background image
  const clearBackgroundImage = () => {
    if (!backgroundManagerRef.current) {
      return;
    }
    
    backgroundManagerRef.current.clearBackground();
    addToast('Background image removed', 'info');
  };

  return {
    spineInstance,
    loadSpineFiles,
    isLoading,
    benchmarkData,
    setBackgroundImage,
    clearBackgroundImage,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible
  };
}
```


## src\index.tsx

```
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './hooks/ToastContext';
import './styles.css';
// Import the custom toastify styles
import './toastify.css'; // Make sure to create this file with the custom styles

// Create root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Failed to find the root element');
}

const root = createRoot(container);

// Render the app
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
```


## src\locales\en.json

```
{
  "error": {
    "1001": "File read error: {0}",
    "1002": "Image load error {0}: {1}",
    "1003": "JSON parse error for skeleton file {0}: {1}",
    "1004": "Unsupported Spine version: {0}. Maximum supported version: 4.1",
    "1005": "Incorrect structure in skeleton JSON file: {0}",
    "1006": "Error reading binary skeleton file: {0}",
    "1007": "Error reading atlas file: {0}",
    "1008": "Invalid atlas file structure: {0}",
    "1009": "Texture not found: {0}",
    "1010": "Error creating atlas: {0}",
    "1011": "Skeleton contains no bones",
    "1012": "Skeleton parse error: {0}",
    "1013": "Error creating Spine instance: {0}",
    "1014": "Critical error creating asset: {0}",
    "1015": "File processing error {0}: {1}",
    "1016": "Missing skeleton file (.json or .skel). Please upload the skeleton file along with the atlas.",
    "1017": "Missing atlas file (.atlas). Please upload it along with the skeleton."
  }
}
```


## src\locales\ru.json

```
{
    "error": {
      "1001": "Ошибка чтения файла: {0}",
      "1002": "Ошибка загрузки изображения {0}: {1}",
      "1003": "Ошибка парсинга JSON файла скелета {0}: {1}",
      "1004": "Неподдерживаемая версия Spine: {0}. Максимальная поддерживаемая версия: 4.1",
      "1005": "Некорректная структура JSON файла скелета: {0}",
      "1006": "Ошибка чтения бинарного файла скелета: {0}",
      "1007": "Ошибка чтения файла атласа: {0}",
      "1008": "Некорректная структура файла атласа: {0}",
      "1009": "Текстура не найдена: {0}",
      "1010": "Ошибка создания атласа: {0}",
      "1011": "Скелет не содержит костей",
      "1012": "Ошибка парсинга скелета: {0}",
      "1013": "Ошибка создания экземпляра Spine: {0}",
      "1014": "Критическая ошибка при создании ассета: {0}",
      "1015": "Произошла ошибка при обработке файла {0}: {1}",
      "1016": "Отсутствует файл скелета (.json или .skel). Загрузите файл скелета вместе с атласом.",
      "1017": "Отсутствует атлас файл (.atlas). Загрузите его вместе со скелетом."
    }
  }
```


## src\md-module.d.ts

```
/// <reference types="vite/client" />

declare module '*.md' {
    const attributes: Record<string, unknown>;
    const html: string;
    const raw: string;
    export { attributes, html, raw };
  }
```


## src\styles.css

```
:root {
  --color-dark: #282b30;
  --color-darker: #1a1a1a;
  --color-light: #f1f1f1;
  --color-accent: #5865f2;
  --color-success: #43b581;
  --color-warning: #faa61a;
  --color-error: #f04747;
  
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.1);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--color-light);
  background-color: var(--color-dark);
  min-height: 100vh;
  width: 100%;
  overflow: hidden;
}

/* Canvas Container */
.canvas-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

#pixiCanvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Drop Area */
.drop-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #fff;
  font-size: 18px;
  background: rgba(0, 0, 0, 0.5);
  padding: 40px 60px;
  border-radius: 8px;
  border: 2px dashed #555;
  pointer-events: none;
}

.drop-area p {
  margin: 8px 0;
}

.drop-area p:last-child {
  font-size: 14px;
  opacity: 0.7;
}

.canvas-container.highlight {
  background-color: rgba(88, 101, 242, 0.1);
  border: 2px dashed var(--color-accent);
}

/* Loading Indicator */
.loading-indicator {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 20;
}

.loading-indicator p {
  margin-top: 16px;
  font-size: 1.2rem;
  color: var(--color-light);
}

/* Playback Controls Container */
.playback-controls-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
}

/* Ant Design Overrides */
.ant-layout {
  color: var(--color-light);
}

.ant-layout-sider {
  background: #1f1f1f !important;
}

.ant-menu-dark {
  background: transparent !important;
}

.ant-menu-dark .ant-menu-item-selected {
  background-color: rgba(88, 101, 242, 0.2) !important;
}

.ant-layout-header {
  background: #141414 !important;
  padding: 0 24px !important;
}

.ant-drawer-content-wrapper {
  background: var(--color-darker);
}

.ant-drawer-header {
  background: #141414;
  border-bottom: 1px solid #303030;
}

.ant-drawer-body {
  background: var(--color-darker);
  color: var(--color-light);
}

.ant-tabs-tab {
  color: rgba(255, 255, 255, 0.65);
}

.ant-tabs-tab-active .ant-tabs-tab-btn {
  color: var(--color-light);
}

.ant-btn-text {
  color: var(--color-light);
}

.ant-btn-text:hover {
  color: var(--color-accent);
  background-color: rgba(88, 101, 242, 0.1);
}

/* Tab Content Styles */
.tab-content {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
}

.tab-content h3 {
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

/* Benchmark Tables */
.benchmark-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin-top: 16px;
}

.benchmark-table th {
  background-color: rgba(20, 22, 26, 0.95);
  padding: 10px 8px;
  text-align: left;
  font-weight: 600;
  color: #ffffff;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  backdrop-filter: blur(2px);
  white-space: nowrap;
}

.benchmark-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: middle;
}

.benchmark-table tbody tr:hover td {
  background-color: rgba(255, 255, 255, 0.05);
}

.row-warning {
  background-color: rgba(250, 166, 26, 0.1);
}

.row-danger {
  background-color: rgba(240, 71, 71, 0.1);
}

/* Performance Score */
.performance-score {
  margin: 16px 0;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

/* Analysis Notes */
.analysis-notes {
  margin-top: 24px;
  padding: 16px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-md);
}

.analysis-notes h4 {
  margin-bottom: 8px;
}

.analysis-notes ul {
  padding-left: 16px;
}

.analysis-notes li {
  margin-bottom: 4px;
}

/* Skeleton Tree */
.skeleton-tree {
  list-style: none;
  padding-left: 0;
}

.tree-node {
  margin: 5px 0;
  position: relative;
}

.tree-node .node-label {
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 3px;
}

.tree-node .node-label:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.tree-node ul {
  padding-left: 20px;
  margin: 5px 0;
}

/* Score Container */
.score-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 16px 0;
}

.score-container .performance-score {
  font-size: 4rem;
  font-weight: bold;
}

.score-label {
  font-size: 1rem;
  opacity: 0.7;
}

.score-interpretation {
  font-size: 0.9rem;
  margin-top: 8px;
  text-align: center;
  opacity: 0.8;
}

/* Event Timeline */
.event-timeline-container {
  padding: 16px;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.time-display {
  font-family: monospace;
  font-size: 0.9rem;
  background-color: rgba(0, 0, 0, 0.2);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.timeline {
  position: relative;
  height: 40px;
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: var(--radius-sm);
  margin: 12px 0;
  cursor: pointer;
}

.timeline-track {
  position: relative;
  width: 100%;
  height: 2px;
  background-color: rgba(255, 255, 255, 0.2);
  top: 50%;
  transform: translateY(-50%);
}

.time-indicator {
  position: absolute;
  width: 2px;
  height: 40px;
  background-color: var(--color-accent);
  top: 0;
  transform: translateX(-1px);
  transition: left 0.1s ease;
}

.event-marker {
  position: absolute;
  width: 6px;
  height: 30px;
  transform: translateX(-3px) translateY(-15px);
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.event-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: currentColor;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
}

.event-tooltip {
  position: absolute;
  background-color: #212121;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  min-width: 120px;
  transform: translateX(-50%);
  box-shadow: var(--shadow-md);
  z-index: 10;
  pointer-events: none;
}

.event-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0;
  padding: 8px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-sm);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-color {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.events-list {
  margin-top: 20px;
}

.events-table {
  width: 100%;
  border-collapse: collapse;
}

.events-table th,
.events-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.events-table th {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.active-event {
  background-color: rgba(255, 255, 255, 0.1);
}

.no-events {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  text-align: center;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .ant-layout-sider {
    position: fixed !important;
    height: 100vh;
    z-index: 1001;
  }
  
  .ant-drawer {
    max-width: 100vw !important;
  }
  
  .playback-controls-container > div {
    padding: 8px 16px !important;
  }
  
  .playback-controls-container .ant-space-item:first-child {
    display: none; /* Hide animation selector on mobile */
  }
}

/* Ant Design Dark Theme Overrides */
.ant-table {
  background: #141414 !important;
  color: #fff !important;
}

.ant-table-thead > tr > th {
  background: #1f1f1f !important;
  color: #fff !important;
  border-bottom: 1px solid #303030 !important;
}

.ant-table-tbody > tr > td {
  border-bottom: 1px solid #303030 !important;
}

.ant-table-tbody > tr:hover > td {
  background: #262626 !important;
}

.ant-table-tbody > tr.active-event > td {
  background: rgba(24, 144, 255, 0.1) !important;
}

.ant-table-tbody > tr.ant-table-row-error > td {
  background: rgba(245, 34, 45, 0.1) !important;
}

.ant-table-tbody > tr.ant-table-row-warning > td {
  background: rgba(250, 173, 20, 0.1) !important;
}

.ant-card {
  background: #141414 !important;
  border-color: #303030 !important;
}

.ant-card-head {
  background: #1f1f1f !important;
  border-bottom: 1px solid #303030 !important;
  color: #fff !important;
}

.ant-card-body {
  color: #fff;
}

.ant-collapse {
  background: #141414 !important;
  border-color: #303030 !important;
}

.ant-collapse > .ant-collapse-item {
  border-bottom: 1px solid #303030 !important;
}

.ant-collapse-header {
  color: #fff !important;
}

.ant-collapse-content {
  background: #1f1f1f !important;
  border-top: 1px solid #303030 !important;
  color: #fff;
}

.ant-statistic-title {
  color: rgba(255, 255, 255, 0.65) !important;
}

.ant-alert {
  background: #1f1f1f !important;
  border: 1px solid #303030 !important;
}

.ant-alert-message {
  color: #fff !important;
}

.ant-alert-description {
  color: rgba(255, 255, 255, 0.85) !important;
}

.ant-progress-text {
  color: #fff !important;
}

.ant-slider {
  margin: 16px 0;
}

.ant-slider-rail {
  background-color: #303030 !important;
}

.ant-slider-track {
  background-color: #1890ff !important;
}

.ant-slider-handle {
  border-color: #1890ff !important;
}

.ant-slider-mark-text {
  color: #fff !important;
}

.ant-empty-description {
  color: rgba(255, 255, 255, 0.45) !important;
}

.ant-tag {
  margin: 2px;
}

.ant-drawer-content {
  background: #0a0a0a !important;
}

.ant-drawer-header {
  background: #141414 !important;
  border-bottom: 1px solid #303030 !important;
}

.ant-drawer-title {
  color: #fff !important;
}

.ant-drawer-close {
  color: #fff !important;
}

.ant-tabs-tab {
  color: rgba(255, 255, 255, 0.65) !important;
}

.ant-tabs-tab-active {
  color: #fff !important;
}

.ant-tabs-ink-bar {
  background: #1890ff !important;
}

.ant-tabs-nav {
  border-bottom: 1px solid #303030 !important;
}

.ant-tabs-content {
  color: #fff;
}
```


## src\text\about.md

```
В инструменте представлена документация с требованиями и дроп зона анализа файлов.
Под капотом pixi v7.4 и spine рантайм v4.1, в них внедрены изменения для подсчета нагрузки на рендер.

```


## src\text\batch.md

```
- PIXI.AbstractBatchRenderer накапливает пул BatchDrawCall и flush-ит их, наличие большого количества режимов наложения и мешей на одном спайне может вынудить делать отдельный дроу-колл чтоб отрисовать все нужное для кадра
```


## src\text\blend.md

```
- Blend Mode вызывают дополнительные flush-ы шейдеров при рендере и создают высокую нагрузку
- Использование Add и Mul режимов лучше минимизировать или сводить на ноль для снижения температурной нагрузки
- Нужно использовать не более двух аттачментов с аддитивным режимом на анимацию
- Режимы наложения можно использовать только в анонсерах и специальных символах (скаттер, вайлд)
- Текстурный атлас снижает число переключений текстур в рендере, однако бленды делают ровно противоположное
```


## src\text\bones.md

```
- Меньше костей - лучше
- Меньше глубина дерева - лучше
- Наследование положение от родителя дешево
- Иметь вторую рут кость для "рут моушена" скелета нормально, однако иерархия отрицательно влияет на производительность

```


## src\text\bounds.md

```
- Границы передвигающихся по экрану объектов важно вручную "ограничить" чтобы pixi понял когда можно прекратить рендер
```


## src\text\clipping.md

```
- Клиппинг - это самая дорогая операция всех спайн рантаймов, особенно если есть меш, и тем более с большим числом вертексов
- Если без клиппинга не обойтись, делайте клиппинг аттачмент с тремя вершинами
- Если вершин надо больше, старайтесь делать маску выпуклым многоугольником
- Дешевле добавить маску в движке, она будет вызывать один стенсил шейдер
```


## src\text\general.md

```
---
title: Awesome Title
description: Describe this awesome content
tags:
  - "great"
  - "awesome"
  - "rad"
---

Игра работает в 60 fps, учитывайте это при создании анимаций. Каждый кадр будет находиться на экране ~16.66мс.

Скелеты называем в snake_case, например, blue_fish, huge_win.

События Spine позволяют фронтенду проиграть звуки или запустить какой-то сегмент кода. События должны иметь названия в camelCase и начинаться с on , например, onBeforeReelStop или onWin. 

Стараемся избегать float значений в событиях, так как возможно ситуации с неверным округлением числа. Если использование необходимо, ограничиваемся тремя знаками после запятой.
Можно использовать папки анимаций, названия тоже в snake_case.

Анимации могут иметь любую длину. При одновременном запуске анимаций в разных объектах возможен рассинхрон в 1-2 кадра, игрок это не заметит, но не пытайтесь делать идеальную синхронизацию.

Для одного отображаемого на экране объекта (например, символа) используем один скелет. Если нужны независимые эффекты, которые должны воспроизвестись прямо под/над этим объектом, анимацию которых невозможно по какой-то причине воспроизвести одновременно с основной idle или выигрышной, то необходимо убрать их в отдельную кость скелета. Данные эффекты будут проиграны параллельно на другом треке в необходимый момент. В коде это сделать проще, чем несколько отдельных Spine объектов.

Мы можем проигрывать параллельно любое количество анимаций на одном скелете. Если эти анимации модифицируют одинаковые ключи, возможны конфликты анимаций (что-то будет дёргаться). Поэтому, например, можно раздельно анимировать тело и руки персонажа для упрощения параллельного воспроизведения. Mesh-трансформации spine нельзя запускать параллельно, так как вся деформация меша описывается одним ключём.
```


## src\text\hiding.md

```
- Снижение размера или альфы аттачмента в ноль - плохой способ скрывать аттачмент
- *Аттачмент надо скрывать таймлайном*
```


## src\text\mesh.md

```
- Mesh Link снижает потребление памяти, при вычислении положения меша переиспользуются вычисленные ранее в скелете значения однако на нагрузку CPU это сильно не влияет
- Деформационные ключи нагружают CPU базовыми операциями умножения для каждого вертекса, то есть чем больше костей влияют на меш и чем больше в нем вертекс, тем больше нагрузка. Один вес и 10 вертексов это примерно то же самое, что три веса и три вертекса. По этой причине лица и другие меши с большим числом вертексов лучше вешать на меньшее количество костей.
- Деформационные ключи едят много RAM, использование большого количество ключей деформации может увеличить размер скелета
- Для снижения нагрузки на RAM лучше использовать деформационные ключи реже или отказываться от них
- Лишние ключи деформации меша полезно чистить функциями Prune и Smooth
```


## src\text\names.md

```
- Кости должны именоваться латиницей
- Все слова пишутся маленькими буквами и соединяются символом нижнего подчеркивания (_)
- Примеры snake_case: **moustache_holder**, **frame_fx_holder**, **frame_fx_2**
- Не используются дефисы или другие специальные символы
- Для разграничения левых/правых костей разрешено использование суффиксов **_L** и **_R**: **pupil_L**, **pupil_R**

```


## src\text\particles.md

```
- Spine предназначен для скелетной анимации, а не для частиц - их нужно делать средствами движка или секвенциями
- Анимация частиц в Spine - это больная нагрузка на CPU и RAM
- Pixi имеет пакет particle-emitter для частиц и редактор частиц (ссылка внизу страницы)
```


## src\text\path.md

```
- Path Constraint потребляют много CPU если вдоль них следует большое количество костей, однако это редко будет ботлнеком
- Path и IK Constraint являются важными инструментами, управление над котороми можно вести из кода
```


## src\text\placeholder.md

```
- Для замены слотов на разные игровые сущности в рантайме используются placeholder слоты
- В слот необходимо положить маленькую картинку, например 2x2 белый квадрат с 1% прозрачности (в картинке)
- В гайде необходимо описать разработчику какая сущность будет подставляться в этот слот
```


## src\text\timelines.md

```
- Таймлайны и число ключей в них оказывают RAM нагрузку и раздувают размер файла, однако на CPU влияют минимально
- Снижение числа таймлайнов рекомендованно только для организации анимаций
- Мусор из таймлайнов можно убрать функцией Clean Up спайна
```


## src\toastify.css

```
/* Custom styling for React Toastify to match app theme */
.Toastify__toast {
    border-radius: var(--radius-md);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  
  .Toastify__toast--dark {
    background-color: #1a1a1a;
    border-left: 4px solid rgba(255, 255, 255, 0.2);
  }
  
  .Toastify__toast--info.Toastify__toast--dark {
    border-left-color: var(--color-accent, #5865f2);
  }
  
  .Toastify__toast--success.Toastify__toast--dark {
    border-left-color: var(--color-success, #43b581);
  }
  
  .Toastify__toast--warning.Toastify__toast--dark {
    border-left-color: var(--color-warning, #faa61a);
  }
  
  .Toastify__toast--error.Toastify__toast--dark {
    border-left-color: var(--color-error, #f04747);
  }
  
  .Toastify__progress-bar--dark {
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0.7),
      rgba(255, 255, 255, 0.2)
    );
  }
  
  .Toastify__close-button--dark {
    color: rgba(255, 255, 255, 0.5);
    opacity: 0.7;
  }
  
  .Toastify__close-button--dark:hover, 
  .Toastify__close-button--dark:focus {
    opacity: 1;
  }
  
  /* Make toasts responsive on mobile */
  @media only screen and (max-width: 480px) {
    .Toastify__toast-container {
      width: 100%;
      padding: 0;
      left: 0;
      margin: 0;
    }
    
    .Toastify__toast-container--bottom-center {
      bottom: 0;
      transform: translateX(-50%);
    }
    
    .Toastify__toast {
      margin-bottom: 0;
      border-radius: 0;
    }
  }
```


## src\utils\fileUtils.ts

```
/**
 * Utility functions for handling file trees and folder drops
 */

// Interface for FileSystemEntry (needed for TypeScript support)
interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file(callback: (file: File) => void, errorCallback?: (error: any) => void): void;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(callback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: any) => void): void;
}

// Extending DataTransferItem to include webkitGetAsEntry
//@ts-ignore
interface ExtendedDataTransferItem extends DataTransferItem {
  webkitGetAsEntry(): FileSystemEntry | null;
}

/**
 * Recursively traverses a file tree and collects all files
 */
export const traverseFileTree = async (
  item: FileSystemEntry, 
  path: string = '',
  fileList: File[] = []
): Promise<File[]> => {
  if (item.isFile) {
    // Get file and add to file list
    const file = await new Promise<File>((resolve, reject) => {
      item.file((file) => {
        resolve(file);
      }, (error) => {
        reject(error);
      });
    });
    
    // Create a new file with the correct path to preserve folder structure
    const fullPath = path + file.name;
    const fileWithPath = new File(
      [file], 
      fullPath, 
      { type: file.type }
    );
    
    // Store the original relative path for later use
    Object.defineProperty(fileWithPath, 'webkitRelativePath', {
      writable: false,
      value: fullPath
    });
    
    fileList.push(fileWithPath);
    return fileList;
  } else if (item.isDirectory) {
    // Get folder contents
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const dirReader = item.createReader();
      const allEntries: FileSystemEntry[] = [];
      
      // Directory readers can only read a certain number of entries at a time
      // We need to keep calling readEntries until it returns an empty array
      const readEntries = () => {
        dirReader.readEntries((entries) => {
          if (entries.length) {
            allEntries.push(...entries);
            readEntries(); // Continue reading if there are more entries
          } else {
            resolve(allEntries); // No more entries, we're done
          }
        }, (error) => {
          reject(error);
        });
      };
      
      readEntries();
    });
    
    // Process all directory entries recursively
    for (const entry of entries) {
      await traverseFileTree(entry, path + item.name + '/', fileList);
    }
    
    return fileList;
  }
  
  return fileList;
};

/**
 * Handle drop event and collect all files from the dropped items
 */
export const handleDroppedItems = async (items: DataTransferItemList): Promise<File[]> => {
  console.log('Processing dropped items:', items.length);
  console.log(items[0],items[1],items[2])
  const allFiles: File[] = [];
  
  // First try to handle as directory drops via webkitGetAsEntry
  if (items[0] && 'webkitGetAsEntry' in items[0]) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as ExtendedDataTransferItem;
      const entry = item.webkitGetAsEntry();
      
      if (entry) {
        const files = await traverseFileTree(entry);
        allFiles.push(...files);
      }
    }
  } else {
    // Fallback for browsers that don't support webkitGetAsEntry
    console.log('Fallback: webkitGetAsEntry not supported');
  }
  
  // If no files were found through the directory API, try to get files directly
  if (allFiles.length === 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          allFiles.push(file);
        }
      }
    }
  }
  
  console.log('Total files collected:', allFiles.length);
  console.log('File names:', allFiles.map(f => f.name));
  
  return allFiles;
};

/**
 * Converts an array of Files to a FileList-like object
 */
export const filesToFileList = (files: File[]): FileList => {
  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));
  return dataTransfer.files;
};
```


## src\utils\mergeMaps.ts

```
export function mergeMaps(propNames: string[], ...maps: Map<string, any>[]) {
  const mergedMap = new Map<string, Record<string, any>>();

  // Ensure we have enough property names for all maps
  if (propNames.length < maps.length) {
    throw new Error("Not enough property names provided for all maps");
  }

  // Get all unique keys from all maps
  const allKeys = new Set(maps.flatMap((map) => [...map.keys()]));

  allKeys.forEach((key) => {
    const mergedValue: Record<string, any> = {};

    maps.forEach((map, index) => {
      const propName = propNames[index];
      mergedValue[propName] = map.get(key) ?? "";
    });

    mergedMap.set(key, mergedValue);
  });

  return mergedMap;
}

```


## src\utils\toast.ts

```
export function toast(message: string, duration = 4000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  toast.addEventListener("click", () => {
      hideToast(toast);
  });

  // Find or create the toast container
  let container = document.getElementById("toast-container");
  if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
  }

  // Append the toast to the container
  container.appendChild(toast);

  setTimeout(() => {
      hideToast(toast);
  }, duration);
}

function hideToast(toast: HTMLElement) {
  toast.classList.add("hide");
  setTimeout(() => {
      toast?.parentElement?.removeChild(toast);
  }, 500);
}
```


## src\vite.env.d.ts

```
/// <reference types="vite/client" />

declare module '*.md' {
    const attributes: Record<string, unknown>;
    const html: string;
    const raw: string;
    export { attributes, html, raw };
  }
```


## src\webgl-memory.js

```
/* webgl-memory@1.1.1, license MIT */
(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
})((function () { 'use strict';

  /* PixelFormat */
  const ALPHA                          = 0x1906;
  const RGB                            = 0x1907;
  const RGBA                           = 0x1908;
  const LUMINANCE                      = 0x1909;
  const LUMINANCE_ALPHA                = 0x190A;
  const DEPTH_COMPONENT                = 0x1902;
  const DEPTH_STENCIL                  = 0x84F9;

  const R8                           = 0x8229;
  const R8_SNORM                     = 0x8F94;
  const R16F                         = 0x822D;
  const R32F                         = 0x822E;
  const R8UI                         = 0x8232;
  const R8I                          = 0x8231;
  const RG16UI                       = 0x823A;
  const RG16I                        = 0x8239;
  const RG32UI                       = 0x823C;
  const RG32I                        = 0x823B;
  const RG8                          = 0x822B;
  const RG8_SNORM                    = 0x8F95;
  const RG16F                        = 0x822F;
  const RG32F                        = 0x8230;
  const RG8UI                        = 0x8238;
  const RG8I                         = 0x8237;
  const R16UI                        = 0x8234;
  const R16I                         = 0x8233;
  const R32UI                        = 0x8236;
  const R32I                         = 0x8235;
  const RGB8                         = 0x8051;
  const SRGB8                        = 0x8C41;
  const RGB565                       = 0x8D62;
  const RGB8_SNORM                   = 0x8F96;
  const R11F_G11F_B10F               = 0x8C3A;
  const RGB9_E5                      = 0x8C3D;
  const RGB16F                       = 0x881B;
  const RGB32F                       = 0x8815;
  const RGB8UI                       = 0x8D7D;
  const RGB8I                        = 0x8D8F;
  const RGB16UI                      = 0x8D77;
  const RGB16I                       = 0x8D89;
  const RGB32UI                      = 0x8D71;
  const RGB32I                       = 0x8D83;
  const RGBA8                        = 0x8058;
  const SRGB8_ALPHA8                 = 0x8C43;
  const RGBA8_SNORM                  = 0x8F97;
  const RGB5_A1                      = 0x8057;
  const RGBA4                        = 0x8056;
  const RGB10_A2                     = 0x8059;
  const RGBA16F                      = 0x881A;
  const RGBA32F                      = 0x8814;
  const RGBA8UI                      = 0x8D7C;
  const RGBA8I                       = 0x8D8E;
  const RGB10_A2UI                   = 0x906F;
  const RGBA16UI                     = 0x8D76;
  const RGBA16I                      = 0x8D88;
  const RGBA32I                      = 0x8D82;
  const RGBA32UI                     = 0x8D70;

  const DEPTH_COMPONENT16            = 0x81A5;
  const DEPTH_COMPONENT24            = 0x81A6;
  const DEPTH_COMPONENT32F           = 0x8CAC;
  const DEPTH32F_STENCIL8            = 0x8CAD;
  const DEPTH24_STENCIL8             = 0x88F0;

  /* DataType */
  // const BYTE                         = 0x1400;
  const UNSIGNED_BYTE                = 0x1401;
  // const SHORT                        = 0x1402;
  const UNSIGNED_SHORT               = 0x1403;
  // const INT                          = 0x1404;
  const UNSIGNED_INT                 = 0x1405;
  const FLOAT                        = 0x1406;
  const UNSIGNED_SHORT_4_4_4_4       = 0x8033;
  const UNSIGNED_SHORT_5_5_5_1       = 0x8034;
  const UNSIGNED_SHORT_5_6_5         = 0x8363;
  const HALF_FLOAT                   = 0x140B;
  const HALF_FLOAT_OES               = 0x8D61;  // Thanks Khronos for making this different >:(

  const SRGB_ALPHA_EXT               = 0x8C42;

  /**
   * @typedef {Object} TextureFormatDetails
   * @property {number} textureFormat format to pass texImage2D and similar functions.
   * @property {boolean} colorRenderable true if you can render to this format of texture.
   * @property {boolean} textureFilterable true if you can filter the texture, false if you can ony use `NEAREST`.
   * @property {number[]} type Array of possible types you can pass to texImage2D and similar function
   * @property {Object.<number,number>} bytesPerElementMap A map of types to bytes per element
   * @private
   */

  let s_textureInternalFormatInfo;
  function getTextureInternalFormatInfo(internalFormat) {
    if (!s_textureInternalFormatInfo) {
      // NOTE: these properties need unique names so we can let Uglify mangle the name.
      const t = {};
      // unsized formats
      t[ALPHA]              = { bytesPerElement: [1, 2, 2, 4],        type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT], };
      t[LUMINANCE]          = { bytesPerElement: [1, 2, 2, 4],        type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT], };
      t[LUMINANCE_ALPHA]    = { bytesPerElement: [2, 4, 4, 8],        type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT], };
      t[RGB]                = { bytesPerElement: [3, 6, 6, 12, 2],    type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT, UNSIGNED_SHORT_5_6_5], };
      t[RGBA]               = { bytesPerElement: [4, 8, 8, 16, 2, 2], type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT, UNSIGNED_SHORT_4_4_4_4, UNSIGNED_SHORT_5_5_5_1], };
      t[SRGB_ALPHA_EXT]     = { bytesPerElement: [4, 8, 8, 16, 2, 2], type: [UNSIGNED_BYTE, HALF_FLOAT, HALF_FLOAT_OES, FLOAT, UNSIGNED_SHORT_4_4_4_4, UNSIGNED_SHORT_5_5_5_1], };
      t[DEPTH_COMPONENT]    = { bytesPerElement: [2, 4],              type: [UNSIGNED_INT, UNSIGNED_SHORT], };
      t[DEPTH_STENCIL]      = { bytesPerElement: [4],                 };

      // sized formats
      t[R8]                 = { bytesPerElement: [1],  };
      t[R8_SNORM]           = { bytesPerElement: [1],  };
      t[R16F]               = { bytesPerElement: [2],  };
      t[R32F]               = { bytesPerElement: [4],  };
      t[R8UI]               = { bytesPerElement: [1],  };
      t[R8I]                = { bytesPerElement: [1],  };
      t[R16UI]              = { bytesPerElement: [2],  };
      t[R16I]               = { bytesPerElement: [2],  };
      t[R32UI]              = { bytesPerElement: [4],  };
      t[R32I]               = { bytesPerElement: [4],  };
      t[RG8]                = { bytesPerElement: [2],  };
      t[RG8_SNORM]          = { bytesPerElement: [2],  };
      t[RG16F]              = { bytesPerElement: [4],  };
      t[RG32F]              = { bytesPerElement: [8],  };
      t[RG8UI]              = { bytesPerElement: [2],  };
      t[RG8I]               = { bytesPerElement: [2],  };
      t[RG16UI]             = { bytesPerElement: [4],  };
      t[RG16I]              = { bytesPerElement: [4],  };
      t[RG32UI]             = { bytesPerElement: [8],  };
      t[RG32I]              = { bytesPerElement: [8],  };
      t[RGB8]               = { bytesPerElement: [3],  };
      t[SRGB8]              = { bytesPerElement: [3],  };
      t[RGB565]             = { bytesPerElement: [2],  };
      t[RGB8_SNORM]         = { bytesPerElement: [3],  };
      t[R11F_G11F_B10F]     = { bytesPerElement: [4],  };
      t[RGB9_E5]            = { bytesPerElement: [4],  };
      t[RGB16F]             = { bytesPerElement: [6],  };
      t[RGB32F]             = { bytesPerElement: [12], };
      t[RGB8UI]             = { bytesPerElement: [3],  };
      t[RGB8I]              = { bytesPerElement: [3],  };
      t[RGB16UI]            = { bytesPerElement: [6],  };
      t[RGB16I]             = { bytesPerElement: [6],  };
      t[RGB32UI]            = { bytesPerElement: [12], };
      t[RGB32I]             = { bytesPerElement: [12], };
      t[RGBA8]              = { bytesPerElement: [4],  };
      t[SRGB8_ALPHA8]       = { bytesPerElement: [4],  };
      t[RGBA8_SNORM]        = { bytesPerElement: [4],  };
      t[RGB5_A1]            = { bytesPerElement: [2],  };
      t[RGBA4]              = { bytesPerElement: [2],  };
      t[RGB10_A2]           = { bytesPerElement: [4],  };
      t[RGBA16F]            = { bytesPerElement: [8],  };
      t[RGBA32F]            = { bytesPerElement: [16], };
      t[RGBA8UI]            = { bytesPerElement: [4],  };
      t[RGBA8I]             = { bytesPerElement: [4],  };
      t[RGB10_A2UI]         = { bytesPerElement: [4],  };
      t[RGBA16UI]           = { bytesPerElement: [8],  };
      t[RGBA16I]            = { bytesPerElement: [8],  };
      t[RGBA32I]            = { bytesPerElement: [16], };
      t[RGBA32UI]           = { bytesPerElement: [16], };
      // Sized Internal
      t[DEPTH_COMPONENT16]  = { bytesPerElement: [2],  };
      t[DEPTH_COMPONENT24]  = { bytesPerElement: [4],  };
      t[DEPTH_COMPONENT32F] = { bytesPerElement: [4],  };
      t[DEPTH24_STENCIL8]   = { bytesPerElement: [4],  };
      t[DEPTH32F_STENCIL8]  = { bytesPerElement: [4],  };

      s_textureInternalFormatInfo = t;
    }
    return s_textureInternalFormatInfo[internalFormat];
  }

  function makeComputeBlockRectSizeFunction(blockWidth, blockHeight, bytesPerBlock) {
    return function(width, height, depth) {
      const blocksAcross = (width + blockWidth - 1) / blockWidth | 0;
      const blocksDown =  (height + blockHeight - 1) / blockHeight | 0;
      return blocksAcross * blocksDown * bytesPerBlock * depth;
    };
  }

  function makeComputePaddedRectSizeFunction(minWidth, minHeight, divisor) {
    return function(width, height, depth) {
      return (Math.max(width, minWidth) * Math.max(height, minHeight) / divisor | 0) * depth;
    };
  }

  // WEBGL_compressed_texture_s3tc
  const COMPRESSED_RGB_S3TC_DXT1_EXT        = 0x83F0;
  const COMPRESSED_RGBA_S3TC_DXT1_EXT       = 0x83F1;
  const COMPRESSED_RGBA_S3TC_DXT3_EXT       = 0x83F2;
  const COMPRESSED_RGBA_S3TC_DXT5_EXT       = 0x83F3;
  // WEBGL_compressed_texture_etc1
  const COMPRESSED_RGB_ETC1_WEBGL           = 0x8D64;
  // WEBGL_compressed_texture_pvrtc
  const COMPRESSED_RGB_PVRTC_4BPPV1_IMG      = 0x8C00;
  const COMPRESSED_RGB_PVRTC_2BPPV1_IMG      = 0x8C01;
  const COMPRESSED_RGBA_PVRTC_4BPPV1_IMG     = 0x8C02;
  const COMPRESSED_RGBA_PVRTC_2BPPV1_IMG     = 0x8C03;
  // WEBGL_compressed_texture_etc
  const COMPRESSED_R11_EAC                        = 0x9270;
  const COMPRESSED_SIGNED_R11_EAC                 = 0x9271;
  const COMPRESSED_RG11_EAC                       = 0x9272;
  const COMPRESSED_SIGNED_RG11_EAC                = 0x9273;
  const COMPRESSED_RGB8_ETC2                      = 0x9274;
  const COMPRESSED_SRGB8_ETC2                     = 0x9275;
  const COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2  = 0x9276;
  const COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2 = 0x9277;
  const COMPRESSED_RGBA8_ETC2_EAC                 = 0x9278;
  const COMPRESSED_SRGB8_ALPHA8_ETC2_EAC          = 0x9279;
  // WEBGL_compressed_texture_astc
  const COMPRESSED_RGBA_ASTC_4x4_KHR = 0x93B0;
  const COMPRESSED_RGBA_ASTC_5x4_KHR = 0x93B1;
  const COMPRESSED_RGBA_ASTC_5x5_KHR = 0x93B2;
  const COMPRESSED_RGBA_ASTC_6x5_KHR = 0x93B3;
  const COMPRESSED_RGBA_ASTC_6x6_KHR = 0x93B4;
  const COMPRESSED_RGBA_ASTC_8x5_KHR = 0x93B5;
  const COMPRESSED_RGBA_ASTC_8x6_KHR = 0x93B6;
  const COMPRESSED_RGBA_ASTC_8x8_KHR = 0x93B7;
  const COMPRESSED_RGBA_ASTC_10x5_KHR = 0x93B8;
  const COMPRESSED_RGBA_ASTC_10x6_KHR = 0x93B9;
  const COMPRESSED_RGBA_ASTC_10x8_KHR = 0x93BA;
  const COMPRESSED_RGBA_ASTC_10x10_KHR = 0x93BB;
  const COMPRESSED_RGBA_ASTC_12x10_KHR = 0x93BC;
  const COMPRESSED_RGBA_ASTC_12x12_KHR = 0x93BD;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR = 0x93D0;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR = 0x93D1;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR = 0x93D2;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR = 0x93D3;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR = 0x93D4;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR = 0x93D5;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR = 0x93D6;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR = 0x93D7;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR = 0x93D8;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR = 0x93D9;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR = 0x93DA;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR = 0x93DB;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR = 0x93DC;
  const COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR = 0x93DD;
  // WEBGL_compressed_texture_s3tc_srgb
  const COMPRESSED_SRGB_S3TC_DXT1_EXT        = 0x8C4C;
  const COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT  = 0x8C4D;
  const COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT  = 0x8C4E;
  const COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT  = 0x8C4F;
  // EXT_texture_compression_bptc
  const COMPRESSED_RGBA_BPTC_UNORM_EXT = 0x8E8C;
  const COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT = 0x8E8D;
  const COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT = 0x8E8E;
  const COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT = 0x8E8F;
  // EXT_texture_compression_rgtc
  const COMPRESSED_RED_RGTC1_EXT = 0x8DBB;
  const COMPRESSED_SIGNED_RED_RGTC1_EXT = 0x8DBC;
  const COMPRESSED_RED_GREEN_RGTC2_EXT = 0x8DBD;
  const COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT = 0x8DBE;

  const compressedTextureFunctions = new Map([
    [ COMPRESSED_RGB_S3TC_DXT1_EXT, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_RGBA_S3TC_DXT1_EXT, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_RGBA_S3TC_DXT3_EXT, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_RGBA_S3TC_DXT5_EXT, makeComputeBlockRectSizeFunction(4, 4, 16) ],

    [ COMPRESSED_RGB_ETC1_WEBGL, makeComputeBlockRectSizeFunction(4, 4, 8) ],

    [ COMPRESSED_RGB_PVRTC_4BPPV1_IMG, makeComputePaddedRectSizeFunction(8, 8, 2) ],
    [ COMPRESSED_RGBA_PVRTC_4BPPV1_IMG, makeComputePaddedRectSizeFunction(8, 8, 2) ],
    [ COMPRESSED_RGB_PVRTC_2BPPV1_IMG, makeComputePaddedRectSizeFunction(16, 8, 4) ],
    [ COMPRESSED_RGBA_PVRTC_2BPPV1_IMG, makeComputePaddedRectSizeFunction(16, 8, 4) ],

    [ COMPRESSED_R11_EAC, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_SIGNED_R11_EAC, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_RGB8_ETC2, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_SRGB8_ETC2, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_RGB8_PUNCHTHROUGH_ALPHA1_ETC2, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_SRGB8_PUNCHTHROUGH_ALPHA1_ETC2, makeComputeBlockRectSizeFunction(4, 4, 8) ],

    [ COMPRESSED_RG11_EAC, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_SIGNED_RG11_EAC, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_RGBA8_ETC2_EAC, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ETC2_EAC, makeComputeBlockRectSizeFunction(4, 4, 16) ],

    [ COMPRESSED_RGBA_ASTC_4x4_KHR, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_RGBA_ASTC_5x4_KHR, makeComputeBlockRectSizeFunction(5, 4, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR, makeComputeBlockRectSizeFunction(5, 4, 16) ],
    [ COMPRESSED_RGBA_ASTC_5x5_KHR, makeComputeBlockRectSizeFunction(5, 5, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR, makeComputeBlockRectSizeFunction(5, 5, 16) ],
    [ COMPRESSED_RGBA_ASTC_6x5_KHR, makeComputeBlockRectSizeFunction(6, 5, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR, makeComputeBlockRectSizeFunction(6, 5, 16) ],
    [ COMPRESSED_RGBA_ASTC_6x6_KHR, makeComputeBlockRectSizeFunction(6, 6, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR, makeComputeBlockRectSizeFunction(6, 6, 16) ],
    [ COMPRESSED_RGBA_ASTC_8x5_KHR, makeComputeBlockRectSizeFunction(8, 5, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR, makeComputeBlockRectSizeFunction(8, 5, 16) ],
    [ COMPRESSED_RGBA_ASTC_8x6_KHR, makeComputeBlockRectSizeFunction(8, 6, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR, makeComputeBlockRectSizeFunction(8, 6, 16) ],
    [ COMPRESSED_RGBA_ASTC_8x8_KHR, makeComputeBlockRectSizeFunction(8, 8, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR, makeComputeBlockRectSizeFunction(8, 8, 16) ],
    [ COMPRESSED_RGBA_ASTC_10x5_KHR, makeComputeBlockRectSizeFunction(10, 5, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR, makeComputeBlockRectSizeFunction(10, 5, 16) ],
    [ COMPRESSED_RGBA_ASTC_10x6_KHR, makeComputeBlockRectSizeFunction(10, 6, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR, makeComputeBlockRectSizeFunction(10, 6, 16) ],
    [ COMPRESSED_RGBA_ASTC_10x8_KHR, makeComputeBlockRectSizeFunction(10, 8, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR, makeComputeBlockRectSizeFunction(10, 8, 16) ],
    [ COMPRESSED_RGBA_ASTC_10x10_KHR, makeComputeBlockRectSizeFunction(10, 10, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR, makeComputeBlockRectSizeFunction(10, 10, 16) ],
    [ COMPRESSED_RGBA_ASTC_12x10_KHR, makeComputeBlockRectSizeFunction(12, 10, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR, makeComputeBlockRectSizeFunction(12, 10, 16) ],
    [ COMPRESSED_RGBA_ASTC_12x12_KHR, makeComputeBlockRectSizeFunction(12, 12, 16) ],
    [ COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR, makeComputeBlockRectSizeFunction(12, 12, 16) ],

    [ COMPRESSED_SRGB_S3TC_DXT1_EXT, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT, makeComputeBlockRectSizeFunction(4, 4, 8) ],
    [ COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT, makeComputeBlockRectSizeFunction(4, 4, 16) ],
    [ COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT, makeComputeBlockRectSizeFunction(4, 4, 16) ],

    [ COMPRESSED_RGBA_BPTC_UNORM_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],
    [ COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],
    [ COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],
    [ COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],

    [ COMPRESSED_RED_RGTC1_EXT, makeComputeBlockRectSizeFunction( 4, 4, 8 ) ],
    [ COMPRESSED_SIGNED_RED_RGTC1_EXT, makeComputeBlockRectSizeFunction( 4, 4, 8 ) ],
    [ COMPRESSED_RED_GREEN_RGTC2_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],
    [ COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT, makeComputeBlockRectSizeFunction( 4, 4, 16 ) ],
  ]);

  /**
   * Gets the number of bytes per element for a given internalFormat / type
   * @param {number} internalFormat The internalFormat parameter from texImage2D etc..
   * @param {number} type The type parameter for texImage2D etc..
   * @return {number} the number of bytes per element for the given internalFormat, type combo
   * @memberOf module:twgl/textures
   */
  function getBytesPerElementForInternalFormat(internalFormat, type) {
    const info = getTextureInternalFormatInfo(internalFormat);
    if (!info) {
      throw "unknown internal format";
    }
    if (info.type) {
      const ndx = info.type.indexOf(type);
      if (ndx < 0) {
        throw new Error(`unsupported type ${type} for internalformat ${internalFormat}`);
      }
      return info.bytesPerElement[ndx];
    }
    return info.bytesPerElement[0];
  }

  function getBytesForMipUncompressed(internalFormat, width, height, depth, type) {
    const bytesPerElement = getBytesPerElementForInternalFormat(internalFormat, type);
    return width * height * depth * bytesPerElement;
  }

  function getBytesForMip(internalFormat, width, height, depth, type) {
    const fn = compressedTextureFunctions.get(internalFormat);
    return fn ? fn(width, height, depth) : getBytesForMipUncompressed(internalFormat, width, height, depth, type);
  }

  function isTypedArray(v) {
    return v && v.buffer && v.buffer instanceof ArrayBuffer;
  }

  function isBufferSource(v) {
    return isTypedArray(v) || v instanceof ArrayBuffer;
  }

  function getDrawingbufferInfo(gl) {
    return {
      samples: gl.getParameter(gl.SAMPLES) || 1,
      depthBits: gl.getParameter(gl.DEPTH_BITS),
      stencilBits: gl.getParameter(gl.STENCIL_BITS),
      contextAttributes: gl.getContextAttributes(),
    };
  }

  function computeDepthStencilSize(drawingBufferInfo) {
    const {depthBits, stencilBits} = drawingBufferInfo;
    const depthSize = (depthBits + stencilBits + 7) / 8 | 0;
    return depthSize === 3 ? 4 : depthSize;
  }

  function computeDrawingbufferSize(gl, drawingBufferInfo) {
    if (gl.isContextLost()) {
      return 0;
    }
    const {samples} = drawingBufferInfo;
    // this will need to change for hi-color support
    const colorSize = 4;
    const size = gl.drawingBufferWidth * gl.drawingBufferHeight;
    const depthStencilSize = computeDepthStencilSize(drawingBufferInfo);
    return size * colorSize + size * samples * colorSize + size * depthStencilSize;
  }

  // I know this is not a full check
  function isNumber(v) {
    return typeof v === 'number';
  }

  function collectObjects(state, type) {
    const list = [...state.webglObjectToMemory.keys()]
      .filter(obj => obj instanceof type)
      .map((obj) => state.webglObjectToMemory.get(obj));

    return list;
  }

  function getStackTrace() {
    const stack = (new Error()).stack;
    const lines = stack.split('\n');
    // Remove the first two entries, the error message and this function itself, or the webgl-memory itself.
    const userLines = lines.slice(2).filter((l) => !l.includes('webgl-memory.js'));
    return userLines.join('\n');
  }

  /*
  The MIT License (MIT)

  Copyright (c) 2021 Gregg Tavares

  Permission is hereby granted, free of charge, to any person obtaining a copy of
  this software and associated documentation files (the "Software"), to deal in
  the Software without restriction, including without limitation the rights to
  use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
  the Software, and to permit persons to whom the Software is furnished to do so,
  subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
  FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
  IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */


  //------------ [ from https://github.com/KhronosGroup/WebGLDeveloperTools ]

  /*
  ** Copyright (c) 2012 The Khronos Group Inc.
  **
  ** Permission is hereby granted, free of charge, to any person obtaining a
  ** copy of this software and/or associated documentation files (the
  ** "Materials"), to deal in the Materials without restriction, including
  ** without limitation the rights to use, copy, modify, merge, publish,
  ** distribute, sublicense, and/or sell copies of the Materials, and to
  ** permit persons to whom the Materials are furnished to do so, subject to
  ** the following conditions:
  **
  ** The above copyright notice and this permission notice shall be included
  ** in all copies or substantial portions of the Materials.
  **
  ** THE MATERIALS ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  ** EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  ** MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
  ** IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
  ** CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
  ** TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  ** MATERIALS OR THE USE OR OTHER DEALINGS IN THE MATERIALS.
  */


  const augmentedSet = new Set();

  /**
   * Given a WebGL context replaces all the functions with wrapped functions
   * that call gl.getError after every command
   *
   * @param {WebGLRenderingContext|Extension} ctx The webgl context to wrap.
   * @param {string} nameOfClass (eg, webgl, webgl2, OES_texture_float)
   */
  // eslint-disable-next-line consistent-return
  function augmentAPI(ctx, nameOfClass, options = {}) {

    if (augmentedSet.has(ctx)) {
      return ctx;
    }
    augmentedSet.add(ctx);

    const origGLErrorFn = options.origGLErrorFn || ctx.getError;

    function createSharedState(ctx) {
      const drawingBufferInfo = getDrawingbufferInfo(ctx);
      const sharedState = {
        baseContext: ctx,
        config: options,
        apis: {
          // custom extension
          gman_webgl_memory: {
            ctx: {
              getMemoryInfo() {
                const drawingbuffer = computeDrawingbufferSize(ctx, drawingBufferInfo);
                return {
                  memory: {
                    ...memory,
                    drawingbuffer,
                    total: drawingbuffer + memory.buffer + memory.texture + memory.renderbuffer,
                  },
                  resources: {
                    ...resources,
                  },
                };
              },
              getResourcesInfo(type) {
                return collectObjects(sharedState, type);
              },
            },
          },
        },
        resources: {},
        memory: {
          texture: 0,
          buffer: 0,
          renderbuffer: 0,
        },
        bindings: new Map(),
        defaultVertexArray: {},
        webglObjectToMemory: new Map(),
      };

      const unRestorableAPIs = new Set([
        'webgl',
        'webgl2',
        'webgl_lose_context',
      ]);

      function resetSharedState() {
        sharedState.bindings.clear();
        sharedState.webglObjectToMemory.clear();
        sharedState.webglObjectToMemory.set(sharedState.defaultVertexArray, {});
        sharedState.currentVertexArray = sharedState.defaultVertexArray;
        [sharedState.resources, sharedState.memory].forEach(function(obj) {
          for (const prop in obj) {
            obj[prop] = 0;
          }
        });
      }

      function handleContextLost() {
        // Issues:
        //   * all resources are lost.
        //     Solution: handled by resetSharedState
        //   * all functions are no-op
        //     Solutions:
        //        * swap all functions for noop
        //          (not so easy because some functions return values)
        //        * wrap all functions is a isContextLost check forwarder
        //          (slow? and same as above)
        //        * have each function manually check for context lost
        //          (simple but repetitive)
        //   * all extensions are lost
        //      Solution: For these we go through and restore all the functions
        //         on each extension
        resetSharedState();
        sharedState.isContextLost = true;

        // restore all original functions for extensions since
        // user will have to get new extensions.
        for (const [name, {ctx, origFuncs}] of [...Object.entries(sharedState.apis)]) {
          if (!unRestorableAPIs.has(name) && origFuncs) {
            augmentedSet.delete(ctx);
            for (const [funcName, origFn] of Object.entries(origFuncs)) {
              ctx[funcName] = origFn;
            }
            delete apis[name];
          }
        }
      }

      function handleContextRestored() {
        sharedState.isContextLost = false;
      }

      if (ctx.canvas) {
        ctx.canvas.addEventListener('webglcontextlost', handleContextLost);
        ctx.canvas.addEventListener('webglcontextrestored', handleContextRestored);
      }

      resetSharedState();
      return sharedState;
    }

    const sharedState = options.sharedState || createSharedState(ctx);
    options.sharedState = sharedState;

    const {
      apis,
      bindings,
      memory,
      resources,
      webglObjectToMemory,
    } = sharedState;

    const origFuncs = {};

    function noop() {
    }

    function makeCreateWrapper(ctx, typeName, _funcName) {
      const funcName = _funcName || `create${typeName[0].toUpperCase()}${typeName.substr(1)}`;
      if (!ctx[funcName]) {
        return null;
      }
      resources[typeName] = 0;
      return function(ctx, funcName, args, webglObj) {
        if (sharedState.isContextLost) {
          return;
        }
        ++resources[typeName];
        webglObjectToMemory.set(webglObj, {
          size: 0,
          stackCreated: getStackTrace(),
        });
      };
    }

    function makeDeleteWrapper(typeName, fn = noop, _funcName) {
      const funcName = _funcName || `delete${typeName[0].toUpperCase()}${typeName.substr(1)}`;
      if (!ctx[funcName]) {
        return null;
      }
      return function(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [obj] = args;
        const info = webglObjectToMemory.get(obj);
        if (info) {
          --resources[typeName];
          fn(obj, info);
          // TODO: handle resource counts
          webglObjectToMemory.delete(obj);
        }
      };
    }

    function updateRenderbuffer(target, samples, internalFormat, width, height) {
      if (sharedState.isContextLost) {
        return;
      }
      const obj = bindings.get(target);
      if (!obj) {
        throw new Error(`no renderbuffer bound to ${target}`);
      }
      const info = webglObjectToMemory.get(obj);
      if (!info) {
        throw new Error(`unknown renderbuffer ${obj}`);
      }

      const bytesForMip = getBytesForMip(internalFormat, width, height, 1);
      const newSize = bytesForMip * samples;

      memory.renderbuffer -= info.size;
      info.size = newSize;
      info.stackUpdated = getStackTrace();
      memory.renderbuffer += newSize;
    }

    const ELEMENT_ARRAY_BUFFER           = 0x8893;

    const UNSIGNED_BYTE                  = 0x1401;
    const TEXTURE_CUBE_MAP               = 0x8513;
    const TEXTURE_2D_ARRAY               = 0x8C1A;
    const TEXTURE_CUBE_MAP_POSITIVE_X    = 0x8515;
    const TEXTURE_CUBE_MAP_NEGATIVE_X    = 0x8516;
    const TEXTURE_CUBE_MAP_POSITIVE_Y    = 0x8517;
    const TEXTURE_CUBE_MAP_NEGATIVE_Y    = 0x8518;
    const TEXTURE_CUBE_MAP_POSITIVE_Z    = 0x8519;
    const TEXTURE_CUBE_MAP_NEGATIVE_Z    = 0x851A;

    const TEXTURE_BASE_LEVEL             = 0x813C;
    const TEXTURE_MAX_LEVEL              = 0x813D;

    const cubemapTargets = new Set([
      TEXTURE_CUBE_MAP_POSITIVE_X,
      TEXTURE_CUBE_MAP_NEGATIVE_X,
      TEXTURE_CUBE_MAP_POSITIVE_Y,
      TEXTURE_CUBE_MAP_NEGATIVE_Y,
      TEXTURE_CUBE_MAP_POSITIVE_Z,
      TEXTURE_CUBE_MAP_NEGATIVE_Z,
    ]);

    function isCubemapFace(target) {
      return cubemapTargets.has(target);
    }

    function getTextureInfo(target) {
      target = isCubemapFace(target) ? TEXTURE_CUBE_MAP : target;
      const obj = bindings.get(target);
      if (!obj) {
        throw new Error(`no texture bound to ${target}`);
      }
      const info = webglObjectToMemory.get(obj);
      if (!info) {
        throw new Error(`unknown texture ${obj}`);
      }
      return info;
    }

    function updateMipLevel(info, target, level, internalFormat, width, height, depth, type) {
      const oldSize = info.size;
      const newMipSize = getBytesForMip(internalFormat, width, height, depth, type);

      const faceNdx = isCubemapFace(target)
        ? target - TEXTURE_CUBE_MAP_POSITIVE_X
        : 0;

      info.mips = info.mips || [];
      info.mips[level] = info.mips[level] || [];
      const mipFaceInfo = info.mips[level][faceNdx] || {};
      info.size -= mipFaceInfo.size || 0;

      mipFaceInfo.size = newMipSize;
      mipFaceInfo.internalFormat = internalFormat;
      mipFaceInfo.type = type;
      mipFaceInfo.width = width;
      mipFaceInfo.height = height;
      mipFaceInfo.depth = depth;

      info.mips[level][faceNdx] = mipFaceInfo;
      info.size += newMipSize;

      memory.texture -= oldSize;
      memory.texture += info.size;

      info.stackUpdated = getStackTrace();
    }

    function updateTexStorage(target, levels, internalFormat, width, height, depth) {
      const info = getTextureInfo(target);
      const numFaces = target === TEXTURE_CUBE_MAP ? 6 : 1;
      const baseFaceTarget = target === TEXTURE_CUBE_MAP ? TEXTURE_CUBE_MAP_POSITIVE_X : target;
      for (let level = 0; level < levels; ++level) {
        for (let face = 0; face < numFaces; ++face) {
          updateMipLevel(info, baseFaceTarget + face, level, internalFormat, width, height, depth);
        }
        width = Math.ceil(Math.max(width / 2, 1));
        height = Math.ceil(Math.max(height / 2, 1));
        depth = target === TEXTURE_2D_ARRAY ? depth : Math.ceil(Math.max(depth / 2, 1));
      }
    }

    function handleBindVertexArray(gl, funcName, args) {
      if (sharedState.isContextLost) {
        return;
      }
      const [va] = args;
      sharedState.currentVertexArray = va ? va : sharedState.defaultVertexArray;
    }

    function handleBufferBinding(target, obj) {
      if (sharedState.isContextLost) {
        return;
      }
      switch (target) {
        case ELEMENT_ARRAY_BUFFER: {
            const info = webglObjectToMemory.get(sharedState.currentVertexArray);
            info.elementArrayBuffer = obj;
            break;
          }
        default:
          bindings.set(target, obj);
          break;
      }
    }

    const preChecks = {};
    const postChecks = {
      // WebGL1
      //   void bufferData(GLenum target, GLsizeiptr size, GLenum usage);
      //   void bufferData(GLenum target, [AllowShared] BufferSource? srcData, GLenum usage);
      // WebGL2:
      //   void bufferData(GLenum target, [AllowShared] ArrayBufferView srcData, GLenum usage, GLuint srcOffset,
      //                   optional GLuint length = 0);
      bufferData(gl, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, src, /* usage */, /*srcOffset = 0*/, length = undefined] = args;
        let obj;
        switch (target) {
          case ELEMENT_ARRAY_BUFFER:
            {
              const info = webglObjectToMemory.get(sharedState.currentVertexArray);
              obj = info.elementArrayBuffer;
            }
            break;
          default:
            obj = bindings.get(target);
            break;
        }
        if (!obj) {
          throw new Error(`no buffer bound to ${target}`);
        }
        let newSize = 0;
        if (length !== undefined) {
          newSize = length * src.BYTES_PER_ELEMENT;
        } else if (isBufferSource(src)) {
          newSize = src.byteLength;
        } else if (isNumber(src)) {
          newSize = src;
        } else {
          throw new Error(`unsupported bufferData src type ${src}`);
        }

        const info = webglObjectToMemory.get(obj);
        if (!info) {
          throw new Error(`unknown buffer ${obj}`);
        }

        memory.buffer -= info.size;
        info.size = newSize;
        info.stackUpdated = getStackTrace();
        memory.buffer += newSize;
      },

      bindVertexArray: handleBindVertexArray,
      bindVertexArrayOES: handleBindVertexArray,

      bindBuffer(gl, funcName, args) {
        const [target, obj] = args;
        handleBufferBinding(target, obj);
      },

      bindBufferBase(gl, funcName, args) {
        const [target, /*ndx*/, obj] = args;
        handleBufferBinding(target, obj);
      },

      bindBufferRange(gl, funcName, args) {
        const [target, /*ndx*/, obj, /*offset*/, /*size*/] = args;
        handleBufferBinding(target, obj);
      },

      bindRenderbuffer(gl, funcName, args) {
        if (sharedState.isContextLost) {
         return;
        }
        const [target, obj] = args;
        bindings.set(target, obj);
      },

      bindTexture(gl, funcName, args) {
        if (sharedState.isContextLost) {
         return;
        }
        const [target, obj] = args;
        bindings.set(target, obj);
      },

      // void gl.copyTexImage2D(target, level, internalformat, x, y, width, height, border);
      copyTexImage2D(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, level, internalFormat, /*x*/, /*y*/, width, height, /*border*/] = args;
        const info = getTextureInfo(target);
        updateMipLevel(info, target, level, internalFormat, width, height, 1, UNSIGNED_BYTE);
      },

      createBuffer: makeCreateWrapper(ctx, 'buffer'),
      createFramebuffer: makeCreateWrapper(ctx, 'framebuffer'),
      createRenderbuffer: makeCreateWrapper(ctx, 'renderbuffer'),
      createProgram: makeCreateWrapper(ctx, 'program'),
      createQuery: makeCreateWrapper(ctx, 'query'),
      createShader: makeCreateWrapper(ctx, 'shader'),
      createSampler: makeCreateWrapper(ctx, 'sampler'),
      createTexture: makeCreateWrapper(ctx, 'texture'),
      createTransformFeedback: makeCreateWrapper(ctx, 'transformFeedback'),
      createVertexArray: makeCreateWrapper(ctx, 'vertexArray'),
      createVertexArrayOES: makeCreateWrapper(ctx, 'vertexArray', 'createVertexArrayOES'),

      // WebGL 1:
      // void gl.compressedTexImage2D(target, level, internalformat, width, height, border, ArrayBufferView? pixels);
      //
      // Additionally available in WebGL 2:
      // read from buffer bound to gl.PIXEL_UNPACK_BUFFER
      // void gl.compressedTexImage2D(target, level, internalformat, width, height, border, GLsizei imageSize, GLintptr offset);
      // void gl.compressedTexImage2D(target, level, internalformat, width, height, border,
      //                              ArrayBufferView srcData, optional srcOffset, optional srcLengthOverride);
      compressedTexImage2D(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, level, internalFormat, width, height] = args;
        const info = getTextureInfo(target);
        updateMipLevel(info, target, level, internalFormat, width, height, 1, UNSIGNED_BYTE);
      },

      // read from buffer bound to gl.PIXEL_UNPACK_BUFFER
      // void gl.compressedTexImage3D(target, level, internalformat, width, height, depth, border, GLsizei imageSize, GLintptr offset);
      // void gl.compressedTexImage3D(target, level, internalformat, width, height, depth, border,
      //                              ArrayBufferView srcData, optional srcOffset, optional srcLengthOverride);
      compressedTexImage3D(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, level, internalFormat, width, height, depth] = args;
        const info = getTextureInfo(target);
        updateMipLevel(info, target, level, internalFormat, width, height, depth, UNSIGNED_BYTE);
      },

      deleteBuffer: makeDeleteWrapper('buffer', function(obj, info) {
        memory.buffer -= info.size;
      }),
      deleteFramebuffer: makeDeleteWrapper('framebuffer'),
      deleteProgram: makeDeleteWrapper('program'),
      deleteQuery: makeDeleteWrapper('query'),
      deleteRenderbuffer: makeDeleteWrapper('renderbuffer', function(obj, info) {
        memory.renderbuffer -= info.size;
      }),
      deleteSampler: makeDeleteWrapper('sampler'),
      deleteShader: makeDeleteWrapper('shader'),
      deleteSync: makeDeleteWrapper('sync'),
      deleteTexture: makeDeleteWrapper('texture', function(obj, info) {
        memory.texture -= info.size;
      }),
      deleteTransformFeedback: makeDeleteWrapper('transformFeedback'),
      deleteVertexArray: makeDeleteWrapper('vertexArray'),
      deleteVertexArrayOES: makeDeleteWrapper('vertexArray', noop, 'deleteVertexArrayOES'),

      fenceSync: function(ctx) {
        if (sharedState.isContextLost) {
          return undefined;
        }
        if (!ctx.fenceSync) {
          return undefined;
        }
        resources.sync = 0;
        return function(ctx, funcName, args, webglObj) {
          ++resources.sync;

          webglObjectToMemory.set(webglObj, {
            size: 0,
          });
        };
      }(ctx),

      generateMipmap(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target] = args;
        const info = getTextureInfo(target);
        const baseMipNdx = info.parameters ? info.parameters.get(TEXTURE_BASE_LEVEL) || 0 : 0;
        const maxMipNdx = info.parameters ? info.parameters.get(TEXTURE_MAX_LEVEL) || 1024 : 1024;
        const mipInfo = info.mips[baseMipNdx][0];
        let {width, height, depth} = mipInfo;
        const {internalFormat, type} = mipInfo;
        let level = baseMipNdx + 1;

        const numFaces = target === TEXTURE_CUBE_MAP ? 6 : 1;
        const baseFaceTarget = target === TEXTURE_CUBE_MAP ? TEXTURE_CUBE_MAP_POSITIVE_X : target;
        while (level <= maxMipNdx && !(width === 1 && height === 1 && (depth === 1 || target === TEXTURE_2D_ARRAY))) {
          width = Math.ceil(Math.max(width / 2, 1));
          height = Math.ceil(Math.max(height / 2, 1));
          depth = target === TEXTURE_2D_ARRAY ? depth : Math.ceil(Math.max(depth / 2, 1));
          for (let face = 0; face < numFaces; ++face) {
            updateMipLevel(info, baseFaceTarget + face, level, internalFormat, width, height, depth, type);
          }
          ++level;
        }
      },

      getSupportedExtensions(ctx, funcName, args, result) {
        if (sharedState.isContextLost) {
          return;
        }
        result.push('GMAN_webgl_memory');
      },

      // void gl.renderbufferStorage(target, internalFormat, width, height);
      // gl.RGBA4: 4 red bits, 4 green bits, 4 blue bits 4 alpha bits.
      // gl.RGB565: 5 red bits, 6 green bits, 5 blue bits.
      // gl.RGB5_A1: 5 red bits, 5 green bits, 5 blue bits, 1 alpha bit.
      // gl.DEPTH_COMPONENT16: 16 depth bits.
      // gl.STENCIL_INDEX8: 8 stencil bits.
      // gl.DEPTH_STENCIL
      renderbufferStorage(ctx, funcName, args) {
        const [target, internalFormat, width, height] = args;
        updateRenderbuffer(target, 1, internalFormat, width, height);
      },

      // void gl.renderbufferStorageMultisample(target, samples, internalFormat, width, height);
      renderbufferStorageMultisample(ctx, funcName, args) {
        const [target, samples, internalFormat, width, height] = args;
        updateRenderbuffer(target, samples, internalFormat, width, height);
      },

      texImage2D(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        // WebGL1:
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, ArrayBufferView? pixels);
        // void gl.texImage2D(target, level, internalformat, format, type, ImageData? pixels);
        // void gl.texImage2D(target, level, internalformat, format, type, HTMLImageElement? pixels);
        // void gl.texImage2D(target, level, internalformat, format, type, HTMLCanvasElement? pixels);
        // void gl.texImage2D(target, level, internalformat, format, type, HTMLVideoElement? pixels);
        // void gl.texImage2D(target, level, internalformat, format, type, ImageBitmap? pixels// );

        // WebGL2:
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, GLintptr offset);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, HTMLCanvasElement source);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, HTMLImageElement source);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, HTMLVideoElement source);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, ImageBitmap source);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, ImageData source);
        // void gl.texImage2D(target, level, internalformat, width, height, border, format, type, ArrayBufferView srcData, srcOffset);
        const [target, level, internalFormat] = args;
        let width;
        let height;
        let type;
        if (args.length === 6) {
          const src = args[5];
          width = src.width;
          height = src.height;
          type = args[4];
        } else {
          width = args[3];
          height = args[4];
          type = args[7];
        }

        const info = getTextureInfo(target);
        updateMipLevel(info, target, level, internalFormat, width, height, 1, type);
      },

      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, GLintptr offset);
      //
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, HTMLCanvasElement source);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, HTMLImageElement source);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, HTMLVideoElement source);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, ImageBitmap source);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, ImageData source);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, ArrayBufferView? srcData);
      // void gl.texImage3D(target, level, internalformat, width, height, depth, border, format, type, ArrayBufferView srcData, srcOffset);

      texImage3D(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, level, internalFormat, width, height, depth, /*border*/, /*format*/, type] = args;
        const info = getTextureInfo(target);
        updateMipLevel(info, target, level, internalFormat, width, height, depth, type);
      },

      texParameteri(ctx, funcName, args) {
        if (sharedState.isContextLost) {
          return;
        }
        const [target, pname, value] = args;
        const info = getTextureInfo(target);
        info.parameters = info.parameters || new Map();
        info.parameters.set(pname, value);
      },

      // void gl.texStorage2D(target, levels, internalformat, width, height);
      texStorage2D(ctx, funcName, args) {
        const [target, levels, internalFormat, width, height] = args;
        updateTexStorage(target, levels, internalFormat, width, height, 1);
      },

      // void gl.texStorage3D(target, levels, internalformat, width, height, depth);
      texStorage3D(ctx, funcName, args) {
        const [target, levels, internalFormat, width, height, depth] = args;
        updateTexStorage(target, levels, internalFormat, width, height, depth);
      },
    };

    const extraWrappers = {
      getExtension(ctx, propertyName) {
        if (sharedState.isContextLost) {
          return;
        }
        const origFn = ctx[propertyName];
        ctx[propertyName] = function(...args) {
          const extensionName = args[0].toLowerCase();
          const api = apis[extensionName];
          if (api) {
            return api.ctx;
          }
          const ext = origFn.call(ctx, ...args);
          if (ext) {
            augmentAPI(ext, extensionName, {...options, origGLErrorFn});
          }
          return ext;
        };
      },
    };

    // Makes a function that calls a WebGL function and then calls getError.
    function makeErrorWrapper(ctx, funcName) {
      const origFn = ctx[funcName];
      const preCheck = preChecks[funcName] || noop;
      const postCheck = postChecks[funcName] || noop;
      if (preCheck === noop && postChecks === noop) {
        return;
      }
      ctx[funcName] = function(...args) {
        preCheck(ctx, funcName, args);
        const result = origFn.call(ctx, ...args);
        postCheck(ctx, funcName, args, result);
        return result;
      };
      const extraWrapperFn = extraWrappers[funcName];
      if (extraWrapperFn) {
        extraWrapperFn(ctx, funcName, origGLErrorFn);
      }
    }

    // Wrap each function
    for (const propertyName in ctx) {
      if (typeof ctx[propertyName] === 'function') {
        origFuncs[propertyName] = ctx[propertyName];
        makeErrorWrapper(ctx, propertyName);
      }
    }

    apis[nameOfClass.toLowerCase()] = { ctx, origFuncs };
  }

  /*
  The MIT License (MIT)

  Copyright (c) 2021 Gregg Tavares

  Permission is hereby granted, free of charge, to any person obtaining a copy of
  this software and associated documentation files (the "Software"), to deal in
  the Software without restriction, including without limitation the rights to
  use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
  the Software, and to permit persons to whom the Software is furnished to do so,
  subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
  FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
  IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */


  function wrapGetContext(Ctor) {
    const oldFn = Ctor.prototype.getContext;
    Ctor.prototype.getContext = function(type, ...args) {
      const ctx = oldFn.call(this, type, ...args);
      // Using bindTexture to see if it's WebGL. Could check for instanceof WebGLRenderingContext
      // but that might fail if wrapped by debugging extension
      if (ctx && ctx.bindTexture) {
        const config = {};
        augmentAPI(ctx, type, config);
        ctx.getExtension('GMAN_webgl_memory');
      }
      return ctx;
    };
  }

  if (typeof HTMLCanvasElement !== 'undefined') {
    wrapGetContext(HTMLCanvasElement);
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    wrapGetContext(OffscreenCanvas);
  }

}));

```
