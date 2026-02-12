import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useAnimationHeatmap, FrameMetrics, AnimationHeatmapData } from '../hooks/useAnimationHeatmap';
import { LiveSlotInfo } from '../hooks/useDrawCallInspector';
import { reparentPixiCanvas } from '../hooks/usePixiApp';

function heatColor(value: number, min: number, max: number): string {
  if (max === min) return '#34D399';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  if (t <= 0.5) {
    // green -> yellow
    const r = Math.round(52 + (251 - 52) * (t * 2));
    const g = Math.round(211 + (191 - 211) * (t * 2));
    const b = Math.round(153 + (36 - 153) * (t * 2));
    return `rgb(${r},${g},${b})`;
  }
  // yellow -> red
  const r = Math.round(251 + (248 - 251) * ((t - 0.5) * 2));
  const g = Math.round(191 + (113 - 191) * ((t - 0.5) * 2));
  const b = Math.round(36 + (113 - 36) * ((t - 0.5) * 2));
  return `rgb(${r},${g},${b})`;
}

interface MetricRange {
  min: number;
  max: number;
  avg: number;
}

function computeRange(frames: FrameMetrics[], key: keyof FrameMetrics): MetricRange {
  if (frames.length === 0) return { min: 0, max: 0, avg: 0 };
  const values = frames.map((f) => f[key] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { min, max, avg: Math.round(avg * 10) / 10 };
}

type MetricKey = 'drawCalls' | 'textures' | 'blendBreaks';

const METRIC_ROWS: { key: MetricKey; label: string }[] = [
  { key: 'drawCalls', label: 'DC' },
  { key: 'textures', label: 'TX' },
  { key: 'blendBreaks', label: 'BB' },
];

function HeatmapRow({
  frames,
  metricKey,
  label,
  range,
  hoveredFrame,
  onHoverFrame,
  onClickFrame,
  selectedFrame,
}: {
  frames: FrameMetrics[];
  metricKey: MetricKey;
  label: string;
  range: MetricRange;
  hoveredFrame: number | null;
  onHoverFrame: (index: number | null) => void;
  onClickFrame: (index: number) => void;
  selectedFrame: number | null;
}) {
  return (
    <div className="heatmap-row">
      <span className="heatmap-row-label">{label}</span>
      <div className="heatmap-strip">
        {frames.map((frame, i) => {
          const value = frame[metricKey] as number;
          return (
            <div
              key={i}
              className={`heatmap-cell${selectedFrame === i ? ' selected' : ''}${hoveredFrame === i ? ' hovered' : ''}`}
              style={{ backgroundColor: heatColor(value, range.min, range.max) }}
              onMouseEnter={() => onHoverFrame(i)}
              onMouseLeave={() => onHoverFrame(null)}
              onClick={() => onClickFrame(i)}
              title={`Frame ${i} (${frame.time.toFixed(3)}s): ${label}=${value}`}
            />
          );
        })}
      </div>
      <span className="heatmap-row-range">
        {range.min}–{range.max}
      </span>
    </div>
  );
}

function HeatmapTooltip({ frame, index }: { frame: FrameMetrics; index: number }) {
  return (
    <div className="heatmap-tooltip">
      <div className="heatmap-tooltip-header">
        Frame #{index} — {frame.time.toFixed(3)}s
      </div>
      <div className="heatmap-tooltip-grid">
        <span>DC</span><span>{frame.drawCalls}</span>
        <span>TX</span><span>{frame.textures}</span>
        <span>Page Breaks</span><span>{frame.pageBreaks}</span>
        <span>Blend Breaks</span><span>{frame.blendBreaks}</span>
        <span>Visible Slots</span><span>{frame.visibleSlots}</span>
        <span>Non-Normal Blends</span><span>{frame.nonNormalBlends}</span>
      </div>
    </div>
  );
}

function FrameDetail({ frame, index }: { frame: FrameMetrics; index: number }) {
  return (
    <div className="heatmap-frame-detail">
      <div className="heatmap-frame-detail-header">
        <strong>Frame #{index}</strong>
        <span>{frame.time.toFixed(3)}s</span>
        <span>DC: {frame.drawCalls}</span>
        <span>TX: {frame.textures}</span>
        <span>BB: {frame.blendBreaks}</span>
        <span>PB: {frame.pageBreaks}</span>
      </div>
      <div className="heatmap-slot-list-header">
        <span className="heatmap-slot-idx">#</span>
        <span className="heatmap-slot-name">Slot</span>
        <span className="heatmap-slot-page">Page</span>
        <span className="heatmap-slot-blend">Blend</span>
        <span className="heatmap-slot-break">Break</span>
      </div>
      <div className="heatmap-slot-list">
        {frame.slots.map((slot: LiveSlotInfo) => (
          <div
            key={`${slot.index}-${slot.slotName}`}
            className={`heatmap-slot-row${slot.isBreak ? ' break' : ''}`}
          >
            <span className="heatmap-slot-idx">{slot.index}</span>
            <span className="heatmap-slot-name" title={`${slot.slotName} → ${slot.attachmentName}`}>
              {slot.attachmentName}
            </span>
            <span className="heatmap-slot-page">{slot.atlasPage}</span>
            <span className={`heatmap-slot-blend${slot.blendMode !== 'Normal' ? ' non-normal' : ''}`}>
              {slot.blendMode}
            </span>
            <span className="heatmap-slot-break">{slot.isBreak ? 'YES' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnimationHeatmapPanel({ animData, isSelected, onSelect }: { animData: AnimationHeatmapData; isSelected: boolean; onSelect: () => void }) {
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);

  const ranges = useMemo(() => {
    const r: Record<MetricKey, MetricRange> = {
      drawCalls: computeRange(animData.frames, 'drawCalls'),
      textures: computeRange(animData.frames, 'textures'),
      blendBreaks: computeRange(animData.frames, 'blendBreaks'),
    };
    return r;
  }, [animData.frames]);

  return (
    <div className={`heatmap-animation-panel${isSelected ? ' expanded' : ''}`}>
      <button type="button" className="heatmap-animation-header" onClick={onSelect}>
        <span className="heatmap-animation-name">{animData.animationName}</span>
        <span className="heatmap-animation-meta">
          {animData.duration.toFixed(2)}s / {animData.frames.length} frames
        </span>
      </button>

      {isSelected && (
        <div className="heatmap-animation-body">
          <div className="heatmap-summary-row">
            {METRIC_ROWS.map(({ key, label }) => (
              <span key={key} className="heatmap-summary-stat">
                {label}: {ranges[key].min}–{ranges[key].max} (avg {ranges[key].avg})
              </span>
            ))}
          </div>

          {METRIC_ROWS.map(({ key, label }) => (
            <HeatmapRow
              key={key}
              frames={animData.frames}
              metricKey={key}
              label={label}
              range={ranges[key]}
              hoveredFrame={hoveredFrame}
              onHoverFrame={setHoveredFrame}
              onClickFrame={setSelectedFrame}
              selectedFrame={selectedFrame}
            />
          ))}

          {hoveredFrame !== null && animData.frames[hoveredFrame] && (
            <HeatmapTooltip frame={animData.frames[hoveredFrame]} index={hoveredFrame} />
          )}

          {selectedFrame !== null && animData.frames[selectedFrame] && (
            <FrameDetail frame={animData.frames[selectedFrame]} index={selectedFrame} />
          )}
        </div>
      )}
    </div>
  );
}

export function AnimationHeatmapRouteView() {
  const { t } = useTranslation();
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
  const [selectedAnimIndex, setSelectedAnimIndex] = useState<number>(0);
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
  } = useWorkbench();

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  const { data, isAnalyzing, analyze } = useAnimationHeatmap(spineInstance);

  // Reset selection when data changes
  useEffect(() => {
    setSelectedAnimIndex(0);
  }, [data]);

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

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

      <div className="heatmap-layout">
        {/* Left panel — heatmap analysis */}
        <div className="tool-panel heatmap-panel">
          {spineInstance ? (
            <>
              <div className="heatmap-controls">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={analyze}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? 'Analyzing...' : 'Analyze All Animations'}
                </button>
              </div>

              {data.length > 0 ? (
                <div className="heatmap-results">
                  {data.map((animData, i) => (
                    <AnimationHeatmapPanel
                      key={animData.animationName}
                      animData={animData}
                      isSelected={selectedAnimIndex === i}
                      onSelect={() => setSelectedAnimIndex(i)}
                    />
                  ))}
                </div>
              ) : !isAnalyzing ? (
                <div className="tool-empty">
                  <h3>Animation Heatmap</h3>
                  <p>Click "Analyze All Animations" to sample every frame and generate heatmaps showing draw call, texture, and blend break costs over time.</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="tool-empty">
              <h3>Animation Heatmap</h3>
              <p>Load a Spine asset to analyze animation performance frame-by-frame.</p>
            </div>
          )}
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
