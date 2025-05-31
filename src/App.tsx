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