import { init } from "@paralleldrive/cuid2";

/**
 * 8-char run ids - short enough to read over the phone, collision-safe
 * enough at calibration scale (the insert path still retries on conflict).
 */
export const newRunId = init({ length: 8 });
