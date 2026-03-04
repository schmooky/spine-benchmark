import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteHeaderCard } from '../components/RouteHeaderCard';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { reparentPixiCanvas } from '../hooks/usePixiApp';

const DEFAULT_VIEWPORT_BACKGROUND = '#efefec';
const DEFAULT_MESH_HIGHLIGHT_COLOR = '#2dd4a8';
const DEFAULT_MESH_HIGHLIGHT_WIDTH = 1;
const MIN_MESH_HIGHLIGHT_WIDTH = 1;
const MAX_MESH_HIGHLIGHT_WIDTH = 6;

const VIEWPORT_PALETTE = [
  '#efefec',
  '#f5f5f3',
  '#fbfbf9',
  '#08090c',
  '#0e1117',
  '#161a21',
  '#1e232b',
  '#262c36',
  '#111827',
  '#0f172a',
  '#000000',
];

function normalizeHexColor(value: string, fallback: string): string {
  const candidate = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : fallback;
}

function clampLineWidth(value: number): number {
  return Math.min(MAX_MESH_HIGHLIGHT_WIDTH, Math.max(MIN_MESH_HIGHLIGHT_WIDTH, Math.round(value)));
}

export function OptionsRouteView() {
  const { t } = useTranslation();
  const {
    pixiContainerRef,
    viewportBackground,
    setViewportBackground,
    meshHighlightColor,
    setMeshHighlightColor,
    meshHighlightLineWidth,
    setMeshHighlightLineWidth,
  } = useWorkbench();

  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  }, [pixiContainerRef]);

  const safeViewportBackground = normalizeHexColor(viewportBackground, DEFAULT_VIEWPORT_BACKGROUND);
  const safeMeshHighlightColor = normalizeHexColor(meshHighlightColor, DEFAULT_MESH_HIGHLIGHT_COLOR);
  const safeLineWidth = clampLineWidth(meshHighlightLineWidth);

  const resetViewport = () => {
    setViewportBackground(DEFAULT_VIEWPORT_BACKGROUND);
  };

  const resetHighlight = () => {
    setMeshHighlightColor(DEFAULT_MESH_HIGHLIGHT_COLOR);
    setMeshHighlightLineWidth(DEFAULT_MESH_HIGHLIGHT_WIDTH);
  };

  const resetAll = () => {
    resetViewport();
    resetHighlight();
  };

  return (
    <div className="route-workspace">
      <RouteHeaderCard
        title={t('dashboard.sections.options')}
        subtitle={t('options.subtitle')}
      />

      <div className="route-static-layout options-layout">
        <section className="options-card">
          <header className="options-card-header">
            <h3>{t('options.viewport.title')}</h3>
            <p>{t('options.viewport.description')}</p>
          </header>

          <div className="options-palette">
            {VIEWPORT_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={`options-palette-swatch${safeViewportBackground === color ? ' active' : ''}`}
                style={{ '--swatch-color': color } as React.CSSProperties}
                onClick={() => setViewportBackground(color)}
                aria-label={t('options.viewport.selectColor', { color: color.toUpperCase() })}
                title={color.toUpperCase()}
              />
            ))}
          </div>

          <label className="options-field-row">
            <span>{t('options.viewport.customColor')}</span>
            <div className="options-inline-input">
              <input
                type="color"
                value={safeViewportBackground}
                onChange={(event) => setViewportBackground(event.target.value)}
              />
              <code>{safeViewportBackground.toUpperCase()}</code>
            </div>
          </label>

          <button type="button" className="secondary-btn" onClick={resetViewport}>
            {t('options.viewport.reset')}
          </button>
        </section>

        <section className="options-card">
          <header className="options-card-header">
            <h3>{t('options.highlight.title')}</h3>
            <p>{t('options.highlight.description')}</p>
          </header>

          <label className="options-field-row">
            <span>{t('options.highlight.color')}</span>
            <div className="options-inline-input">
              <input
                type="color"
                value={safeMeshHighlightColor}
                onChange={(event) => setMeshHighlightColor(event.target.value)}
              />
              <code>{safeMeshHighlightColor.toUpperCase()}</code>
            </div>
          </label>

          <label className="options-field-row">
            <span>
              {t('options.highlight.lineWidth')}: {t('options.highlight.lineWidthValue', { value: safeLineWidth })}
            </span>
            <input
              type="range"
              min={MIN_MESH_HIGHLIGHT_WIDTH}
              max={MAX_MESH_HIGHLIGHT_WIDTH}
              step={1}
              value={safeLineWidth}
              onChange={(event) => setMeshHighlightLineWidth(Number.parseFloat(event.target.value))}
            />
          </label>

          <p className="options-footnote">{t('options.highlight.pixelLine')}</p>

          <button type="button" className="secondary-btn" onClick={resetHighlight}>
            {t('options.highlight.reset')}
          </button>
        </section>

        <section className="options-card options-card-compact">
          <button type="button" className="secondary-btn" onClick={resetAll}>
            {t('options.actions.resetAll')}
          </button>
        </section>
      </div>

      <div className="options-canvas-parking" aria-hidden="true">
        <div ref={pixiContainerRef} className="pixi-host" />
      </div>
    </div>
  );
}
