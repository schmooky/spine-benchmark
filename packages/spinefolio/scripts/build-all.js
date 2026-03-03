#!/usr/bin/env node
/**
 * Build all Spinefolio WebGL assets
 * Outputs:
 * - dist/spinefolio-webgl.js (IIFE)
 * - dist/spinefolio-webgl.mjs (ES Module)
 * - dist/spinefolio-core.css
 * - dist/spinefolio-theme-minimal.css
 * - dist/spinefolio-theme-glassmorphic.css
 * - dist/spinefolio-theme-neon.css
 */

import { spawn } from 'child_process';
import { mkdir, rm, copyFile, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

const buildTargets = [
  'core-js',
  'core-css',
  'theme-minimal',
  'theme-glassmorphic',
  'theme-neon',
];

async function runVite(target) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite', 'build'], {
      cwd: rootDir,
      env: { ...process.env, BUILD_TARGET: target },
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Vite build failed for ${target} with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function cleanDist() {
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true });
  }
  await mkdir(distDir, { recursive: true });
}

async function renameOutputs() {
  // Vite outputs CSS with hash, we need to rename
  const { glob } = await import('glob');
  
  // Find and rename CSS files
  const cssFiles = await glob(join(distDir, '*.css'));
  for (const file of cssFiles) {
    // Files are already named correctly by vite config
    console.log(`  ✓ ${file}`);
  }

  // Rename IIFE JS file
  const iifeFiles = await glob(join(distDir, 'spinefolio-webgl.iife.js'));
  if (iifeFiles.length > 0) {
    const newPath = join(distDir, 'spinefolio-webgl.js');
    await copyFile(iifeFiles[0], newPath);
    await rm(iifeFiles[0]);
    console.log(`  ✓ ${newPath}`);
  }

  // Rename ES Module file
  const esFiles = await glob(join(distDir, 'spinefolio-webgl.es.js'));
  if (esFiles.length > 0) {
    const newPath = join(distDir, 'spinefolio-webgl.mjs');
    await copyFile(esFiles[0], newPath);
    await rm(esFiles[0]);
    console.log(`  ✓ ${newPath}`);
  }
}

async function generateMinifiedVersions() {
  // The JS files are already minified by Vite/Terser
  // CSS files need minification
  const { glob } = await import('glob');
  const cssFiles = await glob(join(distDir, '*.css'));
  
  for (const file of cssFiles) {
    if (file.endsWith('.min.css')) continue;
    
    const content = await readFile(file, 'utf-8');
    const minified = minifyCSS(content);
    const minPath = file.replace('.css', '.min.css');
    await writeFile(minPath, minified);
    console.log(`  ✓ ${minPath}`);
  }
}

function minifyCSS(css) {
  return css
    // Remove comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove whitespace
    .replace(/\s+/g, ' ')
    // Remove space around special chars
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    // Remove trailing semicolons
    .replace(/;}/g, '}')
    // Remove leading/trailing whitespace
    .trim();
}

async function build() {
  console.log('🔨 Building Spinefolio WebGL...\n');

  try {
    // Clean dist directory
    console.log('📁 Cleaning dist directory...');
    await cleanDist();
    console.log('');

    // Build each target
    for (const target of buildTargets) {
      console.log(`📦 Building ${target}...`);
      await runVite(target);
      console.log('');
    }

    // Rename outputs
    console.log('📝 Renaming outputs...');
    await renameOutputs();
    console.log('');

    // Generate minified CSS versions
    console.log('🗜️  Generating minified CSS...');
    await generateMinifiedVersions();
    console.log('');

    console.log('✅ Build complete!\n');
    console.log('Output files:');
    
    const { glob } = await import('glob');
    const files = await glob(join(distDir, '*'));
    files.sort().forEach(f => console.log(`  - ${f.replace(rootDir + '/', '')}`));
    
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
