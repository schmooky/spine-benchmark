const MOBILE_STYLE_ID = "__pixi-crawler-inspector-mobile-css";

export function injectMobileStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(MOBILE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MOBILE_STYLE_ID;
  style.textContent = `
@media (max-width: 720px), (pointer: coarse) {
    #worst-frame-inspector {
        width: auto !important;
        top: calc(8px + env(safe-area-inset-top, 0px)) !important;
        left: calc(8px + env(safe-area-inset-left, 0px)) !important;
        right: calc(8px + env(safe-area-inset-right, 0px)) !important;
        max-height: calc(100vh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        max-height: calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        font-size: 12px !important;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
    }
    #worst-frame-inspector button {
        min-height: 32px;
        padding: 6px 12px !important;
    }
}
`;
  document.head.appendChild(style);
}
