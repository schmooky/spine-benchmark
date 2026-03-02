import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default ?? (traverseModule as any);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(appRoot, 'src', 'locales');
const sourceDir = path.join(appRoot, 'src');
const checkedAttrNames = new Set(['aria-label', 'title', 'placeholder', 'alt']);

type LocaleMap = Record<string, unknown>;
type LiteralViolation = {
  file: string;
  line: number;
  kind: string;
  value: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function collectLocaleFiles(): string[] {
  return fs
    .readdirSync(localesDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function readLocale(file: string): LocaleMap {
  return JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8')) as LocaleMap;
}

function flattenEntries(
  input: LocaleMap,
  prefix = '',
  out: Record<string, string | number | boolean | null> = {}
): Record<string, string | number | boolean | null> {
  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) {
      flattenEntries(value, fullKey, out);
      continue;
    }
    out[fullKey] = value as string | number | boolean | null;
  }
  return out;
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
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

function shouldCheckFile(filePath: string): boolean {
  if (!filePath.endsWith('.tsx')) return false;
  const normalized = filePath.replaceAll('\\', '/');
  return (
    normalized.includes('/src/components/') ||
    normalized.includes('/src/routes/') ||
    normalized.endsWith('/src/App.tsx')
  );
}

function shouldSkipJsxTextLiteral(text: string): boolean {
  if (!text) return true;
  return !/\p{L}/u.test(text);
}

function extractStaticLiteral(expression: any): string | null {
  if (!expression) return null;
  if (expression.type === 'StringLiteral') return expression.value;
  if (expression.type === 'TemplateLiteral' && expression.expressions.length === 0) {
    return expression.quasis.map((quasi: any) => quasi.value.cooked ?? '').join('');
  }
  return null;
}

function collectLiteralViolations(filePath: string, source: string): LiteralViolation[] {
  const violations: LiteralViolation[] = [];
  let ast: any;
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
    JSXText(pathRef: any) {
      const literal = pathRef.node.value.replace(/\s+/g, ' ').trim();
      if (shouldSkipJsxTextLiteral(literal)) return;
      violations.push({
        file: filePath,
        line: pathRef.node.loc?.start.line ?? 1,
        kind: 'jsx-text',
        value: literal,
      });
    },
    JSXAttribute(pathRef: any) {
      const nameNode = pathRef.node.name;
      if (nameNode.type !== 'JSXIdentifier') return;
      const attrName = nameNode.name;
      if (!checkedAttrNames.has(attrName)) return;
      const valueNode = pathRef.node.value;
      if (!valueNode) return;
      const literal = valueNode.type === 'StringLiteral'
        ? valueNode.value.trim()
        : valueNode.type === 'JSXExpressionContainer'
          ? (extractStaticLiteral(valueNode.expression) ?? '').trim()
          : '';
      if (!literal || shouldSkipJsxTextLiteral(literal)) return;
      violations.push({
        file: filePath,
        line: valueNode.loc?.start.line ?? pathRef.node.loc?.start.line ?? 1,
        kind: `attr:${attrName}`,
        value: literal,
      });
    },
    JSXExpressionContainer(pathRef: any) {
      const parentNode = pathRef.parent;
      if (parentNode.type !== 'JSXElement' && parentNode.type !== 'JSXFragment') return;
      const literal = (extractStaticLiteral(pathRef.node.expression) ?? '').replace(/\s+/g, ' ').trim();
      if (!literal || shouldSkipJsxTextLiteral(literal)) return;
      violations.push({
        file: filePath,
        line: pathRef.node.loc?.start.line ?? 1,
        kind: 'jsx-expression',
        value: literal,
      });
    },
  });

  return violations;
}

function extractPlaceholders(value: string): string[] {
  const placeholders = new Set<string>();
  for (const match of value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    placeholders.add(match[1]);
  }
  return [...placeholders].sort();
}

describe('i18n locale parity', () => {
  it('has exactly the same translation keys in every locale', () => {
    const localeFiles = collectLocaleFiles();
    if (!localeFiles.includes('en.json')) {
      throw new Error('Missing base locale file: en.json');
    }

    const enEntries = flattenEntries(readLocale('en.json'));
    const enKeys = new Set(Object.keys(enEntries));
    const problems: string[] = [];

    for (const file of localeFiles) {
      if (file === 'en.json') continue;
      const localeEntries = flattenEntries(readLocale(file));
      const localeKeys = new Set(Object.keys(localeEntries));

      const missing = [...enKeys].filter((key) => !localeKeys.has(key));
      const extra = [...localeKeys].filter((key) => !enKeys.has(key));

      if (missing.length > 0) {
        problems.push(`${file} missing ${missing.length} key(s): ${missing.join(', ')}`);
      }
      if (extra.length > 0) {
        problems.push(`${file} has ${extra.length} extra key(s): ${extra.join(', ')}`);
      }
    }

    if (problems.length > 0) {
      throw new Error(`Locale key mismatch detected:\n${problems.join('\n')}`);
    }
  });

  it('preserves interpolation placeholders across locales', () => {
    const localeFiles = collectLocaleFiles();
    const enEntries = flattenEntries(readLocale('en.json'));
    const problems: string[] = [];

    for (const file of localeFiles) {
      if (file === 'en.json') continue;
      const localeEntries = flattenEntries(readLocale(file));
      for (const [key, enValue] of Object.entries(enEntries)) {
        if (typeof enValue !== 'string') continue;
        const localeValue = localeEntries[key];
        if (typeof localeValue !== 'string') continue;
        const expected = extractPlaceholders(enValue);
        const received = extractPlaceholders(localeValue);
        if (expected.join('|') !== received.join('|')) {
          problems.push(`${file} ${key}: expected [${expected.join(', ')}], got [${received.join(', ')}]`);
        }
      }
    }

    if (problems.length > 0) {
      throw new Error(`Locale interpolation placeholder mismatch:\n${problems.join('\n')}`);
    }
  });
});

describe('component i18n guard', () => {
  it('has no hardcoded user-facing string literals in JSX', () => {
    const tsFiles = collectTsFiles(sourceDir).filter(shouldCheckFile);
    const allViolations: LiteralViolation[] = [];

    for (const file of tsFiles) {
      const source = fs.readFileSync(file, 'utf8');
      allViolations.push(...collectLiteralViolations(file, source));
    }

    if (allViolations.length > 0) {
      const details = allViolations
        .map((violation) => {
          const rel = path.relative(appRoot, violation.file);
          return `${rel}:L${violation.line} [${violation.kind}] ${violation.value}`;
        })
        .join('\n');
      throw new Error(`Hardcoded UI literals found:\n${details}`);
    }
  });
});
