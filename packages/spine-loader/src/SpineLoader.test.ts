/**
 * Unit tests for SpineLoader's pure parser helpers.
 *
 * SpineLoader itself wraps a PixiJS Application and does real fetch()
 * calls, which would make end-to-end tests heavy. The helpers that
 * parse atlas files and rewrite image paths are pure - they take a
 * string, return a string / object - and those are what we cover here.
 *
 * The parser methods are private on the SpineLoader class. We reach
 * them via a narrow `any` cast for the test only. This is cheap and
 * keeps the public API surface unchanged. If these helpers move to
 * their own module (atlasParser.ts) in the future, flip the imports
 * here without touching the assertions.
 *
 * Atlas format note: modern Spine atlases use `bounds:` for regions
 * and reserve `size:` for page headers. These tests use that format
 * because that is what the parser was written for.
 */
import { describe, expect, it } from 'vitest';
import { SpineLoader } from './SpineLoader.js';
import type { Application } from 'pixi.js';

// Minimal dummy Application - SpineLoader's parser helpers don't
// touch this.app, so an empty object is enough.
const dummyApp = {} as unknown as Application;

function loader(): SpineLoader {
  return new SpineLoader(dummyApp);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function privateAccess(instance: SpineLoader): any {
  return instance as unknown as Record<string, (...args: unknown[]) => unknown>;
}

// ────────────────────────────────────────────────────────────────
// extractImageNamesFromAtlas
// ────────────────────────────────────────────────────────────────

describe('SpineLoader.extractImageNamesFromAtlas', () => {
  const extract = (atlas: string): string[] =>
    privateAccess(loader()).extractImageNamesFromAtlas(atlas);

  it('extracts a single page from a modern-format atlas', () => {
    // Matches the spineboy.atlas fixture in packages/spinefolio/assets/.
    const atlas = [
      'spineboy.png',
      '\tsize: 1024, 256',
      '\tfilter: Linear, Linear',
      '\tscale: 0.5',
      'crosshair',
      '\tbounds: 352, 7, 45, 45',
      'head',
      '\tbounds: 2, 27, 136, 149',
    ].join('\n');

    expect(extract(atlas)).toEqual(['spineboy.png']);
  });

  it('parses a multi-page atlas with a blank line between pages', () => {
    const atlas = [
      'page1.png',
      '\tsize: 1024, 1024',
      '\tfilter: Linear, Linear',
      'region_a',
      '\tbounds: 0, 0, 64, 64',
      '',
      'page2.png',
      '\tsize: 1024, 1024',
      '\tfilter: Linear, Linear',
      'region_b',
      '\tbounds: 0, 0, 32, 32',
    ].join('\n');

    expect(extract(atlas)).toEqual(['page1.png', 'page2.png']);
  });

  it('parses a multi-page atlas with no blank separator between pages', () => {
    // Defensive: some exporters don't emit a blank line before the
    // next page header. The lookahead rule doesn't rely on blanks.
    const atlas = [
      'page1.png',
      '\tsize: 1024, 1024',
      '\tfilter: Linear, Linear',
      'region_a',
      '\tbounds: 0, 0, 64, 64',
      'page2.png',
      '\tsize: 1024, 1024',
      '\tfilter: Linear, Linear',
      'region_b',
      '\tbounds: 0, 0, 32, 32',
    ].join('\n');

    expect(extract(atlas)).toEqual(['page1.png', 'page2.png']);
  });

  it('does not mis-identify a trailing region as a page (no EOF push)', () => {
    const atlas = [
      'sheet.png',
      '\tsize: 2, 2',
      '\tfilter: Linear, Linear',
      'last_region',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    // Only the page header is returned. The trailing region is not.
    expect(extract(atlas)).toEqual(['sheet.png']);
  });

  it('does not mistake the last region name for a page (the regression the comment in the source warns about)', () => {
    // If an older implementation pushed `currentName` at EOF, the last
    // region under the final page would be misreported as a second
    // page. Pin the fixed behaviour.
    const atlas = [
      'symbols.webp',
      '\tsize: 2048, 2048',
      '\tfilter: Linear, Linear',
      '1_bell_blick',
      '\tbounds: 10, 10, 64, 64',
      '2_cherry',
      '\tbounds: 74, 10, 64, 64',
    ].join('\n');

    expect(extract(atlas)).toEqual(['symbols.webp']);
  });

  it('deduplicates repeated page names', () => {
    const atlas = [
      'sheet.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'sheet.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
    ].join('\n');

    expect(extract(atlas)).toEqual(['sheet.png']);
  });

  it('returns an empty array for an empty atlas', () => {
    expect(extract('')).toEqual([]);
    expect(extract('\n\n\n')).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────
// extractImageUrlsFromAtlas
// ────────────────────────────────────────────────────────────────

describe('SpineLoader.extractImageUrlsFromAtlas', () => {
  const extract = (atlas: string, atlasUrl: string): Record<string, string> =>
    privateAccess(loader()).extractImageUrlsFromAtlas(atlas, atlasUrl);

  it('resolves relative image names against the atlas URL directory', () => {
    const atlas = [
      'spineboy.png',
      '\tsize: 1024, 256',
      '\tfilter: Linear, Linear',
      'head',
      '\tbounds: 0, 0, 10, 10',
    ].join('\n');

    const urls = extract(atlas, 'https://example.test/assets/spineboy.atlas');
    expect(urls['spineboy.png']).toBe('https://example.test/assets/spineboy.png');
    // The helper stores both the full name and the base-without-extension
    // form so a later lookup can hit either key.
    expect(urls['spineboy']).toBe('https://example.test/assets/spineboy.png');
  });

  it('returns both "name.ext" and "name" keys for a single-page atlas', () => {
    const atlas = [
      'page1.webp',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'region_a',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const urls = extract(atlas, 'https://example.test/a.atlas');
    expect(urls['page1.webp']).toBe('https://example.test/page1.webp');
    // Dual-keyed - callers can look up with or without the extension.
    expect(urls['page1']).toBe(urls['page1.webp']);
  });

  it('accepts absolute http(s) URL page names and keeps them as-is', () => {
    const atlas = [
      'https://cdn.example.test/spineboy.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'head',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const urls = extract(atlas, 'https://example.test/a.atlas');
    expect(urls['https://cdn.example.test/spineboy.png']).toBe(
      'https://cdn.example.test/spineboy.png',
    );
    // Dual-keyed: basename lookup still works.
    expect(urls['https://cdn.example.test/spineboy']).toBe(
      'https://cdn.example.test/spineboy.png',
    );
  });

  it('resolves a multi-page atlas with distinct URLs per page', () => {
    const atlas = [
      'page1.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'region_a',
      '\tbounds: 0, 0, 1, 1',
      '',
      'page2.webp',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'region_b',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const urls = extract(atlas, 'https://example.test/multi.atlas');
    expect(urls['page1.png']).toBe('https://example.test/page1.png');
    expect(urls['page2.webp']).toBe('https://example.test/page2.webp');
    expect(urls['page1']).toBe(urls['page1.png']);
    expect(urls['page2']).toBe(urls['page2.webp']);
  });

  it('does not register a trailing region as a fake page URL at EOF', () => {
    const atlas = [
      'sheet.png',
      '\tsize: 2, 2',
      '\tfilter: Linear, Linear',
      'last_region',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const urls = extract(atlas, 'https://example.test/a.atlas');
    expect(urls['last_region']).toBeUndefined();
    expect(urls['sheet.png']).toBe('https://example.test/sheet.png');
  });
});

// ────────────────────────────────────────────────────────────────
// rewriteAtlasImageNames
// ────────────────────────────────────────────────────────────────

describe('SpineLoader.rewriteAtlasImageNames', () => {
  const rewrite = (atlas: string, files: string[]): string =>
    privateAccess(loader()).rewriteAtlasImageNames(atlas, files);

  it('leaves the atlas untouched when every declared page is already available', () => {
    const atlas = [
      'spineboy.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'head',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const result = rewrite(atlas, ['spineboy.png', 'spineboy.skel']);
    expect(result).toBe(atlas);
  });

  it('substitutes a page with a different extension when the base name matches', () => {
    // Atlas expects spineboy.png but the upload is spineboy.webp.
    const atlas = [
      'spineboy.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'head',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const rewritten = rewrite(atlas, ['spineboy.webp', 'spineboy.skel']);
    const firstLine = rewritten.split('\n')[0];
    expect(firstLine).toBe('spineboy.webp');
  });

  it('does not substitute when no base-name match exists', () => {
    const atlas = [
      'missing.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'head',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const rewritten = rewrite(atlas, ['something-else.png']);
    expect(rewritten).toBe(atlas);
  });

  it('rewrites only lines whose trimmed value matches the page name', () => {
    // A region line that happens to share the page's filename as its
    // region name also gets rewritten because the implementation
    // compares line.trim() to the atlas name. Pin the current
    // behaviour so a future refactor notices.
    const atlas = [
      'page.png',
      '\tsize: 1, 1',
      '\tfilter: Linear, Linear',
      'page.png',
      '\tbounds: 0, 0, 1, 1',
    ].join('\n');

    const rewritten = rewrite(atlas, ['page.webp']);
    const lines = rewritten.split('\n');
    expect(lines[0]).toBe('page.webp');
    // The region line's trim() also matches, so it too ends up
    // rewritten. A reader wondering whether this is intentional:
    // no real atlas uses a region name that equals the page name.
    expect(lines[3].trim()).toBe('page.webp');
  });
});
