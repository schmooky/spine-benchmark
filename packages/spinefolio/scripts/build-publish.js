import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const version = packageJson.version;

// Versioned publish directory
const publishDir = join(rootDir, 'dist', 'publish', version);

console.log(`📦 Building Spinefolio v${version} publish distribution...\n`);

// Ensure versioned directory exists (Vite will create it, but just in case)
if (!existsSync(publishDir)) {
  mkdirSync(publishDir, { recursive: true });
}

// Copy theme files
const themesDir = join(rootDir, 'src', 'themes');
const themeFiles = readdirSync(themesDir).filter(file => file.endsWith('.css'));

console.log('📄 Copying theme files...');
themeFiles.forEach(file => {
  const src = join(themesDir, file);
  const dest = join(publishDir, file);
  copyFileSync(src, dest);
  console.log(`  ✓ ${file}`);
});

// Copy assets directory
console.log('\n📁 Copying assets...');
const assetsDir = join(rootDir, 'assets');
const assetsDestDir = join(publishDir, 'assets');
if (!existsSync(assetsDestDir)) {
  mkdirSync(assetsDestDir, { recursive: true });
}

// Copy low quality assets for the example
const assetFiles = ['low_1.json', 'low.atlas', 'low.webp'];
assetFiles.forEach(file => {
  const src = join(assetsDir, file);
  const dest = join(assetsDestDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`  ✓ ${file}`);
  }
});

// Copy example.html (no version replacement needed anymore)
console.log('\n📄 Copying example files...');
const exampleSrc = join(rootDir, 'example.html');
const exampleDest = join(publishDir, 'example.html');
copyFileSync(exampleSrc, exampleDest);
console.log(`  ✓ example.html`);

// Copy README
const readmeSrc = join(rootDir, 'PUBLISH_README.md');
const readmeDest = join(publishDir, 'README.md');
copyFileSync(readmeSrc, readmeDest);
console.log('  ✓ README.md');

console.log(`\n✅ Build complete! Files are in dist/publish/${version}/`);
console.log('\n📦 Distribution contents:');
console.log('  • spinefolio.js (main library)');
console.log('  • spinefolio.js.map (source map)');
console.log('  • spinefolio.css (core styles)');
console.log('  • glassmorphic.css (theme)');
console.log('  • minimal.css (theme)');
console.log('  • neon.css (theme)');
console.log('  • example.html (usage example)');
console.log('  • assets/ (example Spine assets)');
console.log('  • README.md (documentation)');
console.log(`\n📂 Version: ${version}`);
console.log(`📍 Location: dist/publish/${version}/`);