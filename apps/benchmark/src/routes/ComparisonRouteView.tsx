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
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    uploadBundleFiles,
    formatBytes,
    setShowUrlModal,
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

  const handleLoadSelected = useCallback(async () => {
    if (!selectedAssetId) return;
    const targetSide: Exclude<PickerSide, null> = !leftPane.spine
      ? 'left'
      : !rightPane.spine
        ? 'right'
        : 'left';

    setIsLoadingSelected(true);
    try {
      await loadPaneAsset(targetSide, selectedAssetId);
    } finally {
      setIsLoadingSelected(false);
    }
  }, [leftPane.spine, loadPaneAsset, rightPane.spine, selectedAssetId]);

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
  const paneAStatus = leftPane.isLoading ? 'Loading' : leftPane.spine ? 'Loaded' : 'Empty';
  const paneBStatus = rightPane.isLoading ? 'Loading' : rightPane.spine ? 'Loaded' : 'Empty';
  const drawDelta = rightStats.drawCalls - leftStats.drawCalls;
  const textureDelta = rightStats.textures - leftStats.textures;

  const nextActions = useMemo(() => {
    if (!bothLoaded) {
      return [
        'Load both panes with related assets',
        'Enable shared playback and pick a common animation',
        'Use Draw Calls and Atlas routes for retained selection follow-up',
      ];
    }
    return [
      `Switch to ${currentAnimation || animations[0] || 'a shared animation'}`,
      drawDelta > 0 ? 'Inspect high-cost layer on pane B for break sources' : 'Inspect high-cost layer on pane A for break sources',
      'Use atlas repack suggestion to reduce page transitions',
    ];
  }, [animations, bothLoaded, currentAnimation, drawDelta]);

  const paneBadge = useCallback((pane: ComparisonPane, label: 'A' | 'B') => {
    const width = Math.round(pane.app?.screen.width ?? 0);
    const height = Math.round(pane.app?.screen.height ?? 0);
    if (width <= 0 || height <= 0) return `${label} --`;
    return `${label} ${width}×${height}`;
  }, []);

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
        subtitle="Load two assets and compare behavior with synchronized camera and playback."
      />
      <ToolRouteControls
        minimal
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        atlasOptions={atlasOptions}
        selectedAtlasName={selectedAtlasName}
        setSelectedAtlasName={setSelectedAtlasName}
        onUploadBundle={uploadBundleFiles}
        onLoadSelected={handleLoadSelected}
        isLoadingSelected={isLoadingSelected}
        onOpenUrl={() => setShowUrlModal(true)}
      />

      <div className="comparison-layout comparison-layout-editorial" ref={comparisonRootRef}>
        <aside className="comparison-analysis-panel">
          <div className="comparison-stat-grid comparison-animate">
            <article className="comparison-stat-card">
              <span>Pane A</span>
              <strong>{paneAStatus}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>Pane B</span>
              <strong>{paneBStatus}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>Shared Anims</span>
              <strong>{animations.length}</strong>
            </article>
            <article className="comparison-stat-card">
              <span>Sync</span>
              <strong>{bothLoaded ? 'On' : 'Off'}</strong>
            </article>
          </div>

          <div className="comparison-action-row comparison-animate">
            <div className="comparison-action-copy">
              <strong>Side-by-side comparison</strong>
              <span>Pane A and B are camera-synced with a shared animation selector.</span>
            </div>
            <div className="comparison-action-buttons">
              <button type="button" className="secondary-btn" onClick={() => setPickerSide('left')}>
                Pick Left
              </button>
              <button type="button" className="secondary-btn" onClick={() => setPickerSide('right')}>
                Pick Right
              </button>
            </div>
          </div>

          <section className="comparison-status-card comparison-animate">
            <h3>Comparison status</h3>
            <div className="comparison-status-head">
              <span>Check</span>
              <span>Result</span>
            </div>
            <div className="comparison-status-row">
              <span>animation intersection</span>
              <span>{animations.length} names</span>
            </div>
            <div className="comparison-status-row highlighted">
              <span>camera sync</span>
              <span>{bothLoaded ? 'zoom + pan shared' : 'load both panes'}</span>
            </div>
            <div className="comparison-status-row">
              <span>playback lock</span>
              <span>{isPlaying ? 'enabled' : 'paused'}</span>
            </div>
          </section>

          <section className="comparison-diff-card comparison-animate">
            <h3>Differences detected</h3>
            <p>
              Draw calls: A {leftStats.drawCalls} vs B {rightStats.drawCalls}
              {' • '}
              Texture pages: A {leftStats.textures} vs B {rightStats.textures}
            </p>
            <h4>Next action</h4>
            <pre>{nextActions.join('\n')}</pre>
          </section>
        </aside>

        <section className="comparison-viewer-panel">
          <div className="comparison-pane-grid" ref={wrapperRef}>
            <section className="comparison-editorial-pane comparison-animate">
              <div className="comparison-editorial-pane-top">
                <span className="comparison-pane-chip">Pane A</span>
                <span className="comparison-pane-chip">{paneAStatus}</span>
              </div>
              <div className="comparison-editorial-pane-body">
                <div className="pixi-host comparison-pixi-host" ref={leftHostRef} />
                <CanvasStatsOverlay spineInstance={leftPane.spine} />
                <span className="comparison-pane-res-badge">{paneBadge(leftPane, 'A')}</span>
                {!leftPane.spine && (
                  <div className="comparison-pane-empty">
                    <span className="comparison-pane-empty-glyph">SB</span>
                    <strong>Asset A</strong>
                    <p>{leftPane.isLoading ? t('ui.loading') : t('comparison.selectAsset')}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="comparison-editorial-pane comparison-animate">
              <div className="comparison-editorial-pane-top">
                <span className="comparison-pane-chip">Pane B</span>
                <span className="comparison-pane-chip">{paneBStatus}</span>
              </div>
              <div className="comparison-editorial-pane-body">
                <div className="pixi-host comparison-pixi-host" ref={rightHostRef} />
                <CanvasStatsOverlay spineInstance={rightPane.spine} />
                <span className="comparison-pane-res-badge">{paneBadge(rightPane, 'B')}</span>
                {!rightPane.spine && (
                  <div className="comparison-pane-empty">
                    <span className="comparison-pane-empty-glyph">SB</span>
                    <strong>Asset B</strong>
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
                {isPlaying ? 'Shared playback' : 'Playback paused'}
              </button>
              <button
                type="button"
                className={`comparison-shared-pill toggle${isLooping ? ' active' : ''}`}
                onClick={() => setIsLooping((loop) => !loop)}
              >
                Loop {isLooping ? 'On' : 'Off'}
              </button>
              <span className="comparison-shared-divider" />
              <span className="comparison-shared-pill">Camera Sync</span>
            </div>
            <div className="comparison-shared-row comparison-shared-row-bottom">
              <div className="comparison-shared-select">
                <span>Animation:</span>
                <select
                  value={currentAnimation}
                  onChange={(event) => setCurrentAnimation(event.target.value)}
                  disabled={animations.length === 0}
                >
                  {animations.length === 0 ? (
                    <option value="">No shared animations</option>
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
              {skins.length > 1 && (
                <div className="comparison-shared-select comparison-shared-select-skin">
                  <span>Skin:</span>
                  <select
                    value={currentSkin}
                    onChange={(event) => setCurrentSkin(event.target.value)}
                  >
                    {skins.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="comparison-shared-select-icon" size={14} />
                </div>
              )}
              <div className="comparison-shared-count">
                <span>Common anims: {animations.length}</span>
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
                  {t('comparison.selectAsset')} — {pickerSide === 'left' ? 'A' : 'B'}
                </h3>
                <button type="button" className="secondary-btn" onClick={() => setPickerSide(null)}>
                  {t('ui.close')}
                </button>
              </div>

              <div className="tool-asset-list">
                {assets.length === 0 && (
                  <p className="subtle-text">{t('toolRouteControls.values.noAssets')}</p>
                )}
                {assets.map((asset) => {
                  const isSelected = pickerSide === 'left' ? asset.id === leftAssetId : asset.id === rightAssetId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      className={`tool-asset-item ${isSelected ? 'active' : ''}`}
                      onClick={() => void handlePickAsset(asset.id)}
                    >
                      <span className="tool-asset-item-name">{asset.name}</span>
                      <span className="tool-asset-item-meta">
                        {asset.fileCount} files &middot; {formatBytes(asset.totalBytes)}
                      </span>
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
