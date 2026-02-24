import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { useMeshInspector, captureMeshData, MeshSlotInfo } from '../hooks/useMeshInspector';
import { useDrawCallInspector } from '../hooks/useDrawCallInspector';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { assetToFiles } from '../core/storage/assetStore';
import { optimizeJson, OptimizationReport } from '../core/meshOptimizer';
import { renderMeshPreview, MeshPreviewResult } from '../core/meshPreviewRenderer';
import { getStatColor } from '../core/utils/colorUtils';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import {
  MetricExplainerModal,
  MetricInsightModel,
  MetricInsightPopout,
  RouteJumpStrip,
  RouteStateCallout,
} from '../components/insights/MetricInsightTools';

type MeshFilterMode = 'all' | 'deformed' | 'weighted';

function getActiveMesh(
  snapshot: ReturnType<typeof useMeshInspector>,
  selectedMeshIndex: number | null,
  hoveredMeshIndex: number | null,
): MeshSlotInfo | null {
  const pinned = selectedMeshIndex !== null
    ? snapshot.meshes.find((mesh) => mesh.index === selectedMeshIndex) ?? null
    : null;
  if (pinned) return pinned;
  return hoveredMeshIndex !== null
    ? snapshot.meshes.find((mesh) => mesh.index === hoveredMeshIndex) ?? null
    : null;
}

export function MeshOptimizerRouteView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    loadStoredAsset,
    loadCurrentAssetIntoBenchmark,
    toggleMeshes,
    saveAndLoadOptimizedAsset,
    setHighlightedMeshSlot,
    routeSelection,
    setRouteSelection,
    lastLoadError,
    clearLastLoadError,
    loadFromUrls,
    uploadBundleFiles,
  } = useWorkbench();

  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [optimizedFiles, setOptimizedFiles] = useState<File[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeshIndex, setSelectedMeshIndex] = useState<number | null>(null);
  const [hoveredMeshIndex, setHoveredMeshIndex] = useState<number | null>(null);
  const [meshPreview, setMeshPreview] = useState<MeshPreviewResult | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);
  const [filterMode, setFilterMode] = useState<MeshFilterMode>('all');

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  useEffect(() => {
    toggleMeshes(true);
    return () => {
      toggleMeshes(false);
      setHighlightedMeshSlot(null);
    };
  }, [toggleMeshes, setHighlightedMeshSlot]);

  useEffect(() => {
    setReport(null);
    setOptimizedFiles(null);
    setError(null);
    setSelectedMeshIndex(null);
    setHoveredMeshIndex(null);
    setMeshPreview(null);
    setHighlightedMeshSlot(null);
    setFilterMode('all');
  }, [selectedAssetId, setHighlightedMeshSlot]);

  const snapshot = useMeshInspector(spineInstance);
  const drawSnapshot = useDrawCallInspector(spineInstance);
  const activeMesh = getActiveMesh(snapshot, selectedMeshIndex, hoveredMeshIndex);

  const atlasPageBySlotIndex = useMemo(() => {
    const map = new Map<number, string>();
    drawSnapshot.slots.forEach((slot) => map.set(slot.index, slot.atlasPage));
    return map;
  }, [drawSnapshot.slots]);

  useEffect(() => {
    if (!spineInstance || selectedMeshIndex !== null || routeSelection.slotIndex === null) return;
    const persisted = snapshot.meshes.find((mesh) => mesh.index === routeSelection.slotIndex);
    if (!persisted) return;
    setSelectedMeshIndex(persisted.index);
    setHighlightedMeshSlot(persisted.slotName);
  }, [spineInstance, selectedMeshIndex, routeSelection.slotIndex, snapshot.meshes, setHighlightedMeshSlot]);

  const displayedMeshes = useMemo(() => {
    switch (filterMode) {
      case 'deformed':
        return snapshot.meshes.filter((mesh) => mesh.isDeformed);
      case 'weighted':
        return snapshot.meshes.filter((mesh) => mesh.boneCount > 0);
      default:
        return snapshot.meshes;
    }
  }, [snapshot.meshes, filterMode]);

  const jsonFile = useMemo(() => {
    if (!selectedAsset) return null;
    return selectedAsset.files.find((file) => file.name.endsWith('.json')) ?? null;
  }, [selectedAsset]);

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
      clearLastLoadError();
    } finally {
      setIsLoadingSelected(false);
    }
  };

  const handlePickAsset = async (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    setIsLoadingSelected(true);
    try {
      setSelectedAssetId(assetId);
      await loadStoredAsset(asset);
      clearLastLoadError();
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
      const fileIndex = files.findIndex((file) => file.name === jsonFile.name);
      if (fileIndex >= 0) {
        const optimizedBlob = new TextEncoder().encode(result.optimizedText);
        files[fileIndex] = new File([optimizedBlob], jsonFile.name, { type: 'application/json' });
      }
      setOptimizedFiles(files);
      setReport(result.report);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
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
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsSaving(false);
    }
  };

  const activateMesh = useCallback((mesh: MeshSlotInfo) => {
    if (selectedMeshIndex === mesh.index) {
      setSelectedMeshIndex(null);
      setHoveredMeshIndex(null);
      setMeshPreview(null);
      setHighlightedMeshSlot(null);
      return;
    }

    setSelectedMeshIndex(mesh.index);
    setHighlightedMeshSlot(mesh.slotName);
    setRouteSelection({
      sourceRoute: 'mesh-optimizer',
      slotIndex: mesh.index,
      slotName: mesh.slotName,
      attachmentName: mesh.attachmentName,
      atlasPage: atlasPageBySlotIndex.get(mesh.index) ?? null,
      updatedAt: Date.now(),
    });

    if (!spineInstance) return;
    const data = captureMeshData(spineInstance, mesh.index);
    if (!data) {
      setMeshPreview(null);
      return;
    }
    setMeshPreview(renderMeshPreview(data));
  }, [selectedMeshIndex, setHighlightedMeshSlot, setRouteSelection, atlasPageBySlotIndex, spineInstance]);

  const closeInsight = useCallback(() => {
    setHoveredMeshIndex(null);
    setSelectedMeshIndex(null);
    setMeshPreview(null);
    setHighlightedMeshSlot(null);
    setShowExplainer(false);
  }, [setHighlightedMeshSlot]);

  const pinActiveInsight = useCallback(() => {
    if (!activeMesh) return;
    void activateMesh(activeMesh);
  }, [activeMesh, activateMesh]);

  const jumpChips = useMemo(() => [
    {
      id: 'draw-route',
      label: 'Draw Calls',
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/draw-call-inspector' });
      },
    },
    {
      id: 'mesh-route',
      label: 'Mesh',
      active: true,
      onSelect: () => {},
    },
    {
      id: 'atlas-route',
      label: 'Atlas',
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/atlas-repack' });
      },
    },
  ], [navigate]);

  const selectionHint = routeSelection.attachmentName
    ? `Selection retained: ${routeSelection.attachmentName}`
    : 'Selection retained across Draw, Mesh, and Atlas routes.';

  const meshInsight = useMemo<MetricInsightModel | null>(() => {
    if (!activeMesh) return null;
    const atlasPage = atlasPageBySlotIndex.get(activeMesh.index) ?? 'unknown';
    const vertexDropPercent = Math.min(30, Math.max(8, Math.round(activeMesh.vertexCount * 0.08)));
    const expectedCallDelta = activeMesh.boneCount > 0 ? '-1' : '0';
    const expectedBreakDelta = atlasPage === 'unknown' ? '-0' : '-1';

    return {
      id: `mesh-${activeMesh.index}`,
      title: `Mesh #${activeMesh.index}: ${activeMesh.attachmentName}`,
      subtitle: `${atlasPage} • ${activeMesh.slotName}`,
      sample: `${activeMesh.slotName} is now driving this explainer. Hover previews, click to pin, and Esc closes.`,
      metrics: [
        {
          id: 'vertices',
          label: 'Vertices',
          value: `${activeMesh.vertexCount}`,
          note: activeMesh.vertexCount > 180 ? 'High vertex density for this mesh.' : 'Vertex density is moderate.',
          tone: activeMesh.vertexCount > 180 ? 'warning' : 'positive',
        },
        {
          id: 'triangles',
          label: 'Triangles',
          value: `${activeMesh.triangleCount}`,
          note: activeMesh.triangleCount > 120 ? 'Consider reduction where silhouette allows.' : 'Triangle count is stable.',
          tone: activeMesh.triangleCount > 120 ? 'warning' : 'neutral',
        },
        {
          id: 'weights',
          label: 'Weights',
          value: `${activeMesh.boneCount > 0 ? activeMesh.boneCount : 0}`,
          note: activeMesh.boneCount > 0 ? 'Weighted mesh can increase update cost.' : 'Unweighted mesh.',
          tone: activeMesh.boneCount > 0 ? 'info' : 'neutral',
        },
      ],
      quickActions: [
        {
          id: 'filter-deformed',
          label: 'Fix now: filter deformed meshes',
          impact: 'Expected impact: isolate expensive deformation tracks.',
          onRun: () => {
            setFilterMode('deformed');
          },
        },
        {
          id: 'isolate-mesh',
          label: 'Fix now: isolate selected mesh',
          impact: 'Expected impact: immediate canvas confirmation of highlighted mesh.',
          onRun: () => {
            setSelectedMeshIndex(activeMesh.index);
            setHighlightedMeshSlot(activeMesh.slotName);
          },
        },
        {
          id: 'atlas-grouping',
          label: 'Fix now: send atlas grouping hint',
          impact: 'Expected impact: reduced page transitions near this mesh.',
          onRun: () => {
            setRouteSelection({
              sourceRoute: 'mesh-optimizer',
              slotIndex: activeMesh.index,
              slotName: activeMesh.slotName,
              attachmentName: activeMesh.attachmentName,
              atlasPage,
              updatedAt: Date.now(),
            });
            void navigate({ to: '/tools/atlas-repack' });
          },
        },
      ],
      proofBlocks: [
        { id: 'proof-calls', label: 'calls', delta: expectedCallDelta, tone: 'positive' },
        { id: 'proof-verts', label: 'verts', delta: `-${vertexDropPercent}%`, tone: 'info' },
        { id: 'proof-breaks', label: 'breaks', delta: expectedBreakDelta, tone: 'positive' },
      ],
      jumpChips: [
        {
          id: 'jump-draw',
          label: 'Draw Calls',
          onJump: () => {
            void navigate({ to: '/tools/draw-call-inspector' });
          },
        },
        {
          id: 'jump-mesh',
          label: 'Mesh',
          active: true,
          onJump: () => {},
        },
        {
          id: 'jump-atlas',
          label: 'Atlas',
          onJump: () => {
            void navigate({ to: '/tools/atlas-repack' });
          },
        },
      ],
      explainer: {
        what: `This mesh uses ${activeMesh.vertexCount} vertices and ${activeMesh.triangleCount} triangles on atlas page "${atlasPage}".`,
        whyNow: activeMesh.vertexCount > 180
          ? 'Vertex count is high enough to create avoidable cost spikes on dense animation frames.'
          : 'Optimization headroom exists and can help stabilize worst-case playback.',
        howToFix: 'Reduce overclustered regions, trim hidden deformation keys, and simplify weighted areas where fidelity is not visible.',
        howToVerify: 'Run optimization preview, compare proof cards, and confirm visual quality in the highlighted mesh overlay.',
      },
    };
  }, [activeMesh, atlasPageBySlotIndex, navigate, setHighlightedMeshSlot, setRouteSelection]);

  const selectedMesh = selectedMeshIndex !== null
    ? snapshot.meshes.find((mesh) => mesh.index === selectedMeshIndex)
    : null;

  const hasNoChanges =
    report !== null &&
    report.removedEmptyDeforms === 0 &&
    report.removedDuplicateFrames === 0 &&
    report.removedDrawOrderDuplicates === 0;

  const showFallback = !spineInstance || snapshot.meshes.length === 0 || !!lastLoadError;

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.meshOptimizer')}
        subtitle="Clean deforms, reduce weighted mesh cost, and reload instantly."
      />
      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        onUploadBundle={uploadBundleFiles}
        onPickAsset={handlePickAsset}
        onLoadFromUrl={loadFromUrls}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="mesh-inspector-layout with-side-insight">
        <div className="tool-panel mesh-inspector-panel">
          <RouteJumpStrip chips={jumpChips} selectionHint={selectionHint} />

          {lastLoadError && (
            <RouteStateCallout
              kind="error"
              title="Could not load current asset"
              description={lastLoadError}
              actions={[
                { id: 'retry-load', label: 'Retry load', onClick: () => void handleLoadSelected(), variant: 'primary' },
                { id: 'dismiss-error', label: 'Dismiss', onClick: clearLastLoadError, variant: 'secondary' },
              ]}
            />
          )}

          {!lastLoadError && isAnyLoading && (
            <RouteStateCallout
              kind="loading"
              title="Loading mesh metrics"
              description="Scanning mesh attachments, vertices, and deformation ranges."
            />
          )}

          {!showFallback && (
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

              <div className="mesh-inspector-filter-row">
                <button
                  type="button"
                  className={`route-jump-chip${filterMode === 'all' ? ' active' : ''}`}
                  onClick={() => setFilterMode('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`route-jump-chip${filterMode === 'deformed' ? ' active' : ''}`}
                  onClick={() => setFilterMode('deformed')}
                >
                  Deformed
                </button>
                <button
                  type="button"
                  className={`route-jump-chip${filterMode === 'weighted' ? ' active' : ''}`}
                  onClick={() => setFilterMode('weighted')}
                >
                  Weighted
                </button>
              </div>

              {!jsonFile && (
                <RouteStateCallout
                  kind="partial"
                  title="Partial parse: no JSON source"
                  description="Optimization actions are limited because this asset has no JSON skeleton file."
                />
              )}

              <div className="mesh-inspector-list-header">
                <span className="mesh-inspector-row-index">{t('meshOptimizer.list.headers.index')}</span>
                <span className="mesh-inspector-row-name">{t('meshOptimizer.list.headers.attachment')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.vertices')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.triangles')}</span>
                <span className="mesh-inspector-row-stat">{t('meshOptimizer.list.headers.bones')}</span>
              </div>

              <div className="mesh-inspector-list">
                {displayedMeshes.map((mesh) => (
                  <button
                    key={`${mesh.index}-${mesh.slotName}`}
                    type="button"
                    className={`mesh-inspector-row${mesh.isDeformed ? ' deformed' : ''}${selectedMeshIndex === mesh.index ? ' selected' : ''}`}
                    title={mesh.isDeformed ? t('meshOptimizer.row.deformed') : undefined}
                    onMouseEnter={() => setHoveredMeshIndex(mesh.index)}
                    onMouseLeave={() => setHoveredMeshIndex((current) => (current === mesh.index ? null : current))}
                    onFocus={() => setHoveredMeshIndex(mesh.index)}
                    onBlur={() => setHoveredMeshIndex((current) => (current === mesh.index ? null : current))}
                    onClick={() => activateMesh(mesh)}
                    aria-pressed={selectedMeshIndex === mesh.index}
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
                  </button>
                ))}
              </div>

              {meshPreview && selectedMesh && (
                <div className="mesh-inspector-preview">
                  <div className="mesh-inspector-preview-header">
                    <span>{selectedMesh.attachmentName}</span>
                    <button
                      type="button"
                      className="mesh-inspector-preview-close"
                      onClick={() => {
                        setSelectedMeshIndex(null);
                        setMeshPreview(null);
                        setHighlightedMeshSlot(null);
                      }}
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
                      meshPreview.problems.map((problem) => (
                        <span
                          key={problem.type}
                          className={`mesh-inspector-problem-badge ${problem.type}`}
                        >
                          {problem.type === 'overclustered'
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
            </>
          )}

          {!lastLoadError && !isAnyLoading && !spineInstance && (
            <RouteStateCallout
              kind="empty"
              title={t('meshOptimizer.empty.title')}
              description={t('meshOptimizer.empty.hint')}
              actions={[
                { id: 'mesh-load-selected', label: t('toolRouteControls.actions.loadSelected'), onClick: () => void handleLoadSelected(), variant: 'primary' },
              ]}
            />
          )}

          {!lastLoadError && !isAnyLoading && spineInstance && snapshot.meshes.length === 0 && (
            <RouteStateCallout
              kind="partial"
              title="No mesh attachments detected"
              description="This skeleton currently has no mesh attachments in draw order. You can still inspect Draw Calls and Atlas routes."
              actions={[
                {
                  id: 'jump-draw',
                  label: 'Open Draw Calls',
                  onClick: () => {
                    void navigate({ to: '/tools/draw-call-inspector' });
                  },
                  variant: 'secondary',
                },
              ]}
            />
          )}
        </div>

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

        <aside className="tool-info-panel">
          <div className="tool-info-scroll">
            {meshInsight ? (
              <MetricInsightPopout
                insight={meshInsight}
                isPinned={selectedMeshIndex !== null}
                onPin={pinActiveInsight}
                onUnpin={closeInsight}
                onOpenExplainer={() => setShowExplainer(true)}
                onRequestClose={closeInsight}
              />
            ) : (
              <div className="tool-info-empty">
                <h3>Select a mesh row</h3>
                <p>Hover or click a mesh to inspect details here while keeping the mesh list fully visible.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <MetricExplainerModal
        isOpen={showExplainer}
        insight={meshInsight}
        onClose={() => setShowExplainer(false)}
      />
    </div>
  );
}
