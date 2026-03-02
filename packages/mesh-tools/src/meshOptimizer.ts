export interface OptimizationReport {
  animationCount: number;
  removedEmptyDeforms: number;
  removedDuplicateFrames: number;
  removedDrawOrderDuplicates: number;
  changedAnimations: number;
}

interface DrawOrderOffset {
  slot: string;
  offset: number;
}

interface DeformFrame {
  time?: number;
  offset?: number;
  vertices?: number[];
  curve?: unknown;
  [key: string]: unknown;
}

const FLOAT_EPSILON = 0.000001;

function deepEqualNumberArray(a: number[] = [], b: number[] = [], epsilon = 0): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs(a[i] - b[i]) > epsilon) return false;
  }
  return true;
}

function isZeroDeform(vertices: number[] | undefined): boolean {
  if (!vertices || vertices.length === 0) return true;
  return vertices.every((value) => Math.abs(value) < FLOAT_EPSILON);
}

function normalizeDrawOrderOffsets(offsets: DrawOrderOffset[] | undefined): DrawOrderOffset[] {
  if (!offsets || offsets.length === 0) return [];
  return [...offsets].sort((a, b) => a.slot.localeCompare(b.slot));
}

function areDrawOrderOffsetsEqual(
  a: DrawOrderOffset[] | undefined,
  b: DrawOrderOffset[] | undefined
): boolean {
  const normA = normalizeDrawOrderOffsets(a);
  const normB = normalizeDrawOrderOffsets(b);
  if (normA.length !== normB.length) return false;
  for (let i = 0; i < normA.length; i += 1) {
    if (normA[i].slot !== normB[i].slot || normA[i].offset !== normB[i].offset) return false;
  }
  return true;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFrameOffset(frame: DeformFrame): number {
  return typeof frame.offset === 'number' ? frame.offset : 0;
}

function getFrameVertices(frame: DeformFrame): number[] {
  return Array.isArray(frame.vertices) ? frame.vertices : [];
}

function getFrameTime(frames: DeformFrame[], index: number): number | null {
  const frame = frames[index];
  if (!frame) return null;
  if (typeof frame.time === 'number' && Number.isFinite(frame.time)) {
    return frame.time;
  }
  return index === 0 ? 0 : null;
}

function isLinearCurve(curve: unknown): boolean {
  if (curve == null || curve === 'linear') return true;
  if (!Array.isArray(curve) || curve.length !== 4) return false;
  const [x1, y1, x2, y2] = curve;
  if (
    typeof x1 !== 'number' ||
    typeof y1 !== 'number' ||
    typeof x2 !== 'number' ||
    typeof y2 !== 'number'
  ) {
    return false;
  }
  return (
    Math.abs(x1 - 0) < FLOAT_EPSILON &&
    Math.abs(y1 - 0) < FLOAT_EPSILON &&
    Math.abs(x2 - 1) < FLOAT_EPSILON &&
    Math.abs(y2 - 1) < FLOAT_EPSILON
  );
}

function areFrameValuesEqual(a: DeformFrame, b: DeformFrame): boolean {
  if (getFrameOffset(a) !== getFrameOffset(b)) return false;
  return deepEqualNumberArray(getFrameVertices(a), getFrameVertices(b));
}

function shouldTreatAsLegacyDeformTimeline(frames: unknown[]): frames is DeformFrame[] {
  return frames.some(
    (frame) =>
      isObjectRecord(frame) &&
      ('vertices' in frame || 'offset' in frame || ('curve' in frame && !('name' in frame)))
  );
}

function normalizeDeformFrame(frame: DeformFrame): boolean {
  let changed = false;

  if (isLinearCurve(frame.curve)) {
    delete frame.curve;
    changed = true;
  }

  const vertices = getFrameVertices(frame);
  if (vertices.length === 0) {
    if ('vertices' in frame) {
      delete frame.vertices;
      changed = true;
    }
    if (getFrameOffset(frame) === 0 && 'offset' in frame) {
      delete frame.offset;
      changed = true;
    }
    return changed;
  }

  let trimStart = 0;
  while (trimStart < vertices.length && vertices[trimStart] === 0) {
    trimStart += 1;
  }

  let trimEnd = vertices.length;
  while (trimEnd > trimStart && vertices[trimEnd - 1] === 0) {
    trimEnd -= 1;
  }

  const baseOffset = getFrameOffset(frame);
  const normalizedOffset = baseOffset + trimStart;
  const normalizedVertices = vertices.slice(trimStart, trimEnd);

  if (!deepEqualNumberArray(vertices, normalizedVertices)) {
    if (normalizedVertices.length === 0) {
      delete frame.vertices;
    } else {
      frame.vertices = normalizedVertices;
    }
    changed = true;
  } else if (!Array.isArray(frame.vertices)) {
    frame.vertices = normalizedVertices;
    changed = true;
  }

  if (normalizedVertices.length === 0 || normalizedOffset === 0) {
    if ('offset' in frame) {
      delete frame.offset;
      changed = true;
    }
  } else if (frame.offset !== normalizedOffset) {
    frame.offset = normalizedOffset;
    changed = true;
  }

  return changed;
}

function isLinearlyRedundantFrame(frames: DeformFrame[], index: number): boolean {
  if (index <= 0 || index >= frames.length - 1) return false;

  const previous = frames[index - 1];
  const current = frames[index];
  const next = frames[index + 1];
  if (!previous || !current || !next) return false;

  if (!isLinearCurve(previous.curve) || !isLinearCurve(current.curve)) {
    return false;
  }

  const previousTime = getFrameTime(frames, index - 1);
  const currentTime = getFrameTime(frames, index);
  const nextTime = getFrameTime(frames, index + 1);
  if (previousTime === null || currentTime === null || nextTime === null) return false;
  if (!(previousTime < currentTime && currentTime < nextTime)) return false;

  const previousOffset = getFrameOffset(previous);
  const currentOffset = getFrameOffset(current);
  const nextOffset = getFrameOffset(next);
  if (previousOffset !== currentOffset || currentOffset !== nextOffset) return false;

  const previousVertices = getFrameVertices(previous);
  const currentVertices = getFrameVertices(current);
  const nextVertices = getFrameVertices(next);

  if (
    previousVertices.length !== currentVertices.length ||
    currentVertices.length !== nextVertices.length
  ) {
    return false;
  }

  const alpha = (currentTime - previousTime) / (nextTime - previousTime);
  for (let i = 0; i < currentVertices.length; i += 1) {
    const expected = previousVertices[i] + ((nextVertices[i] - previousVertices[i]) * alpha);
    if (Math.abs(currentVertices[i] - expected) > FLOAT_EPSILON) {
      return false;
    }
  }

  return true;
}

function optimizeDeformTimeline(
  deformFrames: DeformFrame[]
): { optimizedFrames: DeformFrame[]; removedFrames: number; normalizedFrames: number } {
  if (deformFrames.length <= 1) {
    const single = deformFrames.map((frame) => ({ ...frame }));
    let normalizedFrames = 0;
    single.forEach((frame) => {
      if (normalizeDeformFrame(frame)) normalizedFrames += 1;
    });
    return { optimizedFrames: single, removedFrames: 0, normalizedFrames };
  }

  const optimizedFrames = deformFrames.map((frame) => ({ ...frame }));
  let removedFrames = 0;
  let normalizedFrames = 0;

  optimizedFrames.forEach((frame) => {
    if (normalizeDeformFrame(frame)) {
      normalizedFrames += 1;
    }
  });

  // Frames with identical deformation at the same timestamp are merged by keeping the latest frame.
  for (let i = 1; i < optimizedFrames.length;) {
    const previousTime = getFrameTime(optimizedFrames, i - 1);
    const currentTime = getFrameTime(optimizedFrames, i);
    if (
      previousTime !== null &&
      currentTime !== null &&
      previousTime === currentTime &&
      areFrameValuesEqual(optimizedFrames[i - 1], optimizedFrames[i])
    ) {
      optimizedFrames.splice(i - 1, 1);
      removedFrames += 1;
      if (i > 1) i -= 1;
      continue;
    }
    i += 1;
  }

  // The final key does not have an outgoing curve, so an identical trailing value is always redundant.
  while (
    optimizedFrames.length > 1 &&
    areFrameValuesEqual(
      optimizedFrames[optimizedFrames.length - 2],
      optimizedFrames[optimizedFrames.length - 1]
    )
  ) {
    optimizedFrames.pop();
    removedFrames += 1;
  }

  // Remove interior keys only when they lie exactly on the linear interpolation of neighboring keys.
  let removedInPass = true;
  while (removedInPass && optimizedFrames.length > 2) {
    removedInPass = false;
    for (let i = 1; i < optimizedFrames.length - 1; i += 1) {
      if (!isLinearlyRedundantFrame(optimizedFrames, i)) continue;
      optimizedFrames.splice(i, 1);
      removedFrames += 1;
      removedInPass = true;
      i -= 1;
    }
  }

  return { optimizedFrames, removedFrames, normalizedFrames };
}

interface DeformOptimizationStats {
  removedEmptyDeforms: number;
  removedDuplicateFrames: number;
  normalizedFrames: number;
}

function optimizeDeformFrames(deformFrames: DeformFrame[]): {
  allFramesZero: boolean;
  optimizedFrames: DeformFrame[];
  removedFrames: number;
  normalizedFrames: number;
} {
  const allFramesZero = deformFrames.every((frame) => isZeroDeform(getFrameVertices(frame)));
  if (allFramesZero) {
    return {
      allFramesZero: true,
      optimizedFrames: deformFrames,
      removedFrames: 0,
      normalizedFrames: 0,
    };
  }

  const { optimizedFrames, removedFrames, normalizedFrames } = optimizeDeformTimeline(deformFrames);
  return {
    allFramesZero: false,
    optimizedFrames,
    removedFrames,
    normalizedFrames,
  };
}

function optimizeAttachmentDeforms(
  attachmentRoot: unknown
): DeformOptimizationStats {
  let removedEmptyDeforms = 0;
  let removedDuplicateFrames = 0;
  let normalizedFrames = 0;

  if (!isObjectRecord(attachmentRoot)) {
    return { removedEmptyDeforms, removedDuplicateFrames, normalizedFrames };
  }

  Object.keys(attachmentRoot).forEach((skinName) => {
    const skin = attachmentRoot[skinName];
    if (!isObjectRecord(skin)) return;

    Object.keys(skin).forEach((slotName) => {
      const slot = skin[slotName];
      if (!isObjectRecord(slot)) return;

      Object.keys(slot).forEach((attachmentName) => {
        const attachment = slot[attachmentName];
        if (!isObjectRecord(attachment)) return;
        const deform = attachment.deform;
        if (!Array.isArray(deform)) return;

        const deformFrames = deform as DeformFrame[];
        const result = optimizeDeformFrames(deformFrames);
        if (result.allFramesZero) {
          delete attachment.deform;
          if (Object.keys(attachment).length === 0) {
            delete slot[attachmentName];
          }
          removedEmptyDeforms += 1;
          return;
        }

        if (result.removedFrames > 0) {
          removedDuplicateFrames += result.removedFrames;
        }
        if (result.normalizedFrames > 0) {
          normalizedFrames += result.normalizedFrames;
        }
        attachment.deform = result.optimizedFrames;
      });

      if (Object.keys(slot).length === 0) {
        delete skin[slotName];
      }
    });

    if (Object.keys(skin).length === 0) {
      delete attachmentRoot[skinName];
    }
  });

  return { removedEmptyDeforms, removedDuplicateFrames, normalizedFrames };
}

function optimizeLegacyDeforms(
  legacyRoot: unknown
): DeformOptimizationStats {
  let removedEmptyDeforms = 0;
  let removedDuplicateFrames = 0;
  let normalizedFrames = 0;

  if (!isObjectRecord(legacyRoot)) {
    return { removedEmptyDeforms, removedDuplicateFrames, normalizedFrames };
  }

  Object.keys(legacyRoot).forEach((skinName) => {
    const skin = legacyRoot[skinName];
    if (!isObjectRecord(skin)) return;

    Object.keys(skin).forEach((slotName) => {
      const slot = skin[slotName];
      if (!isObjectRecord(slot)) return;

      Object.keys(slot).forEach((attachmentName) => {
        const timeline = slot[attachmentName];
        let deformFrames: DeformFrame[] | null = null;
        let setFrames: ((frames: DeformFrame[]) => void) | null = null;
        let clearFrames: (() => void) | null = null;

        if (Array.isArray(timeline) && shouldTreatAsLegacyDeformTimeline(timeline)) {
          deformFrames = timeline;
          setFrames = (frames) => {
            slot[attachmentName] = frames;
          };
          clearFrames = () => {
            delete slot[attachmentName];
          };
        } else if (isObjectRecord(timeline) && Array.isArray(timeline.deform)) {
          deformFrames = timeline.deform as DeformFrame[];
          setFrames = (frames) => {
            timeline.deform = frames;
          };
          clearFrames = () => {
            delete timeline.deform;
            if (Object.keys(timeline).length === 0) {
              delete slot[attachmentName];
            }
          };
        }

        if (!deformFrames || !setFrames || !clearFrames) return;

        const result = optimizeDeformFrames(deformFrames);
        if (result.allFramesZero) {
          clearFrames();
          removedEmptyDeforms += 1;
          return;
        }

        if (result.removedFrames > 0) {
          removedDuplicateFrames += result.removedFrames;
        }
        if (result.normalizedFrames > 0) {
          normalizedFrames += result.normalizedFrames;
        }
        setFrames(result.optimizedFrames);
      });

      if (Object.keys(slot).length === 0) {
        delete skin[slotName];
      }
    });

    if (Object.keys(skin).length === 0) {
      delete legacyRoot[skinName];
    }
  });

  return { removedEmptyDeforms, removedDuplicateFrames, normalizedFrames };
}

export function optimizeJson(rawText: string): { optimizedText: string; report: OptimizationReport } {
  const data = JSON.parse(rawText);
  const animations = data?.animations;

  if (!animations || typeof animations !== 'object') {
    return {
      optimizedText: rawText,
      report: {
        animationCount: 0,
        removedEmptyDeforms: 0,
        removedDuplicateFrames: 0,
        removedDrawOrderDuplicates: 0,
        changedAnimations: 0,
      },
    };
  }

  let removedEmptyDeforms = 0;
  let removedDuplicateFrames = 0;
  let removedDrawOrderDuplicates = 0;
  let changedAnimations = 0;
  const animationNames = Object.keys(animations);

  animationNames.forEach((animationName) => {
    const animation = animations[animationName];
    let animationChanged = false;

    // Optimize deform timelines in Spine 4.x `attachments` format.
    const attachmentStats = optimizeAttachmentDeforms(animation?.attachments);
    removedEmptyDeforms += attachmentStats.removedEmptyDeforms;
    removedDuplicateFrames += attachmentStats.removedDuplicateFrames;
    if (
      attachmentStats.removedEmptyDeforms > 0 ||
      attachmentStats.removedDuplicateFrames > 0 ||
      attachmentStats.normalizedFrames > 0
    ) {
      animationChanged = true;
    }

    // Optimize deform timelines in legacy `deform` / `ffd` formats.
    const deformStats = optimizeLegacyDeforms(animation?.deform);
    removedEmptyDeforms += deformStats.removedEmptyDeforms;
    removedDuplicateFrames += deformStats.removedDuplicateFrames;
    if (
      deformStats.removedEmptyDeforms > 0 ||
      deformStats.removedDuplicateFrames > 0 ||
      deformStats.normalizedFrames > 0
    ) {
      animationChanged = true;
    }

    const ffdStats = optimizeLegacyDeforms(animation?.ffd);
    removedEmptyDeforms += ffdStats.removedEmptyDeforms;
    removedDuplicateFrames += ffdStats.removedDuplicateFrames;
    if (
      ffdStats.removedEmptyDeforms > 0 ||
      ffdStats.removedDuplicateFrames > 0 ||
      ffdStats.normalizedFrames > 0
    ) {
      animationChanged = true;
    }

    // Optimize draw order timelines
    const drawOrder = animation?.drawOrder;
    if (Array.isArray(drawOrder) && drawOrder.length > 1) {
      const deduped: any[] = [];
      let lastOffsets: DrawOrderOffset[] | undefined;

      drawOrder.forEach((frame: any, index: number) => {
        const currentOffsets = frame?.offsets as DrawOrderOffset[] | undefined;
        if (index > 0 && areDrawOrderOffsetsEqual(currentOffsets, lastOffsets)) {
          removedDrawOrderDuplicates += 1;
          animationChanged = true;
          return;
        }
        deduped.push(frame);
        lastOffsets = currentOffsets;
      });

      animation.drawOrder = deduped;
    }

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
      removedDrawOrderDuplicates,
      changedAnimations,
    },
  };
}
