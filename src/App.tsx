import { Application } from 'pixi.js';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  LoadingOutlined,
  GlobalOutlined
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
  const { t, i18n } = useTranslation();
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
  const [currentLanguage, setCurrentLanguage] = useSafeLocalStorage('spine-benchmark-language', 'en');
  
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
    i18n.changeLanguage(currentLanguage);
  }, [currentLanguage, i18n]);

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
        addToast(t('errors.applicationNotInitialized') + `: ${error instanceof Error ? error.message : t('errors.unknownError')}`, 'error');
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
      addToast(`Error processing dropped files: ${error instanceof Error ? error.message : t('errors.unknownError')}`, 'error');
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
          addToast(t('warning.spine41Warning'), 'warning');
          
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
      addToast(`${t('errors.errorLoadingFiles')}: ${error instanceof Error ? error.message : t('errors.unknownError')}`, 'error');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      if (!file.type.startsWith('image/')) {
        addToast(t('errors.selectImageFile'), 'error');
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
            addToast(t('errors.failedToSetBackground'), 'error');
          }
        } else {
          addToast(t('errors.failedToReadImage'), 'error');
        }
      };
      
      reader.onerror = () => {
        addToast(t('errors.errorReadingImage'), 'error');
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

  const handleLanguageChange = (value: string) => {
    setCurrentLanguage(value);
    i18n.changeLanguage(value);
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
      label: t('menu.information'),
      children: [
        {
          key: 'benchmark',
          icon: <DashboardOutlined />,
          label: t('menu.benchmarkInfo'),
          onClick: () => setShowBenchmark(!showBenchmark)
        },
        {
          key: 'docs',
          icon: <FileTextOutlined />,
          label: t('menu.documentation'),
          onClick: () => window.open('https://github.com/schmooky/spine-benchmark/blob/main/README.md', '_blank')
        },
        {
          key: 'timeline',
          icon: <LineChartOutlined />,
          label: t('menu.eventTimeline'),
          onClick: () => setShowEventTimeline(!showEventTimeline)
        }
      ]
    },
    {
      key: 'visuals',
      icon: <SettingOutlined />,
      label: t('menu.visualSettings'),
      children: [
        {
          key: 'background',
          icon: <PictureOutlined />,
          label: t('menu.backgroundImage'),
          onClick: () => fileInputRef.current?.click()
        },
        {
          key: 'bgcolor',
          icon: <BgColorsOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {t('menu.backgroundColor')}
              <ColorPicker 
                value={backgroundColor} 
                onChange={(color) => setBackgroundColor(color.toHexString())}
                size="small"
                presets={[
                  {
                    label: t('themes.darkTheme'),
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
      label: t('menu.debugVisualization'),
      children: [
        {
          key: 'meshes',
          icon: <AppstoreOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{t('menu.meshVisualization')}</span>
              <Switch checked={meshesVisible} onChange={toggleMeshes} size="small" />
            </div>
          )
        },
        {
          key: 'physics',
          icon: <ThunderboltOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{t('menu.physicsConstraints')}</span>
              <Switch checked={physicsVisible} onChange={togglePhysics} size="small" />
            </div>
          )
        },
        {
          key: 'ik',
          icon: <LinkOutlined />,
          label: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>{t('menu.ikConstraints')}</span>
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
            {collapsed ? t('app.titleShort') : t('app.title')}
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
          
          <Space>
            {hasBackgroundImage && (
              <Button 
                type="text"
                icon={<CloseOutlined />}
                onClick={handleRemoveBackground}
                style={{ color: '#fff' }}
              >
                {t('controls.removeBackground')}
              </Button>
            )}
            
            <Select
              value={currentLanguage}
              onChange={handleLanguageChange}
              style={{ width: 120 }}
              suffixIcon={<GlobalOutlined />}
              options={[
                { label: 'English', value: 'en' },
                { label: 'Русский', value: 'ru' }
              ]}
            />
          </Space>
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
                <p>{t('dropArea.message')}</p>
              </div>
            )}
            
            {(isLoading || spineLoading) && (
              <div className="loading-indicator">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <p>{t('dropArea.loading')}</p>
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
        title={t('analysis.title')}
        placement="right"
        width={800}
        onClose={() => setShowBenchmark(false)}
        open={showBenchmark}
        bodyStyle={{ padding: 0 }}
      >
        {benchmarkData && <InfoPanel data={benchmarkData} onClose={() => setShowBenchmark(false)} />}
      </Drawer>
      
      <Drawer
        title={t('drawer.animationEventTimeline')}
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