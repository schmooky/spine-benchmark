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
    loadCurrentAssetIntoBenchmark,
    setSlotHighlight,
    routeSelection,
    setRouteSelection,
    lastLoadError,
    clearLastLoadError,
    setShowUrlModal,
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
  });

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
    if (!spineInstance || selectedSlotIndex !== null || routeSelection.slotIndex === null) return;
    const persisted = snapshot.slots.find((slot) => slot.index === routeSelection.slotIndex);
    if (!persisted) return;
    setSelectedSlotIndex(persisted.index);
    setSlotHighlight(persisted.index);
  }, [spineInstance, selectedSlotIndex, routeSelection.slotIndex, snapshot.slots, setSlotHighlight]);

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
      label: 'Draw Calls',
      active: true,
      onSelect: () => {},
    },
    {
      id: 'mesh-route',
      label: 'Mesh',
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/mesh-optimizer' });
      },
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
      title: `Slot #${activeSlot.index}: ${activeSlot.attachmentName}`,
      subtitle: `${activeSlot.atlasPage} • ${activeSlot.blendMode}`,
      sample: `${activeSlot.slotName} is now driving this explainer. Hover previews, click to pin, and Esc closes.`,
      metrics: [
        {
          id: 'draw-calls',
          label: 'Draw Calls',
          value: `${snapshot.drawCallCount}`,
          note: 'Total calls in current draw order',
          tone: snapshot.drawCallCount > 8 ? 'warning' : 'positive',
        },
        {
          id: 'page-breaks',
          label: 'Page Breaks',
          value: `${snapshot.pageBreaks}`,
          note: activeSlot.isBreak ? 'Current row introduces a break' : 'Current row keeps batching stable',
          tone: activeSlot.isBreak ? 'danger' : 'positive',
        },
        {
          id: 'blend-breaks',
          label: 'Blend Breaks',
          value: `${snapshot.blendBreaks}`,
          note: activeSlot.blendMode === 'Normal' ? 'Normal blend batching path' : 'Non-normal blend mode split risk',
          tone: activeSlot.blendMode === 'Normal' ? 'neutral' : 'warning',
        },
      ],
      quickActions: [
        {
          id: 'filter-page',
          label: `Fix now: filter page ${activeSlot.atlasPage}`,
          impact: 'Expected impact: isolate contiguous runs to reveal merge opportunities.',
          onRun: () => {
            setAtlasPageFilter(activeSlot.atlasPage);
          },
        },
        {
          id: 'isolate-slot',
          label: 'Fix now: isolate selected draw call',
          impact: 'Expected impact: immediate visual verification on canvas.',
          onRun: () => {
            setSelectedSlotIndex(activeSlot.index);
            setSlotHighlight(activeSlot.index);
          },
        },
        {
          id: 'atlas-suggest',
          label: 'Fix now: atlas grouping suggestion',
          impact: 'Expected impact: reduce page transitions with grouped pack targets.',
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
        { id: 'calls', label: 'calls', delta: expectedCallDelta, tone: activeSlot.isBreak ? 'positive' : 'neutral' },
        { id: 'verts', label: 'verts', delta: expectedVertexDrop, tone: 'info' },
        { id: 'breaks', label: 'breaks', delta: expectedBreakDelta, tone: activeSlot.isBreak ? 'positive' : 'neutral' },
      ],
      jumpChips: [
        {
          id: 'jump-draw',
          label: 'Draw Calls',
          active: true,
          onJump: () => {},
        },
        {
          id: 'jump-mesh',
          label: 'Mesh',
          onJump: () => {
            void navigate({ to: '/tools/mesh-optimizer' });
          },
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
        what: `This row draws "${activeSlot.attachmentName}" from "${activeSlot.atlasPage}" with "${activeSlot.blendMode}" blend.`,
        whyNow: activeSlot.isBreak
          ? 'It currently causes a batch break, so the frame is paying an extra draw call.'
          : 'It is part of a stable batch, so changes here should preserve existing ordering and blend behavior.',
        howToFix: 'Group adjacent regions onto the same atlas page and normalize blend mode where artist intent allows. Keep draw order blocks contiguous for shared materials.',
        howToVerify: 'Re-run this route and confirm lower page/blend break counts. Keep the selected row pinned and compare before/after proof cards.',
      },
    };
  }, [activeSlot, snapshot.drawCallCount, snapshot.pageBreaks, snapshot.blendBreaks, navigate, setRouteSelection, setSlotHighlight]);

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
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
        subtitle="Find slot ordering and blend/page breaks that increase draw calls."
      />
      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        onUploadBundle={uploadBundleFiles}
        onLoadSelected={handleLoadSelected}
        isLoadingSelected={isLoadingSelected}
        onOpenUrl={() => setShowUrlModal(true)}
      />

      <div className="dc-inspector-layout">
        <div className="tool-panel dc-inspector-panel">
          <RouteJumpStrip chips={jumpChips} selectionHint={selectionHint} />

          {lastLoadError && (
            <RouteStateCallout
              kind="error"
              title="Could not load current asset"
              description={lastLoadError}
              actions={[
                { id: 'retry', label: 'Retry load', onClick: () => void handleLoadSelected(), variant: 'primary' },
                { id: 'dismiss', label: 'Dismiss', onClick: clearLastLoadError, variant: 'secondary' },
              ]}
            />
          )}

          {!lastLoadError && isAnyLoading && (
            <RouteStateCallout
              kind="loading"
              title="Loading draw-call metrics"
              description="Parsing slots, blend modes, and atlas-page transitions."
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

              {isPartialParse && (
                <RouteStateCallout
                  kind="partial"
                  title="Partial parse detected"
                  description="Some rows resolve to unknown atlas pages. You can still inspect order and blend breaks."
                  actions={[
                    {
                      id: 'partial-reload',
                      label: 'Reload selected asset',
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
                    Clear page filter
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

              <MetricInsightPopout
                insight={drawInsight}
                isPinned={selectedSlotIndex !== null}
                onPin={pinActiveInsight}
                onUnpin={closeInsight}
                onOpenExplainer={() => setShowExplainer(true)}
                onRequestClose={closeInsight}
              />
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
              title="No drawable rows found"
              description="The skeleton loaded, but no drawable region/mesh attachments are currently active."
              actions={[
                { id: 'reload-empty', label: 'Reload selected asset', onClick: () => void handleLoadSelected(), variant: 'secondary' },
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
      </div>

      <MetricExplainerModal
        isOpen={showExplainer}
        insight={drawInsight}
        onClose={() => setShowExplainer(false)}
      />
    </div>
  );
}
