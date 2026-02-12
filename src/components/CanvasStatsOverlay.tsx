import React from 'react';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { useCanvasStats } from '../hooks/useCanvasStats';

interface CanvasStatsOverlayProps {
  spineInstance: Spine | null;
}

export const CanvasStatsOverlay: React.FC<CanvasStatsOverlayProps> = ({ spineInstance }) => {
  const stats = useCanvasStats(spineInstance);

  if (!spineInstance) return null;

  return (
    <div className="canvas-stats-overlay">
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">FPS</span>
        <span className="canvas-stats-value">{stats.fps}</span>
      </span>
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">DC</span>
        <span className="canvas-stats-value">{stats.drawCalls}</span>
      </span>
      <span className="canvas-stats-item">
        <span className="canvas-stats-label">TX</span>
        <span className="canvas-stats-value">{stats.textures}</span>
      </span>
    </div>
  );
};
