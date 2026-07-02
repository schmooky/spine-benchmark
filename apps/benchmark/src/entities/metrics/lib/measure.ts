import type { Spine } from "@esotericsoftware/spine-pixi-v8";
import { sleep } from "@/shared/lib/sleep";
import { useMetricsStore, type Metric } from "../model/store";

/**
 * The set of background "measuring tasks". Each one inspects the freshly parsed
 * skeleton and reports a metric. They are intentionally run sequentially with a
 * small delay so the loader spinner has something to represent and the UI has
 * time to settle into the loading state - see MIN_LOAD_MS in the orchestrator.
 *
 * These are real, cheap reads off the skeleton data today; heavier analyzers
 * (draw calls, mesh complexity, blend modes) can be slotted in as more tasks
 * without touching the orchestration.
 */
type Task = { key: string; run: (spine: Spine) => Metric };

const tasks: Task[] = [
  {
    key: "bones",
    run: (s) => ({
      key: "bones",
      label: "Bones",
      value: s.skeleton.bones.length,
    }),
  },
  {
    key: "slots",
    run: (s) => ({
      key: "slots",
      label: "Slots",
      value: s.skeleton.slots.length,
    }),
  },
  {
    key: "skins",
    run: (s) => ({
      key: "skins",
      label: "Skins",
      value: s.skeleton.data.skins.length,
    }),
  },
  {
    key: "animations",
    run: (s) => ({
      key: "animations",
      label: "Animations",
      value: s.skeleton.data.animations.length,
    }),
  },
  {
    key: "constraints",
    run: (s) => ({
      key: "constraints",
      label: "IK / Transform constraints",
      value:
        s.skeleton.data.ikConstraints.length +
        s.skeleton.data.transformConstraints.length +
        s.skeleton.data.pathConstraints.length,
    }),
  },
  {
    key: "bounds",
    run: (s) => {
      const b = s.getBounds();
      return {
        key: "bounds",
        label: "Setup bounds",
        value: `${Math.round(b.width)}x${Math.round(b.height)}`,
        unit: "px",
      };
    },
  },
];

/** Run every measuring task against the spine, streaming results into the
 *  metrics store and resolving once all are done. */
export async function runMeasurements(spine: Spine): Promise<void> {
  const { pushMetric, setProgress } = useMetricsStore.getState();
  for (let i = 0; i < tasks.length; i++) {
    await sleep(110);
    try {
      pushMetric(tasks[i].run(spine));
    } catch (err) {
      console.warn(`[measure] task "${tasks[i].key}" failed`, err);
    }
    setProgress((i + 1) / tasks.length);
  }
}
