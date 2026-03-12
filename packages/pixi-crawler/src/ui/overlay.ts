import {
  Application,
  Container,
  Graphics,
  TextStyle,
  BitmapFont,
  BitmapText,
} from "pixi.js";
import type { FrameSnapshot, Issue, NodeMeta } from "../core/types.js";
import { ISSUE_IMPACT } from "../core/types.js";

// ── Monochrome palette ─────────────────────────────────────────
const C = {
  panelBg: 0x0c0c0c,
  panelAlpha: 0.82,
  border: 0x2a2a2a,
  divider: 0x222222,

  text: 0xcccccc,
  textBright: 0xffffff,
  textMuted: 0x666666,

  good: 0x888888,
  warn: 0xbbbbbb,
  error: 0xffffff,

  graphLine: 0x888888,
  graphFill: 0x333333,
  graphBad: 0xffffff,
  gridLine: 0x1a1a1a,

  // RI/CI chart colors
  riLine: 0x4fc3f7, // cyan/blue for RI
  ciLine: 0xce93d8, // magenta/purple for CI

  // Selection X marker
  xMarker: 0xffffff,

  // Highlights on scene nodes
  hlWarn: 0xffa726,
  hlError: 0xef5350,
  hlInfo: 0x4fc3f7,
  // Impact level colors for budget display
  budgetMinimal: 0x4caf50, // green
  budgetLow: 0x8bc34a, // light green
  budgetModerate: 0xffc107, // yellow
  budgetHigh: 0xff9800, // orange
  budgetVeryHigh: 0xf44336, // red
} as const;

const FONT_NAME = "CrawlerMono";
const BASE_FONT_SIZE = 10;
const LINE_H = 13;
const PANEL_W = 220;
const DETAIL_W = 270;
const GRAPH_H = 48;
const PAD = 8;
const GAP = 4;
const MAX_TOP_NODES = 5;
const MAX_DETAIL_LINES = 20;

function px(v: number): number {
  return Math.round(v);
}

type GraphMode = "fps" | "dc" | "budget";

interface TopNodeEntry {
  node: Container;
  meta: NodeMeta;
  score: number;
}

// ── Overlay ────────────────────────────────────────────────────

export class Overlay {
  readonly container: Container;
  readonly highlightContainer: Container;

  private _app: Application;
  private _visible = true;
  private _showGraph = true;
  private _showIssues = true;
  private _showHighlights = true;
  private _graphMode: GraphMode = "fps";

  // ── Selection state ──
  private _topNodes: TopNodeEntry[] = [];
  private _analysisMode = false;
  private _selectedIdx = 0;
  private _selectedNode: Container | null = null;
  private _selectedMeta: NodeMeta | null = null;

  private _bg: Graphics;
  private _graph: Graphics;
  private _graphHit: Graphics;
  private _highlightGfx: Graphics;
  private _recDot: Graphics;
  private _detailBg: Graphics;

  private _headerText!: BitmapText;
  private _statsTexts: BitmapText[] = [];
  private _graphLabel!: BitmapText;
  private _nodeListTexts: BitmapText[] = [];
  private _detailTexts: BitmapText[] = [];

  private _res = 1;
  private _invRes = 1;
  private _fontSize = BASE_FONT_SIZE;
  private _panelX = 0;
  private _panelY = 0;
  private _fontReady = false;

  constructor(app: Application) {
    this._app = app;

    // 'passive' lets _graphHit child receive pointer events
    this.container = new Container();
    this.container.label = "CrawlerOverlay";
    this.container.zIndex = 999999;
    this.container.eventMode = "passive";

    this.highlightContainer = new Container();
    this.highlightContainer.label = "CrawlerHighlights";
    this.highlightContainer.zIndex = 999998;
    this.highlightContainer.eventMode = "none";

    this._bg = new Graphics();
    this._graph = new Graphics();
    this._highlightGfx = new Graphics();
    this._recDot = new Graphics();
    this._detailBg = new Graphics();

    // Clickable hit zone over graph area
    this._graphHit = new Graphics();
    this._graphHit.eventMode = "static";
    this._graphHit.cursor = "pointer";
    this._graphHit.on("pointertap", () => {
      this._graphMode =
        this._graphMode === "fps"
          ? "dc"
          : this._graphMode === "dc"
            ? "budget"
            : "fps";
    });

    this.container.addChild(this._bg);
    this.container.addChild(this._graph);
    this.container.addChild(this._graphHit);
    this.container.addChild(this._recDot);
    this.container.addChild(this._detailBg);
    this.highlightContainer.addChild(this._highlightGfx);

    this._initFont();
  }

  private _initFont(): void {
    this._res = this._app.renderer.resolution;
    this._invRes = 1 / this._res;
    this._fontSize = Math.round(BASE_FONT_SIZE * this._res);

    BitmapFont.install({
      name: FONT_NAME,
      style: new TextStyle({
        fontFamily: '"Consolas", "SF Mono", "Menlo", "Courier New", monospace',
        fontSize: this._fontSize,
        fill: 0xffffff,
        fontWeight: "normal",
      }),
    });
    this._fontReady = true;
    this._buildUI();
  }

  private _mk(text: string, tint: number): BitmapText {
    const t = new BitmapText({
      text,
      style: { fontFamily: FONT_NAME, fontSize: this._fontSize },
    });
    t.tint = tint;
    t.scale.set(this._invRes);
    return t;
  }

  private _buildUI(): void {
    this._headerText = this._mk("CRAWLER", C.textBright);
    this.container.addChild(this._headerText);

    // 9 stat lines (FPS, nodes, DC, RI, CI, Budget, issues, heavy node, extra)
    for (let i = 0; i < 9; i++) {
      const t = this._mk("", C.text);
      this._statsTexts.push(t);
      this.container.addChild(t);
    }

    this._graphLabel = this._mk("", C.textMuted);
    this._graphLabel.visible = false;
    this.container.addChild(this._graphLabel);

    // 5 top-node list entries
    for (let i = 0; i < MAX_TOP_NODES; i++) {
      const t = this._mk("", C.textMuted);
      this._nodeListTexts.push(t);
      this.container.addChild(t);
    }

    // Detail panel text lines
    for (let i = 0; i < MAX_DETAIL_LINES; i++) {
      const t = this._mk("", C.text);
      t.visible = false;
      this._detailTexts.push(t);
      this.container.addChild(t);
    }
  }

  // ── Public API ─────────────────────────────────────────────

  get visible(): boolean {
    return this._visible;
  }
  set visible(v: boolean) {
    this._visible = v;
    this.container.visible = v;
    this.highlightContainer.visible = v && this._showHighlights;
  }

  toggle(): void {
    this.visible = !this.visible;
  }
  toggleGraph(): void {
    this._showGraph = !this._showGraph;
  }
  toggleIssues(): void {
    this._showIssues = !this._showIssues;
  }
  toggleHighlights(): void {
    this._showHighlights = !this._showHighlights;
    this.highlightContainer.visible = this._visible && this._showHighlights;
  }

  /** Toggle detailed analysis mode on/off */
  toggleAnalysis(): void {
    this._analysisMode = !this._analysisMode;
    if (this._analysisMode && this._topNodes.length > 0) {
      this._selectedIdx = 0;
      this._syncSelection();
    } else {
      this._selectedNode = null;
      this._selectedMeta = null;
    }
  }

  /** Cycle to next problem node */
  selectNext(): void {
    if (!this._analysisMode || this._topNodes.length === 0) return;
    this._selectedIdx = (this._selectedIdx + 1) % this._topNodes.length;
    this._syncSelection();
  }

  /** Cycle to previous problem node */
  selectPrev(): void {
    if (!this._analysisMode || this._topNodes.length === 0) return;
    this._selectedIdx =
      (this._selectedIdx - 1 + this._topNodes.length) % this._topNodes.length;
    this._syncSelection();
  }

  get analysisActive(): boolean {
    return this._analysisMode && this._selectedNode !== null;
  }

  private _syncSelection(): void {
    if (this._selectedIdx >= 0 && this._selectedIdx < this._topNodes.length) {
      const entry = this._topNodes[this._selectedIdx];
      this._selectedNode = entry.node;
      this._selectedMeta = entry.meta;
    } else {
      this._selectedNode = null;
      this._selectedMeta = null;
    }
  }

  // ── Frame update ───────────────────────────────────────────

  update(
    snapshot: FrameSnapshot | null,
    history: FrameSnapshot[],
    _recentIssues: { issue: Issue; nodeLabel: string }[],
    isRecording: boolean,
    problemNodes: { node: Container; meta: NodeMeta }[],
    _impactThreshold = 4,
  ): void {
    if (!this._visible || !this._fontReady) return;

    // ── Compute top nodes ──
    this._topNodes = problemNodes
      .map(({ node, meta }) => ({
        node,
        meta,
        score: meta.issues.reduce((s, i) => s + ISSUE_IMPACT[i.code], 0),
      }))
      .filter((n) => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TOP_NODES);

    // ── Refresh selection ──
    if (this._analysisMode && this._selectedNode) {
      // Try to keep same node selected even if list reorders
      const newIdx = this._topNodes.findIndex(
        (e) => e.node === this._selectedNode,
      );
      if (newIdx >= 0) {
        this._selectedIdx = newIdx;
        this._selectedMeta = this._topNodes[newIdx].meta;
      } else if (!this._selectedNode.parent) {
        // Node destroyed - pick next available
        this._selectedIdx = Math.min(
          this._selectedIdx,
          this._topNodes.length - 1,
        );
        this._syncSelection();
      }
      // else: keep stale meta, node still exists but dropped off top list
    } else if (this._analysisMode && this._topNodes.length > 0) {
      this._selectedIdx = Math.min(
        this._selectedIdx,
        this._topNodes.length - 1,
      );
      this._syncSelection();
    }

    const sw = this._app.screen.width;
    this._panelX = px(sw - PANEL_W - 10);
    this._panelY = 10;

    let y = this._panelY + PAD;
    const left = this._panelX + PAD;
    const cw = PANEL_W - PAD * 2;

    this._bg.clear();
    this._graph.clear();
    this._graphHit.clear();
    this._detailBg.clear();

    // ── Header ──
    this._headerText.x = px(left);
    this._headerText.y = px(y);
    y += LINE_H + GAP;

    // Record dot
    this._recDot.clear();
    if (isRecording && Math.floor(performance.now() / 400) % 2 === 0) {
      this._recDot.circle(
        this._panelX + PANEL_W - PAD - 4,
        this._panelY + PAD + 4,
        3,
      );
      this._recDot.fill({ color: 0xffffff });
    }

    // 1px divider
    this._line(left, y, left + cw, y, C.divider);
    y += GAP;

    // ── Stats ──
    if (snapshot) {
      const fps = snapshot.fps;
      const fpsCol = fps >= 55 ? C.text : fps >= 30 ? C.warn : C.error;

      const stats: { t: string; c: number }[] = [
        {
          t: `fps ${fps.toFixed(0).padStart(4)}    dt ${snapshot.dt.toFixed(1).padStart(5)}ms`,
          c: fpsCol,
        },
        {
          t: `nodes ${String(snapshot.nodeCount).padStart(4)}  vis ${String(snapshot.visibleNodes).padStart(4)}`,
          c: C.text,
        },
        {
          t: `draw ${String(snapshot.drawCalls).padStart(5)}`,
          c: snapshot.drawCalls > 80 ? C.textBright : C.text,
        },
      ];

      // ── Aggregate Budget Display ──
      if (snapshot.aggregateBudget && snapshot.aggregateBudget.spineCount > 0) {
        const ab = snapshot.aggregateBudget;
        const riCol = this._getBudgetColor(ab.totalRI);
        const ciCol = this._getBudgetColor(ab.totalCI);
        const totalCol = this._getBudgetColor(ab.total);

        stats.push({
          t: `RI ${ab.totalRI.toFixed(1).padStart(5)} (${ab.level})`,
          c: riCol,
        });
        stats.push({
          t: `CI ${ab.totalCI.toFixed(1).padStart(5)} [${ab.spineCount} spines]`,
          c: ciCol,
        });
        stats.push({
          t: `Budget ${ab.total.toFixed(1).padStart(5)}`,
          c: totalCol,
        });
      }

      if (snapshot.issueCount > 0) {
        stats.push({
          t: `issues ${String(snapshot.issueCount).padStart(3)}`,
          c: C.textBright,
        });
      }

      if (snapshot.heavyNodes.length > 0) {
        const top = snapshot.heavyNodes[0];
        stats.push({
          t: `> ${top.label.substring(0, 18)} ${String(top.drawCalls).padStart(3)}dc`,
          c: C.textMuted,
        });
      }

      for (let i = 0; i < this._statsTexts.length; i++) {
        const st = this._statsTexts[i];
        if (i < stats.length) {
          st.text = stats[i].t;
          st.tint = stats[i].c;
          st.visible = true;
          st.x = px(left);
          st.y = px(y);
          y += LINE_H;
        } else {
          st.visible = false;
        }
      }
    }

    y += GAP;

    // ── Graph (click to swap FPS / DC) ──
    if (this._showGraph && history.length > 2) {
      this._line(left, y, left + cw, y, C.divider);
      y += GAP;

      const last = history[history.length - 1];

      if (this._graphMode === "fps") {
        this._graphLabel.text = `fps ${last.fps.toFixed(0)}  \u25B8`;
        this._graphLabel.tint = C.textMuted;
        this._graphLabel.x = px(left);
        this._graphLabel.y = px(y);
        this._graphLabel.visible = true;
        y += LINE_H;

        this._drawAreaGraph(
          history,
          (f) => f.fps,
          left,
          y,
          cw,
          GRAPH_H,
          0,
          120,
          30,
          false,
        );
      } else if (this._graphMode === "dc") {
        const maxDC = Math.max(...history.map((f) => f.drawCalls), 1);
        const ceil = Math.ceil((maxDC * 1.2) / 10) * 10;

        this._graphLabel.text = `dc ${last.drawCalls}  \u25B8`;
        this._graphLabel.tint = C.textMuted;
        this._graphLabel.x = px(left);
        this._graphLabel.y = px(y);
        this._graphLabel.visible = true;
        y += LINE_H;

        this._drawAreaGraph(
          history,
          (f) => f.drawCalls,
          left,
          y,
          cw,
          GRAPH_H,
          0,
          ceil,
          80,
          true,
        );
      } else {
        // Budget mode (RI/CI)
        const lastRI = last.aggregateBudget?.totalRI ?? 0;
        const lastCI = last.aggregateBudget?.totalCI ?? 0;

        this._graphLabel.text = `RI ${lastRI.toFixed(1)} / CI ${lastCI.toFixed(1)}  \u25B8`;
        this._graphLabel.tint = C.textMuted;
        this._graphLabel.x = px(left);
        this._graphLabel.y = px(y);
        this._graphLabel.visible = true;
        y += LINE_H;

        this._drawBudgetGraph(history, left, y, cw, GRAPH_H);
      }

      // Invisible clickable zone over the graph + label
      this._graphHit.rect(left, y - LINE_H, cw, GRAPH_H + LINE_H);
      this._graphHit.fill({ color: 0x000000, alpha: 0.001 });

      y += GRAPH_H + GAP;
    } else {
      this._graphLabel.visible = false;
    }

    // ── Top nodes list (D to toggle, < > to cycle) ──
    if (this._showIssues && this._topNodes.length > 0) {
      this._line(left, y, left + cw, y, C.divider);
      y += GAP;

      for (let i = 0; i < MAX_TOP_NODES; i++) {
        const t = this._nodeListTexts[i];
        if (i < this._topNodes.length) {
          const { node, meta } = this._topNodes[i];
          const sel = this._analysisMode && this._selectedNode === node;
          const prefix = sel ? "\u25B8" : " ";
          const lbl = meta.label.substring(0, 14).padEnd(14);
          t.text = `${prefix} ${lbl} ${String(meta.drawCalls).padStart(3)}dc`;
          t.tint = sel ? C.textBright : C.textMuted;
          t.visible = true;
          t.x = px(left);
          t.y = px(y);
          y += LINE_H;
        } else {
          t.visible = false;
        }
      }
    } else {
      for (const t of this._nodeListTexts) t.visible = false;
    }

    y += PAD;

    // ── Panel bg ──
    const ph = y - this._panelY;
    this._bg.roundRect(this._panelX, this._panelY, PANEL_W, ph, 4);
    this._bg.fill({ color: C.panelBg, alpha: C.panelAlpha });
    this._bg.roundRect(this._panelX, this._panelY, PANEL_W, ph, 4);
    this._bg.stroke({ color: C.border, width: 1, alpha: 0.5 });

    // ── Detail panel (left side, when analysis active) ──
    if (this._analysisMode && this._selectedNode && this._selectedMeta) {
      this._drawDetailPanel(this._selectedMeta);
    } else {
      for (const dt of this._detailTexts) dt.visible = false;
    }

    // ── Scene highlights + X marker ──
    this._highlightGfx.clear();
    if (this._showHighlights && problemNodes.length > 0) {
      this._drawHighlights(problemNodes);
    }
    if (this._analysisMode && this._selectedNode) {
      this._drawXMarker(this._selectedNode);
    }
  }

  // ── Detail panel (left side) ─────────────────────────────

  private _drawDetailPanel(meta: NodeMeta): void {
    const lines = this._buildDetailLines(meta);
    const dx = 10;
    const dy = this._panelY;
    let ly = dy + PAD;
    const dleft = dx + PAD;

    for (let i = 0; i < MAX_DETAIL_LINES; i++) {
      const dt = this._detailTexts[i];
      if (i < lines.length) {
        dt.text = lines[i].text;
        dt.tint = lines[i].tint;
        dt.visible = true;
        dt.x = px(dleft);
        dt.y = px(ly);
        ly += LINE_H;
      } else {
        dt.visible = false;
      }
    }

    ly += PAD;
    const dh = ly - dy;
    this._detailBg.roundRect(dx, dy, DETAIL_W, dh, 4);
    this._detailBg.fill({ color: C.panelBg, alpha: C.panelAlpha });
    this._detailBg.roundRect(dx, dy, DETAIL_W, dh, 4);
    this._detailBg.stroke({ color: C.border, width: 1, alpha: 0.5 });
  }

  private _buildDetailLines(meta: NodeMeta): { text: string; tint: number }[] {
    const L: { text: string; tint: number }[] = [];
    const MAX_W = 38; // chars that fit in DETAIL_W

    // ── Header ──
    L.push({ text: meta.label.substring(0, MAX_W), tint: C.textBright });
    L.push({
      text: `${meta.kind}  dc:${meta.drawCalls}  depth:${meta.depth}`,
      tint: C.text,
    });
    L.push({
      text: `${meta.boundsW.toFixed(0)}x${meta.boundsH.toFixed(0)}  alpha:${meta.worldAlpha.toFixed(2)}`,
      tint: C.text,
    });
    if (meta.masked) L.push({ text: "masked:yes", tint: C.warn });
    if (meta.hasFilters) L.push({ text: "filters:yes", tint: C.warn });
    if (meta.blendBreak) L.push({ text: "blend:non-normal", tint: C.warn });

    // ── Spine analysis ──
    if (meta.spineAnalysis) {
      const sa = meta.spineAnalysis;
      L.push({ text: "", tint: C.textMuted });
      L.push({
        text: `slots ${sa.activeSlots}/${sa.totalSlots} active`,
        tint: C.text,
      });

      // Atlas pages (truncate long names)
      const pages = sa.atlasPages.map((p) => {
        const parts = p.split("/");
        return parts[parts.length - 1].substring(0, 16);
      });
      L.push({
        text: `atlas: ${pages.join(", ").substring(0, MAX_W - 7)}`,
        tint: C.text,
      });

      L.push({
        text: `blend x${sa.blendModeTransitions}  atlas-sw x${sa.atlasPageSwitches}`,
        tint:
          sa.blendModeTransitions > 0 || sa.atlasPageSwitches > 0
            ? C.textBright
            : C.text,
      });

      // ── Budget metrics ──
      if (meta.spineBudget) {
        const budget = meta.spineBudget;
        L.push({ text: "", tint: C.textMuted });

        // Budget bar visualization
        const riBar = this._budgetBar(budget.ri.total, 100);
        const ciBar = this._budgetBar(budget.ci.total, 100);

        L.push({
          text: `RI ${budget.ri.total.toFixed(1).padStart(5)} ${riBar} ${budget.ri.level}`,
          tint: budget.ri.total >= 50 ? C.textBright : C.text,
        });
        L.push({
          text: `CI ${budget.ci.total.toFixed(1).padStart(5)} ${ciBar} ${budget.ci.level}`,
          tint: budget.ci.total >= 50 ? C.textBright : C.text,
        });
        L.push({
          text: `Total ${budget.total.toFixed(1).padStart(5)} [${budget.level}]`,
          tint: budget.total >= 75 ? C.textBright : C.text,
        });
      }

      // Batch breaks detail
      if (sa.breaks.length > 0) {
        L.push({ text: "", tint: C.textMuted });
        L.push({ text: "batch breaks:", tint: C.textMuted });
        for (const b of sa.breaks.slice(0, 5)) {
          const from = b.afterSlot.substring(0, 10);
          const to = b.beforeSlot.substring(0, 10);
          const reason = b.reason
            .replace("blend_mode_change", "blend")
            .replace("atlas_page_switch", "atlas")
            .replace("clipping_start", "clip+")
            .replace("clipping_end", "clip-");
          L.push({
            text: `  ${from}\u2192${to} ${reason}`,
            tint: C.textMuted,
          });
        }
        if (sa.breaks.length > 5) {
          L.push({
            text: `  +${sa.breaks.length - 5} more`,
            tint: C.textMuted,
          });
        }
      }
    }

    // ── Mask analysis ──
    if (meta.maskAnalysis) {
      const ma = meta.maskAnalysis;
      L.push({ text: "", tint: C.textMuted });
      L.push({
        text: `mask: ${ma.maskType} "${ma.maskNodeLabel.substring(0, 18)}"`,
        tint: C.text,
      });
      L.push({
        text: `nested:${ma.isNested ? "YES" : "no"}  complexity:${ma.estimatedComplexity}`,
        tint: ma.isNested ? C.textBright : C.text,
      });
    }

    // ── Issues ──
    if (meta.issues.length > 0) {
      L.push({ text: "", tint: C.textMuted });
      for (const iss of meta.issues.slice(0, 6)) {
        const imp = ISSUE_IMPACT[iss.code];
        const sev =
          iss.severity === "error"
            ? "!!"
            : iss.severity === "warn"
              ? " !"
              : "  ";
        L.push({
          text: `${sev} ${iss.code.toLowerCase()} (${imp})`,
          tint:
            iss.severity === "error"
              ? C.textBright
              : iss.severity === "warn"
                ? C.text
                : C.textMuted,
        });
      }
      if (meta.issues.length > 6) {
        L.push({
          text: `   +${meta.issues.length - 6} more`,
          tint: C.textMuted,
        });
      }
    }

    return L.slice(0, MAX_DETAIL_LINES);
  }

  // ── X marker on selected node ────────────────────────────

  private _drawXMarker(node: Container): void {
    const gfx = this._highlightGfx;
    let bx: number, by: number, bw: number, bh: number;
    try {
      const b = node.getBounds();
      bx = b.x;
      by = b.y;
      bw = b.width;
      bh = b.height;
    } catch {
      return;
    }
    if (bw < 2 || bh < 2) return;

    const m = 4; // margin inset so X corners sit inside the bounds

    // Diagonal line: top-left → bottom-right
    gfx.moveTo(bx + m, by + m);
    gfx.lineTo(bx + bw - m, by + bh - m);
    gfx.stroke({ color: C.xMarker, width: 2, alpha: 0.8 });

    // Diagonal line: top-right → bottom-left
    gfx.moveTo(bx + bw - m, by + m);
    gfx.lineTo(bx + m, by + bh - m);
    gfx.stroke({ color: C.xMarker, width: 2, alpha: 0.8 });

    // Pulsing outer rect
    const pulse = 0.3 + 0.3 * Math.sin(performance.now() * 0.005);
    gfx.rect(bx, by, bw, bh);
    gfx.stroke({ color: C.xMarker, width: 1.5, alpha: pulse });
  }

  // ── Drawing primitives ─────────────────────────────────────

  /** 1px line via bg graphics */
  private _line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
  ): void {
    this._bg.moveTo(x1, y1);
    this._bg.lineTo(x2, y2);
    this._bg.stroke({ color, width: 1, alpha: 0.5 });
  }

  /**
   * Area graph with a filled shape and line on top.
   * warnAbove = false → values below threshold are "bad" (FPS)
   * warnAbove = true  → values above threshold are "bad" (DC)
   */
  private _drawAreaGraph(
    history: FrameSnapshot[],
    getValue: (f: FrameSnapshot) => number,
    x: number,
    y: number,
    w: number,
    h: number,
    minVal: number,
    maxVal: number,
    warnThreshold: number,
    warnAbove: boolean,
  ): void {
    const gfx = this._graph;
    const range = maxVal - minVal || 1;
    const count = history.length;
    if (count < 2) return;

    // Background
    gfx.rect(x, y, w, h);
    gfx.fill({ color: 0x0a0a0a, alpha: 0.4 });

    // Threshold guide line
    const threshNorm = (warnThreshold - minVal) / range;
    const threshY = y + h - threshNorm * h;
    gfx.moveTo(x, threshY);
    gfx.lineTo(x + w, threshY);
    gfx.stroke({ color: C.divider, width: 1, alpha: 0.5 });

    // Build sample points
    const step = w / (count - 1);
    const pts: { sx: number; sy: number; bad: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const val = getValue(history[i]);
      const norm = Math.max(val - minVal, 0) / range;
      const sx = x + i * step;
      const sy = y + h - Math.min(norm, 1) * h;
      const bad = warnAbove ? val > warnThreshold : val < warnThreshold;
      pts.push({ sx: px(sx), sy: px(sy), bad });
    }

    // ── Filled area ──
    gfx.moveTo(pts[0].sx, y + h);
    for (const p of pts) gfx.lineTo(p.sx, p.sy);
    gfx.lineTo(pts[pts.length - 1].sx, y + h);
    gfx.closePath();
    gfx.fill({ color: C.graphFill, alpha: 0.35 });

    // ── Main line ──
    gfx.moveTo(pts[0].sx, pts[0].sy);
    for (let i = 1; i < pts.length; i++) {
      gfx.lineTo(pts[i].sx, pts[i].sy);
    }
    gfx.stroke({ color: C.graphLine, width: 1.5, alpha: 0.6 });

    // ── Bad segments (brighter overlay) ──
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].bad || pts[i - 1].bad) {
        gfx.moveTo(pts[i - 1].sx, pts[i - 1].sy);
        gfx.lineTo(pts[i].sx, pts[i].sy);
        gfx.stroke({ color: C.graphBad, width: 2, alpha: 0.85 });
      }
    }

    // ── Border ──
    gfx.rect(x, y, w, h);
    gfx.stroke({ color: C.border, width: 1, alpha: 0.3 });
  }

  /**
   * Dual-line graph showing RI and CI budget values over time.
   * Both lines are drawn on the same chart with different colors.
   */
  private _drawBudgetGraph(
    history: FrameSnapshot[],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const gfx = this._graph;
    const count = history.length;
    if (count < 2) return;

    // Extract RI and CI values, find max for scaling
    const riValues = history.map((f) => f.aggregateBudget?.totalRI ?? 0);
    const ciValues = history.map((f) => f.aggregateBudget?.totalCI ?? 0);
    const maxRI = Math.max(...riValues, 1);
    const maxCI = Math.max(...ciValues, 1);
    const maxVal = Math.max(maxRI, maxCI);
    const ceil = Math.ceil((maxVal * 1.2) / 10) * 10;
    const range = ceil || 1;

    // Background
    gfx.rect(x, y, w, h);
    gfx.fill({ color: 0x0a0a0a, alpha: 0.4 });

    // Threshold guide lines at 50 and 75
    const thresh50 = y + h - (50 / range) * h;
    const thresh75 = y + h - (75 / range) * h;

    if (thresh50 >= y && thresh50 <= y + h) {
      gfx.moveTo(x, thresh50);
      gfx.lineTo(x + w, thresh50);
      gfx.stroke({ color: C.divider, width: 1, alpha: 0.3 });
    }

    if (thresh75 >= y && thresh75 <= y + h) {
      gfx.moveTo(x, thresh75);
      gfx.lineTo(x + w, thresh75);
      gfx.stroke({ color: C.divider, width: 1, alpha: 0.5 });
    }

    // Build sample points for both lines
    const step = w / (count - 1);
    const riPts: { sx: number; sy: number }[] = [];
    const ciPts: { sx: number; sy: number }[] = [];

    for (let i = 0; i < count; i++) {
      const riVal = riValues[i];
      const ciVal = ciValues[i];
      const riNorm = Math.max(riVal, 0) / range;
      const ciNorm = Math.max(ciVal, 0) / range;
      const sx = x + i * step;
      const riSy = y + h - Math.min(riNorm, 1) * h;
      const ciSy = y + h - Math.min(ciNorm, 1) * h;
      riPts.push({ sx: px(sx), sy: px(riSy) });
      ciPts.push({ sx: px(sx), sy: px(ciSy) });
    }

    // ── Draw RI line (cyan/blue) ──
    gfx.moveTo(riPts[0].sx, riPts[0].sy);
    for (let i = 1; i < riPts.length; i++) {
      gfx.lineTo(riPts[i].sx, riPts[i].sy);
    }
    gfx.stroke({ color: C.riLine, width: 1.5, alpha: 0.8 });

    // Highlight high RI segments (>= 50)
    for (let i = 1; i < riPts.length; i++) {
      const riVal = riValues[i];
      const prevRiVal = riValues[i - 1];
      if (riVal >= 50 || prevRiVal >= 50) {
        gfx.moveTo(riPts[i - 1].sx, riPts[i - 1].sy);
        gfx.lineTo(riPts[i].sx, riPts[i].sy);
        gfx.stroke({ color: C.riLine, width: 2, alpha: 1 });
      }
    }

    // ── Draw CI line (magenta/purple) ──
    gfx.moveTo(ciPts[0].sx, ciPts[0].sy);
    for (let i = 1; i < ciPts.length; i++) {
      gfx.lineTo(ciPts[i].sx, ciPts[i].sy);
    }
    gfx.stroke({ color: C.ciLine, width: 1.5, alpha: 0.8 });

    // Highlight high CI segments (>= 50)
    for (let i = 1; i < ciPts.length; i++) {
      const ciVal = ciValues[i];
      const prevCiVal = ciValues[i - 1];
      if (ciVal >= 50 || prevCiVal >= 50) {
        gfx.moveTo(ciPts[i - 1].sx, ciPts[i - 1].sy);
        gfx.lineTo(ciPts[i].sx, ciPts[i].sy);
        gfx.stroke({ color: C.ciLine, width: 2, alpha: 1 });
      }
    }

    // ── Border ──
    gfx.rect(x, y, w, h);
    gfx.stroke({ color: C.border, width: 1, alpha: 0.3 });
  }

  /** Highlight spine nodes with DC / batching issues */
  private _drawHighlights(nodes: { node: Container; meta: NodeMeta }[]): void {
    const gfx = this._highlightGfx;

    for (const { node, meta } of nodes) {
      // Only highlight spine nodes
      if (meta.kind !== "spine") continue;
      if (!node.visible || meta.issues.length === 0) continue;
      // Skip selected node (it gets the X marker instead)
      if (node === this._selectedNode) continue;

      let bx: number, by: number, bw: number, bh: number;
      try {
        const b = node.getBounds();
        bx = b.x;
        by = b.y;
        bw = b.width;
        bh = b.height;
      } catch {
        continue;
      }

      if (bw < 2 || bh < 2) continue;

      // Red if >5 draw calls, orange for other spine issues
      const color = meta.drawCalls > 5 ? C.hlError : C.hlWarn;

      // Soft fill
      gfx.rect(bx, by, bw, bh);
      gfx.fill({ color, alpha: 0.05 });

      // Outline
      gfx.rect(bx, by, bw, bh);
      gfx.stroke({ color, width: 1, alpha: 0.4 });

      // Corner brackets
      const cs = Math.min(6, bw * 0.15, bh * 0.15);
      const corners = [
        [bx, by + cs, bx, by, bx + cs, by],
        [bx + bw - cs, by, bx + bw, by, bx + bw, by + cs],
        [bx, by + bh - cs, bx, by + bh, bx + cs, by + bh],
        [bx + bw - cs, by + bh, bx + bw, by + bh, bx + bw, by + bh - cs],
      ];
      for (const [x1, y1, x2, y2, x3, y3] of corners) {
        gfx.moveTo(x1, y1);
        gfx.lineTo(x2, y2);
        gfx.lineTo(x3, y3);
        gfx.stroke({ color, width: 2, alpha: 0.7 });
      }

      // ── Budget badge on highlight ──
      if (meta.spineBudget && meta.spineBudget.total >= 50) {
        const badgeText = `${meta.spineBudget.total.toFixed(0)}`;
        const badgeX = bx + bw - 20;
        const badgeY = by + 4;

        // Badge background (small circle)
        gfx.circle(badgeX, badgeY, 8);
        gfx.fill({ color: 0x000000, alpha: 0.7 });
        gfx.circle(badgeX, badgeY, 8);
        gfx.stroke({ color, width: 1, alpha: 0.8 });
      }
    }
  }

  /**
   * Create a simple text-based budget bar.
   * Returns a string like "████░░░░" representing the budget level.
   */
  private _budgetBar(value: number, max: number): string {
    const barLength = 8;
    const filled = Math.min(Math.round((value / max) * barLength), barLength);
    const empty = barLength - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  /**
   * Get color for budget value based on impact level thresholds.
   * Uses the same thresholds as the budget tracker.
   */
  private _getBudgetColor(value: number): number {
    if (value < 25) return C.budgetMinimal; // minimal: green
    if (value < 50) return C.budgetLow; // low: light green
    if (value < 75) return C.budgetModerate; // moderate: yellow
    if (value < 100) return C.budgetHigh; // high: orange
    return C.budgetVeryHigh; // very-high: red
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.highlightContainer.destroy({ children: true });
  }
}
