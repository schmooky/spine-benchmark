import React, { useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'animejs';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <div className="route-jump-strip" aria-label={t('ui.insights.crossRouteNavigation')}>
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
  const { t } = useTranslation();
  const popoutRef = useRef<HTMLDivElement>(null);
  const metricsRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(isPinned);
  }, [insight?.id, isPinned]);

  useEffect(() => {
    if (isPinned) {
      setIsExpanded(true);
    }
  }, [isPinned]);

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
    if (!insight || !metricsRef.current) return;
    animate(metricsRef.current, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 180,
      ease: 'outQuad',
    });
  }, [insight?.id]);

  useEffect(() => {
    if (!isExpanded || !bodyRef.current) return;
    animate(bodyRef.current, {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 180,
      ease: 'outQuad',
    });
  }, [isExpanded, insight?.id]);

  useEffect(() => {
    if (!insight) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onRequestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [insight, onRequestClose]);

  if (!insight) return null;

  return (
    <aside
      className={`metric-insight-popout${isPinned ? ' pinned' : ''}${isExpanded ? ' expanded' : ' collapsed'}`}
      ref={popoutRef}
      aria-live="polite"
    >
      <header className="metric-insight-header">
        <div className="metric-insight-title-block">
          <h3>{insight.title}</h3>
          <p>{insight.subtitle}</p>
        </div>
      </header>

      <div className="metric-insight-metrics" ref={metricsRef}>
        {insight.metrics.map((metric) => (
          <div key={metric.id} className={`metric-insight-metric ${getToneClass(metric.tone)}`}>
            <span className="metric-insight-metric-label">{metric.label}</span>
            <strong>{metric.value}</strong>
            {metric.note && <small>{metric.note}</small>}
          </div>
        ))}
      </div>

      <p className="metric-insight-sample">{insight.sample}</p>

      {isExpanded && (
        <div className="metric-insight-body" ref={bodyRef}>
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

          <div className="metric-proof-grid" aria-label={t('ui.insights.beforeAfterProof')}>
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
        </div>
      )}

      <footer className="metric-insight-footer">
        <button
          type="button"
          className={isPinned ? 'secondary-btn' : 'primary-btn'}
          onClick={isPinned ? onUnpin : onPin}
        >
          {isPinned ? t('ui.insights.actions.unpin') : t('ui.insights.actions.pin')}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? t('ui.insights.actions.collapse') : t('ui.insights.actions.expand')}
        </button>
        <button type="button" className="secondary-btn" onClick={onOpenExplainer}>
          {t('ui.insights.actions.explain')}
        </button>
        <button type="button" className="secondary-btn" onClick={onRequestClose}>
          {t('ui.close')}
        </button>
      </footer>
    </aside>
  );
}

export function MetricExplainerModal({ isOpen, insight, onClose }: MetricExplainerModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const sectionRows = useMemo(() => {
    if (!insight) return null;
    return [
      { id: 'what', title: t('ui.insights.explainer.what'), body: insight.explainer.what },
      { id: 'why-now', title: t('ui.insights.explainer.whyNow'), body: insight.explainer.whyNow },
      { id: 'how-to-fix', title: t('ui.insights.explainer.howToFix'), body: insight.explainer.howToFix },
      { id: 'how-to-verify', title: t('ui.insights.explainer.howToVerify'), body: insight.explainer.howToVerify },
    ];
  }, [insight, t]);

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
            {t('ui.close')}
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
            <h3>{t('ui.insights.fixNow')}</h3>
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
            <h3>{t('ui.insights.beforeAfter')}</h3>
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
