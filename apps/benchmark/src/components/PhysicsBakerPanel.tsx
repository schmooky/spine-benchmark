import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StoredAsset, StoredAssetFile, assetToFiles } from '../core/storage/assetStore';

interface PhysicsBakerPanelProps {
  asset: StoredAsset | null;
  onLoadBaked: (files: File[]) => Promise<void>;
}

interface PhysicsBakeReport {
  animationCount: number;
  changedAnimations: number;
  removedConstraintDefinitions: number;
  removedTimelineGroups: number;
}

function toText(file: StoredAssetFile): string {
  return new TextDecoder().decode(file.buffer);
}

function fromText(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

function countCollectionEntries(value: any): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return value == null ? 0 : 1;
}

function stripPhysicsKeys(node: any): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) {
    let count = 0;
    node.forEach((item) => {
      count += stripPhysicsKeys(item);
    });
    return count;
  }

  let removed = 0;
  Object.keys(node).forEach((key) => {
    const value = node[key];
    if (/^physics/i.test(key)) {
      removed += countCollectionEntries(value);
      delete node[key];
      return;
    }
    removed += stripPhysicsKeys(value);
  });
  return removed;
}

function bakePhysicsJson(rawText: string): { bakedText: string; report: PhysicsBakeReport } {
  const data = JSON.parse(rawText);
  const animations = data?.animations;

  let removedConstraintDefinitions = 0;
  ['physics', 'physicsConstraints', 'physicsConstraint'].forEach((key) => {
    if (key in data) {
      removedConstraintDefinitions += countCollectionEntries(data[key]);
      delete data[key];
    }
  });

  if (!animations || typeof animations !== 'object') {
    return {
      bakedText: JSON.stringify(data),
      report: {
        animationCount: 0,
        changedAnimations: 0,
        removedConstraintDefinitions,
        removedTimelineGroups: 0,
      },
    };
  }

  let removedTimelineGroups = 0;
  let changedAnimations = 0;
  const animationNames = Object.keys(animations);

  animationNames.forEach((animationName) => {
    const animation = animations[animationName];
    if (!animation || typeof animation !== 'object') return;

    const removedForAnimation = stripPhysicsKeys(animation);
    if (removedForAnimation > 0) {
      removedTimelineGroups += removedForAnimation;
      changedAnimations += 1;
    }
  });

  return {
    bakedText: JSON.stringify(data),
    report: {
      animationCount: animationNames.length,
      changedAnimations,
      removedConstraintDefinitions,
      removedTimelineGroups,
    },
  };
}

export const PhysicsBakerPanel: React.FC<PhysicsBakerPanelProps> = ({ asset, onLoadBaked }) => {
  const { t } = useTranslation();
  const [bakedFiles, setBakedFiles] = useState<File[] | null>(null);
  const [report, setReport] = useState<PhysicsBakeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingIntoBenchmark, setIsLoadingIntoBenchmark] = useState(false);

  const jsonFile = useMemo(() => {
    if (!asset) return null;
    return asset.files.find((file) => file.name.endsWith('.json')) || null;
  }, [asset]);

  const runBake = () => {
    if (!asset || !jsonFile) {
      setError(t('physicsBaker.messages.selectJsonAsset'));
      return;
    }

    try {
      const files = assetToFiles(asset);
      const fileIndex = files.findIndex((file) => file.name === jsonFile.name);
      if (fileIndex < 0) {
        throw new Error(t('physicsBaker.messages.jsonNotFound'));
      }

      const jsonText = toText(jsonFile);
      const result = bakePhysicsJson(jsonText);
      const bakedName = jsonFile.name.replace(/\.json$/i, '.physics-baked.json');
      const bakedJson = new File([fromText(result.bakedText)], bakedName, {
        type: 'application/json',
      });

      files[fileIndex] = bakedJson;
      setBakedFiles(files);
      setReport(result.report);
      setError(null);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : t('physicsBaker.messages.bakeFailed');
      setError(message);
      setBakedFiles(null);
      setReport(null);
    }
  };

  const downloadBaked = () => {
    if (!bakedFiles) return;
    const file = bakedFiles.find((candidate) => candidate.name.endsWith('.physics-baked.json'));
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
    if (!bakedFiles) return;
    setIsLoadingIntoBenchmark(true);
    try {
      await onLoadBaked(bakedFiles);
    } finally {
      setIsLoadingIntoBenchmark(false);
    }
  };

  return (
    <section className="tool-panel">
      <h2>{t('physicsBaker.title')}</h2>
      <p className="tool-subtitle">{t('physicsBaker.subtitle')}</p>

      <div className="optimizer-card">
        <p>
          <strong>{t('physicsBaker.labels.asset')}</strong> {asset ? asset.name : t('physicsBaker.values.noneSelected')}
        </p>
        <p>
          <strong>{t('physicsBaker.labels.json')}</strong> {jsonFile ? jsonFile.name : t('physicsBaker.values.noJson')}
        </p>
        <button type="button" className="primary-btn" onClick={runBake} disabled={!asset || !jsonFile}>
          {t('physicsBaker.actions.bake')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {report && (
        <div className="optimizer-report">
          <h3>{t('physicsBaker.report.title')}</h3>
          <p>{t('physicsBaker.report.animationsScanned', { count: report.animationCount })}</p>
          <p>{t('physicsBaker.report.animationsChanged', { count: report.changedAnimations })}</p>
          <p>{t('physicsBaker.report.constraintDefinitionsRemoved', { count: report.removedConstraintDefinitions })}</p>
          <p>{t('physicsBaker.report.timelineGroupsRemoved', { count: report.removedTimelineGroups })}</p>
          <div className="optimizer-actions">
            <button className="primary-btn" type="button" onClick={downloadBaked}>
              {t('physicsBaker.actions.download')}
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={loadIntoBenchmark}
              disabled={isLoadingIntoBenchmark}
            >
              {isLoadingIntoBenchmark ? t('physicsBaker.actions.loading') : t('physicsBaker.actions.loadInBenchmark')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
