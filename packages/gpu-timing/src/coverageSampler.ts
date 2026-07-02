/**
 * Measures the rendering-cost term RI was missing: how many pixels a display
 * object actually covers, and how deeply it overdraws them. RI counts vertices
 * and blend slots but never fill, which is why a big layered background beats
 * dozens of tiny symbols at equal "RI". Coverage is a (roughly animation-stable)
 * property of a spine, so it's cheap to sample once and feed as a feature.
 *
 * `coveredKpx` is in the object's OWN coordinate space (thousands of px), so it
 * is resolution- and fit-scale-independent; the on-screen fill is
 * `coveredKpx * fitScale^2`. `overdrawFactor` is total drawn area over covered
 * area (>= 1); 1 means no overlap.
 *
 * Lives in gpu-timing (not render-tools) so leaf consumers get it without the
 * camera/debug/gsap baggage. Typed structurally against the small slice of the
 * Pixi renderer/container API it touches, so this package keeps zero runtime
 * (and zero type) dependencies. Methods use call syntax on purpose: it makes a
 * real Pixi `Renderer`/`Container` structurally assignable to these shapes.
 */

export interface CoverageRenderer {
  extract: {
    pixels(options: unknown): {
      pixels: Uint8ClampedArray | Uint8Array;
      width: number;
      height: number;
    };
  };
}

export interface CoverageTarget {
  getLocalBounds(): { width: number; height: number };
  children?: CoverageTarget[];
  visible?: boolean;
  alpha?: number;
}

export interface CoverageSample {
  /** covered area in the object's local space, thousands of px. */
  coveredKpx: number;
  /** fraction of the object's bounding box that is actually covered (0..1). */
  coveredFraction: number;
  /** mean overdraw depth over the covered region (>= 1). */
  overdrawFactor: number;
}

/**
 * Render `target` to an offscreen buffer and read back its alpha to compute
 * covered pixels. Overdraw is estimated from the summed renderable-child area
 * versus the covered area. Best-effort: returns a bounds-area fallback if the
 * renderer can't extract pixels.
 */
export function sampleCoverage(
  renderer: CoverageRenderer,
  target: CoverageTarget,
  opts: { maxDim?: number } = {},
): CoverageSample {
  const maxDim = opts.maxDim ?? 200;
  const bounds = target.getLocalBounds();
  const w = Math.max(1, bounds.width);
  const h = Math.max(1, bounds.height);
  const boundsKpx = (w * h) / 1000;
  const resolution = Math.min(1, maxDim / Math.max(w, h));

  let pixels: Uint8ClampedArray | Uint8Array | undefined;
  let pw = 0;
  let ph = 0;
  try {
    const out = renderer.extract.pixels({ target, resolution });
    pixels = out.pixels;
    pw = out.width;
    ph = out.height;
  } catch {
    return { coveredKpx: boundsKpx, coveredFraction: 1, overdrawFactor: overdrawProxy(target) };
  }

  let covered = 0;
  const total = pw * ph;
  if (pixels) {
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 12) covered++; // alpha threshold
    }
  }
  const coveredFraction = total > 0 ? covered / total : 0;
  return {
    coveredKpx: coveredFraction * boundsKpx,
    coveredFraction,
    overdrawFactor: overdrawProxy(target),
  };
}

/**
 * Overdraw proxy from the scene graph: sum of each visible renderable child's
 * bounding area over the parent's covered area. A single flat layer -> ~1;
 * heavily stacked/layered art -> higher. Cheap and needs no extra GPU pass.
 */
function overdrawProxy(target: CoverageTarget): number {
  const parent = target.getLocalBounds();
  const parentArea = Math.max(1, parent.width * parent.height);
  let drawn = 0;
  const walk = (c: CoverageTarget) => {
    for (const child of c.children ?? []) {
      if (child.visible === false || (child.alpha ?? 1) <= 0.02) continue;
      if ((child.children?.length ?? 0) > 0) {
        walk(child);
      } else {
        const b = child.getLocalBounds();
        if (Number.isFinite(b.width) && Number.isFinite(b.height)) {
          drawn += Math.max(0, b.width) * Math.max(0, b.height);
        }
      }
    }
  };
  walk(target);
  return drawn > 0 ? Math.max(1, drawn / parentArea) : 1;
}
