export interface OptimizationReport {
  animationCount: number;
  removedEmptyDeforms: number;
  removedDuplicateFrames: number;
  removedDrawOrderDuplicates: number;
  changedAnimations: number;
}

function deepEqualNumberArray(a: number[] = [], b: number[] = []): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isZeroDeform(vertices: number[] | undefined): boolean {
  if (!vertices || vertices.length === 0) return true;
  return vertices.every((value) => Math.abs(value) < 0.000001);
}

interface DrawOrderOffset {
  slot: string;
  offset: number;
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

    // Optimize deform timelines
    const attachments = animation?.attachments;
    if (attachments && typeof attachments === 'object') {
      Object.keys(attachments).forEach((skinName) => {
        const skin = attachments[skinName];
        if (!skin || typeof skin !== 'object') return;

        Object.keys(skin).forEach((slotName) => {
          const slot = skin[slotName];
          if (!slot || typeof slot !== 'object') return;

          Object.keys(slot).forEach((attachmentName) => {
            const attachment = slot[attachmentName];
            const deform = attachment?.deform;
            if (!Array.isArray(deform)) return;

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
