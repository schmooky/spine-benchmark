import React from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { useTranslation } from 'react-i18next';
import { useCanvasStats } from '../hooks/useCanvasStats';

interface CanvasStatsOverlayProps {
  spineInstance: Spine | null;
}

export const CanvasStatsOverlay: React.FC<CanvasStatsOverlayProps> = ({ spineInstance }) => {
  const { t } = useTranslation();
  const stats = useCanvasStats(spineInstance);

  if (!spineInstance) return null;

  return (
    <div className="canvas-stats-overlay">
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">{t('ui.canvasStats.fps')}</span>
        <span className="canvas-stats-value">{stats.fps}</span>
      </span>
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">{t('ui.canvasStats.drawCalls')}</span>
        <span className="canvas-stats-value">{stats.drawCalls}</span>
      </span>
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">{t('ui.canvasStats.flushes')}</span>
        <span className="canvas-stats-value">{stats.flushes}</span>
      </span>
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">{t('ui.canvasStats.textures')}</span>
        <span className="canvas-stats-value">{stats.textures}</span>
      </span>
    </div>
  );
};
