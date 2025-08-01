import { useEffect } from 'react';
import { commandRegistry } from '../utils/commandRegistry';

interface UseCommandRegistrationProps {
  spineInstance: any;
  toggleMeshes: () => void;
  togglePhysics: () => void;
  toggleIk: () => void;
  meshesVisible: boolean;
  physicsVisible: boolean;
  ikVisible: boolean;
  showBenchmark: boolean;
  setShowBenchmark: (show: boolean) => void;
  showEventTimeline: boolean;
  setShowEventTimeline: (show: boolean) => void;
  openGitHubReadme: () => void;
  handleBackgroundButtonClick: () => void;
  handleRemoveBackground: () => void;
  hasBackgroundImage: boolean;
}

export function useCommandRegistration({
  spineInstance,
  toggleMeshes,
  togglePhysics,
  toggleIk,
  meshesVisible,
  physicsVisible,
  ikVisible,
  showBenchmark,
  setShowBenchmark,
  showEventTimeline,
  setShowEventTimeline,
  openGitHubReadme,
  handleBackgroundButtonClick,
  handleRemoveBackground,
  hasBackgroundImage
}: UseCommandRegistrationProps) {
  
  useEffect(() => {
    // Debug Commands
    commandRegistry.register({
      id: 'debug.toggle-meshes',
      title: 'Toggle Mesh Visualization',
      category: 'debug',
      description: 'Show/hide mesh triangles and hulls',
      keywords: ['debug', 'mesh', 'triangles', 'hull', 'wireframe'],
      execute: toggleMeshes
    });

    commandRegistry.register({
      id: 'debug.toggle-physics',
      title: 'Toggle Physics Constraints',
      category: 'debug',
      description: 'Show/hide physics constraint visualization',
      keywords: ['debug', 'physics', 'constraints', 'springs'],
      execute: togglePhysics
    });

    commandRegistry.register({
      id: 'debug.toggle-ik',
      title: 'Toggle IK Constraints',
      category: 'debug',
      description: 'Show/hide IK constraint visualization',
      keywords: ['debug', 'ik', 'inverse', 'kinematics', 'constraints'],
      execute: toggleIk
    });

    commandRegistry.register({
      id: 'debug.clear-all',
      title: 'Clear All Debug Visualizations',
      category: 'debug',
      description: 'Turn off all debug layers',
      keywords: ['debug', 'clear', 'hide', 'off'],
      execute: () => {
        if (meshesVisible) toggleMeshes();
        if (physicsVisible) togglePhysics();
        if (ikVisible) toggleIk();
      }
    });

    // Animation Commands
    if (spineInstance) {
      commandRegistry.register({
        id: 'animation.play-pause',
        title: 'Play/Pause Animation',
        category: 'animation',
        description: 'Toggle animation playback',
        keywords: ['animation', 'play', 'pause', 'toggle'],
        execute: () => {
          const currentTimeScale = spineInstance.state.timeScale;
          spineInstance.state.timeScale = currentTimeScale === 0 ? 1 : 0;
        }
      });

      commandRegistry.register({
        id: 'animation.stop',
        title: 'Stop Animation',
        category: 'animation',
        description: 'Stop current animation',
        keywords: ['animation', 'stop'],
        execute: () => {
          spineInstance.state.clearTrack(0);
        }
      });

      commandRegistry.register({
        id: 'animation.restart',
        title: 'Restart Animation',
        category: 'animation',
        description: 'Restart current animation from beginning',
        keywords: ['animation', 'restart', 'reset'],
        execute: () => {
          const currentEntry = spineInstance.state.getCurrent(0);
          if (currentEntry) {
            spineInstance.state.setAnimation(0, currentEntry.animation.name, currentEntry.loop);
          }
        }
      });

      // Register skin commands dynamically
      const skins = spineInstance.skeleton.data.skins;
      skins.forEach((skin: any) => {
        commandRegistry.register({
          id: `skin.${skin.name}`,
          title: `Switch to ${skin.name}`,
          category: 'skin',
          description: `Apply ${skin.name} skin`,
          keywords: ['skin', skin.name.toLowerCase()],
          execute: () => {
            spineInstance.skeleton.setSkin(skin.name);
            spineInstance.skeleton.setSlotsToSetupPose();
          }
        });
      });
    }

    // Performance Commands
    commandRegistry.register({
      id: 'performance.toggle-benchmark',
      title: 'Toggle Benchmark Info',
      category: 'performance',
      description: 'Show/hide performance benchmark panel',
      keywords: ['performance', 'benchmark', 'info', 'stats'],
      execute: () => setShowBenchmark(!showBenchmark)
    });

    commandRegistry.register({
      id: 'performance.toggle-timeline',
      title: 'Toggle Event Timeline',
      category: 'performance',
      description: 'Show/hide animation event timeline',
      keywords: ['performance', 'timeline', 'events'],
      execute: () => setShowEventTimeline(!showEventTimeline)
    });

    // Navigation Commands
    commandRegistry.register({
      id: 'help.documentation',
      title: 'Open Documentation',
      category: 'performance',
      description: 'Open GitHub README documentation',
      keywords: ['help', 'documentation', 'readme', 'github'],
      execute: openGitHubReadme
    });

    commandRegistry.register({
      id: 'background.upload',
      title: 'Upload Background Image',
      category: 'performance',
      description: 'Upload a background image',
      keywords: ['background', 'image', 'upload'],
      execute: handleBackgroundButtonClick
    });

    if (hasBackgroundImage) {
      commandRegistry.register({
        id: 'background.remove',
        title: 'Remove Background Image',
        category: 'performance',
        description: 'Remove current background image',
        keywords: ['background', 'remove', 'clear'],
        execute: handleRemoveBackground
      });
    }

    // Cleanup function to unregister commands
    return () => {
      const commandIds = [
        'debug.toggle-meshes',
        'debug.toggle-physics',
        'debug.toggle-ik',
        'debug.clear-all',
        'animation.play-pause',
        'animation.stop',
        'animation.restart',
        'performance.toggle-benchmark',
        'performance.toggle-timeline',
        'help.documentation',
        'background.upload',
        'background.remove'
      ];

      commandIds.forEach(id => commandRegistry.unregister(id));

      // Unregister skin commands
      if (spineInstance) {
        const skins = spineInstance.skeleton.data.skins;
        skins.forEach((skin: any) => {
          commandRegistry.unregister(`skin.${skin.name}`);
        });
      }
    };
  }, [
    spineInstance,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    meshesVisible,
    physicsVisible,
    ikVisible,
    showBenchmark,
    setShowBenchmark,
    showEventTimeline,
    setShowEventTimeline,
    openGitHubReadme,
    handleBackgroundButtonClick,
    handleRemoveBackground,
    hasBackgroundImage
  ]);
}