/**
 * HUD stylesheet - single injected <style>, class-based (`.sbc-*`). All structural
 * styling lives here; render code only sets classNames + dynamic colors/widths
 * inline. Idempotent: injected once per document on first HUD mount.
 *
 * Design: muted, neutral, plain - a calm dev-tool panel that sits over a live
 * scene without shouting. All tone is driven by the `--sbc-*` custom properties
 * on the root, so the whole HUD is themeable by overriding a handful of vars.
 *
 * Includes the responsive (@media) rules for the HUD itself - the worst-frame
 * inspector keeps its own rules in shared/mobile-styles.ts. No `!important`: the
 * HUD is the only thing styling `#sbc-crawler` so plain class specificity wins.
 */
const HUD_STYLE_ID = "__sbc-hud-css";

const CSS = `
#sbc-crawler.sbc-hud {
    /* --- theme tokens (override these to re-skin) --- */
    --sbc-bg: rgba(15, 16, 19, 0.96);
    --sbc-fg: rgba(233, 234, 238, 0.94);
    --sbc-fg-dim: rgba(170, 173, 182, 0.74);
    --sbc-fg-muted: rgba(150, 153, 162, 0.52);
    --sbc-fg-faint: rgba(142, 145, 154, 0.36);
    --sbc-line: rgba(255, 255, 255, 0.045);
    --sbc-line-2: rgba(255, 255, 255, 0.07);
    --sbc-track: rgba(255, 255, 255, 0.045);
    --sbc-hover: rgba(255, 255, 255, 0.045);
    --sbc-accent: #7d9cb2;
    --sbc-warn: #c2a878;
    --sbc-over: #c07f77;
    --sbc-radius: 12px;

    position: fixed;
    top: 10px;
    right: 10px;
    padding: 0;
    /* Opaque-ish solid fill - no backdrop blur: blurring the live scene behind a
       fixed overlay forces a full-viewport composite every frame, perturbing the
       very timings the HUD measures. Higher alpha keeps text readable instead. */
    background: var(--sbc-bg);
    color: var(--sbc-fg);
    font: 11px/1.5 ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.005em;
    -webkit-font-smoothing: antialiased;
    border-radius: var(--sbc-radius);
    border: 1px solid var(--sbc-line-2);
    pointer-events: none;
    z-index: 99999;
    min-width: 320px;
    max-width: min(540px, calc(100vw - 20px));
    /* cap height + clip to rounded corners so the body can scroll inside */
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 20px);
    overflow: hidden;
    box-shadow:
        0 12px 40px rgba(0, 0, 0, 0.46),
        0 2px 8px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.045);
}

/* Scroll container - pointer-events:auto so the wheel/touch reaches it (desktop
   wheel-scroll needs this; the root stays pointer-events:none so the scene shows
   through the gaps). min-height:0 lets the flex child actually scroll. */
.sbc-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    pointer-events: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
}
.sbc-body::-webkit-scrollbar { width: 8px; }
.sbc-body::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
.sbc-body::-webkit-scrollbar-track { background: transparent; }

/* ---- collapse -> FPS badge ---- */
.sbc-hud .sbc-badge { display: none; }
.sbc-hud.sbc-collapsed { min-width: 0; width: auto; }
.sbc-hud.sbc-collapsed .sbc-body,
.sbc-hud.sbc-collapsed .sbc-header { display: none; }
.sbc-hud.sbc-collapsed .sbc-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 13px;
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
}
.sbc-badge .sbc-badge-fps { font-size: 15px; font-weight: 600; line-height: 1; }
.sbc-badge .sbc-badge-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sbc-fg-muted); }

/* ---- sections ---- */
.sbc-section { padding: 9px 13px; border-bottom: 1px solid var(--sbc-line); }
.sbc-section:last-child { border-bottom: 0; }
.sbc-section-title {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--sbc-fg-muted); margin-bottom: 7px; font-weight: 600;
}
/* Collapsible section header - click toggles its body (delegated listener on
   .sbc-body reads data-section). Caret prefix drawn by render code. */
.sbc-section-toggle { cursor: pointer; user-select: none; margin-bottom: 0; transition: color 0.12s; }
.sbc-section-toggle:hover { color: var(--sbc-fg-dim); }
.sbc-section-toggle.sbc-open { margin-bottom: 7px; }
/* Sub-block heading inside the merged Cost section. */
.sbc-subhead {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--sbc-fg-dim); font-weight: 600; margin: 8px 0 4px;
}
.sbc-subhead:first-of-type { margin-top: 2px; }

/* ---- header ---- */
.sbc-header {
    padding: 11px 13px; display: flex; align-items: baseline; flex-wrap: wrap;
    gap: 6px 10px; border-bottom: 1px solid var(--sbc-line-2);
    min-width: 0; flex: none;
}
.sbc-hd-col { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
/* left grows + may shrink (min-width:0) so it never forces overflow */
.sbc-hd-left { flex: 1 1 auto; }
.sbc-hd-right { align-items: flex-end; flex: 0 1 auto; }
/* fps row: number is fixed-size, label takes the rest and truncates */
.sbc-hd-fpsrow { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.sbc-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; align-self: center; opacity: 0.9; }
.sbc-fps { font-size: 21px; font-weight: 600; line-height: 1; flex: none; letter-spacing: -0.01em; }
.sbc-fps-label {
    font-size: 10px; color: var(--sbc-fg-muted); text-transform: uppercase; letter-spacing: 0.07em;
    flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* frame-time sparkline - flat muted line + a dashed budget reference, no
   per-point color (matches the plain/premium HUD aesthetic). */
.sbc-spark { display: block; margin-top: 4px; overflow: visible; }
.sbc-spark-line { fill: none; stroke: var(--sbc-fg-dim); stroke-width: 1.25; stroke-linejoin: round; stroke-linecap: round; }
.sbc-spark-budget { stroke: var(--sbc-line-2); stroke-width: 1; stroke-dasharray: 2 2; }
.sbc-total { font-size: 13px; font-weight: 500; white-space: nowrap; color: var(--sbc-fg); }
.sbc-sub { font-size: 9px; color: var(--sbc-fg-muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbc-collapse-btn {
    pointer-events: auto; cursor: pointer; background: transparent; border: 0;
    color: var(--sbc-fg-muted); font: 13px/1 ui-monospace, monospace;
    padding: 3px 7px; border-radius: 6px; -webkit-tap-highlight-color: transparent;
    flex: none; margin-left: auto; align-self: flex-start; transition: background 0.12s, color 0.12s;
}
.sbc-collapse-btn:hover { background: var(--sbc-hover); color: var(--sbc-fg); }

/* ---- micro-interaction: expand/collapse pop (config.hudMotion, default on) ----
   A brief scale+opacity settle on toggle, instead of the instant display:none
   snap. Applied as a transient class by the HUD, removed after it plays; the
   keyframes are always defined but only ever added to an element when
   hudMotion is enabled - see CrawlerHud.mount()/_setCollapsed(). */
@keyframes sbc-pop {
    from { opacity: 0.55; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
}
.sbc-toggle-pop { animation: sbc-pop 0.16s ease-out; }

/* ---- counters grid ---- */
.sbc-counters { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px 12px; font-size: 10px; }
.sbc-counter { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; overflow: hidden; }
.sbc-counter-l {
    color: var(--sbc-fg-muted); font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; cursor: help;
}
.sbc-counter-v {
    color: var(--sbc-fg); font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}

/* ---- key/value detail rows ---- */
.sbc-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 10px; margin-bottom: 3px; }
.sbc-kv:last-child { margin-bottom: 0; }
.sbc-kv-l { color: var(--sbc-fg-dim); cursor: help; }
.sbc-kv-v { color: var(--sbc-fg); text-align: right; flex: 1; border-radius: 3px; padding-right: 3px; }

/* ---- budget-score ---- */
/* cpu/gpu readouts: flat text, no capsule. The driver value sits in a muted
   hue (set inline), the rest reads as plain header text. */
.sbc-budget-chip {
    align-self: flex-start; font-size: 10px; font-weight: 500;
    padding: 0; border: 0; border-radius: 0; background: none; white-space: nowrap; cursor: help;
    color: var(--sbc-fg-dim); letter-spacing: 0.01em;
}
#sbc-crawler .sbc-budget-bottleneck .sbc-kv-l { color: var(--sbc-fg); font-weight: 600; }
.sbc-budget-device { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--sbc-line-2); }
.sbc-budget-device .sbc-kv-l { text-transform: uppercase; letter-spacing: 0.06em; font-size: 9px; }
.sbc-budget-note { display: block; font-size: 9px; font-style: italic; color: var(--sbc-warn); opacity: 0.85; cursor: help; margin: 3px 0 4px; }

/* ---- bars ---- */
.sbc-legend { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-bottom: 8px; }
.sbc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 9px; color: var(--sbc-fg-muted); }
.sbc-legend-dot { width: 7px; height: 7px; border-radius: 2px; display: inline-block; flex: none; }
.sbc-bars { display: flex; flex-direction: column; gap: 6px; }
.sbc-bar-row {
    display: grid; grid-template-columns: minmax(140px, 1.4fr) minmax(80px, 2fr) minmax(64px, auto);
    align-items: center; gap: 9px; font-size: 10px; color: var(--sbc-fg-dim); min-width: 0;
}
.sbc-bar-sep { text-align: center; font-size: 9px; color: var(--sbc-fg-faint); letter-spacing: 0.08em; padding-top: 2px; }
/* Parent rows (collapsible) - hover highlight + click affordance handled via a
   delegated listener on .sbc-bars (label read from data-label). */
.sbc-bar-row.sbc-bar-parent { cursor: pointer; pointer-events: auto; user-select: none; border-radius: 4px; transition: background 0.12s; }
.sbc-bar-row.sbc-bar-parent:hover { background: var(--sbc-hover); }
.sbc-bar-label { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbc-bar-track { position: relative; height: 9px; background: var(--sbc-track); border-radius: 3px; overflow: hidden; }
.sbc-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; opacity: 0.92; transition: width 0.18s ease-out; }
.sbc-bar-marker { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.28); }
.sbc-bar-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 8.5px; font-weight: 600;
    color: rgba(255, 255, 255, 0.8); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.65); pointer-events: none;
}
.sbc-bar-num { text-align: right; font-size: 10px; color: var(--sbc-fg-dim); }

/* ---- worst-frame row (only pointer-interactive region besides badge/buttons) ---- */
.sbc-worst {
    padding: 9px 13px; border-top: 1px solid var(--sbc-line); pointer-events: auto;
    cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between;
    gap: 10px; font-size: 10px; transition: background 0.12s;
}
.sbc-worst:hover { background: var(--sbc-hover); }
.sbc-worst-l { color: var(--sbc-fg-muted); text-transform: uppercase; letter-spacing: 0.07em; font-size: 9px; font-weight: 600; }
.sbc-worst-mid { flex: 1; text-align: right; color: var(--sbc-fg-dim); }
.sbc-worst-action { color: var(--sbc-accent); font-size: 10px; }

/* ---- record control ---- */
.sbc-record { padding: 9px 13px; border-bottom: 1px solid var(--sbc-line); display: none; gap: 10px; align-items: center; justify-content: space-between; }
.sbc-record-label { color: var(--sbc-fg-muted); text-transform: uppercase; letter-spacing: 0.07em; font-size: 9px; font-weight: 600; }
.sbc-btn {
    pointer-events: auto; cursor: pointer; color: var(--sbc-fg); background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--sbc-line-2); border-radius: 6px; padding: 4px 12px;
    font: 11px ui-monospace, monospace; font-weight: 600; touch-action: manipulation;
    -webkit-tap-highlight-color: transparent; min-width: 84px; transition: background 0.12s, border-color 0.12s;
}
.sbc-btn:hover { background: rgba(255, 255, 255, 0.1); }
.sbc-btn.sbc-btn-active { background: rgba(192, 127, 119, 0.18); border-color: rgba(192, 127, 119, 0.5); color: var(--sbc-over); }

/* ---- capture toolbar (record / save / load) ---- */
.sbc-capture {
    padding: 8px 13px; border-bottom: 1px solid var(--sbc-line);
    display: flex; align-items: center; gap: 7px;
}
.sbc-capture-l {
    color: var(--sbc-fg-muted); text-transform: uppercase; letter-spacing: 0.07em;
    font-size: 9px; font-weight: 600; margin-right: 2px;
}
.sbc-cap-btn {
    pointer-events: auto; cursor: pointer; background: rgba(255, 255, 255, 0.05);
    color: var(--sbc-fg-dim); border: 1px solid var(--sbc-line-2); border-radius: 6px;
    font: 10px ui-monospace, monospace; padding: 3px 10px; -webkit-tap-highlight-color: transparent;
    touch-action: manipulation; transition: background 0.12s, color 0.12s;
}
.sbc-cap-btn:hover { background: rgba(255, 255, 255, 0.1); color: var(--sbc-fg); }
.sbc-cap-btn.sbc-cap-rec-on { background: rgba(192, 127, 119, 0.18); color: var(--sbc-over); border-color: rgba(192, 127, 119, 0.5); }

/* ---- responsive: bottom-anchored, scrollable, touch-friendly on narrow/coarse ---- */
@media (max-width: 720px), (pointer: coarse) {
    #sbc-crawler.sbc-hud {
        top: auto;
        bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        left: calc(10px + env(safe-area-inset-left, 0px));
        right: calc(10px + env(safe-area-inset-right, 0px));
        min-width: 0;
        max-width: none;
        /* scrolling lives on .sbc-body (base rule) - only re-cap the height here */
        max-height: 60vh;
        max-height: 60dvh;
        font-size: 12px;
    }
    #sbc-crawler .sbc-worst { font-size: 12px; }
    #sbc-crawler .sbc-bar-row {
        grid-template-columns: minmax(0, 1.2fr) minmax(56px, 1.4fr) minmax(52px, auto);
        gap: 7px;
        font-size: 11px;
    }
    #sbc-crawler .sbc-bar-row > * { font-size: 11px; }
    #sbc-crawler .sbc-collapse-btn,
    #sbc-crawler .sbc-btn,
    #sbc-crawler .sbc-cap-btn { min-height: 32px; }
}
`;

export function injectHudStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(HUD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HUD_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * HUD color presets, as `--sbc-*` custom-property overrides applied inline on
 * the root element (config.hudTheme). "slate" is the shipped default (empty -
 * no override needed). All three keep the SAME light-text-on-dark direction as
 * the base theme: several elements (bar overlays, drop shadows) hardcode a
 * light-on-dark assumption, so a true light/white theme would need those
 * re-tuned too - out of scope here, hence no "light" preset.
 */
export const HUD_THEMES: Record<"slate" | "warm" | "contrast", Record<string, string>> = {
  slate: {},
  warm: {
    "--sbc-bg": "rgba(23, 19, 16, 0.96)",
    "--sbc-fg": "rgba(238, 231, 221, 0.94)",
    "--sbc-fg-dim": "rgba(196, 182, 163, 0.74)",
    "--sbc-fg-muted": "rgba(176, 160, 138, 0.52)",
    "--sbc-fg-faint": "rgba(168, 152, 130, 0.36)",
    "--sbc-line": "rgba(255, 232, 200, 0.05)",
    "--sbc-line-2": "rgba(255, 232, 200, 0.08)",
    "--sbc-track": "rgba(255, 232, 200, 0.05)",
    "--sbc-hover": "rgba(255, 232, 200, 0.05)",
    "--sbc-accent": "#c2a878",
    "--sbc-warn": "#c2a878",
    "--sbc-over": "#c4776a",
  },
  contrast: {
    "--sbc-bg": "rgba(24, 25, 29, 0.99)",
    "--sbc-fg": "rgba(245, 246, 248, 0.98)",
    "--sbc-fg-dim": "rgba(196, 199, 206, 0.85)",
    "--sbc-fg-muted": "rgba(172, 175, 184, 0.65)",
    "--sbc-fg-faint": "rgba(160, 163, 172, 0.5)",
    "--sbc-line": "rgba(255, 255, 255, 0.08)",
    "--sbc-line-2": "rgba(255, 255, 255, 0.14)",
    "--sbc-track": "rgba(255, 255, 255, 0.08)",
    "--sbc-hover": "rgba(255, 255, 255, 0.08)",
    "--sbc-accent": "#96b7cc",
    "--sbc-warn": "#d4bd8f",
    "--sbc-over": "#d4948a",
  },
};
