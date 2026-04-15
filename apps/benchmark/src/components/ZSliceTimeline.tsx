import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { useTranslation } from 'react-i18next';
import type { PrerenderStatus } from '../hooks/usePrerender';

/* ── Props ─────────────────────────────────────────────────────────── */

interface ZSliceTimelineProps {
  spineInstance: Spine;
  /** Total number of prerendered frames (0 while prerender hasn't finished) */
  totalFrames: number;
  /** Current frame index */
  currentFrame: number;
  /** Callback when user scrubs to a new frame */
  onFrameChange: (frame: number) => void;
  /** Current prerender status */
  prerenderStatus: PrerenderStatus;
  /** 0-1 prerender progress */
  prerenderProgress: number;
  /** Called when user picks a different animation */
  onAnimationChange: (name: string) => void;
  /** Called when user picks a different skin */
  onSkinChange: (name: string) => void;
  /** Currently selected animation name */
  animationName: string;
  /** Currently selected skin name */
  skinName: string;
}

/* ── Component ─────────────────────────────────────────────────────── */

export const ZSliceTimeline: React.FC<ZSliceTimelineProps> = ({
  spineInstance,
  totalFrames,
  currentFrame,
  onFrameChange,
  prerenderStatus,
  prerenderProgress,
  onAnimationChange,
  onSkinChange,
  animationName,
  skinName,
}) => {
  const { t } = useTranslation();
  const [animations, setAnimations] = useState<string[]>([]);
  const [skins, setSkins] = useState<string[]>([]);
  const [animationSelectWidth, setAnimationSelectWidth] = useState(92);
  const animationSelectMeasureRef = useRef<HTMLSpanElement | null>(null);

  // ── Populate animation / skin lists ────────────────────────────
  useEffect(() => {
    if (!spineInstance?.skeleton?.data) return;

    const animNames = spineInstance.skeleton.data.animations.map((a) => a.name);
    setAnimations(animNames);

    const skinNames = spineInstance.skeleton.data.skins.map((s) => s.name);
    setSkins(skinNames);

    // If no animation selected yet, pick the first one
    if (!animationName && animNames.length > 0) {
      onAnimationChange(animNames[0]);
    }
    // If no skin selected yet, pick current or first
    if (!skinName) {
      const activeSkin = spineInstance.skeleton.skin?.name || skinNames[0] || '';
      if (activeSkin) onSkinChange(activeSkin);
    }
  }, [spineInstance]);

  // ── Auto-size animation select ─────────────────────────────────
  const selectLabel = animationName || animations[0] || t('ui.default');
  useLayoutEffect(() => {
    const el = animationSelectMeasureRef.current;
    if (!el) return;
    const measured = Math.ceil(el.getBoundingClientRect().width);
    setAnimationSelectWidth(Math.max(92, measured + 34));
  }, [selectLabel]);

  const hasSkins = skins.length > 0;
  const isPrerendering = prerenderStatus === 'prerendering';
  const isReady = prerenderStatus === 'ready' && totalFrames > 0;
  const maxFrame = Math.max(0, totalFrames - 1);

  return (
    <div className="animation-controls">
      {/* Row 1: Frame scrubber */}
      <div className="animation-controls-row animation-controls-row-playback" style={{ gap: 8 }}>
        <span
          className="animation-select-prefix"
          style={{ whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7, minWidth: 46 }}
        >
          {t('zSlice.timeline.frame')} {isReady ? currentFrame + 1 : '-'}
          <span style={{ opacity: 0.4 }}> / {isReady ? totalFrames : '-'}</span>
        </span>

        <input
          type="range"
          className="zslice-slider"
          min={0}
          max={maxFrame}
          step={1}
          value={currentFrame}
          onChange={(e) => onFrameChange(Number(e.target.value))}
          disabled={!isReady}
          title={t('zSlice.timeline.scrub')}
          style={{ flex: 1 }}
        />

        {isPrerendering && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#60A5FA',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                width: 60,
                height: 3,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(prerenderProgress * 100)}%`,
                  height: '100%',
                  background: '#60A5FA',
                  borderRadius: 2,
                  transition: 'width 0.15s ease-out',
                }}
              />
            </div>
            {Math.round(prerenderProgress * 100)}%
          </div>
        )}
      </div>

      {/* Row 2: Animation + Skin selects */}
      <div className="animation-controls-row animation-controls-row-selects">
        <label className="animation-select-chip animation-select-chip-animation">
          <span className="animation-select-prefix">{t('controls.labels.selectAnimation')}:</span>
          <select
            className="animation-select-native"
            value={animationName}
            onChange={(e) => onAnimationChange(e.target.value)}
            style={{ width: `${animationSelectWidth}px` }}
          >
            {animations.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span
            ref={animationSelectMeasureRef}
            className="animation-select-measure"
            aria-hidden="true"
          >
            {selectLabel}
          </span>
        </label>

        <label className="animation-select-chip animation-select-chip-skin">
          <span className="animation-select-prefix">{t('controls.labels.selectSkin')}:</span>
          <select
            className="animation-select-native"
            value={hasSkins ? skinName : 'default'}
            onChange={(e) => onSkinChange(e.target.value)}
            disabled={skins.length <= 1}
          >
            {hasSkins ? (
              skins.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))
            ) : (
              <option value="default">{t('ui.default')}</option>
            )}
          </select>
        </label>
      </div>
    </div>
  );
};
