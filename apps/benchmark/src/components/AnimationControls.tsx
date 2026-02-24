import React, { useEffect, useRef, useState } from 'react';
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
  const stateRef = useRef({
    isPlaying,
    isLooping,
    currentAnimation,
    currentSkin,
  });

  useEffect(() => {
    stateRef.current = {
      isPlaying,
      isLooping,
      currentAnimation,
      currentSkin,
    };
  }, [isPlaying, isLooping, currentAnimation, currentSkin]);

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

  // Keep UI controls synchronized with external Spine state changes.
  useEffect(() => {
    if (!spineInstance) return;

    let rafId = 0;
    const syncFromSpine = () => {
      const entry = spineInstance.state.getCurrent(0);
      const activeAnimation = entry?.animation?.name ?? '';
      const activeSkin = spineInstance.skeleton.skin?.name ?? '';
      const hasTrack = Boolean(entry?.animation);
      const finishedNonLoop = Boolean(entry && !entry.loop && entry.isComplete());
      const playing = hasTrack && spineInstance.state.timeScale > 0 && !finishedNonLoop;

      if (activeAnimation && activeAnimation !== stateRef.current.currentAnimation) {
        setCurrentAnimation(activeAnimation);
      }

      if (entry && entry.loop !== stateRef.current.isLooping) {
        setIsLooping(entry.loop);
      }

      if (activeSkin && activeSkin !== stateRef.current.currentSkin) {
        setCurrentSkin(activeSkin);
      }

      if (playing !== stateRef.current.isPlaying) {
        setIsPlaying(playing);
      }

      rafId = window.requestAnimationFrame(syncFromSpine);
    };

    syncFromSpine();
    return () => {
      window.cancelAnimationFrame(rafId);
    };
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
    spineInstance.state.timeScale = 1;
    setCurrentAnimation(name);
    setIsLooping(loop);
    setIsPlaying(true);
    
    // Notify parent component about animation change
    if (onAnimationChange) {
      onAnimationChange(name);
    }
  };
  
  const togglePlay = () => {
    if (!spineInstance) return;

    const currentEntry = spineInstance.state.getCurrent(0);
    const entryCompleted = Boolean(currentEntry && !currentEntry.loop && currentEntry.isComplete());
    const hasTrack = Boolean(currentEntry?.animation);

    if (entryCompleted || !hasTrack) {
      const animationToPlay = currentAnimation || animations[0];
      if (animationToPlay) {
        playAnimation(animationToPlay, currentEntry?.loop ?? isLooping);
      }
      return;
    }

    if (isPlaying) {
      spineInstance.state.timeScale = 0;
      setIsPlaying(false);
      return;
    }

    spineInstance.state.timeScale = 1;
    setIsPlaying(true);
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

  const hasSkins = skins.length > 0;
  const skinSelectValue = hasSkins ? currentSkin : 'default';
  
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
          <span className="animation-select-prefix">{t('controls.labels.selectAnimation')}:</span>
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

        <label className="animation-select-chip animation-select-chip-skin">
          <span className="animation-select-prefix">{t('controls.labels.selectSkin')}:</span>
          <select
            className="animation-select-native"
            value={skinSelectValue}
            onChange={(event) => switchSkin(event.target.value)}
            disabled={skins.length <= 1}
          >
            {hasSkins ? (
              skins.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))
            ) : (
              <option value="default">{t('ui.default')}</option>
            )}
          </select>
        </label>
      </div>
    </div>
  );
};
