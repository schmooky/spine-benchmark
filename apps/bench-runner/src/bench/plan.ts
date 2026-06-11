/**
 * Scenario plan: built at runtime from /spines/manifest.json so the bundled
 * spine set can be swapped without touching code. For every spine the plan
 * runs a solo pass (one instance, animation loop) and an instance ramp;
 * one final swarm mixes every spine together. Total wall time is divided
 * evenly across scenarios.
 */

export interface ManifestSpine {
  id: string;
  name: string;
  skel: string;
  atlas: string;
  /** Optional extra scale multiplier for oddly-sized rigs. */
  scale?: number;
}

export interface Manifest {
  spines: ManifestSpine[];
}

export interface Scenario {
  id: string;
  label: string;
  kind: "solo" | "ramp" | "swarm";
  /** Spine ids involved; ramp/solo have exactly one. */
  spines: string[];
  durationMs: number;
  /** Instance targets for ramp steps, evenly timed within the scenario. */
  rampSteps?: number[];
}

const RAMP_STEPS = [1, 2, 4, 8, 16, 24, 32, 48, 64];

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch("/spines/manifest.json");
  if (!res.ok) throw new Error(`manifest load failed: HTTP ${res.status}`);
  const m = (await res.json()) as Manifest;
  if (!Array.isArray(m.spines) || m.spines.length === 0) {
    throw new Error("manifest has no spines");
  }
  return m;
}

export function buildPlan(manifest: Manifest, totalSeconds: number): Scenario[] {
  const scenarios: Scenario[] = [];
  for (const s of manifest.spines) {
    scenarios.push({
      id: `${s.id}-solo`,
      label: `${s.name} - solo`,
      kind: "solo",
      spines: [s.id],
      durationMs: 0,
    });
    scenarios.push({
      id: `${s.id}-ramp`,
      label: `${s.name} - instance ramp`,
      kind: "ramp",
      spines: [s.id],
      durationMs: 0,
      rampSteps: RAMP_STEPS,
    });
  }
  scenarios.push({
    id: "swarm",
    label: "All spines - swarm",
    kind: "swarm",
    spines: manifest.spines.map((s) => s.id),
    durationMs: 0,
  });

  const per = Math.floor((totalSeconds * 1000) / scenarios.length);
  for (const sc of scenarios) sc.durationMs = per;
  return scenarios;
}
