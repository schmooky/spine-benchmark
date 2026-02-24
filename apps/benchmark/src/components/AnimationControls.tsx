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
    
    spineInstance.state.setAnimation(0, name, loop);
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
    
    spineInstance.state.clearTrack(0);
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
      <div className="animation-controls-row animation-controls-row-playback">
        <IconButton
          icon={<RewindIcon className='flipped'/>}
          onClick={previousAnimation}
          tooltip={t('controls.actions.previous')}
          className="animation-icon-btn"
        />
        
        <IconButton
          icon={<StopIcon />}
          onClick={stopAnimation}
          tooltip={t('controls.actions.stop')}
          className="animation-icon-btn"
        />
        
        <IconButton
          icon={isPlaying ? <PauseIcon /> : <PlayIcon />}
          onClick={togglePlay}
          tooltip={isPlaying ? t('controls.actions.pause') : t('controls.actions.play')}
          className="animation-icon-btn animation-icon-btn-primary"
        />
        
        <IconButton
          icon={<ArrowPathIcon />}
          onClick={rewindAnimation}
          tooltip={t('controls.actions.restart')}
          className="animation-icon-btn"
        />
        
        <IconButton
          icon={<ForwardIcon />}
          onClick={nextAnimation}
          tooltip={t('controls.actions.next')}
          className="animation-icon-btn"
        />

        <div className="animation-controls-spacer" />

        <button
          type="button"
          className={`animation-loop-chip${isLooping ? ' active' : ''}`}
          onClick={toggleLoop}
          aria-pressed={isLooping}
        >
          {t('controls.labels.loop')}
        </button>
      </div>
      
      <div className="animation-controls-row animation-controls-row-selects">
        <label className="animation-select-chip">
          <span className="animation-select-prefix">Animation:</span>
          <select
            className="animation-select-native"
            value={currentAnimation}
            onChange={(event) => playAnimation(event.target.value)}
          >
            {animations.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>

        {skins.length > 1 && (
          <label className="animation-select-chip animation-select-chip-skin">
            <span className="animation-select-prefix">Skin:</span>
            <select
              className="animation-select-native"
              value={currentSkin}
              onChange={(event) => switchSkin(event.target.value)}
            >
              {skins.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
};
