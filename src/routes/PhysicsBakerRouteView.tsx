import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useConstraintInspector } from '../hooks/useConstraintInspector';
import { reparentPixiCanvas } from '../hooks/usePixiApp';
import { assetToFiles } from '../core/storage/assetStore';
import { bakeConstraints, BakeReport, ConstraintInfo } from '../core/constraintBaker';

const TYPE_COLORS: Record<ConstraintInfo['type'], string> = {
  ik: '#22D3EE',
  transform: '#FB923C',
  path: '#34D399',
  physics: '#F472B6',
};

export function PhysicsBakerRouteView() {
  const { t } = useTranslation();
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
    selectedAsset,
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    loadCurrentAssetIntoBenchmark,
    uploadBundleFiles,
    togglePhysics,
    toggleIk,
    toggleTransformConstraints,
    togglePathConstraints,
    saveAndLoadOptimizedAsset,
  } = useWorkbench();

  const [selectedConstraintType, setSelectedConstraintType] = useState<ConstraintInfo['type'] | null>(null);
  const [report, setReport] = useState<BakeReport | null>(null);
  const [bakedFiles, setBakedFiles] = useState<File[] | null>(null);
  const [isBaking, setIsBaking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);

  const constraints = useConstraintInspector(spineInstance);

  // Re-parent the singleton PIXI canvas into this route's pixi-host div
  useEffect(() => {
    if (pixiContainerRef.current) {
      reparentPixiCanvas(pixiContainerRef.current);
    }
  });

  // Reset state when asset changes
  useEffect(() => {
    setReport(null);
    setBakedFiles(null);
    setError(null);
    setSelectedConstraintType(null);
  }, [selectedAssetId]);

  // Toggle debug overlay when a constraint type row is clicked
  const handleRowClick = useCallback((type: ConstraintInfo['type']) => {
    // Turn off any previous
    togglePhysics(false);
    toggleIk(false);
    toggleTransformConstraints(false);
    togglePathConstraints(false);

    if (selectedConstraintType === type) {
      // Deselect
      setSelectedConstraintType(null);
      return;
    }

    setSelectedConstraintType(type);
    switch (type) {
      case 'ik': toggleIk(true); break;
      case 'transform': toggleTransformConstraints(true); break;
      case 'path': togglePathConstraints(true); break;
      case 'physics': togglePhysics(true); break;
    }
  }, [selectedConstraintType, togglePhysics, toggleIk, toggleTransformConstraints, togglePathConstraints]);

  // Cleanup debug overlays on unmount
  useEffect(() => {
    return () => {
      togglePhysics(false);
      toggleIk(false);
      toggleTransformConstraints(false);
      togglePathConstraints(false);
    };
  }, [togglePhysics, toggleIk, toggleTransformConstraints, togglePathConstraints]);

  const jsonFile = useMemo(() => {
    if (!selectedAsset) return null;
    return selectedAsset.files.find((f) => f.name.endsWith('.json')) ?? null;
  }, [selectedAsset]);

  const handleLoadSelected = async () => {
    setIsLoadingSelected(true);
    try {
      await loadCurrentAssetIntoBenchmark();
    } finally {
      setIsLoadingSelected(false);
    }
  };

  const handleBakeAll = useCallback(() => {
    if (!spineInstance || !selectedAsset || !jsonFile) {
      setError(t('constraintBaker.bake.noJson'));
      return;
    }

    setIsBaking(true);
    setError(null);

    try {
      const rawText = new TextDecoder().decode(jsonFile.buffer);
      const result = bakeConstraints(spineInstance, rawText);

      const files = assetToFiles(selectedAsset);
      const fileIndex = files.findIndex((f) => f.name === jsonFile.name);
      if (fileIndex >= 0) {
        const bakedBlob = new TextEncoder().encode(result.bakedText);
        files[fileIndex] = new File([bakedBlob], jsonFile.name, { type: 'application/json' });
      }

      setBakedFiles(files);
      setReport(result.report);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBakedFiles(null);
      setReport(null);
    } finally {
      setIsBaking(false);
    }
  }, [spineInstance, selectedAsset, jsonFile, t]);

  const handleSaveAndLoad = useCallback(async () => {
    if (!bakedFiles || !selectedAsset) return;
    setIsSaving(true);
    try {
      const newName = `${selectedAsset.name} (Baked)`;
      const description = 'Constraint-baked skeleton';
      await saveAndLoadOptimizedAsset(bakedFiles, newName, description);
      setReport(null);
      setBakedFiles(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }, [bakedFiles, selectedAsset, saveAndLoadOptimizedAsset]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { ik: 0, transform: 0, path: 0, physics: 0 };
    for (const ci of constraints) c[ci.type]++;
    return c;
  }, [constraints]);

  return (
    <>
      <ToolRouteControls
        assets={assets}
        selectedAssetId={selectedAssetId}
        setSelectedAssetId={(id) => setSelectedAssetId(id)}
        atlasOptions={atlasOptions}
        selectedAtlasName={selectedAtlasName}
        setSelectedAtlasName={setSelectedAtlasName}
        onUploadBundle={uploadBundleFiles}
        onLoadSelected={handleLoadSelected}
        isLoadingSelected={isLoadingSelected}
      />

      <div className="mesh-inspector-layout">
        {/* Left panel — constraint list */}
        <div className="mesh-inspector-panel">
          {spineInstance && constraints.length > 0 ? (
            <>
              {/* Summary stats */}
              <div className="constraint-baker-summary">
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value" style={{ '--dc-stat-color': TYPE_COLORS.ik } as React.CSSProperties}>
                    {counts.ik}
                  </span>
                  <span className="dc-inspector-stat-label">{t('constraintBaker.summary.ik')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value" style={{ '--dc-stat-color': TYPE_COLORS.transform } as React.CSSProperties}>
                    {counts.transform}
                  </span>
                  <span className="dc-inspector-stat-label">{t('constraintBaker.summary.transform')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value" style={{ '--dc-stat-color': TYPE_COLORS.path } as React.CSSProperties}>
                    {counts.path}
                  </span>
                  <span className="dc-inspector-stat-label">{t('constraintBaker.summary.path')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value" style={{ '--dc-stat-color': TYPE_COLORS.physics } as React.CSSProperties}>
                    {counts.physics}
                  </span>
                  <span className="dc-inspector-stat-label">{t('constraintBaker.summary.physics')}</span>
                </div>
              </div>

              {/* List header */}
              <div className="constraint-baker-list-header">
                <span>{t('constraintBaker.list.headers.type')}</span>
                <span>{t('constraintBaker.list.headers.name')}</span>
                <span>{t('constraintBaker.list.headers.target')}</span>
                <span>{t('constraintBaker.list.headers.bones')}</span>
                <span>{t('constraintBaker.list.headers.active')}</span>
              </div>

              {/* Constraint list */}
              <div className="constraint-baker-list">
                {constraints.map((c) => (
                  <div
                    key={`${c.type}-${c.name}`}
                    className={`constraint-baker-row${selectedConstraintType === c.type ? ' selected' : ''}`}
                    style={selectedConstraintType === c.type ? { borderLeftColor: TYPE_COLORS[c.type] } as React.CSSProperties : undefined}
                    onClick={() => handleRowClick(c.type)}
                  >
                    <span className={`constraint-type-badge ${c.type}`}>{c.type.toUpperCase()}</span>
                    <span className="constraint-baker-row-name" title={c.name}>{c.name}</span>
                    <span className="constraint-baker-row-target" title={c.target}>{c.target}</span>
                    <span className="constraint-baker-row-bones">{c.bones.length}</span>
                    <span className={`constraint-baker-row-active ${c.isActive ? 'on' : 'off'}`}>
                      {c.isActive ? 'ON' : 'OFF'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : spineInstance ? (
            <div className="mesh-inspector-empty">
              <h3>{t('constraintBaker.noConstraints')}</h3>
            </div>
          ) : (
            <div className="mesh-inspector-empty">
              <h3>{t('constraintBaker.empty.title')}</h3>
              <p>{t('constraintBaker.empty.hint')}</p>
            </div>
          )}

          {/* Footer: bake controls + report */}
          <div className="constraint-baker-footer">
            <button
              className="primary-btn"
              type="button"
              onClick={handleBakeAll}
              disabled={!spineInstance || !jsonFile || isBaking || constraints.length === 0}
            >
              {isBaking ? t('constraintBaker.bake.baking') : t('constraintBaker.bake.button')}
            </button>

            {error && <p className="error-text">{error}</p>}

            {report && (
              <div className="constraint-baker-report">
                <h4>{t('constraintBaker.bake.report.title')}</h4>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.animationsScanned')}</span>
                  <span>{report.animationCount}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.animationsBaked')}</span>
                  <span>{report.bakedAnimations}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.keyframesGenerated')}</span>
                  <span>{report.totalKeyframesGenerated}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.ikRemoved')}</span>
                  <span>{report.constraintsRemoved.ik}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.transformRemoved')}</span>
                  <span>{report.constraintsRemoved.transform}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.pathRemoved')}</span>
                  <span>{report.constraintsRemoved.path}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.physicsRemoved')}</span>
                  <span>{report.constraintsRemoved.physics}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.affectedBones')}</span>
                  <span>{report.affectedBones.length}</span>
                </div>
                <div className="mesh-inspector-report-row">
                  <span>{t('constraintBaker.bake.report.sampleRate')}</span>
                  <span>{report.sampleRate} fps</span>
                </div>
              </div>
            )}

            {bakedFiles && (
              <button
                className="secondary-btn"
                type="button"
                onClick={handleSaveAndLoad}
                disabled={isSaving}
              >
                {isSaving ? t('constraintBaker.bake.saving') : t('constraintBaker.bake.saveAndLoad')}
              </button>
            )}
          </div>
        </div>

        {/* Right side — canvas + animation controls */}
        <div className="mesh-inspector-canvas">
          <div
            className="canvas-container"
            data-tour="canvas-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div ref={pixiContainerRef} className="pixi-host" />
            <div className="canvas-grid-overlay" />

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
