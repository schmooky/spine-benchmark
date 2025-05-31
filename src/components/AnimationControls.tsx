import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
          placeholder={t('controls.selectAnimation')}
        />
        
        <Space>
          <Tooltip title={t('controls.previousAnimation')}>
            <Button icon={<StepBackwardOutlined />} onClick={previousAnimation} />
          </Tooltip>
          
          <Tooltip title={t('controls.stop')}>
            <Button icon={<StopOutlined />} onClick={stopAnimation} />
          </Tooltip>
          
          <Tooltip title={isPlaying ? t('controls.pause') : t('controls.play')}>
            <Button 
              type="primary" 
              icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} 
              onClick={togglePlay}
              size="large"
            />
          </Tooltip>
          
          <Tooltip title={t('controls.restart')}>
            <Button icon={<ReloadOutlined />} onClick={rewindAnimation} />
          </Tooltip>
          
          <Tooltip title={t('controls.nextAnimation')}>
            <Button icon={<StepForwardOutlined />} onClick={nextAnimation} />
          </Tooltip>
        </Space>
        
        <Switch 
          checkedChildren={t('controls.loop')} 
          unCheckedChildren={t('controls.once')} 
          checked={isLooping} 
          onChange={toggleLoop} 
        />
      </Space>
    </div>
  );
};