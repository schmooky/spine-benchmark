import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { commandRegistry } from '../utils/commandRegistry';
import i18n from '../i18n';

interface UseCommandRegistrationProps {
  spineInstance: any;
  showBenchmark: boolean;
  setShowBenchmark: (show: boolean) => void;
  openGitHubReadme: () => void;
  setShowLanguageModal: (show: boolean) => void;
}

export function useCommandRegistration({
  spineInstance,
  showBenchmark,
  setShowBenchmark,
  openGitHubReadme,
  setShowLanguageModal
}: UseCommandRegistrationProps) {
  const { t } = useTranslation();
  
  useEffect(() => {
    // Animation Commands
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

      // Register skin commands dynamically
      const skins = spineInstance.skeleton.data.skins;
      skins.forEach((skin: any) => {
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

    // Language Commands - single command to open modal
    console.log('🔧 Registering language command with translations:', {
      title: t('language.changeLanguage'),
      description: t('language.changeLanguageDescription'),
      keywords: [
        t('commands.keywords.language'),
        t('commands.keywords.switch'),
        'change',
        'modal'
      ]
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
      execute: () => {
        console.log('🌐 Language command executed - opening modal');
        setShowLanguageModal(true);
      }
    });
    
    console.log('✅ Language command registered successfully');

    // Cleanup function to unregister commands
    return () => {
      const commandIds = [
        'animation.play-pause',
        'animation.stop',
        'animation.restart',
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
    showBenchmark,
    setShowBenchmark,
    openGitHubReadme,
    setShowLanguageModal,
    t
  ]);
}