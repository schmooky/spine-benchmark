/** Lower value = greener (better), higher = redder (worse). */
export function getStatColor(value: number, low: number, high: number): string {
  if (value <= low) return 'var(--sb-success)';
  if (value <= high) return 'var(--sb-warning)';
  return 'var(--sb-error)';
}
