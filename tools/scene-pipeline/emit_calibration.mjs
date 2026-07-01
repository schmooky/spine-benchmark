/**
 * Writes the procedural single-axis calibration spines to the games-src asset
 * tree so they upload to S3 and load through the normal pipeline. Run:
 *   node tools/scene-pipeline/emit_calibration.mjs <games-src-root>
 */
import { calibrationSet } from "@spine-benchmark/calibration-primitives";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] || "/Users/user/GitHub/games-src";
const base = join(root, "calibration", "assets", "spine");

let n = 0;
for (const { id, files } of calibrationSet()) {
  const dir = join(base, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), files.skeleton);
  writeFileSync(join(dir, "white.atlas"), files.atlas);
  const pngB64 = files.pngDataUrl.split(",")[1];
  writeFileSync(join(dir, "white.png"), Buffer.from(pngB64, "base64"));
  n++;
}
console.log(`wrote ${n} calibration primitives to ${base}`);
