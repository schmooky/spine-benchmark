import React, { useState, useEffect } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { useTranslation } from 'react-i18next';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  RewindIcon,
  ForwardIcon,
  ArrowPathIcon
} from './Icons';
import { IconButton } from './IconButton';
import { ToggleSwitch } from './ToggleSwitch';
import { ModernSelect } from './ModernSelect';

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
  const [skins, setSkins] = useState<string[]>([]);
  const [currentSkin, setCurrentSkin] = useState<string>('');

  // Initialize animations list and set default animation
  useEffect(() => {
    if (!spineInstance) return;

    const animationNames = spineInstance.skeleton.data.animations.map(anim => anim.name);
    setAnimations(animationNames);

    if (animationNames.length > 0) {
      setCurrentAnimation(animationNames[0]);
      playAnimation(animationNames[0], false);
    }

    const skinNames = spineInstance.skeleton.data.skins.map(s => s.name);
    setSkins(skinNames);
    const activeSkin = spineInstance.skeleton.skin?.name || skinNames[0] || '';
    setCurrentSkin(activeSkin);
  }, [spineInstance]);
  
  // Handle play/pause
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
    
    // Notify parent component about animation change
    if (onAnimationChange) {
      onAnimationChange(name);
    }
  };
  
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };
  
  const toggleLoop = () => {
    setIsLooping(!isLooping);
    
    // Reapply the current animation with new loop setting
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
    
    // Restart the current animation
    playAnimation(currentAnimation);
  };
  
  const switchSkin = (skinName: string) => {
    if (!spineInstance) return;
    const skin = spineInstance.skeleton.data.findSkin(skinName);
    if (skin) {
      spineInstance.skeleton.setSkin(skin);
      spineInstance.skeleton.setSlotsToSetupPose();
      setCurrentSkin(skinName);
    }
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
    <div className="animation-controls">
      <div className="controls-label">{t('controls.title')}</div>
      <div className="playback-controls">
        <IconButton
          icon={<RewindIcon className='flipped'/>}
          onClick={previousAnimation}
          tooltip={t('controls.actions.previous')}
        />
        
        <IconButton
          icon={<StopIcon />}
          onClick={stopAnimation}
          tooltip={t('controls.actions.stop')}
        />
        
        <IconButton
          icon={isPlaying ? <PauseIcon /> : <PlayIcon />}
          onClick={togglePlay}
          tooltip={isPlaying ? t('controls.actions.pause') : t('controls.actions.play')}
        />
        
        <IconButton
          icon={<ArrowPathIcon />}
          onClick={rewindAnimation}
          tooltip={t('controls.actions.restart')}
        />
        
        <IconButton
          icon={<ForwardIcon />}
          onClick={nextAnimation}
          tooltip={t('controls.actions.next')}
        />
      </div>
      
      <div className="animation-settings">
        <ToggleSwitch
          checked={isLooping}
          onChange={toggleLoop}
          label={t('controls.labels.loop')}
          tooltip={t('controls.labels.loopHint')}
        />
        
        <ModernSelect
          value={currentAnimation}
          onChange={(value) => playAnimation(value)}
          options={animations.map(name => ({
            value: name,
            label: name
          }))}
          placeholder={t('controls.labels.selectAnimation')}
        />

        {skins.length > 1 && (
          <ModernSelect
            value={currentSkin}
            onChange={switchSkin}
            options={skins.map(name => ({
              value: name,
              label: name
            }))}
            placeholder={t('controls.labels.selectSkin')}
          />
        )}
      </div>
    </div>
  );
};
