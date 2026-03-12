import {
  Assets,
  BitmapText,
  Container,
  FederatedPointerEvent,
  Geometry,
  Mesh,
  Rectangle,
  Shader,
  UniformGroup,
} from "pixi.js";
import { clamp01, fmtPercent, type ModTheme } from "./theme.js";

type RGBA = [number, number, number, number];

type SDFRectStyle = {
  radius: number;
  stroke: number;
  fill: RGBA;
  strokeColor: RGBA;
  shadowColor: RGBA;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  glowColor: RGBA;
  glowSize: number;
};

const SDF_VS = `
precision mediump float;

in vec2 aPosition;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

out vec2 vUv;

void main() {
  vUv = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const SDF_FS = `
precision mediump float;

in vec2 vUv;
out vec4 finalColor;

uniform vec2 uSize;
uniform float uRadius;
uniform float uStroke;

uniform vec4 uFill;
uniform vec4 uStrokeColor;
uniform vec4 uShadowColor;
uniform vec2 uShadowOffset;
uniform float uShadowBlur;
uniform vec4 uGlowColor;
uniform float uGlowSize;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - (b - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 size = max(uSize, vec2(1.0));
  vec2 p = vUv * size - 0.5 * size;
  vec2 halfSize = 0.5 * size;

  float radius = min(uRadius, min(halfSize.x, halfSize.y));
  float d = sdRoundRect(p, halfSize, radius);

  // WebGL1-safe AA width (avoids derivative extension requirements).
  float aa = 1.0;

  float fillA = 1.0 - smoothstep(0.0, aa, d);

  float strokeBand = abs(d) - max(uStroke, 0.0);
  float strokeA = 1.0 - smoothstep(0.0, aa, strokeBand);

  vec2 shP = p - uShadowOffset;
  float dShadow = sdRoundRect(shP, halfSize, radius);
  float shSoft = max(aa + uShadowBlur, aa + 0.01);
  float shadowA = 1.0 - smoothstep(0.0, shSoft, dShadow);

  float glowBand = 1.0 - smoothstep(0.0, aa + max(0.001, uGlowSize), d);
  float glowA = glowBand * uGlowColor.a;

  vec4 col = vec4(0.0);
  col += uShadowColor * shadowA;
  col += vec4(uGlowColor.rgb, 1.0) * glowA;
  col += uFill * fillA;
  col += uStrokeColor * strokeA;

  finalColor = col;
}
`;

const QUAD_GEOMETRY = new Geometry();
QUAD_GEOMETRY.addAttribute("aPosition", {
  buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  format: "float32x2",
});
QUAD_GEOMETRY.addIndex([0, 1, 2, 0, 2, 3]);

type SDFUniformStruct = {
  uSize: { value: Float32Array; type: "vec2<f32>" };
  uRadius: { value: number; type: "f32" };
  uStroke: { value: number; type: "f32" };
  uFill: { value: Float32Array; type: "vec4<f32>" };
  uStrokeColor: { value: Float32Array; type: "vec4<f32>" };
  uShadowColor: { value: Float32Array; type: "vec4<f32>" };
  uShadowOffset: { value: Float32Array; type: "vec2<f32>" };
  uShadowBlur: { value: number; type: "f32" };
  uGlowColor: { value: Float32Array; type: "vec4<f32>" };
  uGlowSize: { value: number; type: "f32" };
};

function rgba(hex: number, alpha = 1): RGBA {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return [r * alpha, g * alpha, b * alpha, alpha];
}

function copyColor(dst: Float32Array, src: RGBA): void {
  dst[0] = src[0];
  dst[1] = src[1];
  dst[2] = src[2];
  dst[3] = src[3];
}

function mixRGBA(a: RGBA, b: RGBA, t: number): RGBA {
  const m = clamp01(t);
  const inv = 1 - m;
  return [
    a[0] * inv + b[0] * m,
    a[1] * inv + b[1] * m,
    a[2] * inv + b[2] * m,
    a[3] * inv + b[3] * m,
  ];
}

function shortLabel(value: string, max = 16): string {
  if (value.length <= max) return value;
  const head = Math.max(4, Math.floor((max - 1) * 0.66));
  return `${value.slice(0, head)}…`;
}

const DEFAULT_STYLE: SDFRectStyle = {
  radius: 8,
  stroke: 0,
  fill: [1, 1, 1, 1],
  strokeColor: [0, 0, 0, 0],
  shadowColor: [0, 0, 0, 0],
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  glowColor: [0, 0, 0, 0],
  glowSize: 0,
};

export class SDFRect extends Mesh<Geometry, Shader> {
  private widthPx: number;
  private heightPx: number;

  private readonly uSize: Float32Array;
  private readonly uFill: Float32Array;
  private readonly uStrokeColor: Float32Array;
  private readonly uShadowColor: Float32Array;
  private readonly uShadowOffset: Float32Array;
  private readonly uGlowColor: Float32Array;
  private readonly sdfUniforms: UniformGroup<SDFUniformStruct>;

  private readonly style: SDFRectStyle;

  constructor(width: number, height: number, style?: Partial<SDFRectStyle>) {
    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);

    const uSize = new Float32Array([safeW, safeH]);
    const uFill = new Float32Array(4);
    const uStrokeColor = new Float32Array(4);
    const uShadowColor = new Float32Array(4);
    const uShadowOffset = new Float32Array(2);
    const uGlowColor = new Float32Array(4);

    const sdfUniforms = new UniformGroup<SDFUniformStruct>({
      uSize: { value: uSize, type: "vec2<f32>" },
      uRadius: { value: 8, type: "f32" },
      uStroke: { value: 0, type: "f32" },
      uFill: { value: uFill, type: "vec4<f32>" },
      uStrokeColor: { value: uStrokeColor, type: "vec4<f32>" },
      uShadowColor: { value: uShadowColor, type: "vec4<f32>" },
      uShadowOffset: { value: uShadowOffset, type: "vec2<f32>" },
      uShadowBlur: { value: 0, type: "f32" },
      uGlowColor: { value: uGlowColor, type: "vec4<f32>" },
      uGlowSize: { value: 0, type: "f32" },
    });

    const shader = Shader.from({
      gl: {
        name: "crawler-ui-sdf-rect",
        vertex: SDF_VS,
        fragment: SDF_FS,
      },
      resources: {
        sdfUniforms,
      },
    });

    super({ geometry: QUAD_GEOMETRY, shader });

    this.widthPx = safeW;
    this.heightPx = safeH;

    this.scale.set(this.widthPx, this.heightPx);

    this.uSize = uSize;
    this.uFill = uFill;
    this.uStrokeColor = uStrokeColor;
    this.uShadowColor = uShadowColor;
    this.uShadowOffset = uShadowOffset;
    this.uGlowColor = uGlowColor;
    this.sdfUniforms = sdfUniforms;

    this.style = {
      ...DEFAULT_STYLE,
      ...style,
    };

    this.applyStyle();
  }

  setSize(width: number, height: number): void {
    this.widthPx = Math.max(1, width);
    this.heightPx = Math.max(1, height);

    this.scale.set(this.widthPx, this.heightPx);
    this.uSize[0] = this.widthPx;
    this.uSize[1] = this.heightPx;
  }

  setStyle(style: Partial<SDFRectStyle>): void {
    if (style.radius !== undefined) this.style.radius = style.radius;
    if (style.stroke !== undefined) this.style.stroke = style.stroke;
    if (style.fill !== undefined) this.style.fill = style.fill;
    if (style.strokeColor !== undefined)
      this.style.strokeColor = style.strokeColor;
    if (style.shadowColor !== undefined)
      this.style.shadowColor = style.shadowColor;
    if (style.shadowBlur !== undefined)
      this.style.shadowBlur = style.shadowBlur;
    if (style.shadowOffsetX !== undefined)
      this.style.shadowOffsetX = style.shadowOffsetX;
    if (style.shadowOffsetY !== undefined)
      this.style.shadowOffsetY = style.shadowOffsetY;
    if (style.glowColor !== undefined) this.style.glowColor = style.glowColor;
    if (style.glowSize !== undefined) this.style.glowSize = style.glowSize;

    this.applyStyle();
  }

  private applyStyle(): void {
    this.sdfUniforms.uniforms.uRadius = this.style.radius;
    this.sdfUniforms.uniforms.uStroke = this.style.stroke;
    this.sdfUniforms.uniforms.uShadowBlur = this.style.shadowBlur;
    this.sdfUniforms.uniforms.uGlowSize = this.style.glowSize;

    this.uShadowOffset[0] = this.style.shadowOffsetX;
    this.uShadowOffset[1] = this.style.shadowOffsetY;

    copyColor(this.uFill, this.style.fill);
    copyColor(this.uStrokeColor, this.style.strokeColor);
    copyColor(this.uShadowColor, this.style.shadowColor);
    copyColor(this.uGlowColor, this.style.glowColor);
  }
}

function uiText(
  _theme: ModTheme,
  value: string,
  size: number,
  color: number,
  mono = false,
): BitmapText {
  const text = new BitmapText({
    text: value,
    style: {
      fontFamily: "Monaco",
      fontSize: size,
      fill: color,
      letterSpacing: mono ? 0.4 : 0.2,
      align: "left",
    },
  });
  text.roundPixels = true;
  return text;
}

function updateSegment(
  seg: SDFRect,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));

  seg.setSize(len, thickness);
  seg.pivot.set(0, thickness * 0.5);
  seg.position.set(x0, y0);
  seg.rotation = Math.atan2(dy, dx);
}

type PanelMenuAction = "solo" | "pause" | "dim" | "random";
type PanelKey = "tl" | "tr" | "bl" | "br";

const PANEL_MENU_ITEMS: ReadonlyArray<{
  action: PanelMenuAction;
  label: string;
}> = [
  { action: "random", label: "R" },
  { action: "dim", label: "D" },
  { action: "pause", label: "P" },
  { action: "solo", label: "S" },
];

// Keep legacy widget classes around for quick A/B restores while satisfying TS noUnusedLocals.
const LEGACY_PANEL_KEYS: readonly PanelKey[] = ["tl", "tr", "bl", "br"];
void LEGACY_PANEL_KEYS;

class HeaderActionButton extends Container {
  private readonly bg: SDFRect;
  private readonly glyph: BitmapText;
  private readonly theme: ModTheme;

  private hovered = false;
  private active = false;

  onPress?: () => void;

  constructor(theme: ModTheme, label: string) {
    super();
    this.theme = theme;

    this.bg = new SDFRect(17, 17, {
      radius: 8.5,
      fill: rgba(0x2f343c, 0.92),
      stroke: 0.75,
      strokeColor: rgba(0x79818f, 0.66),
    });
    this.addChild(this.bg);

    this.glyph = uiText(theme, label, 10, theme.textPrimary, true);
    this.glyph.anchor.set(0.5, 0.5);
    this.glyph.position.set(8.5, 8.5);
    this.addChild(this.glyph);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Rectangle(0, 0, 17, 17);

    this.on("pointerover", () => {
      this.hovered = true;
      this.redraw();
    });
    this.on("pointerout", () => {
      this.hovered = false;
      this.redraw();
    });
    this.on("pointertap", () => {
      this.onPress?.();
    });

    this.redraw();
  }

  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    this.redraw();
  }

  private redraw(): void {
    if (this.active) {
      this.bg.setStyle({
        fill: rgba(this.theme.accentCyan, 0.32),
        strokeColor: rgba(this.theme.accentCyan, 0.85),
        glowColor: rgba(this.theme.accentCyan, 0.25),
        glowSize: 5,
      });
      this.glyph.tint = this.theme.textPrimary;
      return;
    }

    this.bg.setStyle({
      fill: rgba(
        this.hovered ? 0x424a57 : 0x2f343c,
        this.hovered ? 0.96 : 0.92,
      ),
      strokeColor: rgba(
        this.hovered ? 0xa0a8b5 : 0x79818f,
        this.hovered ? 0.78 : 0.66,
      ),
      glowColor: [0, 0, 0, 0],
      glowSize: 0,
    });
    this.glyph.tint = this.hovered ? 0xf8fbff : this.theme.textPrimary;
  }
}

class ModulePanel extends Container {
  readonly content = new Container();

  private readonly chrome: SDFRect;
  private readonly outerBorder: SDFRect;
  private readonly innerBorder: SDFRect;
  private readonly header: SDFRect;
  private readonly menuButtons: Partial<
    Record<PanelMenuAction, HeaderActionButton>
  > = {};

  readonly panelWidth: number;
  readonly panelHeight: number;

  constructor(
    theme: ModTheme,
    title: string,
    width: number,
    height: number,
    onMenuAction?: (action: PanelMenuAction) => void,
  ) {
    super();

    this.panelWidth = width;
    this.panelHeight = height;

    this.chrome = new SDFRect(width, height, {
      radius: 14,
      stroke: 0,
      fill: rgba(theme.panelFill, 0.96),
      strokeColor: [0, 0, 0, 0],
      shadowColor: rgba(theme.shadow, 0.45),
      shadowBlur: 16,
      shadowOffsetY: 4,
      glowColor: rgba(theme.accentCyan, 0.06),
      glowSize: 2,
    });
    this.addChild(this.chrome);

    this.outerBorder = new SDFRect(width, height, {
      radius: 14,
      stroke: 1.7,
      fill: [0, 0, 0, 0],
      strokeColor: rgba(0xe0e5ed, 0.96),
      glowColor: rgba(theme.accentCyan, 0.14),
      glowSize: 1.0,
    });
    this.addChild(this.outerBorder);

    this.innerBorder = new SDFRect(width - 6, height - 6, {
      radius: 11,
      stroke: 1.05,
      fill: [0, 0, 0, 0],
      strokeColor: rgba(0x848c99, 0.9),
    });
    this.innerBorder.position.set(3, 3);
    this.addChild(this.innerBorder);

    this.header = new SDFRect(width - 4, 30, {
      radius: 12,
      fill: rgba(theme.panelHeader, 0.96),
      stroke: 1.0,
      strokeColor: rgba(0xb0b7c2, 0.72),
    });
    this.header.position.set(2, 2);
    this.addChild(this.header);

    const led = new SDFRect(18, 18, {
      radius: 9,
      fill: rgba(theme.accentOrange, 0.96),
      stroke: 1,
      strokeColor: rgba(0x391c00, 0.9),
      glowColor: rgba(theme.accentOrange, 0.35),
      glowSize: 6,
    });
    led.position.set(8, 8);
    this.addChild(led);

    const shownTitle = title.length > 11 ? `${title.slice(0, 11)}..` : title;
    const titleText = uiText(theme, shownTitle, 14, theme.textPrimary);
    titleText.anchor.set(0, 0.5);
    titleText.position.set(34, 17);
    this.addChild(titleText);

    for (let i = 0; i < PANEL_MENU_ITEMS.length; i++) {
      const item = PANEL_MENU_ITEMS[i]!;
      const button = new HeaderActionButton(theme, item.label);
      button.position.set(width - 24 - i * 22, 8);
      button.onPress = () => {
        onMenuAction?.(item.action);
      };
      this.menuButtons[item.action] = button;
      this.addChild(button);
    }

    this.content.position.set(8, 38);
    this.addChild(this.content);
  }

  setMenuActive(action: PanelMenuAction, active: boolean): void {
    this.menuButtons[action]?.setActive(active);
  }
}

class ModSlider extends Container {
  private readonly track: SDFRect;
  private readonly fill: SDFRect;
  private readonly thumb: SDFRect;
  private readonly labelText: BitmapText;
  private readonly valueText: BitmapText;

  private readonly theme: ModTheme;
  private readonly widthPx: number;

  private dragging = false;

  value = 0.5;
  onChange?: (value: number) => void;

  constructor(theme: ModTheme, label: string, width: number) {
    super();

    this.theme = theme;
    this.widthPx = width;

    this.labelText = uiText(theme, label, 13, theme.textMuted);
    this.labelText.anchor.set(0, 0.5);
    this.labelText.position.set(0, 7);
    this.addChild(this.labelText);

    this.valueText = uiText(
      theme,
      fmtPercent(this.value),
      13,
      theme.textPrimary,
      true,
    );
    this.valueText.anchor.set(1, 0.5);
    this.valueText.position.set(width, 7);
    this.addChild(this.valueText);

    this.track = new SDFRect(width, 12, {
      radius: 6,
      stroke: 1,
      fill: rgba(theme.controlFill, 0.95),
      strokeColor: rgba(theme.controlStroke, 0.75),
      shadowColor: rgba(theme.shadow, 0.35),
      shadowBlur: 8,
      shadowOffsetY: 2,
    });
    this.track.position.set(0, 18);
    this.addChild(this.track);

    this.fill = new SDFRect(2, 12, {
      radius: 6,
      fill: rgba(theme.accentMint, 0.95),
      glowColor: rgba(theme.accentMint, 0.3),
      glowSize: 8,
    });
    this.fill.position.set(0, 18);
    this.addChild(this.fill);

    this.thumb = new SDFRect(16, 20, {
      radius: 7,
      stroke: 1,
      fill: rgba(theme.controlHover, 0.95),
      strokeColor: rgba(theme.controlStroke, 0.9),
      shadowColor: rgba(theme.shadow, 0.45),
      shadowBlur: 10,
      shadowOffsetY: 2,
      glowColor: rgba(theme.accentMint, 0.3),
      glowSize: 0,
    });
    this.thumb.position.set(0, 14);
    this.addChild(this.thumb);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Rectangle(0, 0, width, 38);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);

    this.redraw();
  }

  setValue(value: number, emit = true): void {
    const next = clamp01(value);
    if (Math.abs(next - this.value) < 1e-5) return;

    this.value = next;
    this.redraw();

    if (emit) this.onChange?.(this.value);
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    this.dragging = true;
    const local = ev.getLocalPosition(this);
    this.setFromX(local.x);
  }

  private handlePointerMove(ev: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const local = ev.getLocalPosition(this);
    this.setFromX(local.x);
  }

  private handlePointerUp(): void {
    this.dragging = false;
  }

  private setFromX(x: number): void {
    const nx = clamp01(x / this.widthPx);
    this.setValue(nx);
  }

  private redraw(): void {
    const fillW = Math.max(2, this.widthPx * this.value);
    this.fill.setSize(fillW, 12);
    this.thumb.position.x = this.widthPx * this.value - 8;

    this.valueText.text = fmtPercent(this.value);

    this.thumb.setStyle({
      fill: rgba(
        this.dragging ? this.theme.controlActive : this.theme.controlHover,
        0.95,
      ),
      glowSize: this.dragging ? 10 : 0,
    });
  }
}

class ModKnob extends Container {
  private readonly theme: ModTheme;
  private readonly sizePx: number;

  private readonly base: SDFRect;
  private readonly centerDisc: SDFRect;
  private readonly pointerDot: SDFRect;
  private readonly dots: SDFRect[] = [];

  private readonly valueText: BitmapText;
  private readonly labelText: BitmapText;

  private dragging = false;
  private dragStartY = 0;
  private dragStartValue = 0;

  value = 0.5;
  onChange?: (value: number) => void;

  constructor(theme: ModTheme, label: string, size: number) {
    super();

    this.theme = theme;
    this.sizePx = size;

    this.base = new SDFRect(size, size, {
      radius: size * 0.5,
      stroke: 1.2,
      fill: rgba(theme.controlFill, 0.98),
      strokeColor: rgba(theme.controlStroke, 0.9),
      shadowColor: rgba(theme.shadow, 0.55),
      shadowBlur: 16,
      shadowOffsetY: 3,
    });
    this.addChild(this.base);

    this.centerDisc = new SDFRect(size * 0.64, size * 0.64, {
      radius: size * 0.32,
      fill: rgba(0x090c11, 0.95),
      stroke: 1,
      strokeColor: rgba(theme.panelStroke, 0.5),
    });
    this.centerDisc.position.set(size * 0.18, size * 0.18);
    this.addChild(this.centerDisc);

    const dotCount = 33;
    for (let i = 0; i < dotCount; i++) {
      const dot = new SDFRect(4, 4, {
        radius: 2,
        fill: rgba(theme.panelStroke, 0.45),
      });
      this.dots.push(dot);
      this.addChild(dot);
    }

    this.pointerDot = new SDFRect(8, 8, {
      radius: 4,
      fill: rgba(theme.accentOrange, 0.97),
      glowColor: rgba(theme.accentOrange, 0.45),
      glowSize: 8,
    });
    this.addChild(this.pointerDot);

    this.valueText = uiText(
      theme,
      fmtPercent(this.value),
      16,
      theme.textPrimary,
      true,
    );
    this.valueText.anchor.set(0.5, 0.5);
    this.valueText.position.set(size * 0.5, size * 0.5 + 1);
    this.addChild(this.valueText);

    this.labelText = uiText(theme, label, 14, theme.textMuted);
    this.labelText.anchor.set(0.5, 0.5);
    this.labelText.position.set(size * 0.5, size + 14);
    this.addChild(this.labelText);

    this.eventMode = "static";
    this.cursor = "ns-resize";
    this.hitArea = new Rectangle(0, 0, size, size + 24);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);
    this.on("pointerover", this.handlePointerOver, this);
    this.on("pointerout", this.handlePointerOut, this);

    this.redraw();
  }

  setValue(value: number, emit = true): void {
    const next = clamp01(value);
    if (Math.abs(next - this.value) < 1e-5) return;

    this.value = next;
    this.redraw();

    if (emit) this.onChange?.(this.value);
  }

  nudgeFromWheel(deltaY: number, fineStep: boolean): void {
    const step = fineStep ? 0.003 : 0.012;
    this.setValue(this.value - Math.sign(deltaY) * step);
  }

  containsGlobalPoint(x: number, y: number): boolean {
    const b = this.getBounds();
    return b.containsPoint(x, y);
  }

  private handlePointerOver(): void {
    if (this.dragging) return;
    this.base.setStyle({
      glowColor: rgba(this.theme.accentCyan, 0.22),
      glowSize: 12,
    });
  }

  private handlePointerOut(): void {
    if (this.dragging) return;
    this.base.setStyle({
      glowColor: [0, 0, 0, 0],
      glowSize: 0,
    });
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    this.dragging = true;
    this.dragStartY = ev.global.y;
    this.dragStartValue = this.value;

    this.base.setStyle({
      fill: rgba(this.theme.controlActive, 0.98),
      glowColor: rgba(this.theme.accentCyan, 0.28),
      glowSize: 14,
    });
  }

  private handlePointerMove(ev: FederatedPointerEvent): void {
    if (!this.dragging) return;

    const delta = (this.dragStartY - ev.global.y) / 140;
    this.setValue(this.dragStartValue + delta);
  }

  private handlePointerUp(): void {
    if (!this.dragging) return;

    this.dragging = false;
    this.base.setStyle({
      fill: rgba(this.theme.controlFill, 0.98),
      glowColor: [0, 0, 0, 0],
      glowSize: 0,
    });
  }

  private redraw(): void {
    const centerX = this.sizePx * 0.5;
    const centerY = this.sizePx * 0.5;

    const startAngle = (-140 * Math.PI) / 180;
    const endAngle = (140 * Math.PI) / 180;
    const currentAngle = startAngle + (endAngle - startAngle) * this.value;

    const ringRadius = this.sizePx * 0.42;
    for (let i = 0; i < this.dots.length; i++) {
      const t = i / Math.max(1, this.dots.length - 1);
      const angle = startAngle + (endAngle - startAngle) * t;
      const x = centerX + Math.cos(angle) * ringRadius;
      const y = centerY + Math.sin(angle) * ringRadius;
      const on = angle <= currentAngle + 1e-6;

      const dot = this.dots[i]!;
      dot.position.set(x - 2, y - 2);
      dot.setStyle({
        fill: on
          ? rgba(this.theme.accentOrange, 0.95)
          : rgba(this.theme.panelStroke, 0.42),
        glowColor: on ? rgba(this.theme.accentOrange, 0.24) : [0, 0, 0, 0],
        glowSize: on ? 6 : 0,
      });
    }

    const px = centerX + Math.cos(currentAngle) * (ringRadius * 0.72);
    const py = centerY + Math.sin(currentAngle) * (ringRadius * 0.72);
    this.pointerDot.position.set(px - 4, py - 4);

    this.valueText.text = fmtPercent(this.value);
  }
}

class ModStepGrid extends Container {
  private readonly theme: ModTheme;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cell: number;
  private readonly gap: number;

  private readonly tray: SDFRect;
  private readonly cells: SDFRect[] = [];

  activeIndex = 0;
  onChange?: (index: number) => void;

  constructor(theme: ModTheme, cols: number, rows: number, cell = 22, gap = 6) {
    super();

    this.theme = theme;
    this.cols = cols;
    this.rows = rows;
    this.cell = cell;
    this.gap = gap;

    const width = cols * cell + (cols - 1) * gap;
    const height = rows * cell + (rows - 1) * gap;

    this.tray = new SDFRect(width + 12, height + 12, {
      radius: 10,
      stroke: 1,
      fill: rgba(theme.controlFill, 0.8),
      strokeColor: rgba(theme.controlStroke, 0.5),
      shadowColor: rgba(theme.shadow, 0.35),
      shadowBlur: 10,
      shadowOffsetY: 2,
    });
    this.addChild(this.tray);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const rect = new SDFRect(cell, cell, {
          radius: 4,
          stroke: 1,
          fill: rgba(0x39414d, 0.82),
          strokeColor: rgba(theme.controlStroke, 0.35),
        });
        rect.position.set(6 + x * (cell + gap), 6 + y * (cell + gap));
        this.cells[idx] = rect;
        this.addChild(rect);
      }
    }

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Rectangle(0, 0, width + 12, height + 12);

    this.on("pointerdown", this.handlePointerDown, this);

    this.redraw();
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    const local = ev.getLocalPosition(this);
    const lx = local.x - 6;
    const ly = local.y - 6;

    const col = Math.floor(lx / (this.cell + this.gap));
    const row = Math.floor(ly / (this.cell + this.gap));

    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;

    const idx = row * this.cols + col;
    this.setActiveIndex(idx, true);
  }

  setActiveIndex(index: number, emit = false): void {
    const max = this.cols * this.rows - 1;
    this.activeIndex = Math.max(0, Math.min(max, Math.floor(index)));
    this.redraw();
    if (emit) this.onChange?.(this.activeIndex);
  }

  private redraw(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const on = i === this.activeIndex;
      const cell = this.cells[i]!;
      cell.setStyle({
        fill: on ? rgba(0xf7f9e2, 0.96) : rgba(0x39414d, 0.82),
        strokeColor: on
          ? rgba(this.theme.accentMint, 0.8)
          : rgba(this.theme.controlStroke, 0.35),
        glowColor: on ? rgba(this.theme.accentMint, 0.35) : [0, 0, 0, 0],
        glowSize: on ? 10 : 0,
      });
    }
  }
}

class ModWaveChart extends Container {
  private readonly widthPx: number;
  private readonly heightPx: number;

  private readonly body: SDFRect;
  private readonly segmentsA: SDFRect[] = [];
  private readonly segmentsB: SDFRect[] = [];

  private readonly hintText: BitmapText;

  private dragging = false;

  private phase = 0;
  private shape = 0.55;
  private spread = 0.5;

  constructor(theme: ModTheme, width: number, height: number) {
    super();

    this.widthPx = width;
    this.heightPx = height;

    this.body = new SDFRect(width, height, {
      radius: 10,
      stroke: 1,
      fill: rgba(0x090d13, 0.95),
      strokeColor: rgba(theme.controlStroke, 0.7),
      shadowColor: rgba(theme.shadow, 0.35),
      shadowBlur: 10,
      shadowOffsetY: 2,
    });
    this.addChild(this.body);

    for (let i = 0; i < 64; i++) {
      const segA = new SDFRect(4, 2.2, {
        radius: 1.1,
        fill: rgba(theme.accentCyan, 0.95),
        glowColor: rgba(theme.accentCyan, 0.28),
        glowSize: 4,
      });
      this.segmentsA.push(segA);
      this.addChild(segA);

      const segB = new SDFRect(4, 1.6, {
        radius: 0.8,
        fill: rgba(theme.accentMint, 0.62),
      });
      this.segmentsB.push(segB);
      this.addChild(segB);
    }

    this.hintText = uiText(
      theme,
      "drag chart: phase / shape",
      12,
      theme.textMuted,
      true,
    );
    this.hintText.anchor.set(1, 0.5);
    this.hintText.position.set(width - 8, height - 10);
    this.addChild(this.hintText);

    this.eventMode = "static";
    this.cursor = "crosshair";
    this.hitArea = new Rectangle(0, 0, width, height);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);

    this.redraw();
  }

  tick(deltaMs: number): void {
    this.phase += deltaMs * 0.001 * (0.6 + this.spread * 0.9);
    this.redraw();
  }

  setControls(spread: number, shape: number): void {
    this.spread = clamp01(spread);
    this.shape = clamp01(shape);
    this.redraw();
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    this.dragging = true;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerMove(ev: FederatedPointerEvent): void {
    if (!this.dragging) return;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerUp(): void {
    this.dragging = false;
  }

  private setFromLocal(pos: { x: number; y: number }): void {
    this.spread = clamp01(pos.x / this.widthPx);
    this.shape = clamp01(1 - pos.y / this.heightPx);
  }

  private redraw(): void {
    const x0 = 8;
    const y0 = 8;
    const w = this.widthPx - 16;
    const h = this.heightPx - 24;

    const points = this.segmentsA.length + 1;
    let prevXA = 0;
    let prevYA = 0;
    let prevXB = 0;
    let prevYB = 0;

    for (let i = 0; i < points; i++) {
      const t = i / Math.max(1, points - 1);
      const x = x0 + t * w;

      const yNormA =
        0.5 +
        0.26 * Math.sin(t * 9.2 + this.phase * 2.2) +
        0.18 *
          this.shape *
          Math.sin(t * (17.0 + this.spread * 12.0) - this.phase * 1.1) +
        0.1 * Math.cos(t * 25.0 + this.phase * 0.7);

      const yNormB =
        0.5 +
        0.2 * Math.sin(t * 11.5 - this.phase * 1.8) +
        0.13 *
          (1 - this.shape) *
          Math.cos(t * (18.0 + this.spread * 8.0) + this.phase * 1.6);

      const yA = y0 + clamp01(yNormA) * h;
      const yB = y0 + clamp01(yNormB) * h;

      if (i > 0) {
        const segIdx = i - 1;
        updateSegment(this.segmentsA[segIdx]!, prevXA, prevYA, x, yA, 1.7);
        updateSegment(this.segmentsB[segIdx]!, prevXB, prevYB, x, yB, 1.15);
      }

      prevXA = x;
      prevYA = yA;
      prevXB = x;
      prevYB = yB;
    }

    this.hintText.text = `shape ${(this.shape * 100).toFixed(1)}%  spread ${(this.spread * 100).toFixed(1)}%`;
  }
}

class ModBarsChart extends Container {
  private readonly theme: ModTheme;
  private readonly widthPx: number;
  private readonly heightPx: number;

  private readonly body: SDFRect;
  private readonly bars: SDFRect[] = [];
  private readonly caps: SDFRect[] = [];
  private readonly levels: number[] = [];
  private readonly hintText: BitmapText;

  private phase = 0;
  private tilt = 0.5;
  private focus = 0.5;
  private dragging = false;

  constructor(theme: ModTheme, width: number, height: number, count = 24) {
    super();

    this.theme = theme;
    this.widthPx = width;
    this.heightPx = height;

    this.body = new SDFRect(width, height, {
      radius: 10,
      stroke: 1,
      fill: rgba(0x090d13, 0.95),
      strokeColor: rgba(theme.controlStroke, 0.7),
      shadowColor: rgba(theme.shadow, 0.35),
      shadowBlur: 10,
      shadowOffsetY: 2,
    });
    this.addChild(this.body);

    for (let i = 0; i < count; i++) {
      const bar = new SDFRect(4, 8, {
        radius: 2,
        fill: rgba(theme.accentCyan, 0.88),
        glowColor: rgba(theme.accentCyan, 0.22),
        glowSize: 5,
      });
      this.bars.push(bar);
      this.addChild(bar);

      const cap = new SDFRect(4, 2, {
        radius: 1,
        fill: rgba(0xf7f9e2, 0.82),
      });
      this.caps.push(cap);
      this.addChild(cap);

      this.levels[i] = 0;
    }

    this.hintText = uiText(
      theme,
      "drag bars: focus / tilt",
      12,
      theme.textMuted,
      true,
    );
    this.hintText.anchor.set(1, 0.5);
    this.hintText.position.set(width - 8, height - 9);
    this.addChild(this.hintText);

    this.eventMode = "static";
    this.cursor = "crosshair";
    this.hitArea = new Rectangle(0, 0, width, height);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);
  }

  setControls(focus: number, tilt: number): void {
    this.focus = clamp01(focus);
    this.tilt = clamp01(tilt);
  }

  tick(deltaMs: number, drive: number): void {
    const response = Math.min(1, deltaMs / 55);
    this.phase += deltaMs * 0.001 * (1.1 + drive * 1.9);

    const n = this.bars.length;
    const innerW = this.widthPx - 16;
    const gap = 2;
    const barW = Math.max(2, (innerW - gap * (n - 1)) / n);
    const baseY = this.heightPx - 10;
    const maxBarH = this.heightPx - 24;

    const spread = 2.4 + (1 - drive) * 2.0;

    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const centerDist = (t - this.focus) * spread;
      const ridge = Math.exp(-(centerDist * centerDist));
      const wobble =
        0.5 + 0.5 * Math.sin(this.phase * 5.1 + t * 21.0 + drive * 3.0);
      const flutter =
        0.5 + 0.5 * Math.cos(this.phase * 7.4 + t * 17.0 + this.tilt * 4.0);

      const target = clamp01(
        0.08 +
          ridge * (0.58 + drive * 0.35) +
          wobble * 0.16 +
          flutter * this.tilt * 0.22,
      );
      const prev = this.levels[i] ?? 0;
      const level = prev + (target - prev) * response;
      this.levels[i] = level;

      const h = Math.max(4, maxBarH * level);
      const x = 8 + i * (barW + gap);
      const y = baseY - h;

      const bar = this.bars[i]!;
      bar.setSize(barW, h);
      bar.position.set(x, y);

      const colorLo = mixRGBA(
        rgba(this.theme.accentMint, 0.82),
        rgba(this.theme.accentCyan, 0.94),
        t,
      );
      const colorHi = mixRGBA(
        colorLo,
        rgba(this.theme.accentOrange, 0.95),
        ridge * 0.55,
      );
      bar.setStyle({
        fill: colorHi,
        glowColor: mixRGBA(colorHi, rgba(0xffffff, 0.25), 0.25),
        glowSize: 5 + ridge * 4,
      });

      const cap = this.caps[i]!;
      cap.setSize(barW, 2);
      cap.position.set(x, y - 3);
    }

    this.hintText.text = `focus ${(this.focus * 100).toFixed(0)}%  tilt ${(this.tilt * 100).toFixed(0)}%`;
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    this.dragging = true;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerMove(ev: FederatedPointerEvent): void {
    if (!this.dragging) return;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerUp(): void {
    this.dragging = false;
  }

  private setFromLocal(pos: { x: number; y: number }): void {
    this.focus = clamp01(pos.x / this.widthPx);
    this.tilt = clamp01(1 - pos.y / this.heightPx);
  }
}

class ModXyPad extends Container {
  private readonly theme: ModTheme;
  private readonly widthPx: number;
  private readonly heightPx: number;

  private readonly body: SDFRect;
  private readonly handle: SDFRect;

  private readonly xText: BitmapText;
  private readonly yText: BitmapText;
  private readonly zText: BitmapText;
  private readonly wText: BitmapText;

  private readonly staticLines: SDFRect[] = [];

  private dragging = false;

  xValue = 0.5;
  yValue = 0.5;
  zValue = 0.3;
  wValue = 0.1;

  onChange?: (v: { x: number; y: number; z: number; w: number }) => void;

  constructor(theme: ModTheme, width: number, height: number) {
    super();

    this.theme = theme;
    this.widthPx = width;
    this.heightPx = height;

    this.body = new SDFRect(width, height, {
      radius: 10,
      stroke: 1,
      fill: rgba(0x090d13, 0.95),
      strokeColor: rgba(theme.controlStroke, 0.7),
      shadowColor: rgba(theme.shadow, 0.35),
      shadowBlur: 10,
      shadowOffsetY: 2,
    });
    this.addChild(this.body);

    this.createCubeGuide();

    this.handle = new SDFRect(12, 12, {
      radius: 2,
      fill: rgba(0xf7f9e2, 0.95),
      stroke: 1,
      strokeColor: rgba(theme.accentMint, 0.8),
      glowColor: rgba(theme.accentMint, 0.4),
      glowSize: 8,
    });
    this.addChild(this.handle);

    this.xText = uiText(theme, "x 50.0 %", 17, theme.accentCyan, true);
    this.yText = uiText(theme, "y 50.0 %", 17, theme.accentOrange, true);
    this.zText = uiText(theme, "z 30.0 %", 15, theme.accentMint, true);
    this.wText = uiText(theme, "w 10.0 %", 15, theme.textPrimary, true);

    this.xText.anchor.set(0, 0.5);
    this.yText.anchor.set(0, 0.5);
    this.zText.anchor.set(0, 0.5);
    this.wText.anchor.set(0, 0.5);

    this.xText.position.set(14, height - 36);
    this.yText.position.set(width * 0.5, height - 36);
    this.zText.position.set(14, height - 16);
    this.wText.position.set(width * 0.5, height - 16);

    this.addChild(this.xText, this.yText, this.zText, this.wText);

    this.eventMode = "static";
    this.cursor = "crosshair";
    this.hitArea = new Rectangle(0, 0, width, height - 44);

    this.on("pointerdown", this.handlePointerDown, this);
    this.on("globalpointermove", this.handlePointerMove, this);
    this.on("pointerup", this.handlePointerUp, this);
    this.on("pointerupoutside", this.handlePointerUp, this);

    this.redraw();
  }

  private createCubeGuide(): void {
    const pad = this.padRect();

    const front = {
      x: pad.x + pad.w * 0.17,
      y: pad.y + pad.h * 0.2,
      w: pad.w * 0.58,
      h: pad.h * 0.58,
    };

    const backOffsetX = pad.w * 0.16;
    const backOffsetY = -pad.h * 0.16;

    this.addDashedBox(front.x, front.y, front.w, front.h, rgba(0x657080, 0.38));
    this.addDashedBox(
      front.x + backOffsetX,
      front.y + backOffsetY,
      front.w,
      front.h,
      rgba(0x657080, 0.38),
    );

    this.addDashedLine(
      front.x,
      front.y,
      front.x + backOffsetX,
      front.y + backOffsetY,
      rgba(0x657080, 0.38),
    );
    this.addDashedLine(
      front.x + front.w,
      front.y,
      front.x + front.w + backOffsetX,
      front.y + backOffsetY,
      rgba(0x657080, 0.38),
    );
    this.addDashedLine(
      front.x,
      front.y + front.h,
      front.x + backOffsetX,
      front.y + front.h + backOffsetY,
      rgba(0x657080, 0.38),
    );
    this.addDashedLine(
      front.x + front.w,
      front.y + front.h,
      front.x + front.w + backOffsetX,
      front.y + front.h + backOffsetY,
      rgba(0x657080, 0.38),
    );

    const xAxis = new SDFRect(52, 2, {
      radius: 1,
      fill: rgba(this.theme.accentCyan, 0.95),
    });
    xAxis.position.set(pad.x + 8, pad.y + pad.h - 10);
    this.staticLines.push(xAxis);
    this.addChild(xAxis);

    const yAxis = new SDFRect(2, 52, {
      radius: 1,
      fill: rgba(this.theme.accentMint, 0.95),
    });
    yAxis.position.set(pad.x + 8, pad.y + pad.h - 60);
    this.staticLines.push(yAxis);
    this.addChild(yAxis);

    const zAxis = new SDFRect(2, 34, {
      radius: 1,
      fill: rgba(this.theme.accentOrange, 0.95),
    });
    zAxis.position.set(pad.x + 8, pad.y + pad.h - 42);
    zAxis.rotation = (-50 * Math.PI) / 180;
    zAxis.pivot.set(1, 33);
    this.staticLines.push(zAxis);
    this.addChild(zAxis);
  }

  private addDashedBox(
    x: number,
    y: number,
    w: number,
    h: number,
    color: RGBA,
  ): void {
    this.addDashedLine(x, y, x + w, y, color);
    this.addDashedLine(x + w, y, x + w, y + h, color);
    this.addDashedLine(x + w, y + h, x, y + h, color);
    this.addDashedLine(x, y + h, x, y, color);
  }

  private addDashedLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: RGBA,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);

    const dash = 5;
    const gap = 7;
    const count = Math.max(1, Math.floor(len / (dash + gap)));

    const ux = dx / Math.max(1, len);
    const uy = dy / Math.max(1, len);

    for (let i = 0; i < count; i++) {
      const start = i * (dash + gap);
      const end = Math.min(start + dash, len);

      const sx = x0 + ux * start;
      const sy = y0 + uy * start;
      const ex = x0 + ux * end;
      const ey = y0 + uy * end;

      const seg = new SDFRect(4, 1.3, {
        radius: 0.65,
        fill: color,
      });
      updateSegment(seg, sx, sy, ex, ey, 1.0);
      this.staticLines.push(seg);
      this.addChild(seg);
    }
  }

  private handlePointerDown(ev: FederatedPointerEvent): void {
    this.dragging = true;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerMove(ev: FederatedPointerEvent): void {
    if (!this.dragging) return;
    this.setFromLocal(ev.getLocalPosition(this));
  }

  private handlePointerUp(): void {
    this.dragging = false;
  }

  private padRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: 12,
      y: 8,
      w: this.widthPx - 24,
      h: this.heightPx - 64,
    };
  }

  setValues(x: number, y: number, emit = false): void {
    this.applyValues(clamp01(x), clamp01(y), emit);
  }

  private setFromLocal(pos: { x: number; y: number }): void {
    const pad = this.padRect();

    const nx = clamp01((pos.x - pad.x) / pad.w);
    const ny = clamp01(1 - (pos.y - pad.y) / pad.h);

    this.applyValues(nx, ny, true);
  }

  private applyValues(nx: number, ny: number, emit: boolean): void {
    this.xValue = nx;
    this.yValue = ny;

    const cx = nx - 0.5;
    const cy = ny - 0.5;
    const centerFalloff = clamp01(1 - Math.hypot(cx, cy) * 1.8);

    this.zValue = clamp01(0.12 + centerFalloff * 0.88);
    this.wValue = clamp01(0.05 + (nx * 0.62 + ny * 0.38) * 0.95);

    this.redraw();

    if (!emit) return;
    this.onChange?.({
      x: this.xValue,
      y: this.yValue,
      z: this.zValue,
      w: this.wValue,
    });
  }

  private redraw(): void {
    const pad = this.padRect();

    const hx = pad.x + this.xValue * pad.w;
    const hy = pad.y + (1 - this.yValue) * pad.h;
    this.handle.position.set(hx - 6, hy - 6);

    this.xText.text = `x ${(this.xValue * 100).toFixed(1)} %`;
    this.yText.text = `y ${(this.yValue * 100).toFixed(1)} %`;
    this.zText.text = `z ${(this.zValue * 100).toFixed(1)} %`;
    this.wText.text = `w ${(this.wValue * 100).toFixed(1)} %`;
  }
}

class StereoMeter extends Container {
  private readonly leftBg: SDFRect;
  private readonly rightBg: SDFRect;

  private readonly leftFill: SDFRect;
  private readonly rightFill: SDFRect;

  private readonly heightPx: number;

  private left = 0.4;
  private right = 0.5;

  constructor(theme: ModTheme, height: number) {
    super();

    this.heightPx = height;

    this.leftBg = new SDFRect(6, height, {
      radius: 3,
      fill: rgba(0x10151c, 0.92),
      stroke: 1,
      strokeColor: rgba(theme.controlStroke, 0.55),
    });

    this.rightBg = new SDFRect(6, height, {
      radius: 3,
      fill: rgba(0x10151c, 0.92),
      stroke: 1,
      strokeColor: rgba(theme.controlStroke, 0.55),
    });
    this.rightBg.position.x = 8;

    this.leftFill = new SDFRect(6, 2, {
      radius: 3,
      fill: rgba(theme.accentMint, 0.95),
      glowColor: rgba(theme.accentMint, 0.3),
      glowSize: 8,
    });

    this.rightFill = new SDFRect(6, 2, {
      radius: 3,
      fill: rgba(theme.accentLime, 0.95),
      glowColor: rgba(theme.accentLime, 0.3),
      glowSize: 8,
    });
    this.rightFill.position.x = 8;

    this.addChild(this.leftBg, this.rightBg, this.leftFill, this.rightFill);

    this.redraw();
  }

  setLevels(left: number, right: number, smooth = 1): void {
    const blend = clamp01(smooth);
    const l = clamp01(left);
    const r = clamp01(right);
    this.left += (l - this.left) * blend;
    this.right += (r - this.right) * blend;
    this.redraw();
  }

  tick(deltaMs: number, drive: number): void {
    const speed = Math.min(1, deltaMs / 120);

    const targetLeft = clamp01(
      0.18 + drive * 0.72 + Math.sin(performance.now() * 0.0032) * 0.12,
    );
    const targetRight = clamp01(
      0.22 + drive * 0.66 + Math.sin(performance.now() * 0.0038 + 1.1) * 0.16,
    );

    this.left += (targetLeft - this.left) * speed;
    this.right += (targetRight - this.right) * speed;

    this.redraw();
  }

  private redraw(): void {
    const leftH = Math.max(2, this.heightPx * this.left);
    const rightH = Math.max(2, this.heightPx * this.right);

    this.leftFill.setSize(6, leftH);
    this.rightFill.setSize(6, rightH);

    this.leftFill.position.y = this.heightPx - leftH;
    this.rightFill.position.y = this.heightPx - rightH;
  }
}

const LEGACY_WIDGETS = [
  ModKnob,
  ModStepGrid,
  ModWaveChart,
  ModBarsChart,
  ModXyPad,
  StereoMeter,
] as const;
void LEGACY_WIDGETS;

export type CrawlerUiFrame = {
  frame: number;
  fps: number;
  dt: number;
  drawCalls: number;
  issueCount: number;
  nodeCount: number;
  visibleNodes: number;
  budgetTotal: number;
  budgetRi: number;
  budgetCi: number;
  scanMs: number;
  overlayMs: number;
  totalMs: number;
  recording: boolean;
  glSpyActive: boolean;
  topIssueCode: string;
  topIssueSeverity: "info" | "warn" | "error";
  topIssueCount: number;
  warnCount: number;
  errorCount: number;
  infoCount: number;
  heavyNodeLabel: string;
  heavyNodeDrawCalls: number;
  issues: CrawlerUiIssueRow[];
};

export type CrawlerUiIssueRow = {
  code: string;
  severity: "info" | "warn" | "error";
  count: number;
  nodeLabel: string;
  message: string;
  impact: number;
  drawCalls: number;
  depth: number;
  kind: string;
  masked: boolean;
  filtered: boolean;
  blendBreak: boolean;
};

const DEFAULT_CRAWLER_FRAME: CrawlerUiFrame = {
  frame: 0,
  fps: 0,
  dt: 0,
  drawCalls: 0,
  issueCount: 0,
  nodeCount: 0,
  visibleNodes: 0,
  budgetTotal: 0,
  budgetRi: 0,
  budgetCi: 0,
  scanMs: 0,
  overlayMs: 0,
  totalMs: 0,
  recording: false,
  glSpyActive: false,
  topIssueCode: "none",
  topIssueSeverity: "info",
  topIssueCount: 0,
  warnCount: 0,
  errorCount: 0,
  infoCount: 0,
  heavyNodeLabel: "none",
  heavyNodeDrawCalls: 0,
  issues: [],
};

type RealtimeSeriesDef = {
  name: string;
  color: RGBA;
  thickness: number;
};

type IssueSeriesHistory = {
  count: number[];
  impact: number[];
  drawCalls: number[];
  lastSeenFrame: number;
};

function monoCharsForWidth(width: number, fontSize: number): number {
  const perChar = fontSize * 0.62 + 0.4;
  return Math.max(4, Math.floor(width / Math.max(1, perChar)));
}

function fitMonoLine(value: string, width: number, fontSize: number): string {
  return shortLabel(value, monoCharsForWidth(width, fontSize));
}

function tail(values: readonly number[], count: number): number[] {
  if (count <= 0 || values.length === 0) return [];
  const start = Math.max(0, values.length - count);
  return values.slice(start);
}

function maxOf(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  let m = values[0] ?? fallback;
  for (let i = 1; i < values.length; i++) {
    m = Math.max(m, values[i] ?? 0);
  }
  return Math.max(m, fallback);
}

function smoothSeries(values: readonly number[], amount: number): number[] {
  if (values.length <= 1) return [...values];
  const clamped = clamp01(amount);
  if (clamped < 0.01) return [...values];

  const response = Math.max(0.05, 1 - clamped * 0.9);
  const out = new Array<number>(values.length);
  let acc = values[0] ?? 0;
  out[0] = acc;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] ?? 0;
    acc += (v - acc) * response;
    out[i] = acc;
  }
  return out;
}

class RealtimeSeriesChart extends Container {
  private readonly widthPx: number;
  private readonly heightPx: number;
  private readonly maxPoints: number;
  private readonly seriesDefs: RealtimeSeriesDef[];
  private readonly body: SDFRect;
  private readonly gridLines: SDFRect[] = [];
  private readonly segments: SDFRect[][] = [];
  private readonly legendTexts: BitmapText[] = [];

  constructor(
    theme: ModTheme,
    width: number,
    height: number,
    seriesDefs: RealtimeSeriesDef[],
    maxPoints = 320,
  ) {
    super();
    this.widthPx = width;
    this.heightPx = height;
    this.maxPoints = Math.max(32, maxPoints);
    this.seriesDefs = [...seriesDefs];

    this.body = new SDFRect(width, height, {
      radius: 10,
      stroke: 1.05,
      fill: rgba(0x090d13, 0.98),
      strokeColor: rgba(theme.controlStroke, 0.8),
      shadowColor: rgba(theme.shadow, 0.4),
      shadowBlur: 10,
      shadowOffsetY: 2,
    });
    this.addChild(this.body);

    for (let i = 1; i <= 3; i++) {
      const y = 8 + ((height - 28) * i) / 4;
      const grid = new SDFRect(width - 16, 1.2, {
        radius: 0.6,
        fill: rgba(theme.panelStroke, 0.24),
      });
      grid.position.set(8, y);
      this.gridLines.push(grid);
      this.addChild(grid);
    }

    const segCount = this.maxPoints - 1;
    for (let s = 0; s < this.seriesDefs.length; s++) {
      const def = this.seriesDefs[s]!;
      const seriesSegments: SDFRect[] = [];
      for (let i = 0; i < segCount; i++) {
        const seg = new SDFRect(4, def.thickness, {
          radius: def.thickness * 0.5,
          fill: def.color,
          glowColor: mixRGBA(def.color, [1, 1, 1, 0.2], 0.15),
          glowSize: 3,
        });
        seg.alpha = 0;
        seriesSegments.push(seg);
        this.addChild(seg);
      }
      this.segments.push(seriesSegments);

      const legend = uiText(theme, def.name, 10, theme.textMuted, true);
      legend.anchor.set(0, 0.5);
      legend.position.set(8 + s * 72, height - 9);
      legend.tint =
        s === 0
          ? theme.accentCyan
          : s === 1
            ? theme.accentMint
            : s === 2
              ? theme.accentOrange
              : theme.textMuted;
      this.legendTexts.push(legend);
      this.addChild(legend);
    }
  }

  setLegend(labels: readonly string[]): void {
    const maxLabelWidth = 68;
    for (let i = 0; i < this.legendTexts.length; i++) {
      const text = this.legendTexts[i]!;
      text.text = fitMonoLine(
        labels[i] ?? this.seriesDefs[i]?.name ?? "-",
        maxLabelWidth,
        10,
      );
    }
  }

  render(seriesValues: readonly number[][], smoothing: number): void {
    const plotX = 8;
    const plotY = 8;
    const plotW = this.widthPx - 16;
    const plotH = this.heightPx - 28;

    for (let s = 0; s < this.segments.length; s++) {
      const segs = this.segments[s]!;
      const raw = seriesValues[s] ?? [];
      const limited =
        raw.length > this.maxPoints ? tail(raw, this.maxPoints) : [...raw];
      const data = smoothSeries(limited, smoothing).map((v) => clamp01(v));

      const pointCount = data.length;
      const usedSegs = Math.max(0, pointCount - 1);

      for (let i = 0; i < usedSegs; i++) {
        const t0 = i / Math.max(1, pointCount - 1);
        const t1 = (i + 1) / Math.max(1, pointCount - 1);
        const x0 = plotX + t0 * plotW;
        const x1 = plotX + t1 * plotW;
        const y0 = plotY + (1 - (data[i] ?? 0)) * plotH;
        const y1 = plotY + (1 - (data[i + 1] ?? 0)) * plotH;
        const seg = segs[i]!;
        updateSegment(
          seg,
          x0,
          y0,
          x1,
          y1,
          this.seriesDefs[s]?.thickness ?? 1.2,
        );
        seg.alpha = 1;
      }

      for (let i = usedSegs; i < segs.length; i++) {
        segs[i]!.alpha = 0;
      }
    }
  }
}

export class CrawlerModUI extends Container {
  private readonly theme: ModTheme;

  private readonly panelTopLeft: ModulePanel;
  private readonly panelTopRight: ModulePanel;
  private readonly panelBottomLeft: ModulePanel;
  private readonly panelBottomRight: ModulePanel;

  private overviewChart!: RealtimeSeriesChart;
  private inspectChart!: RealtimeSeriesChart;
  private infoTopLeft!: BitmapText;
  private infoTopRight!: BitmapText;
  private topLeftWindowSlider!: ModSlider;
  private topLeftSmoothSlider!: ModSlider;
  private inspectImpactSlider!: ModSlider;
  private readonly inspectRows: CrawlerUiIssueRow[] = [];
  private readonly inspectListTexts: BitmapText[] = [];
  private inspectDetailTitle!: BitmapText;
  private inspectDetailBody!: BitmapText;
  private inspectSelection = 0;
  private inspectLocked = false;
  private inspectImpactFloor = 0.1;

  private panelByKey!: Record<"tl" | "tr", ModulePanel>;
  private readonly panelPaused: Record<"tl" | "tr", boolean> = {
    tl: false,
    tr: false,
  };
  private readonly panelDim: Record<"tl" | "tr", boolean> = {
    tl: false,
    tr: false,
  };
  private soloPanel: "tl" | "tr" | null = null;

  private historyWindowNorm = 0.5;
  private historySmooth = 0.24;
  private historyPoints = 160;
  private lastHistoryFrame = -1;
  private readonly telemetryHistory = {
    fps: [] as number[],
    drawCalls: [] as number[],
    issueCount: [] as number[],
    budget: [] as number[],
    totalMs: [] as number[],
  };
  private readonly issueHistory = new Map<string, IssueSeriesHistory>();

  private crawlerFrame: CrawlerUiFrame = { ...DEFAULT_CRAWLER_FRAME };
  private hasCrawlerFrame = false;

  constructor(theme: ModTheme) {
    super();

    this.theme = theme;

    this.panelTopLeft = new ModulePanel(
      theme,
      "crawler.overview",
      252,
      318,
      (action) => this.onPanelMenu("tl", action),
    );
    this.panelTopRight = new ModulePanel(
      theme,
      "problem.inspect",
      252,
      318,
      (action) => this.onPanelMenu("tr", action),
    );
    this.panelBottomLeft = new ModulePanel(
      theme,
      "xy.matrix",
      252,
      318,
      () => undefined,
    );
    this.panelBottomRight = new ModulePanel(
      theme,
      "spectral.mod",
      252,
      318,
      () => undefined,
    );

    this.addChild(
      this.panelTopLeft,
      this.panelTopRight,
      this.panelBottomLeft,
      this.panelBottomRight,
    );
    this.panelByKey = {
      tl: this.panelTopLeft,
      tr: this.panelTopRight,
    };

    this.buildTopLeft();
    this.buildTopRight();
    this.panelBottomLeft.visible = false;
    this.panelBottomRight.visible = false;
    this.refreshPanelState();
  }

  attachWheel(canvas: HTMLCanvasElement): void {
    // Keep method for API compatibility. Inputs are currently direct pointer sliders.
    void canvas;
  }

  setCrawlerFrame(frame: Partial<CrawlerUiFrame>): void {
    this.hasCrawlerFrame = true;
    this.crawlerFrame = {
      ...this.crawlerFrame,
      ...frame,
    };

    if (Array.isArray(frame.issues)) {
      this.inspectRows.length = 0;
      this.inspectRows.push(...frame.issues);
      if (!this.inspectLocked) this.inspectSelection = 0;
      this.inspectSelection = Math.max(0, this.inspectSelection);
    }

    if (this.crawlerFrame.frame !== this.lastHistoryFrame) {
      this.lastHistoryFrame = this.crawlerFrame.frame;
      this.appendHistoryPoint();
    }
  }

  layout(viewW: number, viewH: number): void {
    const margin = 12;
    const gap = 12;
    const panelW = this.panelTopLeft.panelWidth;
    const panelH = this.panelTopLeft.panelHeight;

    const scale = Math.max(
      0.56,
      Math.min(
        1,
        (viewW - margin * 2) / panelW,
        (viewH - margin * 2 - gap) / (panelH * 2),
      ),
    );

    const x = Math.max(margin, viewW - margin - panelW * scale);
    const top = margin;
    const secondY = top + panelH * scale + gap;

    this.panelTopLeft.scale.set(scale);
    this.panelTopRight.scale.set(scale);

    this.panelTopLeft.position.set(x, top);
    this.panelTopRight.position.set(x, secondY);

    this.panelBottomLeft.visible = false;
    this.panelBottomRight.visible = false;
  }

  nudgeInspectSelection(step: number): void {
    const rows = this.getFilteredInspectRows();
    if (rows.length === 0) return;
    this.inspectLocked = true;
    this.inspectSelection = Math.max(
      0,
      Math.min(rows.length - 1, this.inspectSelection + Math.sign(step)),
    );
    this.refreshPanelState();
    this.updateInspectPanel();
  }

  resetInspectSelection(): void {
    this.inspectSelection = 0;
    this.inspectLocked = false;
    this.refreshPanelState();
    this.updateInspectPanel();
  }

  private onPanelMenu(key: "tl" | "tr", action: PanelMenuAction): void {
    if (key === "tr") {
      if (action === "pause") {
        this.inspectLocked = !this.inspectLocked;
      } else if (action === "dim") {
        this.nudgeInspectSelection(-1);
      } else if (action === "solo") {
        this.nudgeInspectSelection(1);
      } else {
        this.resetInspectSelection();
      }
      this.refreshPanelState();
      return;
    }

    if (action === "pause") {
      this.panelPaused[key] = !this.panelPaused[key];
      this.refreshPanelState();
      return;
    }

    if (action === "dim") {
      this.panelDim[key] = !this.panelDim[key];
      this.refreshPanelState();
      return;
    }

    if (action === "solo") {
      this.soloPanel = this.soloPanel === key ? null : key;
      this.refreshPanelState();
      return;
    }

    this.randomizePanel(key);
  }

  private refreshPanelState(): void {
    const keys: Array<"tl" | "tr"> = ["tl", "tr"];
    for (const key of keys) {
      const panel = this.panelByKey[key];
      const soloMode = this.soloPanel !== null;
      const fadedBySolo = key === "tl" && soloMode && this.soloPanel !== key;

      panel.alpha = fadedBySolo ? 0.36 : 1;
      panel.content.alpha = this.panelDim[key] ? 0.5 : 1;

      if (key === "tr") {
        panel.setMenuActive("pause", this.inspectLocked);
        panel.setMenuActive("dim", false);
        panel.setMenuActive("solo", false);
        panel.setMenuActive("random", false);
      } else {
        panel.setMenuActive("pause", this.panelPaused[key]);
        panel.setMenuActive("dim", this.panelDim[key]);
        panel.setMenuActive("solo", this.soloPanel === key);
        panel.setMenuActive("random", false);
      }
    }
  }

  private randomizePanel(key: "tl" | "tr"): void {
    const r = () => Math.random();

    if (key === "tl") {
      this.topLeftWindowSlider.setValue(r(), true);
      this.topLeftSmoothSlider.setValue(r(), true);
    } else {
      this.inspectImpactSlider.setValue(r(), true);
      const rows = this.getFilteredInspectRows();
      this.inspectSelection =
        rows.length > 0 ? Math.floor(r() * rows.length) : 0;
    }
  }

  tick(deltaMs: number): void {
    void deltaMs;
    if (!this.panelPaused.tl) this.updateOverviewChart();
    if (!this.panelPaused.tr) this.updateInspectChart();
    this.updateOverviewText();
    this.updateInspectPanel();
  }

  private appendHistoryValue(target: number[], value: number): void {
    target.push(value);
    while (target.length > this.historyPoints) target.shift();
  }

  private appendHistoryPoint(): void {
    const t = this.crawlerFrame;
    this.appendHistoryValue(this.telemetryHistory.fps, t.fps);
    this.appendHistoryValue(this.telemetryHistory.drawCalls, t.drawCalls);
    this.appendHistoryValue(this.telemetryHistory.issueCount, t.issueCount);
    this.appendHistoryValue(this.telemetryHistory.budget, t.budgetTotal);
    this.appendHistoryValue(this.telemetryHistory.totalMs, t.totalMs);

    for (const series of this.issueHistory.values()) {
      this.appendHistoryValue(series.count, 0);
      this.appendHistoryValue(series.impact, 0);
      this.appendHistoryValue(series.drawCalls, 0);
    }

    const len = this.telemetryHistory.fps.length;
    for (const row of this.inspectRows) {
      let entry = this.issueHistory.get(row.code);
      if (!entry) {
        entry = {
          count: new Array<number>(len).fill(0),
          impact: new Array<number>(len).fill(0),
          drawCalls: new Array<number>(len).fill(0),
          lastSeenFrame: this.crawlerFrame.frame,
        };
        this.issueHistory.set(row.code, entry);
      }
      entry.lastSeenFrame = this.crawlerFrame.frame;
      entry.count[entry.count.length - 1] = row.count;
      entry.impact[entry.impact.length - 1] = row.impact;
      entry.drawCalls[entry.drawCalls.length - 1] = row.drawCalls;
    }

    for (const [code, entry] of this.issueHistory) {
      if (
        this.crawlerFrame.frame - entry.lastSeenFrame >
        this.historyPoints * 3
      ) {
        this.issueHistory.delete(code);
      }
    }
  }

  private updateHistoryPoints(v: number): void {
    this.historyWindowNorm = clamp01(v);
    this.historyPoints = Math.round(60 + this.historyWindowNorm * 220);

    const trim = (a: number[]): void => {
      while (a.length > this.historyPoints) a.shift();
    };

    trim(this.telemetryHistory.fps);
    trim(this.telemetryHistory.drawCalls);
    trim(this.telemetryHistory.issueCount);
    trim(this.telemetryHistory.budget);
    trim(this.telemetryHistory.totalMs);

    for (const series of this.issueHistory.values()) {
      trim(series.count);
      trim(series.impact);
      trim(series.drawCalls);
    }
  }

  private updateOverviewChart(): void {
    const fps = tail(this.telemetryHistory.fps, this.historyPoints);
    const draw = tail(this.telemetryHistory.drawCalls, this.historyPoints);
    const issues = tail(this.telemetryHistory.issueCount, this.historyPoints);
    const budget = tail(this.telemetryHistory.budget, this.historyPoints);

    const fpsN = fps.map((v) => clamp01(v / 60));
    const drawN = draw.map((v) => clamp01(v / maxOf(draw, 80) / 1.1));
    const issueN = issues.map((v) => clamp01(v / maxOf(issues, 4)));
    const budgetN = budget.map((v) => clamp01(v / 100));

    this.overviewChart.render(
      [fpsN, drawN, issueN, budgetN],
      this.historySmooth,
    );
    this.overviewChart.setLegend([
      `fps ${this.crawlerFrame.fps.toFixed(1)}`,
      `dc ${this.crawlerFrame.drawCalls}`,
      `issue ${this.crawlerFrame.issueCount}`,
      `budget ${this.crawlerFrame.budgetTotal.toFixed(0)}%`,
    ]);
  }

  private updateInspectChart(): void {
    const rows = this.getFilteredInspectRows();
    const idx = Math.max(0, Math.min(rows.length - 1, this.inspectSelection));
    this.inspectSelection = idx;

    const selected = rows[idx];
    if (!selected) {
      this.inspectChart.render([[], [], []], this.historySmooth);
      this.inspectChart.setLegend(["count", "impact", "draw"]);
      return;
    }

    const hist = this.issueHistory.get(selected.code);
    const count = tail(hist?.count ?? [], this.historyPoints);
    const impact = tail(hist?.impact ?? [], this.historyPoints);
    const draw = tail(hist?.drawCalls ?? [], this.historyPoints);

    const countN = count.map((v) => clamp01(v / maxOf(count, 1)));
    const impactN = impact.map((v) => clamp01(v / 10));
    const drawN = draw.map((v) => clamp01(v / maxOf(draw, 8) / 1.1));

    this.inspectChart.render([countN, impactN, drawN], this.historySmooth);
    this.inspectChart.setLegend([
      `count ${selected.count}`,
      `impact ${selected.impact}`,
      `draw ${selected.drawCalls}`,
    ]);
  }

  private updateOverviewText(): void {
    if (!this.hasCrawlerFrame) {
      this.infoTopLeft.text = "waiting for crawler telemetry...";
      this.infoTopRight.text = "D+arrows inspect   P lock   R reset";
      return;
    }

    const t = this.crawlerFrame;
    const row1 = `f${t.frame} fps ${t.fps.toFixed(1)} dc ${t.drawCalls} i ${t.issueCount} b ${t.budgetTotal.toFixed(1)}%`;
    const row2 = `scan ${t.scanMs.toFixed(2)}ms ov ${t.overlayMs.toFixed(2)}ms total ${t.totalMs.toFixed(2)}ms`;
    this.infoTopLeft.text = `${fitMonoLine(row1, 228, 10)}\n${fitMonoLine(row2, 228, 10)}`;
    this.infoTopLeft.tint =
      t.fps < 35 ? this.theme.accentOrange : this.theme.textMuted;

    const hint = `D+arrows select  lock ${this.inspectLocked ? "on" : "off"}  floor>=${Math.round(this.inspectImpactFloor * 10)}`;
    this.infoTopRight.text = fitMonoLine(hint, 228, 10);
    this.infoTopRight.tint = this.theme.textMuted;
  }

  private getFilteredInspectRows(): CrawlerUiIssueRow[] {
    const floor = Math.round(this.inspectImpactFloor * 10);
    return this.inspectRows.filter((row) => row.impact >= floor);
  }

  private updateInspectPanel(): void {
    const rows = this.getFilteredInspectRows();
    const max = this.inspectListTexts.length;
    const selected = Math.min(
      Math.max(0, rows.length - 1),
      Math.max(0, this.inspectSelection),
    );
    this.inspectSelection = selected;

    for (let i = 0; i < max; i++) {
      const text = this.inspectListTexts[i]!;
      const row = rows[i];

      if (!row) {
        text.text = "· -";
        text.tint = this.theme.textMuted;
        continue;
      }

      const marker = i === selected ? ">" : " ";
      const line = `${marker} ${row.code} x${row.count} ${row.nodeLabel}`;
      text.text = fitMonoLine(line, 228, 11);
      if (i === selected) {
        text.tint = this.theme.textPrimary;
      } else if (row.severity === "error") {
        text.tint = this.theme.accentOrange;
      } else {
        text.tint = this.theme.textMuted;
      }
    }

    const row = rows[selected];
    if (!row) {
      this.inspectDetailTitle.text = "no issue selected";
      this.inspectDetailBody.text =
        "increase floor slider down\nor wait for scanner data";
      this.inspectDetailTitle.tint = this.theme.textPrimary;
      this.inspectDetailBody.tint = this.theme.textMuted;
      return;
    }

    const summary = `node ${row.nodeLabel}  kind ${row.kind}  dc ${row.drawCalls}  depth ${row.depth}  impact ${row.impact}`;
    const flags = `mask ${row.masked ? "yes" : "no"}  filt ${row.filtered ? "yes" : "no"}  blend ${row.blendBreak ? "yes" : "no"}`;
    const message = `msg ${row.message}`;

    this.inspectDetailTitle.text = fitMonoLine(
      `${row.code} severity ${row.severity}`,
      228,
      11,
    );
    this.inspectDetailBody.text = [
      fitMonoLine(summary, 228, 10),
      fitMonoLine(flags, 228, 10),
      fitMonoLine(message, 228, 10),
    ].join("\n");
    this.inspectDetailTitle.tint =
      row.severity === "error"
        ? this.theme.accentOrange
        : this.theme.textPrimary;
    this.inspectDetailBody.tint = this.theme.textMuted;
  }

  private buildTopLeft(): void {
    this.overviewChart = new RealtimeSeriesChart(
      this.theme,
      232,
      124,
      [
        {
          name: "fps",
          color: rgba(this.theme.accentCyan, 0.96),
          thickness: 1.8,
        },
        {
          name: "draw",
          color: rgba(this.theme.accentMint, 0.92),
          thickness: 1.6,
        },
        {
          name: "issue",
          color: rgba(this.theme.accentOrange, 0.92),
          thickness: 1.45,
        },
        {
          name: "budget",
          color: rgba(this.theme.textPrimary, 0.72),
          thickness: 1.2,
        },
      ],
      320,
    );
    this.overviewChart.position.set(2, 4);

    this.topLeftWindowSlider = new ModSlider(this.theme, "window", 228);
    this.topLeftWindowSlider.position.set(4, 134);
    this.topLeftWindowSlider.setValue(this.historyWindowNorm, false);
    this.topLeftWindowSlider.onChange = (value) => {
      this.updateHistoryPoints(value);
    };

    this.topLeftSmoothSlider = new ModSlider(this.theme, "smooth", 228);
    this.topLeftSmoothSlider.position.set(4, 176);
    this.topLeftSmoothSlider.setValue(this.historySmooth, false);
    this.topLeftSmoothSlider.onChange = (value) => {
      this.historySmooth = value;
    };

    this.infoTopLeft = uiText(
      this.theme,
      "waiting for crawler telemetry...",
      10,
      this.theme.textMuted,
      true,
    );
    this.infoTopLeft.anchor.set(0, 0);
    this.infoTopLeft.position.set(4, 224);

    this.panelTopLeft.content.addChild(
      this.overviewChart,
      this.topLeftWindowSlider,
      this.topLeftSmoothSlider,
      this.infoTopLeft,
    );
  }

  private buildTopRight(): void {
    this.inspectChart = new RealtimeSeriesChart(
      this.theme,
      232,
      102,
      [
        {
          name: "count",
          color: rgba(this.theme.accentCyan, 0.96),
          thickness: 1.7,
        },
        {
          name: "impact",
          color: rgba(this.theme.accentOrange, 0.92),
          thickness: 1.5,
        },
        {
          name: "draw",
          color: rgba(this.theme.accentMint, 0.9),
          thickness: 1.4,
        },
      ],
      320,
    );
    this.inspectChart.position.set(2, 4);

    for (let i = 0; i < 5; i++) {
      const line = uiText(this.theme, "-", 10, this.theme.textMuted, true);
      line.anchor.set(0, 0.5);
      line.position.set(4, 116 + i * 14);
      this.inspectListTexts.push(line);
      this.panelTopRight.content.addChild(line);
    }

    this.inspectDetailTitle = uiText(
      this.theme,
      "no issue selected",
      11,
      this.theme.textPrimary,
      true,
    );
    this.inspectDetailTitle.anchor.set(0, 0);
    this.inspectDetailTitle.position.set(4, 192);

    this.inspectDetailBody = uiText(
      this.theme,
      "inspection is empty",
      10,
      this.theme.textMuted,
      true,
    );
    this.inspectDetailBody.anchor.set(0, 0);
    this.inspectDetailBody.position.set(4, 207);

    this.inspectImpactSlider = new ModSlider(this.theme, "impact floor", 228);
    this.inspectImpactSlider.position.set(4, 238);
    this.inspectImpactSlider.setValue(this.inspectImpactFloor, false);
    this.inspectImpactSlider.onChange = (value) => {
      this.inspectImpactFloor = value;
      this.inspectSelection = 0;
      this.updateInspectPanel();
    };

    this.infoTopRight = uiText(
      this.theme,
      "D+arrows select  P lock  R reset",
      10,
      this.theme.textMuted,
      true,
    );
    this.infoTopRight.anchor.set(0, 0);
    this.infoTopRight.position.set(4, 270);

    this.panelTopRight.content.addChild(
      this.inspectChart,
      this.inspectDetailTitle,
      this.inspectDetailBody,
      this.inspectImpactSlider,
      this.infoTopRight,
    );
  }
}

export { CrawlerModUI as ModUIScene };

export async function loadCrawlerUiAssets(): Promise<void> {
  await Assets.load("/crawler-ui/fonts/Monaco.fnt");
}

export const loadModFonts = loadCrawlerUiAssets;
