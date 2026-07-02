/**
 * HUD stylesheet - single injected <style>, class-based (`.sbc-*`). All structural
 * styling lives here; render code only sets classNames + dynamic colors/widths
 * inline. Idempotent: injected once per document on first HUD mount.
 *
 * Includes the responsive (@media) rules for the HUD itself - the worst-frame
 * inspector keeps its own rules in shared/mobile-styles.ts. No `!important`: the
 * HUD is the only thing styling `#sbc-crawler` so plain class specificity wins.
 */
const HUD_STYLE_ID = "__sbc-hud-css";

const CSS = `
#sbc-crawler.sbc-hud {
    position: fixed;
    top: 8px;
    right: 8px;
    padding: 0;
    /* Opaque-ish solid fill - no backdrop blur: blurring the live scene behind a
       fixed overlay forces a full-viewport composite every frame, perturbing the
       very timings the HUD measures. Higher alpha keeps text readable instead. */
    background: rgba(14, 18, 24, 0.97);
    color: rgba(232, 240, 246, 0.95);
    font: 11px/1.5 ui-monospace, "SF Mono", Consolas, monospace;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 99999;
    min-width: 320px;
    max-width: min(540px, calc(100vw - 16px));
    /* cap height + clip to rounded corners so the body can scroll inside */
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 16px);
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4);
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
}

/* ---- collapse -> FPS badge ---- */
.sbc-hud .sbc-badge { display: none; }
.sbc-hud.sbc-collapsed { min-width: 0; width: auto; }
.sbc-hud.sbc-collapsed .sbc-body,
.sbc-hud.sbc-collapsed .sbc-header { display: none; }
.sbc-hud.sbc-collapsed .sbc-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
}
.sbc-badge .sbc-badge-fps { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; }
.sbc-badge .sbc-badge-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(180, 200, 220, 0.5); }

/* ---- sections ---- */
.sbc-section { padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.sbc-section-title {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em;
    color: rgba(180, 200, 220, 0.45); margin-bottom: 6px; font-weight: 600;
}
/* Collapsible section header - click toggles its body (delegated listener on
   .sbc-body reads data-section). Caret prefix drawn by render code. */
.sbc-section-toggle { cursor: pointer; user-select: none; margin-bottom: 0; }
.sbc-section-toggle:hover { color: rgba(232, 240, 246, 0.85); }
.sbc-section-toggle.sbc-open { margin-bottom: 6px; }
/* Sub-block heading inside the merged Cost section. */
.sbc-subhead {
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    color: rgba(180, 200, 220, 0.6); font-weight: 600; margin: 6px 0 3px;
}
.sbc-subhead:first-of-type { margin-top: 2px; }

/* ---- header ---- */
.sbc-header {
    padding: 10px 12px; display: flex; align-items: baseline; flex-wrap: wrap;
    gap: 6px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent);
    min-width: 0; flex: none;
}
.sbc-hd-col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
/* left grows + may shrink (min-width:0) so it never forces overflow */
.sbc-hd-left { flex: 1 1 auto; }
.sbc-hd-right { align-items: flex-end; flex: 0 1 auto; }
/* fps row: number is fixed-size, label takes the rest and truncates */
.sbc-hd-fpsrow { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.sbc-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; align-self: center; }
.sbc-fps { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1; flex: none; }
.sbc-fps-label {
    font-size: 10px; color: rgba(180, 200, 220, 0.5); text-transform: uppercase; letter-spacing: 0.06em;
    flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sbc-total { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sbc-sub { font-size: 9px; color: rgba(180, 200, 220, 0.5); font-variant-numeric: tabular-nums; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbc-collapse-btn {
    pointer-events: auto; cursor: pointer; background: transparent; border: 0;
    color: rgba(180, 200, 220, 0.55); font: 14px/1 ui-monospace, monospace;
    padding: 2px 6px; border-radius: 4px; -webkit-tap-highlight-color: transparent;
    flex: none; margin-left: auto; align-self: flex-start;
}
.sbc-collapse-btn:hover { background: rgba(255, 255, 255, 0.08); color: rgba(232, 240, 246, 0.95); }

/* ---- counters grid ---- */
.sbc-counters { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 4px 10px; font-size: 10px; }
.sbc-counter { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0; overflow: hidden; }
.sbc-counter-l {
    color: rgba(180, 200, 220, 0.5); font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; cursor: help;
}
.sbc-counter-v {
    color: rgba(232, 240, 246, 0.95); font-variant-numeric: tabular-nums; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}

/* ---- key/value detail rows ---- */
.sbc-kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 10px; margin-bottom: 2px; }
.sbc-kv-l { color: rgba(180, 200, 220, 0.55); cursor: help; }
.sbc-kv-v { color: rgba(232, 240, 246, 0.9); font-variant-numeric: tabular-nums; text-align: right; flex: 1; border-radius: 2px; padding-right: 3px; }

/* ---- budget-score ---- */
.sbc-budget-chip {
    align-self: flex-start; font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
    padding: 1px 7px; border: 1px solid transparent; border-radius: 10px; white-space: nowrap; cursor: help;
}
#sbc-crawler .sbc-budget-bottleneck .sbc-kv-l { color: rgba(232, 240, 246, 0.95); font-weight: 600; }
.sbc-budget-device { margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.08); }
.sbc-budget-device .sbc-kv-l { text-transform: uppercase; letter-spacing: 0.05em; font-size: 9px; }
.sbc-budget-note { display: block; font-size: 9px; font-style: italic; color: rgba(255, 208, 96, 0.75); cursor: help; margin: 2px 0 4px; }

/* ---- bars ---- */
.sbc-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-bottom: 6px; }
.sbc-legend-item { display: flex; align-items: center; gap: 4px; font-size: 9px; color: rgba(180, 200, 220, 0.55); }
.sbc-legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; flex: none; }
.sbc-bars { display: flex; flex-direction: column; gap: 5px; }
.sbc-bar-row {
    display: grid; grid-template-columns: minmax(140px, 1.4fr) minmax(80px, 2fr) minmax(64px, auto);
    align-items: center; gap: 8px; font-size: 10px; color: rgba(232, 240, 246, 0.75); min-width: 0;
}
.sbc-bar-sep { text-align: center; font-size: 9px; color: rgba(180,200,220,0.4); letter-spacing: 0.08em; padding-top: 2px; }
/* Parent rows (collapsible) - hover highlight + click affordance handled via a
   delegated listener on .sbc-bars (label read from data-label). */
.sbc-bar-row.sbc-bar-parent { cursor: pointer; pointer-events: auto; user-select: none; border-radius: 2px; }
.sbc-bar-row.sbc-bar-parent:hover { background: rgba(255, 255, 255, 0.04); }
.sbc-bar-label { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbc-bar-track { position: relative; height: 12px; background: rgba(255, 255, 255, 0.04); border-radius: 2px; overflow: hidden; }
.sbc-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; }
.sbc-bar-marker { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255, 255, 255, 0.3); }
.sbc-bar-overlay {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 600; font-variant-numeric: tabular-nums;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.9); pointer-events: none;
}
.sbc-bar-num { text-align: right; font-variant-numeric: tabular-nums; font-size: 10px; color: rgba(232, 240, 246, 0.7); }

/* ---- worst-frame row (only pointer-interactive region besides badge/buttons) ---- */
.sbc-worst {
    padding: 8px 12px; border-top: 1px solid rgba(255, 255, 255, 0.06); pointer-events: auto;
    cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between;
    gap: 10px; font-size: 10px; transition: background 0.15s;
}
.sbc-worst:hover { background: rgba(255, 255, 255, 0.04); }
.sbc-worst-l { color: rgba(180, 200, 220, 0.55); text-transform: uppercase; letter-spacing: 0.06em; font-size: 9px; font-weight: 600; }
.sbc-worst-mid { flex: 1; text-align: right; color: rgba(232, 240, 246, 0.85); font-variant-numeric: tabular-nums; }
.sbc-worst-action { color: rgba(125, 187, 227, 0.85); font-size: 10px; }

/* ---- record control ---- */
.sbc-record { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); display: none; gap: 10px; align-items: center; justify-content: space-between; }
.sbc-record-label { color: rgba(180,200,220,0.55); text-transform: uppercase; letter-spacing: 0.06em; font-size: 9px; font-weight: 600; }
.sbc-btn {
    pointer-events: auto; cursor: pointer; color: #fff; border: 0; border-radius: 4px; padding: 4px 12px;
    font: 11px ui-monospace, monospace; font-weight: 600; touch-action: manipulation;
    -webkit-tap-highlight-color: transparent; min-width: 84px; background: rgba(50, 130, 80, 0.85);
}
.sbc-btn.sbc-btn-active { background: rgba(220, 70, 70, 0.85); }

/* ---- capture toolbar (record / save / load) ---- */
.sbc-capture {
    padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,0.06);
    display: flex; align-items: center; gap: 6px;
}
.sbc-capture-l {
    color: rgba(180,200,220,0.55); text-transform: uppercase; letter-spacing: 0.06em;
    font-size: 9px; font-weight: 600; margin-right: 2px;
}
.sbc-cap-btn {
    pointer-events: auto; cursor: pointer; background: rgba(255,255,255,0.05);
    color: rgba(200,216,230,0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
    font: 10px ui-monospace, monospace; padding: 3px 9px; -webkit-tap-highlight-color: transparent;
    touch-action: manipulation; font-variant-numeric: tabular-nums;
}
.sbc-cap-btn:hover { background: rgba(255,255,255,0.1); color: rgba(232,240,246,0.95); }
.sbc-cap-btn.sbc-cap-rec-on { background: rgba(220,70,70,0.85); color: #fff; border-color: rgba(220,70,70,0.5); }

/* ---- responsive: bottom-anchored, scrollable, touch-friendly on narrow/coarse ---- */
@media (max-width: 720px), (pointer: coarse) {
    #sbc-crawler.sbc-hud {
        top: auto;
        bottom: calc(8px + env(safe-area-inset-bottom, 0px));
        left: calc(8px + env(safe-area-inset-left, 0px));
        right: calc(8px + env(safe-area-inset-right, 0px));
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
        gap: 6px;
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
