import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { useComparisonApp } from '../hooks/useComparisonApp';
import { ModernSelect } from '../components/ModernSelect';
import { IconButton } from '../components/IconButton';
import { ToggleSwitch } from '../components/ToggleSwitch';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  RewindIcon,
  ForwardIcon,
  ArrowPathIcon,
} from '../components/Icons';

type PickerSide = 'left' | 'right' | null;

export function ComparisonRouteView() {
  const { t } = useTranslation();
  const { assets, formatBytes } = useWorkbench();

  // Refs for the two canvas host divs
  const leftHostRef = useRef<HTMLDivElement | null>(null);
  const rightHostRef = useRef<HTMLDivElement | null>(null);

  // Per-pane hooks
  const leftPane = useComparisonApp(leftHostRef);
  const rightPane = useComparisonApp(rightHostRef);

  // Asset selection
  const [leftAssetId, setLeftAssetId] = useState<string>('');
  const [rightAssetId, setRightAssetId] = useState<string>('');

  // Asset picker modal
  const [pickerSide, setPickerSide] = useState<PickerSide>(null);

  // Shared playback state
  const [currentAnimation, setCurrentAnimation] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Resolved asset names for display
  const leftAssetName = useMemo(
    () => assets.find((a) => a.id === leftAssetId)?.name ?? null,
    [assets, leftAssetId],
  );
  const rightAssetName = useMemo(
    () => assets.find((a) => a.id === rightAssetId)?.name ?? null,
    [assets, rightAssetId],
  );

  // Load asset when selection changes
  useEffect(() => {
    if (!leftAssetId) return;
    const asset = assets.find((a) => a.id === leftAssetId);
    if (asset) leftPane.loadAsset(asset);
  }, [leftAssetId]);

  useEffect(() => {
    if (!rightAssetId) return;
    const asset = assets.find((a) => a.id === rightAssetId);
    if (asset) rightPane.loadAsset(asset);
  }, [rightAssetId]);

  // Handle asset pick from modal
  const handlePickAsset = (assetId: string) => {
    if (pickerSide === 'left') setLeftAssetId(assetId);
    else if (pickerSide === 'right') setRightAssetId(assetId);
    setPickerSide(null);
  };

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

  const animationOptions = useMemo(
    () => animations.map((n) => ({ value: n, label: n })),
    [animations],
  );

  // Auto-select first animation when list changes
  useEffect(() => {
    if (animations.length > 0 && !animations.includes(currentAnimation)) {
      setCurrentAnimation(animations[0]);
    }
  }, [animations]);

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

  // When currentAnimation or isLooping changes, re-apply
  useEffect(() => {
    if (!currentAnimation) return;
    applyAnimation(currentAnimation, isLooping);
    setIsPlaying(true);
  }, [currentAnimation, isLooping, applyAnimation]);

  // Play / pause
  useEffect(() => {
    for (const spine of [leftPane.spine, rightPane.spine]) {
      if (!spine) continue;
      spine.state.timeScale = isPlaying ? 1 : 0;
    }
  }, [isPlaying, leftPane.spine, rightPane.spine]);

  // Playback controls
  const togglePlay = () => setIsPlaying((p) => !p);

  const stop = () => {
    for (const spine of [leftPane.spine, rightPane.spine]) {
      if (!spine) continue;
      spine.state.clearTrack(0);
    }
    setIsPlaying(false);
  };

  const restart = () => {
    if (currentAnimation) applyAnimation(currentAnimation, isLooping);
    setIsPlaying(true);
  };

  const prevAnimation = () => {
    if (animations.length === 0) return;
    const idx = animations.indexOf(currentAnimation);
    const next = idx > 0 ? idx - 1 : animations.length - 1;
    setCurrentAnimation(animations[next]);
  };

  const nextAnimation = () => {
    if (animations.length === 0) return;
    const idx = animations.indexOf(currentAnimation);
    const next = idx < animations.length - 1 ? idx + 1 : 0;
    setCurrentAnimation(animations[next]);
  };

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

  return (
    <div className="comparison-layout">
      <div className="comparison-canvases" ref={wrapperRef}>
        {/* Left pane */}
        <div className="comparison-pane">
          <div className="comparison-pane-header">
            <button
              type="button"
              className="comparison-pane-pick-btn"
              onClick={() => setPickerSide('left')}
            >
              {leftAssetName || t('comparison.selectAsset')}
            </button>
            {leftPane.isLoading && (
              <span className="comparison-pane-badge">{t('ui.loading')}</span>
            )}
          </div>
          <div className="pixi-host" ref={leftHostRef} />
        </div>

        {/* Right pane */}
        <div className="comparison-pane">
          <div className="comparison-pane-header">
            <button
              type="button"
              className="comparison-pane-pick-btn"
              onClick={() => setPickerSide('right')}
            >
              {rightAssetName || t('comparison.selectAsset')}
            </button>
            {rightPane.isLoading && (
              <span className="comparison-pane-badge">{t('ui.loading')}</span>
            )}
          </div>
          <div className="pixi-host" ref={rightHostRef} />
        </div>
      </div>

      {/* Shared animation controls */}
      <div className="comparison-controls">
        <div className="playback-controls">
          <IconButton
            icon={<RewindIcon className="flipped" />}
            onClick={prevAnimation}
            tooltip={t('controls.actions.previous')}
            disabled={animations.length === 0}
          />
          <IconButton
            icon={<StopIcon />}
            onClick={stop}
            tooltip={t('controls.actions.stop')}
          />
          <IconButton
            icon={isPlaying ? <PauseIcon /> : <PlayIcon />}
            onClick={togglePlay}
            tooltip={
              isPlaying
                ? t('controls.actions.pause')
                : t('controls.actions.play')
            }
          />
          <IconButton
            icon={<ArrowPathIcon />}
            onClick={restart}
            tooltip={t('controls.actions.restart')}
          />
          <IconButton
            icon={<ForwardIcon />}
            onClick={nextAnimation}
            tooltip={t('controls.actions.next')}
            disabled={animations.length === 0}
          />
        </div>

        <div className="animation-settings">
          <ToggleSwitch
            checked={isLooping}
            onChange={() => setIsLooping((l) => !l)}
            label={t('controls.labels.loop')}
            tooltip={t('controls.labels.loopHint')}
          />
          <ModernSelect
            value={currentAnimation}
            onChange={setCurrentAnimation}
            options={animationOptions}
            placeholder={t('controls.labels.selectAnimation')}
            disabled={animations.length === 0}
          />
        </div>
      </div>

      {/* Asset picker modal */}
      {pickerSide && (
        <div className="tool-picker-modal-backdrop" onClick={() => setPickerSide(null)}>
          <section className="tool-picker-modal" onClick={(e) => e.stopPropagation()}>
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
                const isSelected =
                  pickerSide === 'left'
                    ? asset.id === leftAssetId
                    : asset.id === rightAssetId;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`tool-asset-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handlePickAsset(asset.id)}
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
  );
}
