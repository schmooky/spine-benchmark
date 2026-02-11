import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useDrawCallInspector } from '../hooks/useDrawCallInspector';
import { useAtlasData } from '../hooks/useAtlasData';
import { reparentPixiCanvas } from '../hooks/usePixiApp';

function getStatColor(value: number, low: number, high: number): string {
  if (value <= low) return '#34D399';
  if (value <= high) return '#FBBF24';
  return '#F87171';
}

export function AtlasRepackRouteView() {
  const { t } = useTranslation();
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const {
    spineInstance,
    urlLoadStatus,
    isAnyLoading,
    loadingMessage,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    pixiContainerRef,
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

  const snapshot = useDrawCallInspector(spineInstance);
  const atlasData = useAtlasData(spineInstance);

  // Build set of problematic attachment names from DC breaks
  const problematicNames = useMemo(() => {
    const names = new Set<string>();
    for (const slot of snapshot.slots) {
      if (slot.isBreak) {
        names.add(slot.attachmentName);
      }
    }
    return names;
  }, [snapshot.slots]);

  const totalRegions = useMemo(
    () => atlasData.pages.reduce((sum, p) => sum + p.regions.length, 0),
    [atlasData.pages],
  );

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

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

      <div className="atlas-repack-layout">
        {/* Left panel — atlas page images with region overlays */}
        <div className="atlas-repack-panel">
          {spineInstance && atlasData.pages.length > 0 ? (
            <>
              <div className="atlas-repack-summary">
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(atlasData.pages.length, 2, 5) } as React.CSSProperties}
                  >
                    {atlasData.pages.length}
                  </span>
                  <span className="dc-inspector-stat-label">{t('atlasRepack.summary.pages')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value">
                    {totalRegions}
                  </span>
                  <span className="dc-inspector-stat-label">{t('atlasRepack.summary.regions')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.drawCallCount, 3, 8) } as React.CSSProperties}
                  >
                    {snapshot.drawCallCount}
                  </span>
                  <span className="dc-inspector-stat-label">{t('atlasRepack.summary.drawCalls')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.pageBreaks, 1, 4) } as React.CSSProperties}
                  >
                    {snapshot.pageBreaks}
                  </span>
                  <span className="dc-inspector-stat-label">{t('atlasRepack.summary.pageBreaks')}</span>
                </div>
              </div>

              <div className="atlas-repack-pages">
                {atlasData.pages.map((page) => (
                  <div key={page.name} className="atlas-repack-page">
                    <div className="atlas-repack-page-header">
                      <span className="atlas-repack-page-title">
                        {t('atlasRepack.page.title', { name: page.name, width: page.width, height: page.height })}
                      </span>
                      <span className="atlas-repack-page-count">
                        {t('atlasRepack.page.regionCount', { count: page.regions.length })}
                      </span>
                    </div>
                    <div className="atlas-repack-page-view">
                      {page.imageSrc ? (
                        <img
                          className="atlas-repack-page-img"
                          src={page.imageSrc}
                          alt={page.name}
                          draggable={false}
                        />
                      ) : (
                        <div
                          className="atlas-repack-page-placeholder"
                          style={{ paddingBottom: `${(page.height / page.width) * 100}%` }}
                        />
                      )}
                      {page.regions.map((region) => {
                        const isProblematic = problematicNames.has(region.name);
                        const scaleX = 100 / page.width;
                        const scaleY = 100 / page.height;
                        return (
                          <div
                            key={`${region.name}-${region.x}-${region.y}`}
                            className={`atlas-repack-region${isProblematic ? ' problematic' : ''}`}
                            style={{
                              left: `${region.x * scaleX}%`,
                              top: `${region.y * scaleY}%`,
                              width: `${region.width * scaleX}%`,
                              height: `${region.height * scaleY}%`,
                            }}
                            title={isProblematic ? `${region.name} — ${t('atlasRepack.region.problematic')}` : region.name}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="atlas-repack-empty">
              <h3>{t('atlasRepack.empty.title')}</h3>
              <p>{t('atlasRepack.empty.hint')}</p>
            </div>
          )}
        </div>

        {/* Right side — canvas + animation controls */}
        <div className="atlas-repack-canvas">
          <div
            className="canvas-container"
            data-tour="canvas-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div ref={pixiContainerRef} className="pixi-host" />
            <div className="canvas-grid-overlay" />

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
