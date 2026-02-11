import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset } from '../core/storage/assetStore';
import { analyzeDrawCallsFromAsset, createAtlasRepackPlan } from '../core/tools/drawCallUtils';

interface AtlasRepackPanelProps {
  asset: StoredAsset | null;
  atlasFileName: string | null;
}

export const AtlasRepackPanel: React.FC<AtlasRepackPanelProps> = ({ asset, atlasFileName }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    currentDrawCalls: number;
    theoreticalMinDrawCalls: number;
    potentialSavings: number;
    plan: ReturnType<typeof createAtlasRepackPlan>;
  } | null>(null);

  const runAnalysis = () => {
    if (!asset) {
      setError(t('atlasRepack.messages.selectAsset'));
      setReport(null);
      return;
    }
    try {
      const analysis = analyzeDrawCallsFromAsset(asset, atlasFileName ?? undefined);
      const plan = createAtlasRepackPlan(analysis);
      const theoreticalMinDrawCalls = Math.max(1, analysis.uniqueBlends);
      const potentialSavings = Math.max(0, analysis.base.drawCalls - theoreticalMinDrawCalls);

      setReport({
        currentDrawCalls: analysis.base.drawCalls,
        theoreticalMinDrawCalls,
        potentialSavings,
        plan,
      });
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('atlasRepack.messages.analysisFailed'));
      setReport(null);
    }
  };

  const downloadPlan = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report.plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'atlas-repack-plan.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="tool-panel">
      <h2>{t('atlasRepack.title')}</h2>
      <p className="tool-subtitle">{t('atlasRepack.subtitle')}</p>

      <div className="optimizer-card">
        <p>
          <strong>{t('atlasRepack.labels.asset')}</strong> {asset ? asset.name : t('atlasRepack.values.noneSelected')}
        </p>
        <button type="button" className="primary-btn" onClick={runAnalysis} disabled={!asset}>
          {t('atlasRepack.actions.run')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {report && (
        <div className="optimizer-report">
          <h3>{t('atlasRepack.report.title')}</h3>
          <p>{t('atlasRepack.report.currentDrawCalls', { count: report.currentDrawCalls })}</p>
          <p>{t('atlasRepack.report.theoreticalMin', { count: report.theoreticalMinDrawCalls })}</p>
          <p>{t('atlasRepack.report.potentialSavings', { count: report.potentialSavings })}</p>
          <p>{t('atlasRepack.report.groups', { count: report.plan.blendGroups.length })}</p>
          <button type="button" className="secondary-btn" onClick={downloadPlan}>
            {t('atlasRepack.actions.downloadPlan')}
          </button>
        </div>
      )}
    </section>
  );
};
