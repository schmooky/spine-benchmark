/**
 * Global vitest setup — browser global stubs.
 *
 * Several packages (constraint-tools, pixi-crawler) transitively import
 * spine-pixi-v8 which accesses browser globals (navigator, document)
 * at module scope. Stub the bare minimum so modules can load in Node.
 */

if (typeof globalThis.navigator === 'undefined') {
    (globalThis as Record<string, unknown>).navigator = { userAgent: 'node' };
}

if (typeof globalThis.document === 'undefined') {
    (globalThis as Record<string, unknown>).document = {
        createElement: () => ({ getContext: () => null }),
    };
}

if (typeof globalThis.window === 'undefined') {
    (globalThis as Record<string, unknown>).window = globalThis;
}
