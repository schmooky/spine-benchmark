import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { useDrawCallInspector } from '../hooks/useDrawCallInspector';
import { useAtlasData } from '../hooks/useAtlasData';
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

interface AtlasRegionEntry {
  id: string;
  pageName: string;
  pageWidth: number;
  pageHeight: number;
  regionName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isProblematic: boolean;
}

export function AtlasRepackRouteView() {
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
    routeSelection,
    setRouteSelection,
    lastLoadError,
    clearLastLoadError,
    loadFromUrls,
    uploadBundleFiles,
  } = useWorkbench();

  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showOnlyProblematic, setShowOnlyProblematic] = useState(false);
  const [pageFilter, setPageFilter] = useState<string | null>(null);

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  const snapshot = useDrawCallInspector(spineInstance);
  const atlasData = useAtlasData(spineInstance);

  const problematicNames = useMemo(() => {
    const names = new Set<string>();
    snapshot.slots.forEach((slot) => {
      if (slot.isBreak) names.add(slot.attachmentName);
    });
    return names;
  }, [snapshot.slots]);

  const totalRegions = useMemo(
    () => atlasData.pages.reduce((sum, page) => sum + page.regions.length, 0),
    [atlasData.pages],
  );

  const regionEntries = useMemo<AtlasRegionEntry[]>(() => {
    const entries: AtlasRegionEntry[] = [];
    atlasData.pages.forEach((page) => {
      page.regions.forEach((region) => {
        entries.push({
          id: `${page.name}:${region.name}:${region.x}:${region.y}`,
          pageName: page.name,
          pageWidth: page.width,
          pageHeight: page.height,
          regionName: region.name,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          isProblematic: problematicNames.has(region.name),
        });
      });
    });
    return entries;
  }, [atlasData.pages, problematicNames]);

  const regionById = useMemo(() => {
    const map = new Map<string, AtlasRegionEntry>();
    regionEntries.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [regionEntries]);

  useEffect(() => {
    if (!routeSelection.attachmentName) return;
    const match = regionEntries.find((entry) => entry.regionName === routeSelection.attachmentName);
    if (!match) return;
    setSelectedRegionId(match.id);
  }, [routeSelection.updatedAt, routeSelection.attachmentName, regionEntries]);

  useEffect(() => {
    if (!spineInstance) {
      setSelectedRegionId(null);
      setHoveredRegionId(null);
      setPageFilter(null);
      setShowOnlyProblematic(false);
    }
  }, [spineInstance]);

  const activeRegion = selectedRegionId
    ? regionById.get(selectedRegionId) ?? null
    : hoveredRegionId
      ? regionById.get(hoveredRegionId) ?? null
      : null;

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

  const activateRegion = (entry: AtlasRegionEntry) => {
    if (selectedRegionId === entry.id) {
      setSelectedRegionId(null);
      return;
    }
    setSelectedRegionId(entry.id);
    setRouteSelection({
      sourceRoute: 'atlas-repack',
      slotIndex: routeSelection.slotIndex,
      slotName: routeSelection.slotName,
      attachmentName: entry.regionName,
      atlasPage: entry.pageName,
      updatedAt: Date.now(),
    });
  };

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
      active: false,
      onSelect: () => {
        void navigate({ to: '/tools/mesh-optimizer' });
      },
    },
    {
      id: 'atlas-route',
      label: t('ui.routeJumps.atlas'),
      active: true,
      onSelect: () => {},
    },
  ], [navigate, t]);

  const selectionHint = routeSelection.attachmentName
    ? t('ui.routeJumps.selectionRetainedNamed', { name: routeSelection.attachmentName })
    : t('ui.routeJumps.selectionRetained');

  const atlasInsight = useMemo<MetricInsightModel | null>(() => {
    if (!activeRegion) return null;
    const pageShare = Math.max(1, Math.round((activeRegion.width * activeRegion.height) / (activeRegion.pageWidth * activeRegion.pageHeight) * 100));
    const expectedCallDelta = activeRegion.isProblematic ? '-1' : '0';
    const expectedBreakDelta = activeRegion.isProblematic ? '-1' : '0';

    return {
      id: `atlas-${activeRegion.id}`,
      title: t('atlasRepack.insight.title', { regionName: activeRegion.regionName }),
      subtitle: t('atlasRepack.insight.subtitle', {
        pageName: activeRegion.pageName,
        width: activeRegion.width,
        height: activeRegion.height,
      }),
      sample: t('atlasRepack.insight.sample', { regionName: activeRegion.regionName }),
      metrics: [
        {
          id: 'page',
          label: t('atlasRepack.insight.metrics.page.label'),
          value: activeRegion.pageName,
          note: t('atlasRepack.insight.metrics.page.note', { pageShare }),
          tone: 'info',
        },
        {
          id: 'problem',
          label: t('atlasRepack.insight.metrics.breakRisk.label'),
          value: activeRegion.isProblematic
            ? t('atlasRepack.insight.metrics.breakRisk.high')
            : t('atlasRepack.insight.metrics.breakRisk.low'),
          note: activeRegion.isProblematic
            ? t('atlasRepack.insight.metrics.breakRisk.problematicNote')
            : t('atlasRepack.insight.metrics.breakRisk.stableNote'),
          tone: activeRegion.isProblematic ? 'danger' : 'positive',
        },
        {
          id: 'size',
          label: t('atlasRepack.insight.metrics.regionSize.label'),
          value: `${activeRegion.width}×${activeRegion.height}`,
          note: t('atlasRepack.insight.metrics.regionSize.note'),
          tone: 'neutral',
        },
      ],
      quickActions: [
        {
          id: 'filter-problematic',
          label: t('atlasRepack.insight.quickActions.filterProblematic.label'),
          impact: t('atlasRepack.insight.quickActions.filterProblematic.impact'),
          onRun: () => {
            setShowOnlyProblematic(true);
          },
        },
        {
          id: 'isolate-page',
          label: t('atlasRepack.insight.quickActions.isolatePage.label', { pageName: activeRegion.pageName }),
          impact: t('atlasRepack.insight.quickActions.isolatePage.impact'),
          onRun: () => {
            setPageFilter(activeRegion.pageName);
          },
        },
        {
          id: 'jump-draw',
          label: t('atlasRepack.insight.quickActions.jumpDrawCalls.label'),
          impact: t('atlasRepack.insight.quickActions.jumpDrawCalls.impact'),
          onRun: () => {
            setRouteSelection((current) => ({
              ...current,
              sourceRoute: 'atlas-repack',
              attachmentName: activeRegion.regionName,
              atlasPage: activeRegion.pageName,
              updatedAt: Date.now(),
            }));
            void navigate({ to: '/tools/draw-call-inspector' });
          },
        },
      ],
      proofBlocks: [
        { id: 'proof-calls', label: t('ui.insights.proof.calls'), delta: expectedCallDelta, tone: 'positive' },
        { id: 'proof-verts', label: t('ui.insights.proof.verts'), delta: '-6%', tone: 'info' },
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
          onJump: () => {
            void navigate({ to: '/tools/mesh-optimizer' });
          },
        },
        {
          id: 'jump-atlas',
          label: t('ui.routeJumps.atlas'),
          active: true,
          onJump: () => {},
        },
      ],
      explainer: {
        what: t('atlasRepack.insight.explainer.what', {
          regionName: activeRegion.regionName,
          pageName: activeRegion.pageName,
        }),
        whyNow: activeRegion.isProblematic
          ? t('atlasRepack.insight.explainer.whyNowProblematic')
          : t('atlasRepack.insight.explainer.whyNowStable'),
        howToFix: t('atlasRepack.insight.explainer.howToFix'),
        howToVerify: t('atlasRepack.insight.explainer.howToVerify'),
      },
    };
  }, [activeRegion, navigate, setRouteSelection, t]);

  const filteredPages = useMemo(() => {
    return atlasData.pages
      .filter((page) => !pageFilter || page.name === pageFilter)
      .map((page) => ({
        ...page,
        regions: showOnlyProblematic
          ? page.regions.filter((region) => problematicNames.has(region.name))
          : page.regions,
      }))
      .filter((page) => page.regions.length > 0 || !showOnlyProblematic);
  }, [atlasData.pages, pageFilter, showOnlyProblematic, problematicNames]);

  const pagesMissingImages = atlasData.pages.filter((page) => !page.imageSrc).length;
  const isPartialParse = !!spineInstance && (atlasData.pages.length === 0 || pagesMissingImages > 0);
  const showFallback = !spineInstance || atlasData.pages.length === 0 || !!lastLoadError;

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.atlasRepack')}
        subtitle={t('atlasRepack.subtitle')}
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

      <div className="atlas-repack-layout with-side-insight">
        <div className="tool-panel atlas-repack-panel">
          <RouteJumpStrip chips={jumpChips} selectionHint={selectionHint} />

          {lastLoadError && (
            <RouteStateCallout
              kind="error"
              title={t('atlasRepack.states.loadError.title')}
              description={lastLoadError}
              actions={[
                { id: 'retry', label: t('atlasRepack.states.loadError.actions.retry'), onClick: () => void handleLoadSelected(), variant: 'primary' },
                { id: 'dismiss', label: t('atlasRepack.states.loadError.actions.dismiss'), onClick: clearLastLoadError, variant: 'secondary' },
              ]}
            />
          )}

          {!lastLoadError && isAnyLoading && (
            <RouteStateCallout
              kind="loading"
              title={t('atlasRepack.states.loading.title')}
              description={t('atlasRepack.states.loading.description')}
            />
          )}

          {!showFallback && (
            <>
              <div className="tool-summary">
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
                  <span className="dc-inspector-stat-value">{totalRegions}</span>
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

              {isPartialParse && (
                <RouteStateCallout
                  kind="partial"
                  title={t('atlasRepack.states.partial.title')}
                  description={pagesMissingImages > 0
                    ? t('atlasRepack.states.partial.missingImages', { count: pagesMissingImages })
                    : t('atlasRepack.states.partial.noPages')}
                  actions={[
                    {
                      id: 'reload',
                      label: t('atlasRepack.states.partial.actions.reloadSelectedAsset'),
                      onClick: () => void handleLoadSelected(),
                      variant: 'secondary',
                    },
                  ]}
                />
              )}

              <div className="atlas-filter-row">
                <button
                  type="button"
                  className={`route-jump-chip${showOnlyProblematic ? ' active' : ''}`}
                  onClick={() => setShowOnlyProblematic((value) => !value)}
                >
                  {t('atlasRepack.actions.problematicOnly')}
                </button>
                {pageFilter && (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setPageFilter(null)}
                  >
                    {t('atlasRepack.actions.clearPageFilter')}
                  </button>
                )}
              </div>

              <div className="atlas-repack-pages">
                {filteredPages.map((page) => (
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
                        const regionId = `${page.name}:${region.name}:${region.x}:${region.y}`;
                        const isSelected = selectedRegionId === regionId;
                        return (
                          <button
                            key={regionId}
                            type="button"
                            className={`atlas-repack-region${isProblematic ? ' problematic' : ''}${isSelected ? ' selected' : ''}`}
                            style={{
                              left: `${region.x * scaleX}%`,
                              top: `${region.y * scaleY}%`,
                              width: `${region.width * scaleX}%`,
                              height: `${region.height * scaleY}%`,
                            }}
                            title={isProblematic ? `${region.name} — ${t('atlasRepack.region.problematic')}` : region.name}
                            onMouseEnter={() => setHoveredRegionId(regionId)}
                            onMouseLeave={() => setHoveredRegionId((current) => (current === regionId ? null : current))}
                            onFocus={() => setHoveredRegionId(regionId)}
                            onBlur={() => setHoveredRegionId((current) => (current === regionId ? null : current))}
                            onClick={() => activateRegion({
                              id: regionId,
                              pageName: page.name,
                              pageWidth: page.width,
                              pageHeight: page.height,
                              regionName: region.name,
                              x: region.x,
                              y: region.y,
                              width: region.width,
                              height: region.height,
                              isProblematic,
                            })}
                            aria-pressed={isSelected}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

            </>
          )}

          {!lastLoadError && !isAnyLoading && !spineInstance && (
            <RouteStateCallout
              kind="empty"
              title={t('atlasRepack.empty.title')}
              description={t('atlasRepack.empty.hint')}
              actions={[
                { id: 'load-selected', label: t('toolRouteControls.actions.loadSelected'), onClick: () => void handleLoadSelected(), variant: 'primary' },
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
            {atlasInsight ? (
              <MetricInsightPopout
                insight={atlasInsight}
                isPinned={selectedRegionId !== null}
                onPin={() => {
                  if (!activeRegion) return;
                  setSelectedRegionId(activeRegion.id);
                }}
                onUnpin={() => {
                  setSelectedRegionId(null);
                  setHoveredRegionId(null);
                  setShowExplainer(false);
                }}
                onOpenExplainer={() => setShowExplainer(true)}
                onRequestClose={() => {
                  setSelectedRegionId(null);
                  setHoveredRegionId(null);
                  setShowExplainer(false);
                }}
              />
            ) : (
              <div className="tool-info-empty">
                <h3>{t('atlasRepack.infoPanel.emptyTitle')}</h3>
                <p>{t('atlasRepack.infoPanel.emptyDescription')}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      <MetricExplainerModal
        isOpen={showExplainer}
        insight={atlasInsight}
        onClose={() => setShowExplainer(false)}
      />
    </div>
  );
}
