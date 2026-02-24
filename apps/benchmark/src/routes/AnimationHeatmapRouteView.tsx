import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { CanvasStatsOverlay } from '../components/CanvasStatsOverlay';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useAnimationHeatmap, FrameMetrics, AnimationHeatmapData } from '../hooks/useAnimationHeatmap';
import { LiveSlotInfo } from '../hooks/useDrawCallInspector';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { RouteHeaderCard } from '../components/RouteHeaderCard';

type MetricKey = 'drawCalls' | 'textures' | 'blendBreaks';

const METRICS: { key: MetricKey; labelKey: string; color: string }[] = [
  { key: 'drawCalls', labelKey: 'ui.canvasStats.drawCalls', color: '#60A5FA' },
  { key: 'textures', labelKey: 'ui.canvasStats.textures', color: '#FBBF24' },
  { key: 'blendBreaks', labelKey: 'ui.canvasStats.blendBreaks', color: '#F87171' },
];

const CHART_HEIGHT = 120;
const CHART_PADDING = { top: 8, right: 8, bottom: 20, left: 32 };

function MetricChart({
  frames,
  hoveredFrame,
  selectedFrame,
  onHoverFrame,
  onClickFrame,
}: {
  frames: FrameMetrics[];
  hoveredFrame: number | null;
  selectedFrame: number | null;
  onHoverFrame: (index: number | null) => void;
  onClickFrame: (index: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(360);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSvgWidth(entry.contentRect.width);
      }
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const plotW = svgWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

  // Compute global max across all metrics so they share one Y scale
  const globalMax = useMemo(() => {
    let max = 1;
    for (const frame of frames) {
      for (const m of METRICS) {
        const v = frame[m.key] as number;
        if (v > max) max = v;
      }
    }
    return max;
  }, [frames]);

  // Build SVG paths for each metric
  const paths = useMemo(() => {
    if (frames.length === 0 || plotW <= 0) return [];
    const stepX = plotW / Math.max(frames.length - 1, 1);
    return METRICS.map((m) => {
      const points: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const x = CHART_PADDING.left + i * stepX;
        const v = frames[i][m.key] as number;
        const y = CHART_PADDING.top + plotH - (v / globalMax) * plotH;
        points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const line = `M${points.join('L')}`;
      // Area: close path along bottom
      const bottomY = CHART_PADDING.top + plotH;
      const firstX = CHART_PADDING.left;
      const lastX = CHART_PADDING.left + (frames.length - 1) * stepX;
      const area = `${line}L${lastX.toFixed(1)},${bottomY}L${firstX.toFixed(1)},${bottomY}Z`;
      return { ...m, line, area };
    });
  }, [frames, plotW, plotH, globalMax]);

  // Y axis ticks (3-4 ticks)
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = globalMax <= 4 ? 1 : Math.ceil(globalMax / 4);
    for (let v = 0; v <= globalMax; v += step) {
      ticks.push(v);
    }
    if (ticks[ticks.length - 1] < globalMax) ticks.push(globalMax);
    return ticks;
  }, [globalMax]);

  // X axis ticks (frame indices)
  const xTicks = useMemo(() => {
    const count = frames.length;
    if (count <= 1) return [0];
    const step = Math.max(1, Math.floor(count / 5));
    const ticks: number[] = [];
    for (let i = 0; i < count; i += step) ticks.push(i);
    if (ticks[ticks.length - 1] !== count - 1) ticks.push(count - 1);
    return ticks;
  }, [frames.length]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || frames.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - CHART_PADDING.left;
      const stepX = plotW / Math.max(frames.length - 1, 1);
      const idx = Math.round(mouseX / stepX);
      if (idx >= 0 && idx < frames.length) {
        onHoverFrame(idx);
      } else {
        onHoverFrame(null);
      }
    },
    [frames.length, plotW, onHoverFrame],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || frames.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - CHART_PADDING.left;
      const stepX = plotW / Math.max(frames.length - 1, 1);
      const idx = Math.round(mouseX / stepX);
      if (idx >= 0 && idx < frames.length) {
        onClickFrame(idx);
      }
    },
    [frames.length, plotW, onClickFrame],
  );

  const cursorFrameIndex = hoveredFrame ?? selectedFrame;
  const stepX = plotW / Math.max(frames.length - 1, 1);
  const cursorX = cursorFrameIndex !== null ? CHART_PADDING.left + cursorFrameIndex * stepX : null;

  return (
    <svg
      ref={svgRef}
      className="perf-chart-svg"
      width="100%"
      height={CHART_HEIGHT}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHoverFrame(null)}
      onClick={handleClick}
    >
      {/* Y axis gridlines */}
      {yTicks.map((v) => {
        const y = CHART_PADDING.top + plotH - (v / globalMax) * plotH;
        return (
          <g key={`y-${v}`}>
            <line
              x1={CHART_PADDING.left}
              x2={svgWidth - CHART_PADDING.right}
              y1={y}
              y2={y}
              className="perf-chart-gridline"
            />
            <text x={CHART_PADDING.left - 4} y={y + 3} className="perf-chart-axis-label" textAnchor="end">
              {v}
            </text>
          </g>
        );
      })}

      {/* X axis labels */}
      {xTicks.map((i) => {
        const x = CHART_PADDING.left + i * stepX;
        return (
          <text
            key={`x-${i}`}
            x={x}
            y={CHART_HEIGHT - 4}
            className="perf-chart-axis-label"
            textAnchor="middle"
          >
            {i}
          </text>
        );
      })}

      {/* Area fills (drawn first, behind lines) */}
      {paths.map((p) => (
        <path key={`area-${p.key}`} d={p.area} fill={p.color} opacity={0.12} />
      ))}

      {/* Lines */}
      {paths.map((p) => (
        <path key={`line-${p.key}`} d={p.line} fill="none" stroke={p.color} strokeWidth={1.5} />
      ))}

      {/* Cursor line */}
      {cursorX !== null && (
        <line
          x1={cursorX}
          x2={cursorX}
          y1={CHART_PADDING.top}
          y2={CHART_PADDING.top + plotH}
          className="perf-chart-cursor"
        />
      )}

      {/* Cursor dots */}
      {cursorFrameIndex !== null &&
        frames[cursorFrameIndex] &&
        METRICS.map((m) => {
          const v = frames[cursorFrameIndex][m.key] as number;
          const y = CHART_PADDING.top + plotH - (v / globalMax) * plotH;
          return (
            <circle key={`dot-${m.key}`} cx={cursorX!} cy={y} r={3} fill={m.color} stroke="var(--sb-bg-1)" strokeWidth={1.5} />
          );
        })}
    </svg>
  );
}

function ChartTooltip({ frame, index }: { frame: FrameMetrics; index: number }) {
  const { t } = useTranslation();

  return (
    <div className="perf-chart-tooltip">
      <span className="perf-chart-tooltip-frame">{t('animationHeatmap.tooltip.frame', { index, time: frame.time.toFixed(3) })}</span>
      {METRICS.map((m) => (
        <span key={m.key} className="perf-chart-tooltip-val" style={{ color: m.color }}>
          {t('animationHeatmap.tooltip.metric', { label: t(m.labelKey), value: frame[m.key] as number })}
        </span>
      ))}
      <span className="perf-chart-tooltip-val">{t('animationHeatmap.tooltip.pageBreaks', { value: frame.pageBreaks })}</span>
      <span className="perf-chart-tooltip-val">{t('animationHeatmap.tooltip.visibleSlots', { value: frame.visibleSlots })}</span>
    </div>
  );
}

function FrameDetail({ frame, index }: { frame: FrameMetrics; index: number }) {
  const { t } = useTranslation();

  return (
    <div className="heatmap-frame-detail">
      <div className="heatmap-frame-detail-header">
        <strong>{t('animationHeatmap.frameDetail.frameTitle', { index })}</strong>
        <span>{t('animationHeatmap.frameDetail.time', { time: frame.time.toFixed(3) })}</span>
        <span>{t('animationHeatmap.frameDetail.drawCalls', { value: frame.drawCalls })}</span>
        <span>{t('animationHeatmap.frameDetail.textures', { value: frame.textures })}</span>
        <span>{t('animationHeatmap.frameDetail.blendBreaks', { value: frame.blendBreaks })}</span>
        <span>{t('animationHeatmap.frameDetail.pageBreaks', { value: frame.pageBreaks })}</span>
      </div>
      <div className="heatmap-slot-list-header">
        <span className="heatmap-slot-idx">{t('drawCallInspector.list.headers.index')}</span>
        <span className="heatmap-slot-name">{t('animationHeatmap.frameDetail.slot')}</span>
        <span className="heatmap-slot-page">{t('animationHeatmap.frameDetail.page')}</span>
        <span className="heatmap-slot-blend">{t('animationHeatmap.frameDetail.blend')}</span>
        <span className="heatmap-slot-break">{t('animationHeatmap.frameDetail.break')}</span>
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
            <span className="heatmap-slot-break">{slot.isBreak ? t('ui.yes') : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
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

function AnimationHeatmapPanel({ animData, isSelected, onSelect }: { animData: AnimationHeatmapData; isSelected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
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
          {t('animationHeatmap.animationMeta', {
            duration: animData.duration.toFixed(2),
            frames: animData.frames.length,
          })}
        </span>
      </button>

      {isSelected && (
        <div className="heatmap-animation-body">
          {/* Legend */}
          <div className="perf-chart-legend">
            {METRICS.map((m) => (
              <span key={m.key} className="perf-chart-legend-item">
                <span className="perf-chart-legend-swatch" style={{ background: m.color }} />
                {t('animationHeatmap.legend.metricRange', {
                  label: t(m.labelKey),
                  min: ranges[m.key].min,
                  max: ranges[m.key].max,
                  avg: ranges[m.key].avg,
                })}
              </span>
            ))}
          </div>

          {/* Chart */}
          <MetricChart
            frames={animData.frames}
            hoveredFrame={hoveredFrame}
            selectedFrame={selectedFrame}
            onHoverFrame={setHoveredFrame}
            onClickFrame={setSelectedFrame}
          />

          {/* Tooltip on hover */}
          {hoveredFrame !== null && animData.frames[hoveredFrame] && (
            <ChartTooltip frame={animData.frames[hoveredFrame]} index={hoveredFrame} />
          )}

          {/* Frame detail on click */}
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
    loadStoredAsset,
    loadFromUrls,
    uploadBundleFiles,
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

  // Auto-run heatmap analysis whenever a spine is available.
  useEffect(() => {
    if (!spineInstance || isAnalyzing) return;
    analyze();
  }, [spineInstance, isAnalyzing, analyze]);

  const handlePickAsset = async (assetId: string) => {
    const asset = assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    setIsLoadingSelected(true);
    try {
      setSelectedAssetId(assetId);
      await loadStoredAsset(asset);
    } finally {
      setIsLoadingSelected(false);
    }
  };

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.tools.animationHeatmap')}
        subtitle={t('animationHeatmap.subtitle')}
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

      <div className="heatmap-layout">
        {/* Left panel — performance charts */}
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
                  {isAnalyzing ? t('animationHeatmap.actions.analyzing') : t('animationHeatmap.actions.analyzeAll')}
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
                  <h3>{t('animationHeatmap.empty.title')}</h3>
                  <p>{t('animationHeatmap.empty.hint')}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="tool-empty">
              <h3>{t('animationHeatmap.empty.title')}</h3>
              <p>{t('animationHeatmap.empty.loadHint')}</p>
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
    </div>
  );
}
