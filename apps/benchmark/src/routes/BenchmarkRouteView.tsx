import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { getStatColor } from '../core/utils/colorUtils';
import { worstRenderingImpact, worstComputationalImpact } from '../core/utils/scoreCalculator';

// Analysis components
import { Summary } from '../components/analysis/Summary';
import { MeshAnalysis } from '../components/analysis/MeshAnalysis';
import { ClippingAnalysis } from '../components/analysis/ClippingAnalysis';
import { BlendModeAnalysis } from '../components/analysis/BlendModeAnalysis';
import { PhysicsAnalysis } from '../components/analysis/PhysicsAnalysis';
import { SkeletonTree } from '../components/analysis/SkeletonTree';

export function BenchmarkRouteView() {
  const { t } = useTranslation();
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const {
    spineInstance,
    benchmarkData,
    urlLoadStatus,
    isAnyLoading,
    loadingMessage,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    pixiContainerRef,
    pixelFootprint,
    assets,
    selectedAssetId,
    setSelectedAssetId,
    loadCurrentAssetIntoBenchmark,
  } = useWorkbench();

  // Re-parent the singleton PIXI canvas into this route's pixi-host div
  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

  // Compute impact stats
  const rendering = benchmarkData && benchmarkData.animations.length > 0
    ? worstRenderingImpact(benchmarkData.animations)
    : null;
  const computational = benchmarkData && benchmarkData.animations.length > 0
    ? worstComputationalImpact(benchmarkData.animations)
    : null;

  return (
    <>
      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        onLoadSelected={handleLoadSelected}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="benchmark-inspector-layout">
        {/* Left panel — stats + all analysis sections */}
        <div className="tool-panel">
          {benchmarkData ? (
            <>
              <div className="tool-summary">
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': rendering?.color ?? 'var(--sb-accent)' } as React.CSSProperties}
                  >
                    {rendering ? Math.round(rendering.cost) : '–'}
                  </span>
                  <span className="dc-inspector-stat-label">RI</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': computational?.color ?? 'var(--sb-accent)' } as React.CSSProperties}
                  >
                    {computational ? Math.round(computational.cost) : '–'}
                  </span>
                  <span className="dc-inspector-stat-label">CI</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(benchmarkData.skeleton.metrics.totalBones, 30, 80) } as React.CSSProperties}
                  >
                    {benchmarkData.skeleton.metrics.totalBones}
                  </span>
                  <span className="dc-inspector-stat-label">{t('infoPanel.stats.bones')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(benchmarkData.totalAnimations, 10, 30) } as React.CSSProperties}
                  >
                    {benchmarkData.totalAnimations}
                  </span>
                  <span className="dc-inspector-stat-label">{t('infoPanel.stats.anims')}</span>
                </div>
              </div>

              <div className="benchmark-sidebar-content">
                <Summary data={benchmarkData} />
                <hr className="benchmark-section-divider" />
                <MeshAnalysis data={benchmarkData} />
                <hr className="benchmark-section-divider" />
                <ClippingAnalysis data={benchmarkData} />
                <hr className="benchmark-section-divider" />
                <BlendModeAnalysis data={benchmarkData} />
                <hr className="benchmark-section-divider" />
                <PhysicsAnalysis data={benchmarkData} />
                <hr className="benchmark-section-divider" />
                <SkeletonTree data={benchmarkData} />
              </div>
            </>
          ) : (
            <div className="tool-empty">
              <h3>{t('benchmark.empty.title')}</h3>
              <p>{t('benchmark.empty.hint')}</p>
            </div>
          )}
        </div>

        {/* Right side — canvas + animation controls */}
        <div className="tool-canvas">
          <div
            className="canvas-container"
            data-tour="canvas-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div ref={pixiContainerRef} className="pixi-host" />
            <div className="canvas-grid-overlay" />
            <CanvasStatsOverlay spineInstance={spineInstance} />
            {pixelFootprint && (
              <div className="pixel-footprint-overlay">
                <span>{t('dashboard.workspace.pixelFootprint', { width: pixelFootprint.width, height: pixelFootprint.height })}</span>
                <strong>{t('dashboard.workspace.canvasCoverage', { coverage: pixelFootprint.coverage })}</strong>
              </div>
            )}

            {!spineInstance && urlLoadStatus !== 'loading' && (
              <div className="drop-area">
                <p>{t('dashboard.workspace.dropArea')}</p>
              </div>
            )}

            {isAnyLoading && (
              <div className="loading-indicator">
                <p>{loadingMessage}</p>
              </div>
            )}
          </div>

          <div className={`controls-container ${spineInstance ? 'visible' : 'hidden'}`}>
            {spineInstance && <AnimationControls spineInstance={spineInstance} />}
          </div>
        </div>
      </div>
    </>
  );
}
