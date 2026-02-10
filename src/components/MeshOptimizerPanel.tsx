import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset, StoredAssetFile, assetToFiles } from '../core/storage/assetStore';

interface MeshOptimizerPanelProps {
  asset: StoredAsset | null;
  onLoadOptimized: (files: File[]) => Promise<void>;
}

interface OptimizationReport {
  animationCount: number;
  removedEmptyDeforms: number;
  removedDuplicateFrames: number;
  changedAnimations: number;
}

function toText(file: StoredAssetFile): string {
  return new TextDecoder().decode(file.buffer);
}

function fromText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function deepEqualNumberArray(a: number[] = [], b: number[] = []): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isZeroDeform(vertices: number[] | undefined): boolean {
  if (!vertices || vertices.length === 0) {
    return true;
  }
  return vertices.every((value) => Math.abs(value) < 0.000001);
}

function optimizeJson(rawText: string): { optimizedText: string; report: OptimizationReport } {
  const data = JSON.parse(rawText);
  const animations = data?.animations;

  if (!animations || typeof animations !== 'object') {
    return {
      optimizedText: rawText,
      report: {
        animationCount: 0,
        removedEmptyDeforms: 0,
        removedDuplicateFrames: 0,
        changedAnimations: 0
      }
    };
  }

  let removedEmptyDeforms = 0;
  let removedDuplicateFrames = 0;
  let changedAnimations = 0;
  const animationNames = Object.keys(animations);

  animationNames.forEach((animationName) => {
    const animation = animations[animationName];
    const attachments = animation?.attachments;
    let animationChanged = false;

    if (!attachments || typeof attachments !== 'object') {
      return;
    }

    Object.keys(attachments).forEach((skinName) => {
      const skin = attachments[skinName];
      if (!skin || typeof skin !== 'object') {
        return;
      }

      Object.keys(skin).forEach((slotName) => {
        const slot = skin[slotName];
        if (!slot || typeof slot !== 'object') {
          return;
        }

        Object.keys(slot).forEach((attachmentName) => {
          const attachment = slot[attachmentName];
          const deform = attachment?.deform;
          if (!Array.isArray(deform)) {
            return;
          }

          const allFramesZero = deform.every((frame: any) => isZeroDeform(frame?.vertices));
          if (allFramesZero) {
            delete attachment.deform;
            removedEmptyDeforms += 1;
            animationChanged = true;
            return;
          }

          const deduped: any[] = [];
          let lastOffset = Number.NaN;
          let lastVertices: number[] = [];

          deform.forEach((frame: any, index: number) => {
            const currentOffset = typeof frame.offset === 'number' ? frame.offset : 0;
            const currentVertices = Array.isArray(frame.vertices) ? frame.vertices : [];
            const sameAsPrevious =
              index > 0 &&
              currentOffset === lastOffset &&
              deepEqualNumberArray(currentVertices, lastVertices);

            if (sameAsPrevious) {
              removedDuplicateFrames += 1;
              animationChanged = true;
              return;
            }

            deduped.push(frame);
            lastOffset = currentOffset;
            lastVertices = currentVertices;
          });

          attachment.deform = deduped;
        });
      });
    });

    if (animationChanged) {
      changedAnimations += 1;
    }
  });

  return {
    optimizedText: JSON.stringify(data),
    report: {
      animationCount: animationNames.length,
      removedEmptyDeforms,
      removedDuplicateFrames,
      changedAnimations
    }
  };
}

export const MeshOptimizerPanel: React.FC<MeshOptimizerPanelProps> = ({ asset, onLoadOptimized }) => {
  const { t } = useTranslation();
  const [optimizedFiles, setOptimizedFiles] = useState<File[] | null>(null);
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingIntoBenchmark, setIsLoadingIntoBenchmark] = useState(false);

  const jsonFile = useMemo(() => {
    if (!asset) return null;
    return asset.files.find((file) => file.name.endsWith('.json')) || null;
  }, [asset]);

  const runOptimization = () => {
    if (!asset || !jsonFile) {
      setError(t('meshOptimizer.messages.selectJsonAsset'));
      return;
    }

    try {
      const files = assetToFiles(asset);
      const fileIndex = files.findIndex((file) => file.name === jsonFile.name);
      if (fileIndex < 0) {
        throw new Error(t('meshOptimizer.messages.jsonNotFound'));
      }

      const jsonText = toText(jsonFile);
      const result = optimizeJson(jsonText);
      const optimizedName = jsonFile.name.replace(/\.json$/i, '.optimized.json');
      const optimizedJson = new File([fromText(result.optimizedText)], optimizedName, {
        type: 'application/json'
      });

      files[fileIndex] = optimizedJson;
      setOptimizedFiles(files);
      setReport(result.report);
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : t('meshOptimizer.messages.optimizationFailed');
      setError(message);
      setOptimizedFiles(null);
      setReport(null);
    }
  };

  const downloadOptimized = () => {
    if (!optimizedFiles || !jsonFile) return;
    const file = optimizedFiles.find((candidate) => candidate.name.endsWith('.optimized.json'));
    if (!file) return;

    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const loadIntoBenchmark = async () => {
    if (!optimizedFiles) return;
    setIsLoadingIntoBenchmark(true);
    try {
      await onLoadOptimized(optimizedFiles);
    } finally {
      setIsLoadingIntoBenchmark(false);
    }
  };

  return (
    <section className="tool-panel">
      <h2>{t('meshOptimizer.title')}</h2>
      <p className="tool-subtitle">
        {t('meshOptimizer.subtitle')}
      </p>

      <div className="optimizer-card">
        <p>
          <strong>{t('meshOptimizer.labels.asset')}</strong> {asset ? asset.name : t('meshOptimizer.values.noneSelected')}
        </p>
        <p>
          <strong>{t('meshOptimizer.labels.json')}</strong> {jsonFile ? jsonFile.name : t('meshOptimizer.values.noJson')}
        </p>
        <button className="primary-btn" type="button" onClick={runOptimization} disabled={!asset || !jsonFile}>
          {t('meshOptimizer.actions.run')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {report && (
        <div className="optimizer-report">
          <h3>{t('meshOptimizer.report.title')}</h3>
          <p>{t('meshOptimizer.report.animationsScanned', { count: report.animationCount })}</p>
          <p>{t('meshOptimizer.report.animationsChanged', { count: report.changedAnimations })}</p>
          <p>{t('meshOptimizer.report.emptyRemoved', { count: report.removedEmptyDeforms })}</p>
          <p>{t('meshOptimizer.report.duplicateRemoved', { count: report.removedDuplicateFrames })}</p>
          <div className="optimizer-actions">
            <button className="primary-btn" type="button" onClick={downloadOptimized}>
              {t('meshOptimizer.actions.download')}
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={loadIntoBenchmark}
              disabled={isLoadingIntoBenchmark}
            >
              {isLoadingIntoBenchmark ? t('meshOptimizer.actions.loading') : t('meshOptimizer.actions.loadInBenchmark')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
