import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const localesDir = path.join(rootDir, 'src', 'locales');
const sourceDir = path.join(rootDir, 'src');

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      keys.push(...flattenKeys(value, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

function collectTsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function hasKey(obj, key) {
  return key.split('.').every((part) => {
    obj = obj?.[part];
    return obj !== undefined;
  });
}

const localeFiles = fs
  .readdirSync(localesDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (!localeFiles.includes('en.json')) {
  console.error('Missing required base locale: src/locales/en.json');
  process.exit(1);
}

const locales = Object.fromEntries(
  localeFiles.map((file) => {
    const full = path.join(localesDir, file);
    return [file, JSON.parse(fs.readFileSync(full, 'utf8'))];
  })
);

const enKeys = flattenKeys(locales['en.json']);
const tsFiles = collectTsFiles(sourceDir);
const keyPattern = /\bt\(\s*['"]([^'"]+)['"]/g;

const usedKeys = new Set();
for (const file of tsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(keyPattern)) {
    usedKeys.add(match[1]);
  }
}

const missingInEn = [...usedKeys].filter((key) => !hasKey(locales['en.json'], key)).sort();
const missingByLocale = [];
for (const file of localeFiles) {
  if (file === 'en.json') continue;
  const missing = enKeys.filter((key) => !hasKey(locales[file], key));
  if (missing.length > 0) {
    missingByLocale.push([file, missing]);
  }
}

if (missingInEn.length === 0 && missingByLocale.length === 0) {
  console.log('i18n check passed');
  process.exit(0);
}

if (missingInEn.length > 0) {
  console.error(`Missing keys in en.json used by code (${missingInEn.length}):`);
  for (const key of missingInEn) console.error(`- ${key}`);
}

for (const [file, keys] of missingByLocale) {
  console.error(`Missing keys in ${file} (${keys.length}):`);
  for (const key of keys) console.error(`- ${key}`);
}

process.exit(1);
