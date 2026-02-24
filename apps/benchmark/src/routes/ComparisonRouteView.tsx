import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'animejs';
import { useTranslation } from 'react-i18next';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import { CheckIcon, ChevronDownIcon } from '../components/Icons';
import { useCanvasStats } from '../hooks/useCanvasStats';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ComparisonPane, useComparisonApp } from '../hooks/useComparisonApp';

type PickerSide = 'left' | 'right' | null;

export function ComparisonRouteView() {
  const { t } = useTranslation();
  const {
    assets,
    selectedAssetId,
    setSelectedAssetId,
    uploadBundleFiles,
    formatBytes,
    loadFromUrls,
  } = useWorkbench();

  const [isLoadingSelected, setIsLoadingSelected] = useState(false);

  // Refs for the two canvas host divs
  const leftHostRef = useRef<HTMLDivElement | null>(null);
  const rightHostRef = useRef<HTMLDivElement | null>(null);
  const comparisonRootRef = useRef<HTMLDivElement | null>(null);

  // Per-pane hooks
  const leftPane = useComparisonApp(leftHostRef);
  const rightPane = useComparisonApp(rightHostRef);
  const leftStats = useCanvasStats(leftPane.spine);
  const rightStats = useCanvasStats(rightPane.spine);

  // Asset selection
  const [leftAssetId, setLeftAssetId] = useState<string>('');
  const [rightAssetId, setRightAssetId] = useState<string>('');

  // Asset picker modal
  const [pickerSide, setPickerSide] = useState<PickerSide>(null);

  // Shared playback state
  const [currentAnimation, setCurrentAnimation] = useState<string>('');
  const [currentSkin, setCurrentSkin] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const loadPaneAsset = useCallback(async (side: Exclude<PickerSide, null>, assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    if (side === 'left') {
      setLeftAssetId(asset.id);
      await leftPane.loadAsset(asset);
      return;
    }
    setRightAssetId(asset.id);
    await rightPane.loadAsset(asset);
  }, [assets, leftPane, rightPane]);

  const handlePickAsset = useCallback(async (assetId: string) => {
    const side = pickerSide;
    if (!side) return;
    await loadPaneAsset(side, assetId);
    setPickerSide(null);
  }, [pickerSide, loadPaneAsset]);

  const handleToolbarPick = useCallback(async (assetId: string) => {
    const targetSide: Exclude<PickerSide, null> = !leftPane.spine
      ? 'left'
      : !rightPane.spine
        ? 'right'
        : 'left';

    setIsLoadingSelected(true);
    try {
      await loadPaneAsset(targetSide, assetId);
    } finally {
      setIsLoadingSelected(false);
    }
  }, [leftPane.spine, loadPaneAsset, rightPane.spine]);

  // Compute intersection of animation names
  const animations = useMemo(() => {
    if (!leftPane.spine || !rightPane.spine) {
      const single = leftPane.spine || rightPane.spine;
      if (!single) return [];
      return single.skeleton.data.animations.map((a) => a.name);
    }
    const leftNames = new Set(
      leftPane.spine.skeleton.data.animations.map((a) => a.name),
    );
    return rightPane.spine.skeleton.data.animations
      .map((a) => a.name)
      .filter((n) => leftNames.has(n));
  }, [leftPane.spine, rightPane.spine]);

  const skins = useMemo(() => {
    if (!leftPane.spine || !rightPane.spine) {
      const single = leftPane.spine || rightPane.spine;
      if (!single) return [];
      return single.skeleton.data.skins.map((s) => s.name);
    }
    const leftNames = new Set(
      leftPane.spine.skeleton.data.skins.map((s) => s.name),
    );
    return rightPane.spine.skeleton.data.skins
      .map((s) => s.name)
      .filter((n) => leftNames.has(n));
  }, [leftPane.spine, rightPane.spine]);

  // Auto-select first animation when list changes
  useEffect(() => {
    if (animations.length > 0 && !animations.includes(currentAnimation)) {
      setCurrentAnimation(animations[0]);
    }
  }, [animations, currentAnimation]);

  // Auto-select first skin when list changes
  useEffect(() => {
    if (skins.length > 0 && !skins.includes(currentSkin)) {
      setCurrentSkin(skins[0]);
    }
  }, [skins, currentSkin]);

  // Apply animation to both spines
  const applyAnimation = useCallback(
    (name: string, loop: boolean) => {
      for (const spine of [leftPane.spine, rightPane.spine]) {
        if (!spine) continue;
        const has = spine.skeleton.data.animations.some((a) => a.name === name);
        if (has) {
          spine.state.setAnimation(0, name, loop);
          spine.state.timeScale = 1;
        }
      }
    },
    [leftPane.spine, rightPane.spine],
  );

  const applySkin = useCallback(
    (name: string) => {
      for (const spine of [leftPane.spine, rightPane.spine]) {
        if (!spine) continue;
        const skin = spine.skeleton.data.findSkin(name);
        if (!skin) continue;
        spine.skeleton.setSkin(skin);
        spine.skeleton.setSlotsToSetupPose();
      }
    },
    [leftPane.spine, rightPane.spine],
  );

  // When currentAnimation or isLooping changes, re-apply
  useEffect(() => {
    if (!currentAnimation) return;
    applyAnimation(currentAnimation, isLooping);
    setIsPlaying(true);
  }, [currentAnimation, isLooping, applyAnimation]);

  // Apply skin to both panes and restore current animation pose.
  useEffect(() => {
    if (!currentSkin) return;
    applySkin(currentSkin);
    if (currentAnimation) {
      applyAnimation(currentAnimation, isLooping);
    }
  }, [currentSkin, currentAnimation, isLooping, applyAnimation, applySkin]);

  // Play / pause
  useEffect(() => {
    for (const spine of [leftPane.spine, rightPane.spine]) {
      if (!spine) continue;
      spine.state.timeScale = isPlaying ? 1 : 0;
    }
  }, [isPlaying, leftPane.spine, rightPane.spine]);

  // Playback controls
  const togglePlay = () => setIsPlaying((p) => !p);

  // Camera helpers
  const applyCamera = useCallback(() => {
    const { x, y, scale } = cameraRef.current;
    for (const vp of [leftPane.viewport, rightPane.viewport]) {
      if (!vp) continue;
      const app = vp === leftPane.viewport ? leftPane.app : rightPane.app;
      const container = app?.canvas?.parentElement;
      if (!container) continue;
      vp.x = container.clientWidth / 2 + x;
      vp.y = container.clientHeight / 2 + y;
      vp.scale.set(scale);
    }
  }, [leftPane.viewport, rightPane.viewport, leftPane.app, rightPane.app]);

  // Wheel zoom — only on the canvas wrapper
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      cameraRef.current.scale = Math.max(
        0.1,
        Math.min(10, cameraRef.current.scale + delta),
      );
      applyCamera();
    };

    wrapper.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', onWheel);
  }, [applyCamera]);

  // Drag pan — only start from canvas elements, not from UI overlays
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const onDown = (e: PointerEvent) => {
      // Only start drag if the target is a canvas or the pixi-host container
      const target = e.target as HTMLElement;
      if (target.tagName === 'CANVAS' || target.classList.contains('pixi-host')) {
        draggingRef.current = true;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      cameraRef.current.x += dx;
      cameraRef.current.y += dy;
      applyCamera();
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    wrapper.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      wrapper.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [applyCamera]);

  const bothLoaded = Boolean(leftPane.spine && rightPane.spine);
  const paneAStatusKey = leftPane.isLoading ? 'loading' : leftPane.spine ? 'loaded' : 'empty';
  const paneBStatusKey = rightPane.isLoading ? 'loading' : rightPane.spine ? 'loaded' : 'empty';
  const paneAStatus = t(`comparison.statusValues.${paneAStatusKey}`);
  const paneBStatus = t(`comparison.statusValues.${paneBStatusKey}`);
  const drawDelta = rightStats.drawCalls - leftStats.drawCalls;

  const nextActions = useMemo(() => {
    if (!bothLoaded) {
      return [
        t('comparison.nextActions.loadBothPanes'),
        t('comparison.nextActions.enableSharedPlayback'),
        t('comparison.nextActions.useFollowUpRoutes'),
      ];
    }
    return [
      t('comparison.nextActions.switchToAnimation', {
        animation: currentAnimation || animations[0] || t('comparison.nextActions.sharedAnimationFallback'),
      }),
      drawDelta > 0
        ? t('comparison.nextActions.inspectPaneB')
        : t('comparison.nextActions.inspectPaneA'),
      t('comparison.nextActions.useAtlasSuggestion'),
    ];
  }, [animations, bothLoaded, currentAnimation, drawDelta, t]);

  const paneBadge = useCallback((pane: ComparisonPane, label: 'A' | 'B') => {
    const width = Math.round(pane.app?.screen.width ?? 0);
    const height = Math.round(pane.app?.screen.height ?? 0);
    if (width <= 0 || height <= 0) return t('comparison.badges.unavailable', { pane: label });
    return t('comparison.badges.resolution', { pane: label, width, height });
  }, [t]);

  useEffect(() => {
    if (!comparisonRootRef.current) return;
    const targets = comparisonRootRef.current.querySelectorAll('.comparison-animate');
    if (!targets.length) return;
    animate(targets, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 220,
      delay: (_target, index) => index * 32,
      ease: 'outQuad',
    });
  }, [leftAssetId, rightAssetId]);

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.comparison')}
        subtitle={t('comparison.subtitle')}
      />
      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        onUploadBundle={uploadBundleFiles}
        onPickAsset={handleToolbarPick}
        onLoadFromUrl={loadFromUrls}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="comparison-layout comparison-layout-editorial" ref={comparisonRootRef}>
        <aside className="comparison-analysis-panel">
          <div className="comparison-stat-grid comparison-animate">
            <article className="comparison-stat-card">
              <span>{t('comparison.summary.paneA')}</span>
              <strong>{paneAStatus}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>{t('comparison.summary.paneB')}</span>
              <strong>{paneBStatus}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>{t('comparison.summary.sharedAnimations')}</span>
              <strong>{animations.length}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>{t('comparison.summary.sync')}</span>
              <strong>{bothLoaded ? t('comparison.statusValues.on') : t('comparison.statusValues.off')}</strong>
            </article>
          </div>

          <div className="comparison-action-row comparison-animate">
            <div className="comparison-action-copy">
              <strong>{t('comparison.actionRow.title')}</strong>
              <span>{t('comparison.actionRow.description')}</span>
            </div>
            <div className="comparison-action-buttons">
              <button type="button" className="secondary-btn" onClick={() => setPickerSide('left')}>
                {t('comparison.actions.pickLeft')}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setPickerSide('right')}>
                {t('comparison.actions.pickRight')}
              </button>
            </div>
          </div>

          <section className="comparison-status-card comparison-animate">
            <h3>{t('comparison.status.title')}</h3>
            <div className="comparison-status-head">
              <span>{t('comparison.status.headers.check')}</span>
              <span>{t('comparison.status.headers.result')}</span>
            </div>
            <div className="comparison-status-row">
              <span>{t('comparison.status.animationIntersection')}</span>
              <span>{t('comparison.status.nameCount', { count: animations.length })}</span>
            </div>
            <div className="comparison-status-row highlighted">
              <span>{t('comparison.status.cameraSync')}</span>
              <span>{bothLoaded ? t('comparison.status.cameraSyncEnabled') : t('comparison.status.cameraSyncNeedsBoth')}</span>
            </div>
            <div className="comparison-status-row">
              <span>{t('comparison.status.playbackLock')}</span>
              <span>{isPlaying ? t('comparison.status.playbackEnabled') : t('comparison.status.playbackPaused')}</span>
            </div>
          </section>

          <section className="comparison-diff-card comparison-animate">
            <h3>{t('comparison.differences.title')}</h3>
            <p>
              {t('comparison.differences.summary', {
                drawCallsA: leftStats.drawCalls,
                drawCallsB: rightStats.drawCalls,
                texturesA: leftStats.textures,
                texturesB: rightStats.textures,
              })}
            </p>
            <h4>{t('comparison.differences.nextAction')}</h4>
            <pre>{nextActions.join('\n')}</pre>
          </section>
        </aside>

        <section className="comparison-viewer-panel">
          <div className="comparison-pane-grid" ref={wrapperRef}>
            <section className="comparison-editorial-pane comparison-animate">
              <div className="comparison-editorial-pane-top">
                <span className="comparison-pane-chip">{t('comparison.summary.paneA')}</span>
                <span className="comparison-pane-chip">{paneAStatus}</span>
              </div>
              <div className="comparison-editorial-pane-body">
                <div className="pixi-host comparison-pixi-host" ref={leftHostRef} />
                <CanvasStatsOverlay spineInstance={leftPane.spine} />
                <span className="comparison-pane-res-badge">{paneBadge(leftPane, 'A')}</span>
                {!leftPane.spine && (
                  <div className="comparison-pane-empty">
                    <span className="comparison-pane-empty-glyph" aria-hidden="true" />
                    <strong>{t('comparison.panes.assetA')}</strong>
                    <p>{leftPane.isLoading ? t('ui.loading') : t('comparison.selectAsset')}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="comparison-editorial-pane comparison-animate">
              <div className="comparison-editorial-pane-top">
                <span className="comparison-pane-chip">{t('comparison.summary.paneB')}</span>
                <span className="comparison-pane-chip">{paneBStatus}</span>
              </div>
              <div className="comparison-editorial-pane-body">
                <div className="pixi-host comparison-pixi-host" ref={rightHostRef} />
                <CanvasStatsOverlay spineInstance={rightPane.spine} />
                <span className="comparison-pane-res-badge">{paneBadge(rightPane, 'B')}</span>
                {!rightPane.spine && (
                  <div className="comparison-pane-empty">
                    <span className="comparison-pane-empty-glyph" aria-hidden="true" />
                    <strong>{t('comparison.panes.assetB')}</strong>
                    <p>{rightPane.isLoading ? t('ui.loading') : t('comparison.selectAsset')}</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="comparison-shared-controls comparison-animate">
            <div className="comparison-shared-row comparison-shared-row-top">
              <button
                type="button"
                className="comparison-shared-pill accent toggle"
                onClick={togglePlay}
              >
                {isPlaying ? t('comparison.shared.sharedPlayback') : t('comparison.shared.playbackPaused')}
              </button>
              <button
                type="button"
                className={`comparison-shared-pill toggle${isLooping ? ' active' : ''}`}
                onClick={() => setIsLooping((loop) => !loop)}
              >
                {t('comparison.shared.loop', { value: isLooping ? t('comparison.statusValues.on') : t('comparison.statusValues.off') })}
              </button>
              <span className="comparison-shared-divider" />
              <span className="comparison-shared-pill">{t('comparison.shared.cameraSync')}</span>
            </div>
            <div className="comparison-shared-row comparison-shared-row-bottom">
              <div className="comparison-shared-select">
                <span>{t('controls.labels.selectAnimation')}:</span>
                <select
                  value={currentAnimation}
                  onChange={(event) => setCurrentAnimation(event.target.value)}
                  disabled={animations.length === 0}
                >
                  {animations.length === 0 ? (
                    <option value="">{t('comparison.shared.noSharedAnimations')}</option>
                  ) : (
                    animations.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  )}
                </select>
                <ChevronDownIcon className="comparison-shared-select-icon" size={14} />
              </div>
              <div className="comparison-shared-select comparison-shared-select-skin">
                <span>{t('controls.labels.selectSkin')}:</span>
                <select
                  value={skins.length > 0 ? currentSkin : 'default'}
                  onChange={(event) => setCurrentSkin(event.target.value)}
                  disabled={skins.length <= 1}
                >
                  {skins.length > 0 ? (
                    skins.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  ) : (
                    <option value="default">{t('ui.default')}</option>
                  )}
                </select>
                <ChevronDownIcon className="comparison-shared-select-icon" size={14} />
              </div>
              <div className="comparison-shared-count">
                <span>{t('comparison.shared.commonAnimations', { count: animations.length })}</span>
                <CheckIcon className="comparison-shared-count-icon" size={14} />
              </div>
            </div>
          </section>
        </section>

        {pickerSide && (
          <div className="tool-picker-modal-backdrop" onClick={() => setPickerSide(null)}>
            <section className="tool-picker-modal" onClick={(event) => event.stopPropagation()}>
              <div className="route-section-header">
                <h3>
                  {t('comparison.selectAssetForPane', {
                    selectAsset: t('comparison.selectAsset'),
                    pane: pickerSide === 'left' ? 'A' : 'B',
                  })}
                </h3>
                <button type="button" className="secondary-btn" onClick={() => setPickerSide(null)}>
                  {t('ui.close')}
                </button>
              </div>

              <div className="tool-asset-grid">
                {assets.length === 0 && (
                  <p className="subtle-text">{t('toolRouteControls.values.noAssets')}</p>
                )}
                {assets.map((asset) => {
                  const isSelected = pickerSide === 'left' ? asset.id === leftAssetId : asset.id === rightAssetId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`asset-card tool-asset-card ${isSelected ? 'active' : ''}`}
                      onClick={() => void handlePickAsset(asset.id)}
                    >
                      <div className="asset-thumb">
                        {asset.previewImageDataUrl ? (
                          <img src={asset.previewImageDataUrl} alt={asset.name} />
                        ) : (
                          <span>{asset.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="tool-asset-card-copy">
                        <h3>{asset.name}</h3>
                        <p>
                          {t('comparison.assetCard.summary', {
                            count: asset.fileCount,
                            size: formatBytes(asset.totalBytes),
                          })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
