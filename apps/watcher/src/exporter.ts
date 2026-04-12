/**
 * Spine CLI export wrapper.
 *
 * Calls the Spine CLI to export a .spine project to JSON + atlas,
 * then returns paths to the exported files.
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

export interface ExportResult {
  skeletonPath: string;
  atlasPath: string;
}

function hashPath(p: string): string {
  return createHash('md5').update(p).digest('hex').slice(0, 12);
}

export function exportSpineProject(spinePath: string, projectPath: string): ExportResult {
  const hash = hashPath(projectPath);
  const outDir = join(tmpdir(), 'spine-benchmark-watcher', hash);

  // Clean previous export
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
  mkdirSync(outDir, { recursive: true });

  // Check for a .export.json next to the .spine file
  const projectDir = dirname(projectPath);
  const projectName = basename(projectPath, '.spine');
  const exportConfig = join(projectDir, `${projectName}.export.json`);

  let cmd: string;
  if (existsSync(exportConfig)) {
    // Use the project's own export settings
    cmd = `"${spinePath}" --input "${projectPath}" --output "${outDir}" --export "${exportConfig}"`;
  } else {
    // Default JSON export
    cmd = `"${spinePath}" --input "${projectPath}" --output "${outDir}" --export json`;
  }

  try {
    execSync(cmd, {
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err as any).stderr || err.message : String(err);
    throw new Error(`Spine export failed: ${msg}`);
  }

  // Find exported files
  const files = readdirSync(outDir);
  const skelFile = files.find(f => f.endsWith('.json') || f.endsWith('.skel'));
  const atlasFile = files.find(f => f.endsWith('.atlas'));

  if (!skelFile) {
    throw new Error(`No skeleton file (.json or .skel) found in export output: ${outDir}`);
  }
  if (!atlasFile) {
    throw new Error(`No atlas file found in export output: ${outDir}`);
  }

  return {
    skeletonPath: join(outDir, skelFile),
    atlasPath: join(outDir, atlasFile),
  };
}
