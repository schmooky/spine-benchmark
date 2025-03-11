/// <reference types="vite/client" />

declare module '*.md' {
    const attributes: Record<string, unknown>;
    const html: string;
    const raw: string;
    export { attributes, html, raw };
  }