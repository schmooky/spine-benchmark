import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { getImpactFromCost, getImpactBadgeClass } from "../utils/scoreCalculator";
import { AnimationAnalysis } from "../SpineAnalyzer";
import i18n from "../../i18n";

const IMPACT_LABEL_KEYS: Record<string, string> = {
  minimal: "analysis.summary.impact.minimal",
  low: "analysis.summary.impact.low",
  moderate: "analysis.summary.impact.moderate",
  high: "analysis.summary.impact.high",
  veryHigh: "analysis.summary.impact.veryHigh",
};

function impactLabel(level: string): string {
  return i18n.t(IMPACT_LABEL_KEYS[level] ?? IMPACT_LABEL_KEYS.minimal);
}

function renderImpactBadge(cost: number): string {
  const impact = getImpactFromCost(cost);
  const className = getImpactBadgeClass(impact.level);
  return `<span class="performance-impact ${className}">${impactLabel(impact.level)}</span>`;
}

function renderingCost(a: AnimationAnalysis): number {
  return (
    a.blendModeMetrics.activeNonNormalCount * 3 +
    a.clippingMetrics.activeMaskCount * 5 +
    a.meshMetrics.totalVertices / 200
  );
}

function computationalCost(a: AnimationAnalysis): number {
  return (
    a.constraintMetrics.activePhysicsCount * 4 +
    a.constraintMetrics.activeIkCount * 2 +
    a.constraintMetrics.activeTransformCount * 1.5 +
    a.constraintMetrics.activePathCount * 2.5 +
    a.meshMetrics.deformedMeshCount * 1.5 +
    a.meshMetrics.weightedMeshCount * 2
  );
}

function totalImpactCost(a: AnimationAnalysis): number {
  return renderingCost(a) + computationalCost(a);
}

function rowClassForCost(cost: number): string {
  if (cost >= 25) return "row-danger";
  if (cost >= 15) return "row-warning";
  return "";
}

function formatDuration(seconds: number): string {
  return i18n.t("analysis.summary.durationSeconds", { value: seconds.toFixed(2) });
}

function renderFeatureList(a: AnimationAnalysis): string {
  const features: string[] = [];
  if (a.activeComponents.hasPhysics) features.push(i18n.t("analysis.summary.features.physics"));
  if (a.activeComponents.hasIK) features.push(i18n.t("analysis.summary.features.ik"));
  if (a.activeComponents.hasClipping) features.push(i18n.t("analysis.summary.features.clipping"));
  if (a.activeComponents.hasBlendModes) features.push(i18n.t("analysis.summary.features.blend"));
  return features.length > 0 ? features.join(", ") : i18n.t("analysis.summary.features.none");
}

function sortByImpactDesc(animationAnalyses: AnimationAnalysis[]): AnimationAnalysis[] {
  return [...animationAnalyses].sort((a, b) => totalImpactCost(b) - totalImpactCost(a));
}

function renderImpactSummarySection(animationAnalyses: AnimationAnalysis[]): string {
  const worstRenderingCost = animationAnalyses.reduce((worst, a) => Math.max(worst, renderingCost(a)), 0);
  const worstComputationalCost = animationAnalyses.reduce((worst, a) => Math.max(worst, computationalCost(a)), 0);

  const peakVertices = Math.max(0, ...animationAnalyses.map((a) => a.meshMetrics.totalVertices));
  const peakBlendBreaks = Math.max(0, ...animationAnalyses.map((a) => a.blendModeMetrics.activeNonNormalCount));
  const peakClipMasks = Math.max(0, ...animationAnalyses.map((a) => a.clippingMetrics.activeMaskCount));
  const peakPhysics = Math.max(0, ...animationAnalyses.map((a) => a.constraintMetrics.activePhysicsCount));
  const peakIk = Math.max(0, ...animationAnalyses.map((a) => a.constraintMetrics.activeIkCount));

  return `
    <div class="impact-summary-grid">
      <div class="impact-summary-card">
        <div class="impact-summary-header">
          <span class="impact-summary-title">${i18n.t("analysis.impact.rendering")}</span>
          ${renderImpactBadge(worstRenderingCost)}
        </div>
        <div class="impact-summary-details">
          ${peakBlendBreaks > 0 ? `<span>${i18n.t("analysis.impact.blendBreaks", { count: peakBlendBreaks })}</span>` : ""}
          ${peakClipMasks > 0 ? `<span>${i18n.t("analysis.impact.clipMasks", { count: peakClipMasks })}</span>` : ""}
          <span>${i18n.t("analysis.impact.peakVertices", { count: peakVertices })}</span>
        </div>
      </div>

      <div class="impact-summary-card">
        <div class="impact-summary-header">
          <span class="impact-summary-title">${i18n.t("analysis.impact.computational")}</span>
          ${renderImpactBadge(worstComputationalCost)}
        </div>
        <div class="impact-summary-details">
          ${peakPhysics > 0 ? `<span>${i18n.t("analysis.impact.physicsCount", { count: peakPhysics })}</span>` : ""}
          ${peakIk > 0 ? `<span>${i18n.t("analysis.impact.ikCount", { count: peakIk })}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderAnimationOverviewSection(sorted: AnimationAnalysis[]): string {
  const lowestImpact = sorted[sorted.length - 1] ?? null;
  const highestImpact = sorted[0] ?? null;

  const animationsWithPhysics = sorted.filter((a) => a.activeComponents.hasPhysics).length;
  const animationsWithClipping = sorted.filter((a) => a.activeComponents.hasClipping).length;
  const animationsWithBlendModes = sorted.filter((a) => a.activeComponents.hasBlendModes).length;

  const lowestCost = lowestImpact ? totalImpactCost(lowestImpact) : 0;
  const highestCost = highestImpact ? totalImpactCost(highestImpact) : 0;

  return `
    <h3>${i18n.t("analysis.summary.animationOverview.title")}</h3>
    <div class="animation-overview">
      <div class="overview-stats">
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.totalAnimations")}</span>
          <span class="stat-value">${sorted.length}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.bestPerformance")}</span>
          <span class="stat-value">${lowestImpact ? `${lowestImpact.name} (${impactLabel(getImpactFromCost(lowestCost).level)}, ${lowestCost.toFixed(1)})` : "-"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.worstPerformance")}</span>
          <span class="stat-value">${highestImpact ? `${highestImpact.name} (${impactLabel(getImpactFromCost(highestCost).level)}, ${highestCost.toFixed(1)})` : "-"}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.withPhysics")}</span>
          <span class="stat-value">${i18n.t("analysis.summary.animationOverview.animationsCount", { count: animationsWithPhysics })}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.withClipping")}</span>
          <span class="stat-value">${i18n.t("analysis.summary.animationOverview.animationsCount", { count: animationsWithClipping })}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">${i18n.t("analysis.summary.animationOverview.withSpecialBlendModes")}</span>
          <span class="stat-value">${i18n.t("analysis.summary.animationOverview.animationsCount", { count: animationsWithBlendModes })}</span>
        </div>
      </div>
    </div>
  `;
}

function renderPerAnimationImpactTable(sorted: AnimationAnalysis[]): string {
  return `
    <h3>${i18n.t("analysis.summary.perAnimationScoresTitle")}</h3>
    <table class="benchmark-table">
      <thead>
        <tr>
          <th>${i18n.t("analysis.common.headers.animation")}</th>
          <th>${i18n.t("analysis.summary.tableHeaders.duration")}</th>
          <th>${i18n.t("analysis.impact.rendering")}</th>
          <th>${i18n.t("analysis.impact.computational")}</th>
          <th>${i18n.t("analysis.summary.tableHeaders.activeFeatures")}</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((analysis) => {
            const renderCost = renderingCost(analysis);
            const computeCost = computationalCost(analysis);
            const totalCost = renderCost + computeCost;

            return `
              <tr class="${rowClassForCost(totalCost)}">
                <td>${analysis.name}</td>
                <td>${formatDuration(analysis.duration)}</td>
                <td>${renderImpactBadge(renderCost)}</td>
                <td>${renderImpactBadge(computeCost)}</td>
                <td>${renderFeatureList(analysis)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderGlobalSkeletonStats(boneMetrics: any, spineInstance: Spine): string {
  const skeletonData = spineInstance.skeleton.data;
  return `
    <h3>${i18n.t("analysis.summary.globalSkeletonStatisticsTitle")}</h3>
    <div class="stats-container">
      <table class="stats-table">
        <tbody>
          <tr>
            <td>${i18n.t("analysis.summary.statistics.totalBones")}</td>
            <td>${boneMetrics.totalBones}</td>
          </tr>
          <tr>
            <td>${i18n.t("analysis.summary.statistics.maxBoneDepth")}</td>
            <td>${boneMetrics.maxDepth}</td>
          </tr>
          <tr>
            <td>${i18n.t("analysis.summary.statistics.totalAnimations")}</td>
            <td>${skeletonData.animations.length}</td>
          </tr>
          <tr>
            <td>${i18n.t("analysis.summary.statistics.skins")}</td>
            <td>${skeletonData.skins.length}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderOptimizationRecommendations(animationAnalyses: AnimationAnalysis[], boneMetrics: any): string {
  const recommendations: string[] = [];

  const physicsAnimations = animationAnalyses.filter((a) => a.activeComponents.hasPhysics);
  const clippingAnimations = animationAnalyses.filter((a) => a.activeComponents.hasClipping);
  const highVertexAnimations = animationAnalyses.filter((a) => a.meshMetrics.totalVertices > 500);
  const highImpactAnimations = animationAnalyses.filter((a) => totalImpactCost(a) >= 25);

  if (boneMetrics.maxDepth > 5) {
    recommendations.push(i18n.t("analysis.summary.recommendations.reduceBoneDepth"));
  }
  if (boneMetrics.totalBones > 50) {
    recommendations.push(i18n.t("analysis.summary.recommendations.reduceTotalBones"));
  }

  if (physicsAnimations.length > animationAnalyses.length * 0.5) {
    recommendations.push(
      i18n.t("analysis.summary.recommendations.physicsUsage", {
        used: physicsAnimations.length,
        total: animationAnalyses.length,
      })
    );
  }

  if (clippingAnimations.length > 0) {
    const names = clippingAnimations
      .slice(0, 3)
      .map((a) => a.name)
      .join(", ");
    const more = clippingAnimations.length > 3
      ? i18n.t("analysis.summary.recommendations.andMore", { count: clippingAnimations.length - 3 })
      : "";

    recommendations.push(
      i18n.t("analysis.summary.recommendations.clippingFound", {
        names,
        more,
      })
    );
  }

  if (highVertexAnimations.length > 0) {
    recommendations.push(
      i18n.t("analysis.summary.recommendations.highVertexAnimations", {
        count: highVertexAnimations.length,
        names: highVertexAnimations.slice(0, 3).map((a) => a.name).join(", "),
      })
    );
  }

  if (highImpactAnimations.length > 0) {
    recommendations.push(
      i18n.t("analysis.summary.recommendations.multiIssueAnimations", {
        count: highImpactAnimations.length,
        names: highImpactAnimations.slice(0, 2).map((a) => a.name).join(", "),
      })
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(i18n.t("analysis.summary.recommendations.performanceGenerallyGood"));
  }

  return `
    <div class="optimization-tips">
      <h3>${i18n.t("analysis.summary.optimizationTitle")}</h3>
      <ul>
        ${recommendations.map((tip) => `<li>${tip}</li>`).join("")}
      </ul>
    </div>
  `;
}

/**
 * Generates localized benchmark summary HTML using the impact model.
 */
export function generateAnimationSummary(
  spineInstance: Spine,
  boneMetrics: any,
  animationAnalyses: AnimationAnalysis[],
  _legacyMedianScore: number
): string {
  const skeletonName = spineInstance.skeleton.data.name || "-";
  const sorted = sortByImpactDesc(animationAnalyses);

  return `
    <div class="benchmark-summary">
      <h2>${i18n.t("analysis.summary.title")}</h2>
      <p>${i18n.t("analysis.summary.skeletonLabel", { name: skeletonName })}</p>

      ${renderImpactSummarySection(animationAnalyses)}
      ${renderAnimationOverviewSection(sorted)}
      ${renderPerAnimationImpactTable(sorted)}
      ${renderGlobalSkeletonStats(boneMetrics, spineInstance)}
      ${renderOptimizationRecommendations(animationAnalyses, boneMetrics)}
    </div>
  `;
}
