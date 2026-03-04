import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CogIcon, XMarkIcon } from '../components/Icons';
import {
  MetricExplainerModal,
  MetricInsightModel,
  MetricInsightPopout,
  RouteJumpStrip,
  RouteStateCallout,
} from '../components/insights/MetricInsightTools';

type MeshFilterMode = 'all' | 'deformed' | 'weighted';
const DEFAULT_HIGHLIGHT_COLOR = '#2dd4a8';
const DEFAULT_HIGHLIGHT_WIDTH = 1;

function hexToPixiColor(hexColor: string): number {
  const normalized = hexColor.replace('#', '');
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : 0x2dd4a8;
}

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
    setSlotHighlight,
    setMeshHighlightStyle,
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
  const [showHighlightMenu, setShowHighlightMenu] = useState(false);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [highlightLineWidth, setHighlightLineWidth] = useState(DEFAULT_HIGHLIGHT_WIDTH);
  const highlightControlsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  }, [pixiContainerRef]);

  useEffect(() => {
    toggleMeshes(true);
    return () => {
      toggleMeshes(false);
      setHighlightedMeshSlot(null);
      setSlotHighlight(null);
    };
  }, [toggleMeshes, setHighlightedMeshSlot, setSlotHighlight]);

  useEffect(() => {
    setMeshHighlightStyle({
      color: hexToPixiColor(highlightColor),
      lineWidth: highlightLineWidth,
    });
  }, [highlightColor, highlightLineWidth, setMeshHighlightStyle]);

  useEffect(() => {
    return () => {
      setMeshHighlightStyle({
        color: hexToPixiColor(DEFAULT_HIGHLIGHT_COLOR),
        lineWidth: DEFAULT_HIGHLIGHT_WIDTH,
      });
    };
  }, [setMeshHighlightStyle]);

  useEffect(() => {
    if (!showHighlightMenu) return;

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (
        highlightControlsRef.current &&
        event.target instanceof Node &&
        !highlightControlsRef.current.contains(event.target)
      ) {
        setShowHighlightMenu(false);
      }
    };

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHighlightMenu(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [showHighlightMenu]);

  useEffect(() => {
    setReport(null);
    setOptimizedFiles(null);
    setError(null);
    setSelectedMeshIndex(null);
    setHoveredMeshIndex(null);
    setMeshPreview(null);
    setHighlightedMeshSlot(null);
    setSlotHighlight(null);
    setFilterMode('all');
  }, [selectedAssetId, setHighlightedMeshSlot, setSlotHighlight]);

  const snapshot = useMeshInspector(spineInstance);
  const drawSnapshot = useDrawCallInspector(spineInstance);
  const activeMesh = getActiveMesh(snapshot, selectedMeshIndex, hoveredMeshIndex);

  const atlasPageBySlotIndex = useMemo(() => {
    const map = new Map<number, string>();
    drawSnapshot.slots.forEach((slot) => map.set(slot.index, slot.atlasPage));
    return map;
  }, [drawSnapshot.slots]);

  useEffect(() => {
    if (!spineInstance || selectedMeshIndex !== null) return;

    let persisted: MeshSlotInfo | undefined;

    if (routeSelection.slotIndex !== null) {
      persisted = snapshot.meshes.find((mesh) => mesh.index === routeSelection.slotIndex);
    }

    if (!persisted && routeSelection.attachmentName) {
      persisted =
        snapshot.meshes.find(
          (mesh) =>
            mesh.attachmentName === routeSelection.attachmentName &&
            (!routeSelection.slotName || mesh.slotName === routeSelection.slotName),
        ) ??
        snapshot.meshes.find((mesh) => mesh.attachmentName === routeSelection.attachmentName);
    }

    if (!persisted && routeSelection.slotName) {
      persisted = snapshot.meshes.find((mesh) => mesh.slotName === routeSelection.slotName);
    }

    if (!persisted) return;

    setSelectedMeshIndex(persisted.index);
    setHighlightedMeshSlot(persisted.slotName);
    setSlotHighlight(persisted.index);

    const data = captureMeshData(spineInstance, persisted.index);
    setMeshPreview(data ? renderMeshPreview(data) : null);
  }, [
    spineInstance,
    selectedMeshIndex,
    routeSelection.updatedAt,
    routeSelection.slotIndex,
    routeSelection.slotName,
    routeSelection.attachmentName,
    snapshot.meshes,
    setHighlightedMeshSlot,
    setSlotHighlight,
  ]);

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
      setSlotHighlight(null);
      return;
    }

    setSelectedMeshIndex(mesh.index);
    setHighlightedMeshSlot(mesh.slotName);
    setSlotHighlight(mesh.index);
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
  }, [selectedMeshIndex, setHighlightedMeshSlot, setSlotHighlight, setRouteSelection, atlasPageBySlotIndex, spineInstance]);

  const closeInsight = useCallback(() => {
    setHoveredMeshIndex(null);
    setSelectedMeshIndex(null);
    setMeshPreview(null);
    setHighlightedMeshSlot(null);
    setSlotHighlight(null);
    setShowExplainer(false);
  }, [setHighlightedMeshSlot, setSlotHighlight]);

  const pinActiveInsight = useCallback(() => {
    if (!activeMesh) return;
    void activateMesh(activeMesh);
  }, [activeMesh, activateMesh]);

  const jumpChips = useMemo(() => [
    {
      id: 'draw-route',
      label: t('ui.routeJumps.drawCalls'),
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/draw-call-inspector' });
      },
    },
    {
      id: 'mesh-route',
      label: t('ui.routeJumps.mesh'),
      active: true,
      onSelect: () => {},
    },
    {
      id: 'atlas-route',
      label: t('ui.routeJumps.atlas'),
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/atlas-repack' });
      },
    },
  ], [navigate, t]);

  const selectionHint = routeSelection.attachmentName
    ? t('ui.routeJumps.selectionRetainedNamed', { name: routeSelection.attachmentName })
    : t('ui.routeJumps.selectionRetained');

  const meshInsight = useMemo<MetricInsightModel | null>(() => {
    if (!activeMesh) return null;
    const atlasPage = atlasPageBySlotIndex.get(activeMesh.index) ?? 'unknown';
    const vertexDropPercent = Math.min(30, Math.max(8, Math.round(activeMesh.vertexCount * 0.08)));
    const expectedCallDelta = activeMesh.boneCount > 0 ? '-1' : '0';
    const expectedBreakDelta = atlasPage === 'unknown' ? '-0' : '-1';

    return {
      id: `mesh-${activeMesh.index}`,
      title: t('meshOptimizer.insight.title', { index: activeMesh.index, attachment: activeMesh.attachmentName }),
      subtitle: t('meshOptimizer.insight.subtitle', { atlasPage, slotName: activeMesh.slotName }),
      sample: t('meshOptimizer.insight.sample', { slotName: activeMesh.slotName }),
      metrics: [
        {
          id: 'vertices',
          label: t('meshOptimizer.insight.metrics.vertices.label'),
          value: `${activeMesh.vertexCount}`,
          note: activeMesh.vertexCount > 180
            ? t('meshOptimizer.insight.metrics.vertices.highNote')
            : t('meshOptimizer.insight.metrics.vertices.moderateNote'),
          tone: activeMesh.vertexCount > 180 ? 'warning' : 'positive',
        },
        {
          id: 'triangles',
          label: t('meshOptimizer.insight.metrics.triangles.label'),
          value: `${activeMesh.triangleCount}`,
          note: activeMesh.triangleCount > 120
            ? t('meshOptimizer.insight.metrics.triangles.highNote')
            : t('meshOptimizer.insight.metrics.triangles.stableNote'),
          tone: activeMesh.triangleCount > 120 ? 'warning' : 'neutral',
        },
        {
          id: 'weights',
          label: t('meshOptimizer.insight.metrics.weights.label'),
          value: `${activeMesh.boneCount > 0 ? activeMesh.boneCount : 0}`,
          note: activeMesh.boneCount > 0
            ? t('meshOptimizer.insight.metrics.weights.weightedNote')
            : t('meshOptimizer.insight.metrics.weights.unweightedNote'),
          tone: activeMesh.boneCount > 0 ? 'info' : 'neutral',
        },
      ],
      quickActions: [
        {
          id: 'filter-deformed',
          label: t('meshOptimizer.insight.quickActions.filterDeformed.label'),
          impact: t('meshOptimizer.insight.quickActions.filterDeformed.impact'),
          onRun: () => {
            setFilterMode('deformed');
          },
        },
        {
          id: 'isolate-mesh',
          label: t('meshOptimizer.insight.quickActions.isolateMesh.label'),
          impact: t('meshOptimizer.insight.quickActions.isolateMesh.impact'),
          onRun: () => {
            setSelectedMeshIndex(activeMesh.index);
            setHighlightedMeshSlot(activeMesh.slotName);
            setSlotHighlight(activeMesh.index);
          },
        },
        {
          id: 'atlas-grouping',
          label: t('meshOptimizer.insight.quickActions.sendAtlasHint.label'),
          impact: t('meshOptimizer.insight.quickActions.sendAtlasHint.impact'),
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
        { id: 'proof-calls', label: t('ui.insights.proof.calls'), delta: expectedCallDelta, tone: 'positive' },
        { id: 'proof-verts', label: t('ui.insights.proof.verts'), delta: `-${vertexDropPercent}%`, tone: 'info' },
        { id: 'proof-breaks', label: t('ui.insights.proof.breaks'), delta: expectedBreakDelta, tone: 'positive' },
      ],
      jumpChips: [
        {
          id: 'jump-draw',
          label: t('ui.routeJumps.drawCalls'),
          onJump: () => {
            void navigate({ to: '/tools/draw-call-inspector' });
          },
        },
        {
          id: 'jump-mesh',
          label: t('ui.routeJumps.mesh'),
          active: true,
          onJump: () => {},
        },
        {
          id: 'jump-atlas',
          label: t('ui.routeJumps.atlas'),
          onJump: () => {
            void navigate({ to: '/tools/atlas-repack' });
          },
        },
      ],
      explainer: {
        what: t('meshOptimizer.insight.explainer.what', {
          vertices: activeMesh.vertexCount,
          triangles: activeMesh.triangleCount,
          atlasPage,
        }),
        whyNow: activeMesh.vertexCount > 180
          ? t('meshOptimizer.insight.explainer.whyNowHigh')
          : t('meshOptimizer.insight.explainer.whyNowHeadroom'),
        howToFix: t('meshOptimizer.insight.explainer.howToFix'),
        howToVerify: t('meshOptimizer.insight.explainer.howToVerify'),
      },
    };
  }, [activeMesh, atlasPageBySlotIndex, navigate, setHighlightedMeshSlot, setSlotHighlight, setRouteSelection, t]);

  const selectedMesh = selectedMeshIndex !== null
    ? snapshot.meshes.find((mesh) => mesh.index === selectedMeshIndex)
    : null;

  const hasNoChanges = report !== null && report.changedAnimations === 0;

  const showFallback = !spineInstance || snapshot.meshes.length === 0 || !!lastLoadError;

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.meshOptimizer')}
        subtitle={t('meshOptimizer.subtitle')}
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
              title={t('meshOptimizer.states.loadError.title')}
              description={lastLoadError}
              actions={[
                {
                  id: 'retry-load',
                  label: t('meshOptimizer.states.loadError.actions.retry'),
                  onClick: () => void handleLoadSelected(),
                  variant: 'primary',
                },
                {
                  id: 'dismiss-error',
                  label: t('meshOptimizer.states.loadError.actions.dismiss'),
                  onClick: clearLastLoadError,
                  variant: 'secondary',
                },
              ]}
            />
          )}

          {!lastLoadError && isAnyLoading && (
            <RouteStateCallout
              kind="loading"
              title={t('meshOptimizer.states.loading.title')}
              description={t('meshOptimizer.states.loading.description')}
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
                  {t('meshOptimizer.filters.all')}
                </button>
                <button
                  type="button"
                  className={`route-jump-chip${filterMode === 'deformed' ? ' active' : ''}`}
                  onClick={() => setFilterMode('deformed')}
                >
                  {t('meshOptimizer.filters.deformed')}
                </button>
                <button
                  type="button"
                  className={`route-jump-chip${filterMode === 'weighted' ? ' active' : ''}`}
                  onClick={() => setFilterMode('weighted')}
                >
                  {t('meshOptimizer.filters.weighted')}
                </button>
                <div className="mesh-highlight-controls" ref={highlightControlsRef}>
                  <button
                    type="button"
                    className={`route-jump-chip mesh-highlight-config-trigger${showHighlightMenu ? ' active' : ''}`}
                    onClick={() => setShowHighlightMenu((open) => !open)}
                  >
                    <CogIcon size={12} />
                    <span>{t('meshOptimizer.highlightControls.button')}</span>
                  </button>
                  {showHighlightMenu && (
                    <div className="mesh-highlight-config-menu">
                      <label className="mesh-highlight-config-row">
                        <span>{t('meshOptimizer.highlightControls.color')}</span>
                        <input
                          className="mesh-highlight-color-input"
                          type="color"
                          value={highlightColor}
                          onChange={(event) => setHighlightColor(event.target.value)}
                        />
                      </label>
                      <label className="mesh-highlight-config-row">
                        <span>
                          {t('meshOptimizer.highlightControls.lineWidth')}: {t('meshOptimizer.highlightControls.lineWidthValue', {
                            value: highlightLineWidth.toFixed(0),
                          })}
                        </span>
                        <input
                          className="mesh-highlight-width-slider"
                          type="range"
                          min={1}
                          max={6}
                          step={1}
                          value={highlightLineWidth}
                          onChange={(event) => setHighlightLineWidth(Number.parseFloat(event.target.value))}
                        />
                      </label>
                      <div className="mesh-highlight-config-footnote">
                        {t('meshOptimizer.highlightControls.pixelLine')}
                      </div>
                      <button
                        type="button"
                        className="secondary-btn mesh-highlight-reset-btn"
                        onClick={() => {
                          setHighlightColor(DEFAULT_HIGHLIGHT_COLOR);
                          setHighlightLineWidth(DEFAULT_HIGHLIGHT_WIDTH);
                        }}
                      >
                        {t('meshOptimizer.highlightControls.reset')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!jsonFile && (
                <RouteStateCallout
                  kind="partial"
                  title={t('meshOptimizer.states.partialNoJson.title')}
                  description={t('meshOptimizer.states.partialNoJson.description')}
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
                        setSlotHighlight(null);
                      }}
                    >
                      <XMarkIcon size={14} />
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
                      <span>{t('meshOptimizer.preview.deformMagnitudeValue', { value: meshPreview.maxDeformPx.toFixed(1) })}</span>
                    </div>
                    <div className="mesh-inspector-preview-stat-row">
                      <span>{t('meshOptimizer.preview.pixelArea')}</span>
                      <span>{t('meshOptimizer.preview.pixelAreaValue', { value: Math.round(meshPreview.meshPixelArea) })}</span>
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
              title={t('meshOptimizer.states.noMeshes.title')}
              description={t('meshOptimizer.states.noMeshes.description')}
              actions={[
                {
                  id: 'jump-draw',
                  label: t('meshOptimizer.states.noMeshes.actions.openDrawCalls'),
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
                <h3>{t('meshOptimizer.infoPanel.emptyTitle')}</h3>
                <p>{t('meshOptimizer.infoPanel.emptyDescription')}</p>
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
