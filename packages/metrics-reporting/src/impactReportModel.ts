import type { AnimationAnalysis, SpineAnalysisResult } from '@spine-benchmark/metrics-pipeline';

export type ImpactLevel = 'minimal' | 'low' | 'moderate' | 'high' | 'veryHigh';
export type ImpactRowTone = 'neutral' | 'warning' | 'danger';
export type AdvisorSeverity = 'info' | 'warning' | 'critical';
export type AdvisorCategory = 'pageBreaks' | 'blendSwitches' | 'meshDensity' | 'constraints';
export type DeltaDirection = 'better' | 'worse' | 'neutral' | 'new' | 'removed';

export interface ImpactSupplementalAnimationMetrics {
  drawCalls?: number;
  pageBreaks?: number;
}

export interface ImpactSupplementalMetrics {
  // Base draw-call pressure from asset-level analysis, if available.
  drawCalls?: number;
  pageBreaks?: number;
  blendBreaks?: number;
  uniquePages?: number;
  perAnimation?: Record<string, ImpactSupplementalAnimationMetrics>;
}

export interface ImpactBadge {
  level: ImpactLevel;
  cost: number;
}

export interface ImpactAnimationEntry {
  name: string;
  durationSec: number;
  rendering: ImpactBadge;
  computational: ImpactBadge;
  totalCost: number;
  rowTone: ImpactRowTone;
  activeFeatures: Array<'physics' | 'ik' | 'clipping' | 'blend'>;
  hotspots: {
    pageBreaks: number;
    blendSwitches: number;
    meshDensity: number;
    constraints: number;
    physicsConstraints: number;
    ikConstraints: number;
  };
}

export interface ImpactSummarySection {
  worst: ImpactBadge;
  metrics: Array<{
    key:
      | 'peakBlendSwitches'
      | 'peakClipMasks'
      | 'peakVertices'
      | 'peakPageBreaks'
      | 'peakPhysics'
      | 'peakIk'
      | 'peakDeformedMeshes'
      | 'peakWeightedMeshes'
      | 'peakConstraints';
    value: number;
  }>;
}

export interface ImpactAdvisorItem {
  id: string;
  category: AdvisorCategory;
  severity: AdvisorSeverity;
  titleKey: string;
  bodyKey: string;
  params: Record<string, number | string>;
  affectedAnimations: string[];
}

export interface ImpactReportModel {
  schemaVersion: 1;
  generatedAt: string;
  skeleton: {
    name: string;
    totalBones: number;
    maxDepth: number;
    totalAnimations: number;
    totalSkins: number;
  };
  overview: {
    totalAnimations: number;
    animationsWithPhysics: number;
    animationsWithClipping: number;
    animationsWithBlendModes: number;
  };
  summary: {
    rendering: ImpactSummarySection;
    computational: ImpactSummarySection;
  };
  hotspots: {
    peakPageBreaks: number;
    peakBlendSwitches: number;
    peakMeshDensity: number;
    peakConstraintLoad: number;
    peakPhysicsConstraints: number;
    peakIkConstraints: number;
  };
  animations: ImpactAnimationEntry[];
  advisor: ImpactAdvisorItem[];
  sourceStats: SpineAnalysisResult['stats'];
}

export interface ImpactDeltaMetric {
  key: 'rendering' | 'computational' | 'total' | 'pageBreaks' | 'blendSwitches' | 'meshDensity' | 'constraints';
  current: ImpactBadge;
  baseline: ImpactBadge;
  delta: number;
  direction: Exclude<DeltaDirection, 'new' | 'removed'>;
}

export interface ImpactDeltaAnimation {
  name: string;
  currentTotalCost: number | null;
  baselineTotalCost: number | null;
  delta: number | null;
  direction: DeltaDirection;
}

export interface ImpactDeltaModel {
  baselineSkeletonName: string;
  currentSkeletonName: string;
  metrics: ImpactDeltaMetric[];
  animations: ImpactDeltaAnimation[];
}

const EPSILON = 0.05;

export function impactFromCost(cost: number): ImpactBadge {
  if (cost < 3) return { level: 'minimal', cost };
  if (cost < 8) return { level: 'low', cost };
  if (cost < 15) return { level: 'moderate', cost };
  if (cost < 25) return { level: 'high', cost };
  return { level: 'veryHigh', cost };
}

export function renderingImpactCost(animation: AnimationAnalysis): number {
  return (
    animation.blendModeMetrics.activeNonNormalCount * 3 +
    animation.clippingMetrics.activeMaskCount * 5 +
    animation.meshMetrics.totalVertices / 200
  );
}

export function computationalImpactCost(animation: AnimationAnalysis): number {
  return (
    animation.constraintMetrics.activePhysicsCount * 4 +
    animation.constraintMetrics.activeIkCount * 2 +
    animation.constraintMetrics.activeTransformCount * 1.5 +
    animation.constraintMetrics.activePathCount * 2.5 +
    animation.meshMetrics.deformedMeshCount * 1.5 +
    animation.meshMetrics.weightedMeshCount * 2
  );
}

function rowTone(totalCost: number): ImpactRowTone {
  if (totalCost >= 25) return 'danger';
  if (totalCost >= 15) return 'warning';
  return 'neutral';
}

function pickActiveFeatures(animation: AnimationAnalysis): Array<'physics' | 'ik' | 'clipping' | 'blend'> {
  const features: Array<'physics' | 'ik' | 'clipping' | 'blend'> = [];
  if (animation.activeComponents.hasPhysics) features.push('physics');
  if (animation.activeComponents.hasIK) features.push('ik');
  if (animation.activeComponents.hasClipping) features.push('clipping');
  if (animation.activeComponents.hasBlendModes) features.push('blend');
  return features;
}

function animationHotspots(
  animation: AnimationAnalysis,
  supplemental?: ImpactSupplementalAnimationMetrics,
): ImpactAnimationEntry['hotspots'] {
  const drawCalls = supplemental?.drawCalls ?? 0;
  const explicitPageBreaks = supplemental?.pageBreaks;
  const estimatedPageBreaks =
    explicitPageBreaks ??
    Math.max(0, drawCalls - 1, animation.blendModeMetrics.activeNonNormalCount + animation.clippingMetrics.activeMaskCount);

  return {
    pageBreaks: estimatedPageBreaks,
    blendSwitches: animation.blendModeMetrics.activeNonNormalCount,
    meshDensity: animation.meshMetrics.totalVertices,
    constraints: animation.constraintMetrics.totalActiveConstraints,
    physicsConstraints: animation.constraintMetrics.activePhysicsCount,
    ikConstraints: animation.constraintMetrics.activeIkCount,
  };
}

function worstImpact(items: ImpactBadge[]): ImpactBadge {
  if (items.length === 0) return impactFromCost(0);
  return items.reduce((worst, current) => (current.cost > worst.cost ? current : worst), items[0]);
}

function severityFrom(value: number, warningThreshold: number, criticalThreshold: number): AdvisorSeverity | null {
  if (value >= criticalThreshold) return 'critical';
  if (value >= warningThreshold) return 'warning';
  return null;
}

function createAdvisor(
  animations: ImpactAnimationEntry[],
  hotspots: ImpactReportModel['hotspots'],
  supplemental?: ImpactSupplementalMetrics,
): ImpactAdvisorItem[] {
  const items: ImpactAdvisorItem[] = [];

  const pageBreakSeverity = severityFrom(hotspots.peakPageBreaks, 4, 8);
  if (pageBreakSeverity) {
    const affected = animations
      .filter((entry) => entry.hotspots.pageBreaks >= Math.max(2, Math.floor(hotspots.peakPageBreaks * 0.5)))
      .slice(0, 3)
      .map((entry) => entry.name);
    items.push({
      id: 'page-break-pressure',
      category: 'pageBreaks',
      severity: pageBreakSeverity,
      titleKey: 'analysis.summary.advisor.rules.pageBreakPressure.title',
      bodyKey: 'analysis.summary.advisor.rules.pageBreakPressure.body',
      params: {
        pageBreaks: hotspots.peakPageBreaks,
        drawCalls: supplemental?.drawCalls ?? 0,
        uniquePages: supplemental?.uniquePages ?? 0,
      },
      affectedAnimations: affected,
    });
  }

  const blendSeverity = severityFrom(hotspots.peakBlendSwitches, 2, 4);
  if (blendSeverity) {
    const affected = animations
      .filter((entry) => entry.hotspots.blendSwitches >= Math.max(1, Math.floor(hotspots.peakBlendSwitches * 0.5)))
      .slice(0, 3)
      .map((entry) => entry.name);
    items.push({
      id: 'blend-switch-pressure',
      category: 'blendSwitches',
      severity: blendSeverity,
      titleKey: 'analysis.summary.advisor.rules.blendSwitchPressure.title',
      bodyKey: 'analysis.summary.advisor.rules.blendSwitchPressure.body',
      params: {
        switches: hotspots.peakBlendSwitches,
      },
      affectedAnimations: affected,
    });
  }

  const meshSeverity =
    severityFrom(hotspots.peakMeshDensity, 450, 800) ??
    severityFrom(
      Math.max(
        ...animations.map((entry) => Math.max(entry.hotspots.meshDensity / 120, entry.hotspots.pageBreaks, entry.hotspots.blendSwitches)),
      ),
      4,
      6,
    );

  if (meshSeverity) {
    const affected = animations
      .filter((entry) => entry.hotspots.meshDensity >= Math.max(300, Math.floor(hotspots.peakMeshDensity * 0.5)))
      .slice(0, 3)
      .map((entry) => entry.name);
    items.push({
      id: 'mesh-density-pressure',
      category: 'meshDensity',
      severity: meshSeverity,
      titleKey: 'analysis.summary.advisor.rules.meshDensityPressure.title',
      bodyKey: 'analysis.summary.advisor.rules.meshDensityPressure.body',
      params: {
        vertices: hotspots.peakMeshDensity,
      },
      affectedAnimations: affected,
    });
  }

  const constraintSeverity =
    severityFrom(hotspots.peakConstraintLoad, 5, 9) ??
    severityFrom(hotspots.peakPhysicsConstraints * 2 + hotspots.peakIkConstraints, 4, 6);

  if (constraintSeverity) {
    const affected = animations
      .filter((entry) => entry.hotspots.constraints >= Math.max(3, Math.floor(hotspots.peakConstraintLoad * 0.5)))
      .slice(0, 3)
      .map((entry) => entry.name);
    items.push({
      id: 'constraint-pressure',
      category: 'constraints',
      severity: constraintSeverity,
      titleKey: 'analysis.summary.advisor.rules.constraintPressure.title',
      bodyKey: 'analysis.summary.advisor.rules.constraintPressure.body',
      params: {
        constraints: hotspots.peakConstraintLoad,
        physics: hotspots.peakPhysicsConstraints,
        ik: hotspots.peakIkConstraints,
      },
      affectedAnimations: affected,
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'stable-profile',
      category: 'meshDensity',
      severity: 'info',
      titleKey: 'analysis.summary.advisor.rules.stableProfile.title',
      bodyKey: 'analysis.summary.advisor.rules.stableProfile.body',
      params: {},
      affectedAnimations: [],
    });
  }

  return items;
}

export function buildImpactReportModel(
  analysis: SpineAnalysisResult,
  options?: { supplemental?: ImpactSupplementalMetrics },
): ImpactReportModel {
  const supplemental = options?.supplemental;
  const animations = analysis.animations
    .map<ImpactAnimationEntry>((animation) => {
      const rendering = impactFromCost(renderingImpactCost(animation));
      const computational = impactFromCost(computationalImpactCost(animation));
      const totalCost = rendering.cost + computational.cost;
      const hotspots = animationHotspots(animation, supplemental?.perAnimation?.[animation.name]);
      return {
        name: animation.name,
        durationSec: animation.duration,
        rendering,
        computational,
        totalCost,
        rowTone: rowTone(totalCost),
        activeFeatures: pickActiveFeatures(animation),
        hotspots,
      };
    })
    .sort((left, right) => right.totalCost - left.totalCost);

  const renderingWorst = worstImpact(animations.map((animation) => animation.rendering));
  const computationalWorst = worstImpact(animations.map((animation) => animation.computational));

  const peakBlendSwitches = animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.blendSwitches), 0);
  const peakClipMasks = analysis.animations.reduce(
    (peak, animation) => Math.max(peak, animation.clippingMetrics.activeMaskCount),
    0,
  );
  const peakVertices = animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.meshDensity), 0);
  const peakPhysics = animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.physicsConstraints), 0);
  const peakIk = animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.ikConstraints), 0);
  const peakDeformedMeshes = analysis.animations.reduce(
    (peak, animation) => Math.max(peak, animation.meshMetrics.deformedMeshCount),
    0,
  );
  const peakWeightedMeshes = analysis.animations.reduce(
    (peak, animation) => Math.max(peak, animation.meshMetrics.weightedMeshCount),
    0,
  );
  const peakConstraints = animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.constraints), 0);
  const peakPageBreaks = Math.max(
    supplemental?.pageBreaks ?? 0,
    animations.reduce((peak, animation) => Math.max(peak, animation.hotspots.pageBreaks), 0),
  );

  const hotspots: ImpactReportModel['hotspots'] = {
    peakPageBreaks,
    peakBlendSwitches,
    peakMeshDensity: peakVertices,
    peakConstraintLoad: peakConstraints,
    peakPhysicsConstraints: peakPhysics,
    peakIkConstraints: peakIk,
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    skeleton: {
      name: analysis.skeletonName,
      totalBones: analysis.skeleton.metrics.totalBones,
      maxDepth: analysis.skeleton.metrics.maxDepth,
      totalAnimations: analysis.totalAnimations,
      totalSkins: analysis.totalSkins,
    },
    overview: {
      totalAnimations: analysis.totalAnimations,
      animationsWithPhysics: analysis.stats.animationsWithPhysics,
      animationsWithClipping: analysis.stats.animationsWithClipping,
      animationsWithBlendModes: analysis.stats.animationsWithBlendModes,
    },
    summary: {
      rendering: {
        worst: renderingWorst,
        metrics: [
          { key: 'peakBlendSwitches', value: peakBlendSwitches },
          { key: 'peakClipMasks', value: peakClipMasks },
          { key: 'peakVertices', value: peakVertices },
          { key: 'peakPageBreaks', value: peakPageBreaks },
        ],
      },
      computational: {
        worst: computationalWorst,
        metrics: [
          { key: 'peakPhysics', value: peakPhysics },
          { key: 'peakIk', value: peakIk },
          { key: 'peakDeformedMeshes', value: peakDeformedMeshes },
          { key: 'peakWeightedMeshes', value: peakWeightedMeshes },
          { key: 'peakConstraints', value: peakConstraints },
        ],
      },
    },
    hotspots,
    animations,
    advisor: createAdvisor(animations, hotspots, supplemental),
    sourceStats: analysis.stats,
  };
}

function deltaDirection(delta: number): Exclude<DeltaDirection, 'new' | 'removed'> {
  if (Math.abs(delta) < EPSILON) return 'neutral';
  return delta < 0 ? 'better' : 'worse';
}

function metricDelta(
  key: ImpactDeltaMetric['key'],
  currentCost: number,
  baselineCost: number,
): ImpactDeltaMetric {
  const current = impactFromCost(currentCost);
  const baseline = impactFromCost(baselineCost);
  const delta = currentCost - baselineCost;
  return {
    key,
    current,
    baseline,
    delta,
    direction: deltaDirection(delta),
  };
}

export function buildImpactDeltaModel(current: ImpactReportModel, baseline: ImpactReportModel): ImpactDeltaModel {
  const metrics: ImpactDeltaMetric[] = [
    metricDelta('rendering', current.summary.rendering.worst.cost, baseline.summary.rendering.worst.cost),
    metricDelta('computational', current.summary.computational.worst.cost, baseline.summary.computational.worst.cost),
    metricDelta(
      'total',
      current.summary.rendering.worst.cost + current.summary.computational.worst.cost,
      baseline.summary.rendering.worst.cost + baseline.summary.computational.worst.cost,
    ),
    metricDelta('pageBreaks', current.hotspots.peakPageBreaks, baseline.hotspots.peakPageBreaks),
    metricDelta('blendSwitches', current.hotspots.peakBlendSwitches, baseline.hotspots.peakBlendSwitches),
    metricDelta('meshDensity', current.hotspots.peakMeshDensity / 100, baseline.hotspots.peakMeshDensity / 100),
    metricDelta('constraints', current.hotspots.peakConstraintLoad, baseline.hotspots.peakConstraintLoad),
  ];

  const baselineByName = new Map(baseline.animations.map((animation) => [animation.name, animation]));
  const currentByName = new Map(current.animations.map((animation) => [animation.name, animation]));

  const animationDeltas: ImpactDeltaAnimation[] = [];
  for (const animation of current.animations) {
    const previous = baselineByName.get(animation.name);
    if (!previous) {
      animationDeltas.push({
        name: animation.name,
        currentTotalCost: animation.totalCost,
        baselineTotalCost: null,
        delta: null,
        direction: 'new',
      });
      continue;
    }
    const delta = animation.totalCost - previous.totalCost;
    animationDeltas.push({
      name: animation.name,
      currentTotalCost: animation.totalCost,
      baselineTotalCost: previous.totalCost,
      delta,
      direction: deltaDirection(delta),
    });
  }

  for (const previous of baseline.animations) {
    if (currentByName.has(previous.name)) continue;
    animationDeltas.push({
      name: previous.name,
      currentTotalCost: null,
      baselineTotalCost: previous.totalCost,
      delta: null,
      direction: 'removed',
    });
  }

  animationDeltas.sort((left, right) => {
    const leftDelta = left.delta ?? 0;
    const rightDelta = right.delta ?? 0;
    return Math.abs(rightDelta) - Math.abs(leftDelta);
  });

  return {
    baselineSkeletonName: baseline.skeleton.name,
    currentSkeletonName: current.skeleton.name,
    metrics,
    animations: animationDeltas,
  };
}
