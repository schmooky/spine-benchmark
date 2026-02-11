import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset } from '../core/storage/assetStore';
import { analyzeDrawCallsFromAsset } from '../core/tools/drawCallUtils';

interface DrawCallInspectorPanelProps {
  asset: StoredAsset | null;
  atlasFileName: string | null;
}

export const DrawCallInspectorPanel: React.FC<DrawCallInspectorPanelProps> = ({ asset, atlasFileName }) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeDrawCallsFromAsset> | null>(null);

  const hasAnimationStats = useMemo(() => Boolean(analysis?.animationStats?.length), [analysis]);

  const runAnalysis = () => {
    if (!asset) {
      setError(t('drawCallInspector.messages.selectAsset'));
      setAnalysis(null);
      return;
    }
    try {
      const result = analyzeDrawCallsFromAsset(asset, atlasFileName ?? undefined);
      setAnalysis(result);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : t('drawCallInspector.messages.analysisFailed'));
      setAnalysis(null);
    }
  };

  return (
    <section className="tool-panel">
      <h2>{t('drawCallInspector.title')}</h2>
      <p className="tool-subtitle">{t('drawCallInspector.subtitle')}</p>

      <div className="optimizer-card">
        <p>
          <strong>{t('drawCallInspector.labels.asset')}</strong> {asset ? asset.name : t('drawCallInspector.values.noneSelected')}
        </p>
        <button type="button" className="primary-btn" onClick={runAnalysis} disabled={!asset}>
          {t('drawCallInspector.actions.run')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {analysis && (
        <div className="optimizer-report">
          <h3>{t('drawCallInspector.report.title')}</h3>
          <p>{t('drawCallInspector.report.baseDrawCalls', { count: analysis.base.drawCalls })}</p>
          <p>{t('drawCallInspector.report.pageBreaks', { count: analysis.base.pageBreaks })}</p>
          <p>{t('drawCallInspector.report.blendBreaks', { count: analysis.base.blendBreaks })}</p>
          <p>{t('drawCallInspector.report.unknownPages', { count: analysis.base.unknownPageCount })}</p>
          <p>{t('drawCallInspector.report.uniquePages', { count: analysis.uniquePages })}</p>
          <p>{t('drawCallInspector.report.uniqueBlends', { count: analysis.uniqueBlends })}</p>

          {hasAnimationStats && (
            <>
              <h3>{t('drawCallInspector.report.animationSection')}</h3>
              <div className="review-list">
                {analysis.animationStats.slice(0, 10).map((item) => (
                  <div key={item.name} className="review-row">
                    <span>{item.name}</span>
                    <span>{t('drawCallInspector.report.animationWorst', { count: item.worstDrawCalls })}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
