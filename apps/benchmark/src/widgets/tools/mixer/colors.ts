/**
 * Stable, distinct color per animation name so clips of the same animation
 * read as the same color across every track. Data colors (not theme colors)
 * - the grey UI stays grey, the clips are the only saturated thing, which is
 * exactly what makes them scannable.
 */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Golden-angle hue stepping keeps consecutive names far apart on the wheel. */
export function animationColor(name: string): string {
  const hue = (hash(name) * 137.508) % 360;
  return `hsl(${hue.toFixed(0)} 62% 55%)`;
}

export function animationColorDim(name: string): string {
  const hue = (hash(name) * 137.508) % 360;
  return `hsl(${hue.toFixed(0)} 45% 28%)`;
}
