export type ModTheme = {
  background: number;

  panelFill: number;
  panelStroke: number;
  panelHeader: number;

  controlFill: number;
  controlStroke: number;
  controlHover: number;
  controlActive: number;

  textPrimary: number;
  textMuted: number;

  accentOrange: number;
  accentMint: number;
  accentCyan: number;
  accentLime: number;

  shadow: number;

  fontUi: string;
  fontMono: string;
};

export const modD3Theme: ModTheme = {
  background: 0x15181d,

  panelFill: 0x090c11,
  panelStroke: 0x5b616b,
  panelHeader: 0x4a4f57,

  controlFill: 0x131821,
  controlStroke: 0x434a56,
  controlHover: 0x1b2230,
  controlActive: 0x242d3f,

  textPrimary: 0xf2f4f7,
  textMuted: 0x9ea5b1,

  accentOrange: 0xffa125,
  accentMint: 0x53d5b3,
  accentCyan: 0x4fc9ff,
  accentLime: 0xc5ee36,

  shadow: 0x000000,

  fontUi: '"Rajdhani", "Saira Semi Condensed", "Helvetica Neue", sans-serif',
  fontMono: '"IBM Plex Mono", "SF Mono", Menlo, monospace',
};

export function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

export function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)} %`;
}
