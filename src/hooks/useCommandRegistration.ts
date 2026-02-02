import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { commandRegistry } from '../utils/commandRegistry';
import { CameraContainer } from '../core/CameraContainer';

interface UseCommandRegistrationProps {
  spineInstance: Spine | null;
  setShowBenchmark: (show: boolean) => void;
  openGitHubReadme: () => void;
  setShowLanguageModal: (show: boolean) => void;
  meshesVisible: boolean;
  physicsVisible: boolean;
  ikVisible: boolean;
  toggleMeshes: (visible?: boolean) => void;
  togglePhysics: (visible?: boolean) => void;
  toggleIk: (visible?: boolean) => void;
  getCameraContainer: () => CameraContainer | null;
}

export function useCommandRegistration({
  spineInstance,
  setShowBenchmark,
  openGitHubReadme,
  setShowLanguageModal,
  meshesVisible,
  physicsVisible,
  ikVisible,
  toggleMeshes,
  togglePhysics,
  toggleIk,
  getCameraContainer,
}: UseCommandRegistrationProps) {
  const { t } = useTranslation();
  
  useEffect(() => {
    if (spineInstance) {
      commandRegistry.register({
        id: 'animation.play-pause',
        title: t('commands.animation.playPause'),
        category: 'animation',
        description: t('commands.animation.playPauseDescription'),
        keywords: [t('commands.keywords.animation'), t('commands.keywords.play'), t('commands.keywords.pause'), t('commands.keywords.toggle')],
        execute: () => {
          const currentTimeScale = spineInstance.state.timeScale;
          spineInstance.state.timeScale = currentTimeScale === 0 ? 1 : 0;
        }
      });

      commandRegistry.register({
        id: 'animation.stop',
        title: t('commands.animation.stop'),
        category: 'animation',
        description: t('commands.animation.stopDescription'),
        keywords: [t('commands.keywords.animation'), t('commands.keywords.stop')],
        execute: () => {
          spineInstance.state.clearTrack(0);
        }
      });

      commandRegistry.register({
        id: 'animation.restart',
        title: t('commands.animation.restart'),
        category: 'animation',
        description: t('commands.animation.restartDescription'),
        keywords: [t('commands.keywords.animation'), t('commands.keywords.restart'), t('commands.keywords.reset')],
        execute: () => {
          const currentEntry = spineInstance.state.getCurrent(0);
          if (currentEntry) {
            spineInstance.state.setAnimation(0, currentEntry.animation.name, currentEntry.loop);
          }
        }
      });

      const skins = spineInstance.skeleton.data.skins;
      skins.forEach((skin: { name: string }) => {
        commandRegistry.register({
          id: `skin.${skin.name}`,
          title: t('commands.skin.switchTo', { 0: skin.name }),
          category: 'skin',
          description: t('commands.skin.switchToDescription', { 0: skin.name }),
          keywords: [t('commands.keywords.skin'), skin.name.toLowerCase()],
          execute: () => {
            spineInstance.skeleton.setSkin(skin.name);
            spineInstance.skeleton.setSlotsToSetupPose();
          }
        });
      });
    }

    if (spineInstance) {
      commandRegistry.register({
        id: 'debug.toggle-bones',
        title: t('commands.debug.toggleBones', 'Toggle Bones'),
        category: 'debug',
        description: t('commands.debug.toggleBonesDescription', 'Show/hide bone structure'),
        keywords: [t('commands.keywords.toggle'), 'bones', 'skeleton', 'debug', 'joints'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showBones: !flags.showBones });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-meshes',
        title: t('commands.debug.toggleMeshes', 'Toggle Meshes'),
        category: 'debug',
        description: t('commands.debug.toggleMeshesDescription', 'Show/hide mesh triangles and hulls'),
        keywords: [t('commands.keywords.toggle'), 'mesh', 'triangles', 'hull', 'debug', 'vertices'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            const newValue = !flags.showMeshTriangles;
            cameraContainer.setDebugFlags({ 
              showMeshTriangles: newValue,
              showMeshHull: newValue,
              showVertices: newValue,
              showRegionAttachments: newValue,
              showBoundingBoxes: newValue,
              showPaths: newValue,
              showClipping: newValue
            });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-regions',
        title: t('commands.debug.toggleRegions', 'Toggle Region Attachments'),
        category: 'debug',
        description: t('commands.debug.toggleRegionsDescription', 'Show/hide region attachment bounds'),
        keywords: [t('commands.keywords.toggle'), 'region', 'attachments', 'debug', 'bounds'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showRegionAttachments: !flags.showRegionAttachments });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-bounding-boxes',
        title: t('commands.debug.toggleBoundingBoxes', 'Toggle Bounding Boxes'),
        category: 'debug',
        description: t('commands.debug.toggleBoundingBoxesDescription', 'Show/hide bounding boxes'),
        keywords: [t('commands.keywords.toggle'), 'bounding', 'boxes', 'debug', 'collision'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showBoundingBoxes: !flags.showBoundingBoxes });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-paths',
        title: t('commands.debug.togglePaths', 'Toggle Paths'),
        category: 'debug',
        description: t('commands.debug.togglePathsDescription', 'Show/hide path attachments'),
        keywords: [t('commands.keywords.toggle'), 'paths', 'debug', 'curves'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showPaths: !flags.showPaths });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-clipping',
        title: t('commands.debug.toggleClipping', 'Toggle Clipping'),
        category: 'debug',
        description: t('commands.debug.toggleClippingDescription', 'Show/hide clipping masks'),
        keywords: [t('commands.keywords.toggle'), 'clipping', 'masks', 'debug'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showClipping: !flags.showClipping });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-ik-constraints',
        title: t('commands.debug.toggleIkConstraints', 'Toggle IK Constraints'),
        category: 'debug',
        description: t('commands.debug.toggleIkConstraintsDescription', 'Show/hide IK constraints'),
        keywords: [t('commands.keywords.toggle'), 'ik', 'constraints', 'debug', 'inverse', 'kinematics'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showIkConstraints: !flags.showIkConstraints });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-transform-constraints',
        title: t('commands.debug.toggleTransformConstraints', 'Toggle Transform Constraints'),
        category: 'debug',
        description: t('commands.debug.toggleTransformConstraintsDescription', 'Show/hide transform constraints'),
        keywords: [t('commands.keywords.toggle'), 'transform', 'constraints', 'debug'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showTransformConstraints: !flags.showTransformConstraints });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-path-constraints',
        title: t('commands.debug.togglePathConstraints', 'Toggle Path Constraints'),
        category: 'debug',
        description: t('commands.debug.togglePathConstraintsDescription', 'Show/hide path constraints'),
        keywords: [t('commands.keywords.toggle'), 'path', 'constraints', 'debug'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showPathConstraints: !flags.showPathConstraints });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.toggle-physics-constraints',
        title: t('commands.debug.togglePhysicsConstraints', 'Toggle Physics Constraints'),
        category: 'debug',
        description: t('commands.debug.togglePhysicsConstraintsDescription', 'Show/hide physics constraints'),
        keywords: [t('commands.keywords.toggle'), 'physics', 'constraints', 'debug', 'simulation'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            const flags = cameraContainer.getDebugFlags();
            cameraContainer.setDebugFlags({ showPhysics: !flags.showPhysics });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.show-all',
        title: t('commands.debug.showAll', 'Show All Debug'),
        category: 'debug',
        description: t('commands.debug.showAllDescription', 'Enable all debug visualizations'),
        keywords: [t('commands.keywords.show'), 'all', 'debug', 'everything'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            cameraContainer.setDebugFlags({
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
            });
          }
        }
      });

      commandRegistry.register({
        id: 'debug.hide-all',
        title: t('commands.debug.hideAll', 'Hide All Debug'),
        category: 'debug',
        description: t('commands.debug.hideAllDescription', 'Disable all debug visualizations'),
        keywords: ['hide', 'all', 'debug', 'clear'],
        execute: () => {
          const cameraContainer = getCameraContainer();
          if (cameraContainer) {
            cameraContainer.setDebugFlags({
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
        }
      });

      // Legacy compatibility - use the convenience toggle functions
      if (!meshesVisible) {
        commandRegistry.register({
          id: 'debug.show-mesh',
          title: t('commands.debug.showMeshDebug'),
          category: 'debug',
          description: t('commands.debug.showMeshDebugDescription'),
          keywords: [t('commands.keywords.show'), 'mesh', 'attachment', 'debug', 'vertices', 'triangles', 'visualization'],
          execute: toggleMeshes
        });
      } else {
        commandRegistry.register({
          id: 'debug.hide-mesh',
          title: t('commands.debug.hideMeshDebug'),
          category: 'debug',
          description: t('commands.debug.hideMeshDebugDescription'),
          keywords: ['hide', 'mesh', 'attachment', 'debug', 'vertices', 'triangles', 'visualization'],
          execute: toggleMeshes
        });
      }

      if (!ikVisible) {
        commandRegistry.register({
          id: 'debug.show-ik',
          title: t('commands.debug.showIkDebug'),
          category: 'debug',
          description: t('commands.debug.showIkDebugDescription'),
          keywords: [t('commands.keywords.show'), 'ik', 'debug', 'constraints', 'controls'],
          execute: toggleIk
        });
      } else {
        commandRegistry.register({
          id: 'debug.hide-ik',
          title: t('commands.debug.hideIkDebug'),
          category: 'debug',
          description: t('commands.debug.hideIkDebugDescription'),
          keywords: ['hide', 'ik', 'debug', 'constraints', 'controls'],
          execute: toggleIk
        });
      }

      if (!physicsVisible) {
        commandRegistry.register({
          id: 'debug.show-physics',
          title: t('commands.debug.showPhysicsDebug'),
          category: 'debug',
          description: t('commands.debug.showPhysicsDebugDescription'),
          keywords: [t('commands.keywords.show'), 'physics', 'debug', 'constraints', 'simulation'],
          execute: togglePhysics
        });
      } else {
        commandRegistry.register({
          id: 'debug.hide-physics',
          title: t('commands.debug.hidePhysicsDebug'),
          category: 'debug',
          description: t('commands.debug.hidePhysicsDebugDescription'),
          keywords: ['hide', 'physics', 'debug', 'constraints', 'simulation'],
          execute: togglePhysics
        });
      }
    }

    // Performance Commands - only register if spine instance exists
    if (spineInstance) {
      commandRegistry.register({
        id: 'performance.show-benchmark',
        title: t('commands.performance.showBenchmark'),
        category: 'performance',
        description: t('commands.performance.showBenchmarkDescription'),
        keywords: [t('commands.keywords.performance'), t('commands.keywords.benchmark'), t('commands.keywords.info'), t('commands.keywords.stats'), t('commands.keywords.show')],
        execute: () => setShowBenchmark(true)
      });
    }

    // Navigation Commands
    commandRegistry.register({
      id: 'help.documentation',
      title: t('commands.help.documentation'),
      category: 'performance',
      description: t('commands.help.documentationDescription'),
      keywords: [t('commands.keywords.help'), t('commands.keywords.documentation'), t('commands.keywords.readme'), t('commands.keywords.github')],
      execute: openGitHubReadme
    });

    commandRegistry.register({
      id: 'language.change',
      title: t('language.changeLanguage'),
      category: 'language',
      description: t('language.changeLanguageDescription'),
      keywords: [
        t('commands.keywords.language'),
        t('commands.keywords.switch'),
        'change',
        'modal'
      ],
      execute: () => setShowLanguageModal(true)
    });

    // Cleanup function to unregister commands
    return () => {
      const commandIds = [
        'animation.play-pause',
        'animation.stop',
        'animation.restart',
        'debug.toggle-bones',
        'debug.toggle-meshes',
        'debug.toggle-regions',
        'debug.toggle-bounding-boxes',
        'debug.toggle-paths',
        'debug.toggle-clipping',
        'debug.toggle-ik-constraints',
        'debug.toggle-transform-constraints',
        'debug.toggle-path-constraints',
        'debug.toggle-physics-constraints',
        'debug.show-all',
        'debug.hide-all',
        'debug.show-mesh',
        'debug.hide-mesh',
        'debug.show-ik',
        'debug.hide-ik',
        'debug.show-physics',
        'debug.hide-physics',
        'performance.show-benchmark',
        'help.documentation',
        'language.change'
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
    setShowBenchmark,
    openGitHubReadme,
    setShowLanguageModal,
    meshesVisible,
    physicsVisible,
    ikVisible,
    toggleMeshes,
    togglePhysics,
    toggleIk,
    getCameraContainer,
    t
  ]);
}