import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

function copyThemes() {
  const themesDir = join(rootDir, 'src', 'themes');
  const targetDir = join(distDir, 'themes');
  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(themesDir).filter((file) => file.endsWith('.css'));
  for (const file of files) {
    copyFileSync(join(themesDir, file), join(targetDir, file));
  }
}

function copyDemoFiles() {
  copyFileSync(join(rootDir, 'example.html'), join(distDir, 'example.html'));
  copyFileSync(join(rootDir, 'demo-schmooky-blog.html'), join(distDir, 'demo-schmooky-blog.html'));
  copyFileSync(join(rootDir, 'README.md'), join(distDir, 'README.md'));
}

copyThemes();
copyDemoFiles();

console.log('Prepared publishable dist artifacts.');
