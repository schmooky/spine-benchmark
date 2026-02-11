import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimationControls } from '../components/AnimationControls';
import { useWorkbench } from '../workbench/WorkbenchContext';
import { ToolRouteControls } from '../components/ToolRouteControls';
import { useDrawCallInspector, LiveSlotInfo } from '../hooks/useDrawCallInspector';

const PAGE_COLORS = [
  '#2DD4A8', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA',
  '#34D399', '#FB923C', '#22D3EE', '#F87171', '#818CF8',
];

function getPageColor(pageName: string, colorMap: Map<string, string>): string {
  if (colorMap.has(pageName)) return colorMap.get(pageName)!;
  const color = PAGE_COLORS[colorMap.size % PAGE_COLORS.length];
  colorMap.set(pageName, color);
  return color;
}

export function DrawCallInspectorRouteView() {
  const { t } = useTranslation();
  const [isLoadingSelected, setIsLoadingSelected] = useState(false);
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
    atlasOptions,
    selectedAtlasName,
    setSelectedAtlasName,
    loadCurrentAssetIntoBenchmark,
    uploadBundleFiles,
  } = useWorkbench();

  const snapshot = useDrawCallInspector(spineInstance);

  const pageColorMap = useMemo(() => {
    const map = new Map<string, string>();
    snapshot.slots.forEach((slot) => getPageColor(slot.atlasPage, map));
    return map;
  }, [snapshot.slots]);

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

      <div className="dc-inspector-layout">
        {/* Left panel — live slot list */}
        <div className="dc-inspector-panel">
          {spineInstance && snapshot.slots.length > 0 ? (
            <>
              <div className="dc-inspector-summary">
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value">{snapshot.drawCallCount}</span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.drawCalls')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value">{snapshot.pageBreaks}</span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.pageBreaks')}</span>
                </div>
                <div className="dc-inspector-stat">
                  <span className="dc-inspector-stat-value">{snapshot.blendBreaks}</span>
                  <span className="dc-inspector-stat-label">{t('drawCallInspector.summary.blendBreaks')}</span>
                </div>
              </div>

              <div className="dc-inspector-list-header">
                <span className="dc-inspector-row-index">{t('drawCallInspector.list.headers.index')}</span>
                <span className="dc-inspector-row-attachment">{t('drawCallInspector.list.headers.attachment')}</span>
                <span className="dc-inspector-row-page">{t('drawCallInspector.list.headers.page')}</span>
                <span className="dc-inspector-row-blend">{t('drawCallInspector.list.headers.blend')}</span>
              </div>

              <div className="dc-inspector-list">
                {snapshot.slots.map((slot: LiveSlotInfo) => (
                  <div
                    key={`${slot.index}-${slot.slotName}`}
                    className={`dc-inspector-row${slot.isBreak ? ' break' : ''}`}
                  >
                    <span className="dc-inspector-row-index">{slot.index}</span>
                    <span className="dc-inspector-row-attachment" title={`${slot.slotName} → ${slot.attachmentName}`}>
                      {slot.attachmentName}
                    </span>
                    <span
                      className="dc-inspector-row-page"
                      style={{ '--page-color': pageColorMap.get(slot.atlasPage) ?? PAGE_COLORS[0] } as React.CSSProperties}
                    >
                      {slot.atlasPage}
                    </span>
                    <span className={`dc-inspector-row-blend ${slot.blendMode !== 'Normal' ? 'non-normal' : ''}`}>
                      {slot.blendMode}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="dc-inspector-empty">
              <h3>{t('drawCallInspector.empty.title')}</h3>
              <p>{t('drawCallInspector.empty.hint')}</p>
            </div>
          )}
        </div>

        {/* Right side — canvas + animation controls */}
        <div className="dc-inspector-canvas">
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
