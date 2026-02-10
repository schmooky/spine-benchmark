import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const localesDir = path.join(rootDir, 'src', 'locales');
const baseFile = path.join(localesDir, 'en.json');

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function mergeMissing(base, target) {
  if (!isObject(base)) return target;
  const out = isObject(target) ? { ...target } : {};

  for (const [key, value] of Object.entries(base)) {
    if (isObject(value)) {
      out[key] = mergeMissing(value, out[key]);
    } else if (!(key in out)) {
      out[key] = value;
    }
  }
  return out;
}

if (!fs.existsSync(baseFile)) {
  throw new Error('Missing src/locales/en.json');
}

const baseLocale = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const localeFiles = fs
  .readdirSync(localesDir)
  .filter((name) => name.endsWith('.json') && name !== 'en.json')
  .sort();

for (const file of localeFiles) {
  const full = path.join(localesDir, file);
  const current = JSON.parse(fs.readFileSync(full, 'utf8'));
  const merged = mergeMissing(baseLocale, current);
  fs.writeFileSync(full, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Synced ${file}`);
}
