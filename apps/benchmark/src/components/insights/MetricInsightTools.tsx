import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'animejs';

export type InsightTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

export interface InsightMetric {
  id: string;
  label: string;
  value: string;
  note?: string;
  tone?: InsightTone;
}

export interface InsightQuickAction {
  id: string;
  label: string;
  impact: string;
  onRun: () => void;
}

export interface InsightProofBlock {
  id: string;
  label: string;
  delta: string;
  tone?: InsightTone;
}

export interface InsightJumpChip {
  id: string;
  label: string;
  active?: boolean;
  onJump: () => void;
}

export interface InsightExplainer {
  what: string;
  whyNow: string;
  howToFix: string;
  howToVerify: string;
}

export interface MetricInsightModel {
  id: string;
  title: string;
  subtitle: string;
  sample: string;
  metrics: InsightMetric[];
  quickActions: InsightQuickAction[];
  proofBlocks: InsightProofBlock[];
  jumpChips: InsightJumpChip[];
  explainer: InsightExplainer;
}

export interface RouteJumpChip {
  id: string;
  label: string;
  active?: boolean;
  onSelect: () => void;
}

interface RouteJumpStripProps {
  chips: RouteJumpChip[];
  selectionHint?: string;
}

interface RouteStateAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface RouteStateCalloutProps {
  kind: 'loading' | 'error' | 'partial' | 'empty';
  title: string;
  description: string;
  actions?: RouteStateAction[];
}

interface MetricInsightPopoutProps {
  insight: MetricInsightModel | null;
  isPinned: boolean;
  onPin: () => void;
  onUnpin: () => void;
  onOpenExplainer: () => void;
  onRequestClose: () => void;
}

interface MetricExplainerModalProps {
  isOpen: boolean;
  insight: MetricInsightModel | null;
  onClose: () => void;
}

function getToneClass(tone: InsightTone | undefined): string {
  if (!tone) return 'tone-neutral';
  return `tone-${tone}`;
}

export function RouteJumpStrip({ chips, selectionHint }: RouteJumpStripProps) {
  return (
    <div className="route-jump-strip" aria-label="Cross-route navigation">
      <div className="route-jump-strip-row">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`route-jump-chip${chip.active ? ' active' : ''}`}
            onClick={chip.onSelect}
            aria-current={chip.active ? 'page' : undefined}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {selectionHint && <p className="route-jump-hint">{selectionHint}</p>}
    </div>
  );
}

export function RouteStateCallout({ kind, title, description, actions = [] }: RouteStateCalloutProps) {
  return (
    <div className={`route-state-callout ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="route-state-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {actions.length > 0 && (
        <div className="route-state-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.variant === 'primary' ? 'primary-btn' : 'secondary-btn'}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MetricInsightPopout({
  insight,
  isPinned,
  onPin,
  onUnpin,
  onOpenExplainer,
  onRequestClose,
}: MetricInsightPopoutProps) {
  const popoutRef = useRef<HTMLDivElement>(null);
  const metricRef = useRef<HTMLDivElement>(null);
  const [metricIndex, setMetricIndex] = useState(0);

  useEffect(() => {
    setMetricIndex(0);
  }, [insight?.id]);

  const metricCount = insight?.metrics.length ?? 0;
  const clampedIndex = metricCount === 0 ? 0 : ((metricIndex % metricCount) + metricCount) % metricCount;
  const activeMetric = insight?.metrics[clampedIndex] ?? null;

  useEffect(() => {
    if (!insight || !popoutRef.current) return;
    animate(popoutRef.current, {
      opacity: [0, 1],
      translateY: [8, 0],
      scale: [0.98, 1],
      duration: 220,
      ease: 'outQuad',
    });
  }, [insight?.id, isPinned]);

  useEffect(() => {
    if (!activeMetric || !metricRef.current) return;
    animate(metricRef.current, {
      opacity: [0, 1],
      translateX: [6, 0],
      duration: 180,
      ease: 'outQuad',
    });
  }, [activeMetric?.id]);

  useEffect(() => {
    if (!insight) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRequestClose();
        return;
      }
      if (event.key === 'ArrowLeft' && metricCount > 1) {
        event.preventDefault();
        setMetricIndex((prev) => prev - 1);
      }
      if (event.key === 'ArrowRight' && metricCount > 1) {
        event.preventDefault();
        setMetricIndex((prev) => prev + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [insight, metricCount, onRequestClose]);

  if (!insight) return null;

  return (
    <aside className={`metric-insight-popout${isPinned ? ' pinned' : ''}`} ref={popoutRef} aria-live="polite">
      <header className="metric-insight-header">
        <div className="metric-insight-title-block">
          <h3>{insight.title}</h3>
          <p>{insight.subtitle}</p>
        </div>
        <div className="metric-insight-nav">
          <button
            type="button"
            className="icon-btn metric-insight-arrow"
            onClick={() => setMetricIndex((prev) => prev - 1)}
            disabled={metricCount <= 1}
            aria-label="Previous metric"
          >
            &#8249;
          </button>
          <span>{metricCount === 0 ? '0/0' : `${clampedIndex + 1}/${metricCount}`}</span>
          <button
            type="button"
            className="icon-btn metric-insight-arrow"
            onClick={() => setMetricIndex((prev) => prev + 1)}
            disabled={metricCount <= 1}
            aria-label="Next metric"
          >
            &#8250;
          </button>
        </div>
      </header>

      {activeMetric && (
        <div ref={metricRef} className={`metric-insight-metric ${getToneClass(activeMetric.tone)}`}>
          <span className="metric-insight-metric-label">{activeMetric.label}</span>
          <strong>{activeMetric.value}</strong>
          {activeMetric.note && <small>{activeMetric.note}</small>}
        </div>
      )}

      <p className="metric-insight-sample">{insight.sample}</p>

      <div className="metric-insight-quick-actions">
        {insight.quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="metric-insight-action"
            onClick={action.onRun}
          >
            <span>{action.label}</span>
            <small>{action.impact}</small>
          </button>
        ))}
      </div>

      <div className="metric-proof-grid" aria-label="Before and after proof">
        {insight.proofBlocks.map((proof) => (
          <div key={proof.id} className={`metric-proof-card ${getToneClass(proof.tone)}`}>
            <span>{proof.label}</span>
            <strong>{proof.delta}</strong>
          </div>
        ))}
      </div>

      <div className="metric-jump-chips">
        {insight.jumpChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`route-jump-chip${chip.active ? ' active' : ''}`}
            onClick={chip.onJump}
            aria-current={chip.active ? 'page' : undefined}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <footer className="metric-insight-footer">
        <button
          type="button"
          className={isPinned ? 'secondary-btn' : 'primary-btn'}
          onClick={isPinned ? onUnpin : onPin}
        >
          {isPinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" className="secondary-btn" onClick={onOpenExplainer}>
          Explain
        </button>
        <button type="button" className="secondary-btn" onClick={onRequestClose}>
          Close
        </button>
      </footer>
    </aside>
  );
}

export function MetricExplainerModal({ isOpen, insight, onClose }: MetricExplainerModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const sectionRows = useMemo(() => {
    if (!insight) return null;
    return [
      { id: 'what', title: 'What', body: insight.explainer.what },
      { id: 'why-now', title: 'Why now', body: insight.explainer.whyNow },
      { id: 'how-to-fix', title: 'How to fix', body: insight.explainer.howToFix },
      { id: 'how-to-verify', title: 'How to verify', body: insight.explainer.howToVerify },
    ];
  }, [insight]);

  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    animate(modalRef.current, {
      opacity: [0, 1],
      translateY: [10, 0],
      scale: [0.98, 1],
      duration: 220,
      ease: 'outQuad',
    });
    titleRef.current?.focus();
  }, [isOpen, insight?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !insight || !sectionRows) return null;

  return (
    <div className="metric-explainer-backdrop" onClick={onClose}>
      <section
        className="metric-explainer-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-explainer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="metric-explainer-header">
          <div>
            <h2 id="metric-explainer-title" tabIndex={-1} ref={titleRef}>
              {insight.title}
            </h2>
            <p>{insight.subtitle}</p>
          </div>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="metric-explainer-body">
          {sectionRows.map((section) => (
            <section key={section.id} className="metric-explainer-section">
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}

          <section className="metric-explainer-section">
            <h3>Fix now</h3>
            <div className="metric-insight-quick-actions">
              {insight.quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="metric-insight-action"
                  onClick={action.onRun}
                >
                  <span>{action.label}</span>
                  <small>{action.impact}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="metric-explainer-section">
            <h3>Before / after</h3>
            <div className="metric-proof-grid">
              {insight.proofBlocks.map((proof) => (
                <div key={proof.id} className={`metric-proof-card ${getToneClass(proof.tone)}`}>
                  <span>{proof.label}</span>
                  <strong>{proof.delta}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
