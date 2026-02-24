import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const rootDir = process.cwd();
const localesDir = path.join(rootDir, 'src', 'locales');
const sourceDir = path.join(rootDir, 'src');
const traverse = traverseModule.default;

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

function shouldSkipJsxTextLiteral(text) {
  if (!text) return true;
  if (/^[^A-Za-z\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF]+$/.test(text)) return true;
  return false;
}

function collectLiteralViolations(file, source) {
  const violations = [];
  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      errorRecovery: true,
      plugins: ['typescript', 'jsx'],
    });
  } catch {
    return violations;
  }

  traverse(ast, {
    JSXText(pathRef) {
      const literal = pathRef.node.value.replace(/\s+/g, ' ').trim();
      if (shouldSkipJsxTextLiteral(literal)) return;
      violations.push({
        line: pathRef.node.loc?.start.line ?? 1,
        kind: 'jsx-text',
        value: literal,
      });
    },
    JSXAttribute(pathRef) {
      const nameNode = pathRef.node.name;
      if (nameNode.type !== 'JSXIdentifier') return;
      const attrName = nameNode.name;
      if (!['aria-label', 'title', 'placeholder', 'alt'].includes(attrName)) return;
      const valueNode = pathRef.node.value;
      if (!valueNode || valueNode.type !== 'StringLiteral') return;
      const literal = valueNode.value.trim();
      if (!literal || shouldSkipJsxTextLiteral(literal)) return;
      violations.push({
        line: valueNode.loc?.start.line ?? 1,
        kind: `attr:${attrName}`,
        value: literal,
      });
    },
  });

  return violations;
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
    const key = match[1];
    // Skip dynamic prefixes like t('analysis.summary.impact.' + level)
    if (key.endsWith('.')) continue;
    usedKeys.add(key);
  }
}

const missingInEn = [...usedKeys].filter((key) => !hasKey(locales['en.json'], key)).sort();
const missingByLocale = [];

const literalViolations = [];
for (const file of tsFiles) {
  if (!file.endsWith('.tsx')) continue;
  const normalized = file.replaceAll('\\', '/');
  const shouldCheck = normalized.includes('/routes/') || normalized.includes('/components/') || normalized.endsWith('/App.tsx');
  if (!shouldCheck) continue;
  const source = fs.readFileSync(file, 'utf8');
  const violations = collectLiteralViolations(file, source);
  if (violations.length > 0) {
    literalViolations.push([file, violations]);
  }
}

for (const file of localeFiles) {
  if (file === 'en.json') continue;
  const missing = enKeys.filter((key) => !hasKey(locales[file], key));
  if (missing.length > 0) {
    missingByLocale.push([file, missing]);
  }
}

if (missingInEn.length === 0 && missingByLocale.length === 0 && literalViolations.length === 0) {
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

for (const [file, violations] of literalViolations) {
  console.error(`Hardcoded UI literals in ${path.relative(rootDir, file)} (${violations.length}):`);
  for (const violation of violations) {
    console.error(`- L${violation.line} [${violation.kind}] ${violation.value}`);
  }
}

process.exit(1);
