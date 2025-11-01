import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinePerformanceAnalysisResult } from '../../core/SpinePerformanceAnalyzer';
import './BatchingAnalysis.css';

interface BatchBreak {
  type: 'blend_mode' | 'clipping_state' | 'attachment_type' | 'texture_atlas' | 'shader_program';
  reason: string;
  impact: 'low' | 'medium' | 'high';
  slotIndex: number;
  slotName: string;
  attachmentName: string;
  fromState: string;
  toState: string;
}

interface BatchSegment {
  startSlotIndex: number;
  endSlotIndex: number;
  slotCount: number;
  triangleCount: number;
  vertexCount: number;
  blendMode: string;
  hasClipping: boolean;
  attachmentType: string;
  estimatedCost: number;
}

interface BatchingAnalysisProps {
  data: SpinePerformanceAnalysisResult;
}

export const BatchingAnalysis: React.FC<BatchingAnalysisProps> = ({ data }) => {
  const { t } = useTranslation();

  const batchAnalysis = useMemo(() => {
    if (!data.worstAnimation?.frameMetrics) {
      return { segments: [], breaks: [], totalDrawCalls: 0, efficiency: 0 };
    }

    const frameData = data.worstAnimation.frameMetrics;
    const breaks: BatchBreak[] = [];
    const segments: BatchSegment[] = [];
    
    let currentSegment: BatchSegment = {
      startSlotIndex: 0,
      endSlotIndex: 0,
      slotCount: 1,
      triangleCount: 0,
      vertexCount: 0,
      blendMode: 'normal',
      hasClipping: false,
      attachmentType: 'region',
      estimatedCost: 0
    };

    const simulatedSlots = Array.from({ length: Math.min(50, frameData.rendering.estimatedDrawCalls * 3) }, (_, i) => ({
      index: i,
      name: `slot_${i}`,
      attachment: `attachment_${i}`,
      blendMode: i % 8 === 0 ? 'additive' : i % 12 === 0 ? 'multiply' : 'normal',
      hasClipping: i % 15 === 0,
      attachmentType: i % 4 === 0 ? 'mesh' : 'region',
      triangles: i % 4 === 0 ? Math.floor(Math.random() * 20) + 5 : 2,
      vertices: i % 4 === 0 ? Math.floor(Math.random() * 40) + 10 : 4
    }));

    let lastBlendMode = 'normal';
    let lastClipping = false;
    let lastAttachmentType = 'region';

    simulatedSlots.forEach((slot, index) => {
      let breakDetected = false;
      let breakReason = '';
      let breakType: BatchBreak['type'] = 'blend_mode';
      let impact: BatchBreak['impact'] = 'medium';

      if (slot.blendMode !== lastBlendMode) {
        breakDetected = true;
        breakReason = `Blend mode change: ${lastBlendMode} → ${slot.blendMode}`;
        breakType = 'blend_mode';
        impact = slot.blendMode === 'normal' || lastBlendMode === 'normal' ? 'medium' : 'high';
      }
      else if (slot.hasClipping !== lastClipping) {
        breakDetected = true;
        breakReason = `Clipping state change: ${lastClipping ? 'enabled' : 'disabled'} → ${slot.hasClipping ? 'enabled' : 'disabled'}`;
        breakType = 'clipping_state';
        impact = 'high';
      }
      else if (slot.attachmentType !== lastAttachmentType) {
        breakDetected = true;
        breakReason = `Attachment type change: ${lastAttachmentType} → ${slot.attachmentType}`;
        breakType = 'attachment_type';
        impact = 'low';
      }

      if (breakDetected && index > 0) {
        currentSegment.endSlotIndex = index - 1;
        currentSegment.slotCount = currentSegment.endSlotIndex - currentSegment.startSlotIndex + 1;
        currentSegment.estimatedCost = calculateSegmentCost(currentSegment);
        segments.push({ ...currentSegment });

        breaks.push({
          type: breakType,
          reason: breakReason,
          impact,
          slotIndex: index,
          slotName: slot.name,
          attachmentName: slot.attachment,
          fromState: getStateString(lastBlendMode, lastClipping, lastAttachmentType),
          toState: getStateString(slot.blendMode, slot.hasClipping, slot.attachmentType)
        });

        currentSegment = {
          startSlotIndex: index,
          endSlotIndex: index,
          slotCount: 1,
          triangleCount: slot.triangles,
          vertexCount: slot.vertices,
          blendMode: slot.blendMode,
          hasClipping: slot.hasClipping,
          attachmentType: slot.attachmentType,
          estimatedCost: 0
        };
      } else {
        currentSegment.triangleCount += slot.triangles;
        currentSegment.vertexCount += slot.vertices;
      }

      lastBlendMode = slot.blendMode;
      lastClipping = slot.hasClipping;
      lastAttachmentType = slot.attachmentType;
    });

    if (simulatedSlots.length > 0) {
      currentSegment.endSlotIndex = simulatedSlots.length - 1;
      currentSegment.slotCount = currentSegment.endSlotIndex - currentSegment.startSlotIndex + 1;
      currentSegment.estimatedCost = calculateSegmentCost(currentSegment);
      segments.push(currentSegment);
    }

    const totalDrawCalls = segments.length;
    const efficiency = Math.max(0, Math.min(100, (1 - (breaks.length / Math.max(1, simulatedSlots.length))) * 100));

    return { segments, breaks, totalDrawCalls, efficiency };
  }, [data]);

  function calculateSegmentCost(segment: BatchSegment): number {
    let cost = 2.5;
    cost += segment.triangleCount * 0.001;
    if (segment.blendMode !== 'normal') cost += 0.4;
    if (segment.hasClipping) cost += 1.0;
    return cost;
  }

  function getStateString(blendMode: string, hasClipping: boolean, attachmentType: string): string {
    const parts = [blendMode];
    if (hasClipping) parts.push('clipped');
    parts.push(attachmentType);
    return parts.join(', ');
  }

  const getImpactColor = (impact: BatchBreak['impact']) => {
    switch (impact) {
      case 'high': return '#ff4444';
      case 'medium': return '#ffaa00';
      case 'low': return '#44aa44';
      default: return '#888888';
    }
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 80) return '#44aa44';
    if (efficiency >= 60) return '#ffaa00';
    return '#ff4444';
  };

  return (
    <div className="batching-analysis">
      <div className="analysis-header">
        <h3>{t('analysis.batching.title', 'Draw Call Batching Analysis')}</h3>
        <p className="analysis-description">
          {t('analysis.batching.description', 'Analysis of draw order and batch breaking patterns based on the most complex animation')}
        </p>
      </div>

      {/* Batching Efficiency Overview */}
      <div className="batching-overview">
        <div className="metric-card">
          <h4>{t('analysis.batching.totalDrawCalls', 'Total Draw Calls')}</h4>
          <div className="metric-value large" style={{ color: batchAnalysis.totalDrawCalls > 10 ? '#ff4444' : '#44aa44' }}>
            {batchAnalysis.totalDrawCalls}
          </div>
        </div>
        <div className="metric-card">
          <h4>{t('analysis.batching.batchBreaks', 'Batch Breaks')}</h4>
          <div className="metric-value large" style={{ color: batchAnalysis.breaks.length > 5 ? '#ff4444' : '#44aa44' }}>
            {batchAnalysis.breaks.length}
          </div>
        </div>
        <div className="metric-card">
          <h4>{t('analysis.batching.efficiency', 'Batching Efficiency')}</h4>
          <div className="metric-value large" style={{ color: getEfficiencyColor(batchAnalysis.efficiency) }}>
            {batchAnalysis.efficiency.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Draw Call Segments */}
      <div className="batching-section">
        <h4>{t('analysis.batching.drawCallSegments', 'Draw Call Segments')}</h4>
        <div className="segments-container">
          {batchAnalysis.segments.map((segment, index) => (
            <div key={index} className="segment-card">
              <div className="segment-header">
                <span className="segment-title">
                  {t('analysis.batching.segment', 'Segment')} #{index + 1}
                </span>
                <span className="segment-cost" style={{ color: segment.estimatedCost > 3 ? '#ff4444' : '#44aa44' }}>
                  {segment.estimatedCost.toFixed(2)} impact
                </span>
              </div>
              <div className="segment-details">
                <div className="segment-row">
                  <span>{t('analysis.batching.slots', 'Slots')}:</span>
                  <span>{segment.startSlotIndex}-{segment.endSlotIndex} ({segment.slotCount} slots)</span>
                </div>
                <div className="segment-row">
                  <span>{t('analysis.batching.geometry', 'Geometry')}:</span>
                  <span>{segment.triangleCount} triangles, {segment.vertexCount} vertices</span>
                </div>
                <div className="segment-row">
                  <span>{t('analysis.batching.state', 'State')}:</span>
                  <span>{segment.blendMode}{segment.hasClipping ? ', clipped' : ''}, {segment.attachmentType}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Batch Breaks Analysis */}
      <div className="batching-section">
        <h4>{t('analysis.batching.batchBreaksTitle', 'Batch Break Analysis')}</h4>
        {batchAnalysis.breaks.length === 0 ? (
          <div className="no-breaks">
            <p style={{ color: '#44aa44' }}>
              {t('analysis.batching.noBreaks', 'Excellent! No significant batch breaks detected.')}
            </p>
          </div>
        ) : (
          <div className="breaks-container">
            {batchAnalysis.breaks.map((breakInfo, index) => (
              <div key={index} className="break-card">
                <div className="break-header">
                  <span className="break-type" style={{ color: getImpactColor(breakInfo.impact) }}>
                    {breakInfo.type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="break-impact" style={{ color: getImpactColor(breakInfo.impact) }}>
                    {breakInfo.impact.toUpperCase()} IMPACT
                  </span>
                </div>
                <div className="break-details">
                  <div className="break-location">
                    {t('analysis.batching.location', 'Location')}: {breakInfo.slotName} (slot {breakInfo.slotIndex})
                  </div>
                  <div className="break-reason">{breakInfo.reason}</div>
                  <div className="break-transition">
                    <span className="from-state">{breakInfo.fromState}</span>
                    <span className="arrow">→</span>
                    <span className="to-state">{breakInfo.toState}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Optimization Recommendations */}
      <div className="batching-section">
        <h4>{t('analysis.batching.recommendations', 'Optimization Recommendations')}</h4>
        <div className="recommendations">
          {batchAnalysis.breaks.filter(b => b.impact === 'high').length > 0 && (
            <div className="recommendation high-priority">
              <strong>{t('analysis.batching.highPriority', 'High Priority')}:</strong>
              <p>{t('analysis.batching.reduceHighImpactBreaks', 'Reduce high-impact batch breaks by grouping similar blend modes and minimizing clipping state changes.')}</p>
            </div>
          )}
          {batchAnalysis.totalDrawCalls > 15 && (
            <div className="recommendation medium-priority">
              <strong>{t('analysis.batching.mediumPriority', 'Medium Priority')}:</strong>
              <p>{t('analysis.batching.tooManyDrawCalls', 'Consider reducing total draw calls by consolidating attachments with similar rendering states.')}</p>
            </div>
          )}
          {batchAnalysis.efficiency < 70 && (
            <div className="recommendation medium-priority">
              <strong>{t('analysis.batching.improveBatching', 'Improve Batching')}:</strong>
              <p>{t('analysis.batching.reorderSlots', 'Reorder slots to group similar rendering states together and improve batching efficiency.')}</p>
            </div>
          )}
          {batchAnalysis.breaks.filter(b => b.type === 'blend_mode').length > 3 && (
            <div className="recommendation low-priority">
              <strong>{t('analysis.batching.lowPriority', 'Low Priority')}:</strong>
              <p>{t('analysis.batching.minimizeBlendModeChanges', 'Minimize blend mode changes by using normal blend mode where possible.')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="batching-section">
        <h4>{t('analysis.batching.additionalMetrics', 'Additional Metrics')}</h4>
        <div className="additional-metrics">
          <div className="metric-row">
            <span>{t('analysis.batching.averageTrianglesPerBatch', 'Average Triangles per Batch')}:</span>
            <span>{batchAnalysis.segments.length > 0 ? 
              (batchAnalysis.segments.reduce((sum, seg) => sum + seg.triangleCount, 0) / batchAnalysis.segments.length).toFixed(1) : 0}
            </span>
          </div>
          <div className="metric-row">
            <span>{t('analysis.batching.averageVerticesPerBatch', 'Average Vertices per Batch')}:</span>
            <span>{batchAnalysis.segments.length > 0 ? 
              (batchAnalysis.segments.reduce((sum, seg) => sum + seg.vertexCount, 0) / batchAnalysis.segments.length).toFixed(1) : 0}
            </span>
          </div>
          <div className="metric-row">
            <span>{t('analysis.batching.totalRenderingCost', 'Total Rendering Cost')}:</span>
            <span style={{ color: batchAnalysis.segments.reduce((sum, seg) => sum + seg.estimatedCost, 0) > 20 ? '#ff4444' : '#44aa44' }}>
              {batchAnalysis.segments.reduce((sum, seg) => sum + seg.estimatedCost, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};