import React, { useState, useEffect } from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
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
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [currentAnimation, setCurrentAnimation] = useState<string>('');
  const [animations, setAnimations] = useState<string[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  
  // Initialize animations list and set default animation
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
  
  // Debug logging to validate assumptions
  console.log('AnimationControls rendering:', {
    spineInstance: !!spineInstance,
    currentAnimation,
    animations: animations.length,
    isPlaying,
    isLooping
  });
  console.log('Rendering playback controls with buttons');

  return (
    <div className="animation-controls">
      <div className="animation-name">
        {currentAnimation}
      </div>
      
      <div className="playback-controls">
        <IconButton
          icon={<RewindIcon />}
          onClick={previousAnimation}
          tooltip="Previous Animation"
        />
        
        <IconButton
          icon={<StopIcon />}
          onClick={stopAnimation}
          tooltip="Stop"
        />
        
        <IconButton
          icon={isPlaying ? <PauseIcon /> : <PlayIcon />}
          onClick={togglePlay}
          tooltip={isPlaying ? "Pause" : "Play"}
        />
        
        <IconButton
          icon={<ArrowPathIcon />}
          onClick={rewindAnimation}
          tooltip="Restart Animation"
        />
        
        <IconButton
          icon={<ForwardIcon />}
          onClick={nextAnimation}
          tooltip="Next Animation"
        />
      </div>
      
      <div className="animation-settings">
        <ToggleSwitch
          checked={isLooping}
          onChange={toggleLoop}
          label="Loop"
          tooltip="Toggle animation looping"
        />
        
        <ModernSelect
          value={currentAnimation}
          onChange={(value) => playAnimation(value)}
          options={animations.map(name => ({
            value: name,
            label: name
          }))}
          placeholder="Select Animation"
        />
      </div>
    </div>
  );
};