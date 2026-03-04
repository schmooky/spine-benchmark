import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useDrawCallInspector, LiveSlotInfo } from '../hooks/useDrawCallInspector';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { getStatColor } from '../core/utils/colorUtils';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import {
  MetricExplainerModal,
  MetricInsightModel,
  MetricInsightPopout,
  RouteJumpStrip,
  RouteStateCallout,
} from '../components/insights/MetricInsightTools';

const PAGE_COLORS = [
  '#2DD4A8', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA',
  '#34D399', '#FB923C', '#22D3EE', '#F87171', '#818CF8',
];

function getPageColor(pageName: string, colorMap: Map<string, string>): string {
  if (colorMap.has(pageName)) return colorMap.get(pageName)!;
  const color = PAGE_COLORS[colorMap.size % PAGE_COLORS.length];
  colorMap.set(pageName, color);
  return color;
}

function getActiveSlot(
  snapshot: ReturnType<typeof useDrawCallInspector>,
  selectedSlotIndex: number | null,
  hoveredSlotIndex: number | null,
): LiveSlotInfo | null {
  const pinned = selectedSlotIndex !== null
    ? snapshot.slots.find((slot) => slot.index === selectedSlotIndex) ?? null
    : null;
  if (pinned) return pinned;
  return hoveredSlotIndex !== null
    ? snapshot.slots.find((slot) => slot.index === hoveredSlotIndex) ?? null
    : null;
}

export function DrawCallInspectorRouteView() {
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
    loadStoredAsset,
    loadCurrentAssetIntoBenchmark,
    setSlotHighlight,
    routeSelection,
    setRouteSelection,
    lastLoadError,
    clearLastLoadError,
    loadFromUrls,
    uploadBundleFiles,
  } = useWorkbench();

  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [hideInvisible, setHideInvisible] = useState(false);
  const [atlasPageFilter, setAtlasPageFilter] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  }, [pixiContainerRef]);

  useEffect(() => {
    return () => {
      setSlotHighlight(null);
    };
  }, [setSlotHighlight]);

  const snapshot = useDrawCallInspector(spineInstance);

  useEffect(() => {
    setSelectedSlotIndex(null);
    setHoveredSlotIndex(null);
    setSlotHighlight(null);
    setAtlasPageFilter(null);
  }, [spineInstance, setSlotHighlight]);

  useEffect(() => {
    if (!spineInstance || selectedSlotIndex !== null) return;

    let persisted: LiveSlotInfo | undefined;

    if (routeSelection.slotIndex !== null) {
      persisted = snapshot.slots.find((slot) => slot.index === routeSelection.slotIndex);
    }

    if (!persisted && routeSelection.attachmentName) {
      persisted =
        snapshot.slots.find(
          (slot) =>
            slot.attachmentName === routeSelection.attachmentName &&
            (!routeSelection.slotName || slot.slotName === routeSelection.slotName),
        ) ??
        snapshot.slots.find((slot) => slot.attachmentName === routeSelection.attachmentName);
    }

    if (!persisted && routeSelection.slotName) {
      persisted = snapshot.slots.find((slot) => slot.slotName === routeSelection.slotName);
    }

    if (!persisted) return;

    setSelectedSlotIndex(persisted.index);
    setSlotHighlight(persisted.index);
  }, [
    spineInstance,
    selectedSlotIndex,
    routeSelection.updatedAt,
    routeSelection.slotIndex,
    routeSelection.slotName,
    routeSelection.attachmentName,
    snapshot.slots,
    setSlotHighlight,
  ]);

  const displaySlots = useMemo(() => {
    let filtered = hideInvisible ? snapshot.slots.filter((slot) => !slot.isInvisible) : snapshot.slots;
    if (atlasPageFilter) {
      filtered = filtered.filter((slot) => slot.atlasPage === atlasPageFilter);
    }
    return filtered;
  }, [snapshot.slots, hideInvisible, atlasPageFilter]);

  const pageColorMap = useMemo(() => {
    const map = new Map<string, string>();
    displaySlots.forEach((slot) => getPageColor(slot.atlasPage, map));
    return map;
  }, [displaySlots]);

  const activeSlot = getActiveSlot(snapshot, selectedSlotIndex, hoveredSlotIndex);
  const hasUnknownPages = snapshot.slots.some((slot) => slot.atlasPage === 'unknown');
  const isPartialParse = !!spineInstance && snapshot.slots.length > 0 && hasUnknownPages;
  const hasEmptyData = !!spineInstance && snapshot.slots.length === 0;

  const jumpChips = useMemo(() => [
    {
      id: 'draw-route',
      label: t('ui.routeJumps.drawCalls'),
      active: true,
      onSelect: () => {},
    },
    {
      id: 'mesh-route',
      label: t('ui.routeJumps.mesh'),
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/mesh-optimizer' });
      },
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

  const handleSlotClick = useCallback((slot: LiveSlotInfo) => {
    if (selectedSlotIndex === slot.index) {
      setSelectedSlotIndex(null);
      setSlotHighlight(null);
      return;
    }
    setSelectedSlotIndex(slot.index);
    setSlotHighlight(slot.index);
    setRouteSelection({
      sourceRoute: 'draw-call-inspector',
      slotIndex: slot.index,
      slotName: slot.slotName,
      attachmentName: slot.attachmentName,
      atlasPage: slot.atlasPage,
      updatedAt: Date.now(),
    });
  }, [selectedSlotIndex, setSlotHighlight, setRouteSelection]);

  const closeInsight = useCallback(() => {
    setHoveredSlotIndex(null);
    setSelectedSlotIndex(null);
    setSlotHighlight(null);
    setShowExplainer(false);
  }, [setSlotHighlight]);

  const pinActiveInsight = useCallback(() => {
    if (!activeSlot) return;
    setSelectedSlotIndex(activeSlot.index);
    setSlotHighlight(activeSlot.index);
  }, [activeSlot, setSlotHighlight]);

  const drawInsight = useMemo<MetricInsightModel | null>(() => {
    if (!activeSlot) return null;

    const expectedBreakDelta = activeSlot.isBreak ? '-1' : '0';
    const expectedCallDelta = activeSlot.isBreak ? '-1' : '0';
    const expectedVertexDrop = activeSlot.blendMode !== 'Normal' ? '-8%' : '-4%';

    return {
      id: `draw-${activeSlot.index}`,
      title: t('drawCallInspector.insight.title', { index: activeSlot.index, attachment: activeSlot.attachmentName }),
      subtitle: t('drawCallInspector.insight.subtitle', { atlasPage: activeSlot.atlasPage, blendMode: activeSlot.blendMode }),
      sample: t('drawCallInspector.insight.sample', { slotName: activeSlot.slotName }),
      metrics: [
        {
          id: 'draw-calls',
          label: t('drawCallInspector.insight.metrics.drawCalls.label'),
          value: `${snapshot.drawCallCount}`,
          note: t('drawCallInspector.insight.metrics.drawCalls.note'),
          tone: snapshot.drawCallCount > 8 ? 'warning' : 'positive',
        },
        {
          id: 'page-breaks',
          label: t('drawCallInspector.insight.metrics.pageBreaks.label'),
          value: `${snapshot.pageBreaks}`,
          note: activeSlot.isBreak
            ? t('drawCallInspector.insight.metrics.pageBreaks.breakNote')
            : t('drawCallInspector.insight.metrics.pageBreaks.stableNote'),
          tone: activeSlot.isBreak ? 'danger' : 'positive',
        },
        {
          id: 'blend-breaks',
          label: t('drawCallInspector.insight.metrics.blendBreaks.label'),
          value: `${snapshot.blendBreaks}`,
          note: activeSlot.blendMode === 'Normal'
            ? t('drawCallInspector.insight.metrics.blendBreaks.normalNote')
            : t('drawCallInspector.insight.metrics.blendBreaks.riskNote'),
          tone: activeSlot.blendMode === 'Normal' ? 'neutral' : 'warning',
        },
      ],
      quickActions: [
        {
          id: 'filter-page',
          label: t('drawCallInspector.insight.quickActions.filterPage.label', { page: activeSlot.atlasPage }),
          impact: t('drawCallInspector.insight.quickActions.filterPage.impact'),
          onRun: () => {
            setAtlasPageFilter(activeSlot.atlasPage);
          },
        },
        {
          id: 'isolate-slot',
          label: t('drawCallInspector.insight.quickActions.isolate.label'),
          impact: t('drawCallInspector.insight.quickActions.isolate.impact'),
          onRun: () => {
            setSelectedSlotIndex(activeSlot.index);
            setSlotHighlight(activeSlot.index);
          },
        },
        {
          id: 'atlas-suggest',
          label: t('drawCallInspector.insight.quickActions.atlasSuggestion.label'),
          impact: t('drawCallInspector.insight.quickActions.atlasSuggestion.impact'),
          onRun: () => {
            setRouteSelection({
              sourceRoute: 'draw-call-inspector',
              slotIndex: activeSlot.index,
              slotName: activeSlot.slotName,
              attachmentName: activeSlot.attachmentName,
              atlasPage: activeSlot.atlasPage,
              updatedAt: Date.now(),
            });
            void navigate({ to: '/tools/atlas-repack' });
          },
        },
      ],
      proofBlocks: [
        {
          id: 'calls',
          label: t('ui.insights.proof.calls'),
          delta: expectedCallDelta,
          tone: activeSlot.isBreak ? 'positive' : 'neutral',
        },
        { id: 'verts', label: t('ui.insights.proof.verts'), delta: expectedVertexDrop, tone: 'info' },
        {
          id: 'breaks',
          label: t('ui.insights.proof.breaks'),
          delta: expectedBreakDelta,
          tone: activeSlot.isBreak ? 'positive' : 'neutral',
        },
      ],
      jumpChips: [
        {
          id: 'jump-draw',
          label: t('ui.routeJumps.drawCalls'),
          active: true,
          onJump: () => {},
        },
        {
          id: 'jump-mesh',
          label: t('ui.routeJumps.mesh'),
          onJump: () => {
            void navigate({ to: '/tools/mesh-optimizer' });
          },
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
        what: t('drawCallInspector.insight.explainer.what', {
          attachment: activeSlot.attachmentName,
          atlasPage: activeSlot.atlasPage,
          blendMode: activeSlot.blendMode,
        }),
        whyNow: activeSlot.isBreak
          ? t('drawCallInspector.insight.explainer.whyNowBreak')
          : t('drawCallInspector.insight.explainer.whyNowStable'),
        howToFix: t('drawCallInspector.insight.explainer.howToFix'),
        howToVerify: t('drawCallInspector.insight.explainer.howToVerify'),
      },
    };
  }, [activeSlot, snapshot.drawCallCount, snapshot.pageBreaks, snapshot.blendBreaks, navigate, setRouteSelection, setSlotHighlight, t]);

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

  const showFallback = !spineInstance || hasEmptyData || !!lastLoadError;

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.drawCallInspector')}
        subtitle={t('drawCallInspector.subtitle')}
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

      <div className="dc-inspector-layout with-side-insight">
        <div className="tool-panel dc-inspector-panel">
          <RouteJumpStrip chips={jumpChips} selectionHint={selectionHint} />

          {lastLoadError && (
            <RouteStateCallout
              kind="error"
              title={t('drawCallInspector.states.loadError.title')}
              description={lastLoadError}
              actions={[
                { id: 'retry', label: t('drawCallInspector.states.loadError.actions.retry'), onClick: () => void handleLoadSelected(), variant: 'primary' },
                { id: 'dismiss', label: t('drawCallInspector.states.loadError.actions.dismiss'), onClick: clearLastLoadError, variant: 'secondary' },
              ]}
            />
          )}

          {!lastLoadError && isAnyLoading && (
            <RouteStateCallout
              kind="loading"
              title={t('drawCallInspector.states.loading.title')}
              description={t('drawCallInspector.states.loading.description')}
            />
          )}

          {!showFallback && (
            <>
              <div className="tool-summary">
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.drawCallCount, 3, 8) } as React.CSSProperties}
                  >
                    {snapshot.drawCallCount}
                  </span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.drawCalls')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.flushCount, 3, 8) } as React.CSSProperties}
                  >
                    {snapshot.flushCount}
                  </span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.flushes')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.pageBreaks, 1, 4) } as React.CSSProperties}
                  >
                    {snapshot.pageBreaks}
                  </span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.pageBreaks')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span
                    className="dc-inspector-stat-value"
                    style={{ '--dc-stat-color': getStatColor(snapshot.blendBreaks, 0, 2) } as React.CSSProperties}
                  >
                    {snapshot.blendBreaks}
                  </span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.blendBreaks')}</span>
                </div>
              </div>

              {activeSlot && (
                <p className="subtle-text">
                  {t('drawCallInspector.list.headers.attachment')}: <strong>{activeSlot.attachmentName}</strong>
                </p>
              )}

              {isPartialParse && (
                <RouteStateCallout
                  kind="partial"
                  title={t('drawCallInspector.states.partial.title')}
                  description={t('drawCallInspector.states.partial.description')}
                  actions={[
                    {
                      id: 'partial-reload',
                      label: t('drawCallInspector.states.partial.actions.reloadSelectedAsset'),
                      onClick: () => void handleLoadSelected(),
                      variant: 'secondary',
                    },
                  ]}
                />
              )}

              <div className="dc-inspector-filter-row">
                <label className="dc-inspector-toggle">
                  <input
                    type="checkbox"
                    checked={hideInvisible}
                    onChange={(event) => setHideInvisible(event.target.checked)}
                  />
                  {t('drawCallInspector.hideInvisible')}
                </label>
                {atlasPageFilter && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setAtlasPageFilter(null)}
                  >
                    {t('drawCallInspector.actions.clearPageFilter')}
                  </button>
                )}
              </div>

              <div className="dc-inspector-list-header">
                <span className="dc-inspector-row-index">{t('drawCallInspector.list.headers.index')}</span>
                <span className="dc-inspector-row-attachment">{t('drawCallInspector.list.headers.attachment')}</span>
                <span className="dc-inspector-row-page">{t('drawCallInspector.list.headers.page')}</span>
                <span className="dc-inspector-row-blend">{t('drawCallInspector.list.headers.blend')}</span>
              </div>

              <div className="dc-inspector-list">
                {displaySlots.map((slot: LiveSlotInfo) => (
                  <button
                    key={`${slot.index}-${slot.slotName}`}
                    type="button"
                    className={`dc-inspector-row${slot.isBreak ? ' break' : ''}${selectedSlotIndex === slot.index ? ' selected' : ''}${slot.isInvisible ? ' invisible' : ''}`}
                    onMouseEnter={() => setHoveredSlotIndex(slot.index)}
                    onMouseLeave={() => setHoveredSlotIndex((current) => (current === slot.index ? null : current))}
                    onFocus={() => setHoveredSlotIndex(slot.index)}
                    onBlur={() => setHoveredSlotIndex((current) => (current === slot.index ? null : current))}
                    onClick={() => handleSlotClick(slot)}
                    aria-pressed={selectedSlotIndex === slot.index}
                  >
                    <span className="dc-inspector-row-index">{slot.index}</span>
                    <span className="dc-inspector-row-attachment" title={`${slot.slotName} → ${slot.attachmentName}`}>
                      {slot.attachmentName}
                    </span>
                    <span
                      className="dc-inspector-row-page"
                      style={{ '--page-color': pageColorMap.get(slot.atlasPage) ?? PAGE_COLORS[0] } as React.CSSProperties}
                    >
                      {slot.atlasPage}
                    </span>
                    <span className={`dc-inspector-row-blend ${slot.blendMode !== 'Normal' ? 'non-normal' : ''}`}>
                      {slot.blendMode}
                    </span>
                  </button>
                ))}
              </div>

            </>
          )}

          {!lastLoadError && !isAnyLoading && !spineInstance && (
            <RouteStateCallout
              kind="empty"
              title={t('drawCallInspector.empty.title')}
              description={t('drawCallInspector.empty.hint')}
              actions={[
                { id: 'load-selected', label: t('toolRouteControls.actions.loadSelected'), onClick: () => void handleLoadSelected(), variant: 'primary' },
              ]}
            />
          )}

          {!lastLoadError && !isAnyLoading && spineInstance && hasEmptyData && (
            <RouteStateCallout
              kind="partial"
              title={t('drawCallInspector.states.noDrawableRows.title')}
              description={t('drawCallInspector.states.noDrawableRows.description')}
              actions={[
                {
                  id: 'reload-empty',
                  label: t('drawCallInspector.states.partial.actions.reloadSelectedAsset'),
                  onClick: () => void handleLoadSelected(),
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
            {drawInsight ? (
              <MetricInsightPopout
                insight={drawInsight}
                isPinned={selectedSlotIndex !== null}
                onPin={pinActiveInsight}
                onUnpin={closeInsight}
                onOpenExplainer={() => setShowExplainer(true)}
                onRequestClose={closeInsight}
              />
            ) : (
              <div className="tool-info-empty">
                <h3>{t('drawCallInspector.infoPanel.emptyTitle')}</h3>
                <p>{t('drawCallInspector.infoPanel.emptyDescription')}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <MetricExplainerModal
        isOpen={showExplainer}
        insight={drawInsight}
        onClose={() => setShowExplainer(false)}
      />
    </div>
  );
}
