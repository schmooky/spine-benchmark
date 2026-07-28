import type { FrameRecord } from "../../types";

/** Rolling window (frames) the averaged view + FPS/quantile readouts use. */
export const FPS_WINDOW_FRAMES = 60;

function sumPhases(f: FrameRecord): number {
  const p = f.phases;
  return (
    p.prerenderMs +
    p.renderStartMs +
    p.renderMs +
    p.renderEndMs +
    p.postrenderMs
  );
}

export interface BarView {
  prePixiMs: number;
  pixiMs: number;
  postPixiMs: number;
  spineSharedMs: number;
  /** Where spine-cpu physically lands (5 Ticker.shared phases): under the shared ticker
   *  (Ticker.shared === app.ticker) Spine runs BEFORE app.render in the same
   *  tick -> spine-cpu sits in prePixi. With separate tickers - in postPixi.
   *  The bar draws the spine segment inside the corresponding parent. */
  spineInPrePixi: boolean;
  /** Mean Ticker.shared tick duration over the window (separate-ticker). Splits
   *  postPixi: otherShared = sharedTickerMs − spineSharedMs, compositeIdle =
   *  postPixiMs - sharedTickerMs. 0 under the shared ticker / idle Ticker.shared. */
  sharedTickerMs: number;
  gpuMs: number;
  framesAveraged: number;
  // Median rafDelta over the window - INFO, not a budget. Under load the median tracks it,
  // not the monitor refresh, and is unfit as a budget (the bar would never show overrun).
  // Used in the FPS row as 'D X (detected Y)' - a diagnostic signal that the
  // actual rAF interval does not match config.targetFrameMs (either a different
  // monitor, or a persistent CPU bound). The bar takes its budget from config.targetFrameMs.
  detectedFrameMs: number | null;
  pixiInternals?: {
    boilerplateMs: number;
    transformsMs: number;
    // Separate components of the build cluster - needed by the churn analyzer to
    // tell 'Spine churn in build+update' from 'honest batchUpload'. The bar
    // shows buildClusterMs (aggregate); the analysis reads the separate fields.
    buildInstructionsMs: number;
    updateRenderablesMs: number;
    batchUploadMs: number;
    buildClusterMs: number; // = buildInstr + updateRend + batchUpload (for the bar)
    executeMs: number;
    renderOtherMs: number;
    gcMs: number;
    // Phase mark intervals - breakdown of "boilerplate" agregate. Σ four
    // phase marks + (postrender - gc) ≈ boilerplate. Useful diagnostic
    // which runner phases dominate (renderStart is usually prep work,
    // renderEnd - pipe teardown, postrender - gc + cleanup).
    prerenderMs: number; // runner.prerender
    renderStartMs: number; // runner.renderStart
    renderEndMs: number; // runner.renderEnd
    postrenderTailMs: number; // runner.postrender minus gc (cleanup tail)
  };
  // Spine churn - derived from spineSummary.pipeMs (wall-clock of SpinePipe methods,
  // which are called INSIDE _buildInstructions / _updateRenderables). Shows
  // what share of build+update in the current scene is actually churn from Spine
  // (structureDidChange=true every frame -> root render group rebuild every frame).
  churn?: {
    spinePipeMs: number; // = spineSummary.pipeMs
    buildAndUpdateMs: number; // buildInstr + updateRend (no batchUpload - Spine does not touch it)
    spineSharePct: number; // 0-100, share of spineChurn within build+update
    nonSpineMs: number; // max(0, buildAndUpdateMs - spinePipeMs)
  };
  perPipe?: {
    name: string;
    ms: number;
    invocations: number;
    drawCalls: number;
  }[];
  // Real wall-clock Spine (no attach double-count) and its structural slice,
  // taken from the last frame (structure is meaningless to average).
  spineSummary?: {
    cpuMs: number; // 5 Ticker.shared phases (avg over window)
    pipeMs: number; // pipeAdd + pipeUpdate + pipeValidate (avg over window)
    attachNestedMs: number; // attachmentTransformMs (inside pipeMs, for reference)
    totalRealMs: number; // cpuMs + pipeMs (attach is NOT summed - it is already in pipeMs)
    instanceCount: number;
    totalBones: number;
    // 5 Ticker.shared sub-phases breakdown (avg over window).
    animationStateUpdateMs: number;
    skeletonPrePhysicsMs: number;
    animationApplyMs: number;
    worldTransformMs: number;
    slotObjectsMs: number;
    // 3 pipe sub-phases breakdown (avg over window).
    pipeAddMs: number;
    pipeUpdateMs: number;
    pipeValidateMs: number;
  };
  /** Assets.load wall-clock per frame - parallel async work. Not in the frame
   *  partition (background work), shown separately as an info-row. */
  asyncMs?: number;
  /** Batch pipe rebuilds avg per frame (BatcherPipe.buildStart events). */
  batchRebuildsAvg?: number;
  /** Batch break events per frame avg (batch.break instruction splits). */
  batchBreaksAvg?: number;
  /** Long animation tasks blocking main thread per frame (PerformanceObserver). */
  longTasksMsAvg?: number;
  longTasksCountAvg?: number;
  /** WebAudio per-frame metrics - info section. decodeMs = wall-clock
   *  decodeAudioData (async, parallel); counters non-ms (events/frame). */
  audio?: {
    decodeMs: number;
    contextCount: number;
    activeSourceCount: number;
    peakSourceCount: number;
    currentTimeDriftMs: number;
    decodeCount: number;
    sourceStarted: number;
    sourceStopped: number;
    automationOps: number;
    contextStateTransitions: number;
  };
  // Filter pipe internal breakdown - push/apply/pop are collected in `record.filter`
  // via hooks on FilterSystem. sum push+apply+pop ~= perPipe.filter.ms (when filters
  // flicker - a minor diff from measure noise). passes - how many times applyFilter ran.
  filter?: {
    pushMs: number;
    applyMs: number;
    popMs: number;
    passes: number;
  };
}

export function spineSharedMsOf(spine: FrameRecord["spine"]): number {
  if (!spine) return 0;
  const p = spine.phases;
  return (
    p.animationStateUpdateMs +
    p.skeletonPrePhysicsMs +
    p.animationApplyMs +
    p.worldTransformMs +
    p.slotObjectsMs
  );
}

// Real wall-clock of the Spine pipe side. attachmentTransformMs is physically nested in
// pipeAddRenderableMs / pipeUpdateRenderableMs / pipeValidateRenderableMs (see
// SpinePipe.js:118 - inside addRenderable _validateAndTransformAttachments is called,
// and both wrappers measure wall-clock independently -> attach already sits in pipe). Summing
// pipe + attach would count attach twice; here we return only pipe.
export function spinePipeMsOf(spine: FrameRecord["spine"]): number {
  if (!spine) return 0;
  const p = spine.phases;
  return (
    p.pipeAddRenderableMs +
    p.pipeUpdateRenderableMs +
    p.pipeValidateRenderableMs
  );
}

// Build the averaged view over the last N frames. Iterate over indices [start, end).
//
// Spine attribution depends on the ticker (sharedTicker):
//  - Separate tickers (default): Ticker.shared ticks AFTER app.ticker -> a frame's spine work
//    for frame i is measured on flush i+1. We use frames[i+1].spine (cross-frame +1)
//    and put spine in postPixi.
//  - Shared ticker (Ticker.shared === app.ticker): Spine (NORMAL=0) runs between
//    tickStart (INTERACTION=50) and app.render (LOW=-25) in the SAME tick -> spine in prePixi
//    of the same frame. We use frames[i].spine (no shift).
//
// Upper bound is frames.length - 1 (excluding the freshest: its postPixiMs is not yet
// patched, and in cross-frame mode it has no frames[i+1]).
export function buildAveragedView(
  frames: FrameRecord[],
  sharedTicker = false
): BarView | null {
  if (frames.length < 2) return null;
  const end = frames.length - 1;
  const start = Math.max(0, end - FPS_WINDOW_FRAMES);
  const count = end - start;
  if (count === 0) return null;

  let sumPre = 0,
    sumPixi = 0,
    sumPost = 0,
    sumSpineShared = 0,
    sumSharedTicker = 0;
  let sumGpu = 0,
    gpuCount = 0;
  let sumBoil = 0,
    sumXform = 0,
    sumBuildInstr = 0,
    sumUpdateRend = 0,
    sumBatchUp = 0;
  let sumExec = 0,
    sumOther = 0,
    sumGc = 0;
  let sumPrerender = 0,
    sumRenderStart = 0,
    sumRenderEnd = 0,
    sumPostrenderTail = 0;
  let sumAudioDecode = 0,
    sumAudioDrift = 0;
  let sumAudioDecodeCnt = 0,
    sumAudioSrcStarted = 0,
    sumAudioSrcStopped = 0;
  let sumAudioAutoOps = 0,
    sumAudioStateTrans = 0;
  let lastAudioContextCount = 0,
    lastAudioActive = 0,
    lastAudioPeak = 0;
  let audioCount = 0;
  let splitCount = 0;
  const pipeAccum = new Map<string, { ms: number; inv: number; dc: number }>();
  let pipeCount = 0;
  let sumSpineCpu = 0,
    sumSpinePipe = 0,
    sumSpineAttach = 0;
  let sumSpineAnim = 0,
    sumSpinePrePhys = 0,
    sumSpineApply = 0,
    sumSpineXform = 0,
    sumSpineSlot = 0;
  let sumSpinePipeAdd = 0,
    sumSpinePipeUpd = 0,
    sumSpinePipeVal = 0;
  let spineCount = 0;
  let lastInstanceCount = 0;
  let lastBones = 0;
  let sumFilterPush = 0,
    sumFilterApply = 0,
    sumFilterPop = 0,
    sumFilterPasses = 0;
  let filterCount = 0;
  let sumAsync = 0,
    asyncCount = 0;
  let sumRebuilds = 0,
    sumBreaks = 0,
    sumLongTaskMs = 0,
    sumLongTaskCnt = 0;
  let counterFramesN = 0;
  const rafDeltas: number[] = [];

  for (let i = start; i < end; i++) {
    const f = frames[i]!;
    const next = frames[i + 1]!;
    // spine source: the same frame under the shared ticker, the next one under separate.
    const spineFrame = sharedTicker ? f : next;

    sumPre += f.prePixiMs;
    sumPixi += sumPhases(f);
    sumPost += f.postPixiMs;
    sumSharedTicker += f.sharedTickerMs ?? 0;
    sumSpineShared += spineSharedMsOf(spineFrame.spine);

    if (typeof f.gpuMs === "number") {
      sumGpu += f.gpuMs;
      gpuCount++;
    }

    if (f.renderSplit) {
      const split = f.renderSplit;
      const p = f.phases;
      const boil = Math.max(
        0,
        p.prerenderMs +
          p.renderStartMs +
          p.renderEndMs +
          p.postrenderMs -
          p.gcMs
      );
      sumBoil += boil;
      sumPrerender += p.prerenderMs;
      sumRenderStart += p.renderStartMs;
      sumRenderEnd += p.renderEndMs;
      sumPostrenderTail += Math.max(0, p.postrenderMs - p.gcMs);
      sumXform += split.transformsMs;
      sumBuildInstr += split.buildInstructionsMs;
      sumUpdateRend += split.updateRenderablesMs;
      sumBatchUp += split.batchUploadMs;
      sumExec += split.executeInstructionsMs;
      sumOther += split.renderOtherMs;
      sumGc += p.gcMs;
      splitCount++;
    }

    if (f.perPipe) {
      for (const [name, stats] of Object.entries(f.perPipe)) {
        let entry = pipeAccum.get(name);
        if (!entry) {
          entry = { ms: 0, inv: 0, dc: 0 };
          pipeAccum.set(name, entry);
        }
        entry.ms += stats.ms;
        entry.inv += stats.invocations;
        entry.dc += stats.drawCalls;
      }
      pipeCount++;
    }

    if (spineFrame.spine) {
      const sp = spineFrame.spine.phases;
      sumSpineCpu += spineSharedMsOf(spineFrame.spine);
      sumSpinePipe += spinePipeMsOf(spineFrame.spine);
      sumSpineAttach += sp.attachmentTransformMs;
      sumSpineAnim += sp.animationStateUpdateMs;
      sumSpinePrePhys += sp.skeletonPrePhysicsMs;
      sumSpineApply += sp.animationApplyMs;
      sumSpineXform += sp.worldTransformMs;
      sumSpineSlot += sp.slotObjectsMs;
      sumSpinePipeAdd += sp.pipeAddRenderableMs;
      sumSpinePipeUpd += sp.pipeUpdateRenderableMs;
      sumSpinePipeVal += sp.pipeValidateRenderableMs;
      spineCount++;
      lastInstanceCount = spineFrame.spine.instanceCount;
      lastBones = spineFrame.spine.structure.totalBones;
    }

    if (f.filter) {
      sumFilterPush += f.filter.pushMs;
      sumFilterApply += f.filter.applyMs;
      sumFilterPop += f.filter.popMs;
      sumFilterPasses += f.filter.passes;
      filterCount++;
    }

    if (typeof f.asyncMs === "number" && f.asyncMs > 0) {
      sumAsync += f.asyncMs;
      asyncCount++;
    }

    sumRebuilds += f.counters.rebuilds;
    sumBreaks += f.counters.batchBreaks;
    sumLongTaskMs += f.browser.longTasksMsThisFrame;
    sumLongTaskCnt += f.browser.longTasksCount;
    counterFramesN++;

    if (f.audio) {
      const a = f.audio;
      sumAudioDecode += a.decodeMs;
      sumAudioDrift += a.currentTimeDriftMs;
      sumAudioDecodeCnt += a.counters.decodeCount;
      sumAudioSrcStarted += a.counters.sourceStarted;
      sumAudioSrcStopped += a.counters.sourceStopped;
      sumAudioAutoOps += a.counters.automationOps;
      sumAudioStateTrans += a.counters.contextStateTransitions;
      lastAudioContextCount = a.contextCount;
      lastAudioActive = a.activeSourceCount;
      lastAudioPeak = Math.max(lastAudioPeak, a.peakSourceCount);
      audioCount++;
    }

    if (f.rafDeltaMs > 0) rafDeltas.push(f.rafDeltaMs);
  }

  // Median rafDelta - for the budget. Median (not avg) is robust to outlier frames
  // (compositor stall, GC pause) - over 60 frames one or two bad ones do not move the median.
  // We require at least 20 frames so the chance of a noisy value is low.
  let detectedFrameMs: number | null = null;
  if (rafDeltas.length >= 20) {
    rafDeltas.sort((a, b) => a - b);
    detectedFrameMs = rafDeltas[Math.floor(rafDeltas.length / 2)] ?? null;
  }

  const view: BarView = {
    prePixiMs: sumPre / count,
    pixiMs: sumPixi / count,
    postPixiMs: sumPost / count,
    spineSharedMs: sumSpineShared / count,
    spineInPrePixi: sharedTicker,
    sharedTickerMs: sumSharedTicker / count,
    gpuMs: gpuCount > 0 ? sumGpu / gpuCount : 0,
    framesAveraged: count,
    detectedFrameMs,
  };

  if (splitCount > 0) {
    const buildInstr = sumBuildInstr / splitCount;
    const updateRend = sumUpdateRend / splitCount;
    const batchUp = sumBatchUp / splitCount;
    view.pixiInternals = {
      boilerplateMs: sumBoil / splitCount,
      prerenderMs: sumPrerender / splitCount,
      renderStartMs: sumRenderStart / splitCount,
      renderEndMs: sumRenderEnd / splitCount,
      postrenderTailMs: sumPostrenderTail / splitCount,
      transformsMs: sumXform / splitCount,
      buildInstructionsMs: buildInstr,
      updateRenderablesMs: updateRend,
      batchUploadMs: batchUp,
      buildClusterMs: buildInstr + updateRend + batchUp,
      executeMs: sumExec / splitCount,
      renderOtherMs: sumOther / splitCount,
      gcMs: sumGc / splitCount,
    };
  }

  if (pipeCount > 0 && pipeAccum.size > 0) {
    view.perPipe = Array.from(pipeAccum.entries())
      .map(([name, e]) => ({
        name,
        ms: e.ms / pipeCount,
        invocations: e.inv / pipeCount,
        drawCalls: e.dc / pipeCount,
      }))
      .filter((e) => e.ms > 0)
      .sort((a, b) => b.ms - a.ms);
  }

  if (spineCount > 0) {
    const cpuAvg = sumSpineCpu / spineCount;
    const pipeAvg = sumSpinePipe / spineCount;
    view.spineSummary = {
      cpuMs: cpuAvg,
      pipeMs: pipeAvg,
      attachNestedMs: sumSpineAttach / spineCount,
      totalRealMs: cpuAvg + pipeAvg,
      instanceCount: lastInstanceCount,
      totalBones: lastBones,
      animationStateUpdateMs: sumSpineAnim / spineCount,
      skeletonPrePhysicsMs: sumSpinePrePhys / spineCount,
      animationApplyMs: sumSpineApply / spineCount,
      worldTransformMs: sumSpineXform / spineCount,
      slotObjectsMs: sumSpineSlot / spineCount,
      pipeAddMs: sumSpinePipeAdd / spineCount,
      pipeUpdateMs: sumSpinePipeUpd / spineCount,
      pipeValidateMs: sumSpinePipeVal / spineCount,
    };
  }

  if (asyncCount > 0) {
    view.asyncMs = sumAsync / asyncCount;
  }

  if (counterFramesN > 0) {
    view.batchRebuildsAvg = sumRebuilds / counterFramesN;
    view.batchBreaksAvg = sumBreaks / counterFramesN;
    view.longTasksMsAvg = sumLongTaskMs / counterFramesN;
    view.longTasksCountAvg = sumLongTaskCnt / counterFramesN;
  }

  if (audioCount > 0) {
    view.audio = {
      decodeMs: sumAudioDecode / audioCount,
      contextCount: lastAudioContextCount,
      activeSourceCount: lastAudioActive,
      peakSourceCount: lastAudioPeak,
      currentTimeDriftMs: sumAudioDrift / audioCount,
      decodeCount: sumAudioDecodeCnt,
      sourceStarted: sumAudioSrcStarted,
      sourceStopped: sumAudioSrcStopped,
      automationOps: sumAudioAutoOps,
      contextStateTransitions: sumAudioStateTrans,
    };
  }

  if (filterCount > 0 && sumFilterPasses > 0) {
    view.filter = {
      pushMs: sumFilterPush / filterCount,
      applyMs: sumFilterApply / filterCount,
      popMs: sumFilterPop / filterCount,
      passes: sumFilterPasses / filterCount,
    };
  }

  // Churn is derived. It makes sense to compute when there is both spine pipe data
  // and a build+update split. Otherwise we hide it (field undefined).
  if (view.spineSummary && view.pixiInternals) {
    const spinePipe = view.spineSummary.pipeMs;
    const buildAndUpdate =
      view.pixiInternals.buildInstructionsMs +
      view.pixiInternals.updateRenderablesMs;
    const share =
      buildAndUpdate > 0
        ? Math.min(100, (spinePipe / buildAndUpdate) * 100)
        : 0;
    view.churn = {
      spinePipeMs: spinePipe,
      buildAndUpdateMs: buildAndUpdate,
      spineSharePct: share,
      nonSpineMs: Math.max(0, buildAndUpdate - spinePipe),
    };
  }

  return view;
}

// Hue rotation for up to ~10 unique pipes on a scene. Start at 200deg (cyan-blue),
// step 33deg - gives visually distinct adjacent hues. Saturation/lightness
// kept mid-range to match the overall HUD palette.
export function pipeColor(index: number): string {
  const hue = (200 + index * 33) % 360;
  return `hsl(${hue}, 55%, 65%)`;
}
