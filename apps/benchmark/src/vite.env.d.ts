/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REMOTE_FETCH_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.md' {
    const attributes: Record<string, unknown>;
    const html: string;
    const raw: string;
    export { attributes, html, raw };
  }
