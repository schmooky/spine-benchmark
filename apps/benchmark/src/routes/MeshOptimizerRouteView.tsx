import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { useMeshInspector, captureMeshData } from '../hooks/useMeshInspector';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { assetToFiles } from '../core/storage/assetStore';
import { optimizeJson, OptimizationReport } from '../core/meshOptimizer';
import { renderMeshPreview, MeshPreviewResult } from '../core/meshPreviewRenderer';
import { getStatColor } from '../core/utils/colorUtils';

export function MeshOptimizerRouteView() {
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
    selectedAsset,
    loadCurrentAssetIntoBenchmark,
    toggleMeshes,
    meshesVisible,
    saveAndLoadOptimizedAsset,
    setHighlightedMeshSlot,
  } = useWorkbench();

  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [optimizedFiles, setOptimizedFiles] = useState<File[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeshIndex, setSelectedMeshIndex] = useState<number | null>(null);
  const [meshPreview, setMeshPreview] = useState<MeshPreviewResult | null>(null);

  // Re-parent the singleton PIXI canvas into this route's pixi-host div
  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  // Enable mesh debug overlay on mount, disable on unmount
  useEffect(() => {
    toggleMeshes(true);
    return () => {
      toggleMeshes(false);
      setHighlightedMeshSlot(null);
    };
  }, [toggleMeshes, setHighlightedMeshSlot]);

  // Reset optimization state when selected asset changes
  useEffect(() => {
    setReport(null);
    setOptimizedFiles(null);
    setError(null);
    setSelectedMeshIndex(null);
    setMeshPreview(null);
    setHighlightedMeshSlot(null);
  }, [selectedAssetId, setHighlightedMeshSlot]);

  const snapshot = useMeshInspector(spineInstance);

  const jsonFile = useMemo(() => {
    if (!selectedAsset) return null;
    return selectedAsset.files.find((f) => f.name.endsWith('.json')) ?? null;
  }, [selectedAsset]);

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

  const handleOptimize = () => {
    if (!selectedAsset || !jsonFile) {
      setError(t('meshOptimizer.optimize.noJson'));
      return;
    }

    try {
      const rawText = new TextDecoder().decode(jsonFile.buffer);
      const result = optimizeJson(rawText);

      const files = assetToFiles(selectedAsset);
      const fileIndex = files.findIndex((f) => f.name === jsonFile.name);
      if (fileIndex >= 0) {
        const optimizedBlob = new TextEncoder().encode(result.optimizedText);
        files[fileIndex] = new File([optimizedBlob], jsonFile.name, { type: 'application/json' });
      }

      setOptimizedFiles(files);
      setReport(result.report);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOptimizedFiles(null);
      setReport(null);
    }
  };

  const handleSaveAndLoad = async () => {
    if (!optimizedFiles || !selectedAsset || !report) return;
    setIsSaving(true);
    try {
      const newName = `${selectedAsset.name} (Optimized)`;
      const description = t('meshOptimizer.optimize.description', {
        emptyDeforms: report.removedEmptyDeforms,
        duplicateFrames: report.removedDuplicateFrames,
        drawOrderDuplicates: report.removedDrawOrderDuplicates,
      });
      await saveAndLoadOptimizedAsset(optimizedFiles, newName, description);
      setReport(null);
      setOptimizedFiles(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMeshRowClick = useCallback(
    (slotIndex: number, slotName: string) => {
      if (selectedMeshIndex === slotIndex) {
        setSelectedMeshIndex(null);
        setMeshPreview(null);
        setHighlightedMeshSlot(null);
        return;
      }
      if (!spineInstance) return;
      const data = captureMeshData(spineInstance, slotIndex);
      if (!data) return;
      const result = renderMeshPreview(data);
      setSelectedMeshIndex(slotIndex);
      setMeshPreview(result);
      setHighlightedMeshSlot(slotName);
    },
    [spineInstance, selectedMeshIndex, setHighlightedMeshSlot],
  );

  const selectedMesh = selectedMeshIndex !== null
    ? snapshot.meshes.find((m) => m.index === selectedMeshIndex)
    : null;

  const hasNoChanges =
    report !== null &&
    report.removedEmptyDeforms === 0 &&
    report.removedDuplicateFrames === 0 &&
    report.removedDrawOrderDuplicates === 0;

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

      <div className="mesh-inspector-layout">
        {/* Left panel — mesh list with stats */}
        <div className="tool-panel mesh-inspector-panel">
          {spineInstance && snapshot.meshes.length > 0 ? (
            <>
              <div className="tool-summary">
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.totalMeshes, 5, 15) } as React.CSSProperties}
                  >
                    {snapshot.totalMeshes}
                  </span>
                  <span className="dc-inspector-stat-label">{t('meshOptimizer.summary.meshes')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.totalVertices, 200, 800) } as React.CSSProperties}
                  >
                    {snapshot.totalVertices}
                  </span>
                  <span className="dc-inspector-stat-label">{t('meshOptimizer.summary.vertices')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.totalTriangles, 150, 600) } as React.CSSProperties}
                  >
                    {snapshot.totalTriangles}
                  </span>
                  <span className="dc-inspector-stat-label">{t('meshOptimizer.summary.triangles')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.weightedCount, 3, 10) } as React.CSSProperties}
                  >
                    {snapshot.weightedCount}
                  </span>
                  <span className="dc-inspector-stat-label">{t('meshOptimizer.summary.weighted')}</span>
                </div>
              </div>

              <div className="mesh-inspector-list-header">
                <span className="mesh-inspector-row-index">{t('meshOptimizer.list.headers.index')}</span>
                <span className="mesh-inspector-row-name">{t('meshOptimizer.list.headers.attachment')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.vertices')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.triangles')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.bones')}</span>
              </div>

              <div className="mesh-inspector-list">
                {snapshot.meshes.map((mesh) => (
                  <div
                    key={`${mesh.index}-${mesh.slotName}`}
                    className={`mesh-inspector-row${mesh.isDeformed ? ' deformed' : ''}${selectedMeshIndex === mesh.index ? ' selected' : ''}`}
                    title={mesh.isDeformed ? t('meshOptimizer.row.deformed') : undefined}
                    onClick={() => handleMeshRowClick(mesh.index, mesh.slotName)}
                  >
                    <span className="mesh-inspector-row-index">{mesh.index}</span>
                    <span className="mesh-inspector-row-name" title={`${mesh.slotName} → ${mesh.attachmentName}`}>
                      {mesh.attachmentName}
                    </span>
                    <span className="mesh-inspector-row-stat">{mesh.vertexCount}</span>
                    <span className="mesh-inspector-row-stat">{mesh.triangleCount}</span>
                    <span className={`mesh-inspector-row-stat${mesh.boneCount > 0 ? ' weighted' : ''}`}>
                      {mesh.boneCount > 0 ? mesh.boneCount : '-'}
                    </span>
                  </div>
                ))}
              </div>
              {meshPreview && selectedMesh && (
                <div className="mesh-inspector-preview">
                  <div className="mesh-inspector-preview-header">
                    <span>{selectedMesh.attachmentName}</span>
                    <button
                      type="button"
                      className="mesh-inspector-preview-close"
                      onClick={() => { setSelectedMeshIndex(null); setMeshPreview(null); setHighlightedMeshSlot(null); }}
                    >
                      &times;
                    </button>
                  </div>
                  <div className="mesh-inspector-preview-hint">
                    {t('meshOptimizer.preview.liveHint')}
                  </div>
                  <div className="mesh-inspector-preview-badges">
                    {meshPreview.problems.length === 0 ? (
                      <span className="mesh-inspector-problem-badge ok">
                        {t('meshOptimizer.preview.noProblems')}
                      </span>
                    ) : (
                      meshPreview.problems.map((p) => (
                        <span
                          key={p.type}
                          className={`mesh-inspector-problem-badge ${p.type}`}
                        >
                          {p.type === 'overclustered'
                            ? t('meshOptimizer.preview.overclustered')
                            : t('meshOptimizer.preview.invisibleDeform')}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mesh-inspector-preview-stats">
                    <div className="mesh-inspector-preview-stat-row">
                      <span>{t('meshOptimizer.preview.density')}</span>
                      <span>{(meshPreview.densityScore * 100).toFixed(1)}%</span>
                    </div>
                    <div className="mesh-inspector-preview-stat-row">
                      <span>{t('meshOptimizer.preview.deformMagnitude')}</span>
                      <span>{meshPreview.maxDeformPx.toFixed(1)} px</span>
                    </div>
                    <div className="mesh-inspector-preview-stat-row">
                      <span>{t('meshOptimizer.preview.pixelArea')}</span>
                      <span>{Math.round(meshPreview.meshPixelArea)} px&sup2;</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="tool-empty">
              <h3>{t('meshOptimizer.empty.title')}</h3>
              <p>{t('meshOptimizer.empty.hint')}</p>
            </div>
          )}

          {/* Optimize footer */}
          <div className="mesh-inspector-footer">
            <button
              className="primary-btn"
              type="button"
              onClick={handleOptimize}
              disabled={!selectedAsset || !jsonFile}
              title={!jsonFile ? t('meshOptimizer.optimize.noJson') : undefined}
            >
              {t('meshOptimizer.optimize.button')}
            </button>

            {error && <p className="error-text">{error}</p>}

            {report && (
              <div className="mesh-inspector-report">
                <h4>{t('meshOptimizer.optimize.report.title')}</h4>
                <div className="mesh-inspector-report-row">
                  <span>{t('meshOptimizer.optimize.report.animationsScanned')}</span>
                  <span>{report.animationCount}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('meshOptimizer.optimize.report.animationsChanged')}</span>
                  <span>{report.changedAnimations}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('meshOptimizer.optimize.report.emptyDeforms')}</span>
                  <span>{report.removedEmptyDeforms}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('meshOptimizer.optimize.report.duplicateFrames')}</span>
                  <span>{report.removedDuplicateFrames}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('meshOptimizer.optimize.report.drawOrderDuplicates')}</span>
                  <span>{report.removedDrawOrderDuplicates}</span>
                </div>
                {hasNoChanges && (
                  <p className="subtle-text">{t('meshOptimizer.optimize.report.noChanges')}</p>
                )}
              </div>
            )}

            {optimizedFiles && (
              <button
                className="secondary-btn"
                type="button"
                onClick={handleSaveAndLoad}
                disabled={isSaving}
              >
                {isSaving ? t('meshOptimizer.optimize.saving') : t('meshOptimizer.optimize.saveAndLoad')}
              </button>
            )}
          </div>
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
