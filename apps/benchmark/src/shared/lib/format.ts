/** "2.4 MB", "318 KB", "920 B" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** "just now", "5m ago", "3h ago", "2d ago" */
export function relativeTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Budget percentage with adaptive precision so tiny skeletons don't all
 * collapse to "0%": below 10% keep one decimal, below 0.1% clamp.
 */
export function formatBudgetPct(fraction: number): string {
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/** "×52" - how many copies of this cost the budget fits. "×999+" when huge. */
export function budgetHeadroom(fraction: number): string {
  if (fraction <= 0) return "×999+";
  const n = Math.floor(1 / fraction);
  return n > 999 ? "×999+" : `×${n}`;
}
