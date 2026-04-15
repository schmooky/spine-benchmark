import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { Bone, Slot } from '@esotericsoftware/spine-core';
import { collectSnapshot } from './useDrawCallInspector';

/* ── Types ─────────────────────────────────────────────────────────── */

export type SliceMode = 'draw-call' | 'tree-depth' | 'custom-lock';

export interface SliceSlotInfo {
  /** Index in the skeleton.drawOrder array */
  drawIndex: number;
  slotName: string;
  boneName: string;
  attachmentName: string | null;
  isVisible: boolean;
}

export interface SliceLayer {
  id: string;
  label: string;
  color: string;
  slots: SliceSlotInfo[];
  /** Extra info shown in the layer list (e.g. atlas page, blend mode) */
  meta?: string;
}

export interface BoneTreeNode {
  name: string;
  depth: number;
  bone: Bone;
  children: BoneTreeNode[];
  /** slots that are directly attached to this bone */
  directSlots: SliceSlotInfo[];
  /** if true, this subtree is collapsed (locked) into a single layer */
  locked: boolean;
}

/* ── Palette ───────────────────────────────────────────────────────── */

const LAYER_COLORS = [
  '#60A5FA', '#F472B6', '#34D399', '#FBBF24', '#A78BFA',
  '#FB923C', '#22D3EE', '#F87171', '#818CF8', '#2DD4A8',
  '#E879F9', '#FCD34D', '#6EE7B7', '#93C5FD', '#FCA5A5',
  '#C4B5FD', '#FDE68A', '#A7F3D0', '#FBCFE8', '#BAE6FD',
];

function layerColor(index: number): string {
  return LAYER_COLORS[index % LAYER_COLORS.length];
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function extractSlotInfos(spine: Spine): SliceSlotInfo[] {
  const skeleton = spine.skeleton;
  const drawOrder = skeleton.drawOrder;
  return drawOrder.map((slot: Slot, i: number) => ({
    drawIndex: i,
    slotName: slot.data.name,
    boneName: slot.bone.data.name,
    attachmentName: slot.attachment?.name ?? null,
    isVisible: slot.attachment !== null,
  }));
}

function buildBoneTree(spine: Spine): BoneTreeNode {
  const skeleton = spine.skeleton;
  const slotInfos = extractSlotInfos(spine);
  const slotsByBone = new Map<string, SliceSlotInfo[]>();
  for (const s of slotInfos) {
    const arr = slotsByBone.get(s.boneName) ?? [];
    arr.push(s);
    slotsByBone.set(s.boneName, arr);
  }

  function buildNode(bone: Bone, depth: number): BoneTreeNode {
    const children: BoneTreeNode[] = [];
    for (const b of skeleton.bones) {
      if (b.parent === bone) {
        children.push(buildNode(b, depth + 1));
      }
    }
    return {
      name: bone.data.name,
      depth,
      bone,
      children,
      directSlots: slotsByBone.get(bone.data.name) ?? [],
      locked: true, // default locked to avoid FPS loss from too many layers
    };
  }

  const root = skeleton.bones.find((b: Bone) => !b.parent);
  if (!root) {
    return { name: 'root', depth: 0, bone: null as any, children: [], directSlots: [], locked: false };
  }
  const tree = buildNode(root, 0);
  // Unlock the root so its children form separate locked groups;
  // if root were locked the entire skeleton collapses into one layer.
  tree.locked = false;
  return tree;
}

function collectSlotsFromSubtree(node: BoneTreeNode): SliceSlotInfo[] {
  const result: SliceSlotInfo[] = [...node.directSlots];
  for (const child of node.children) {
    result.push(...collectSlotsFromSubtree(child));
  }
  return result.sort((a, b) => a.drawIndex - b.drawIndex);
}

/* ── Slice strategies ──────────────────────────────────────────────── */

/**
 * Group slots by draw-call batch.  A new batch starts whenever the
 * atlas page or blend mode changes between consecutive *visible* slots,
 * exactly mirroring the GPU flush logic in the PixiJS Spine renderer.
 *
 * This runs every ~100 ms (driven by rAF) so the slices update live
 * as the animation plays.
 */
function sliceByDrawCall(spine: Spine): SliceLayer[] {
  const snapshot = collectSnapshot(spine.skeleton);
  if (snapshot.slots.length === 0) return [];

  const layers: SliceLayer[] = [];
  let batchIdx = 0;
  let currentSlots: SliceSlotInfo[] = [];
  let batchPage = '';
  let batchBlend = '';

  for (const info of snapshot.slots) {
    // Skip invisible slots  -  they don't contribute to draw calls
    if (info.isInvisible) continue;

    // When a break occurs (or first slot), start a new batch layer
    if (currentSlots.length === 0 || info.isBreak) {
      if (currentSlots.length > 0) {
        layers.push({
          id: `dc-${batchIdx}`,
          label: `DC ${batchIdx + 1}`,
          color: layerColor(batchIdx),
          slots: currentSlots,
          meta: `${batchPage} · ${batchBlend}`,
        });
        batchIdx++;
      }
      currentSlots = [];
      batchPage = info.atlasPage;
      batchBlend = info.blendMode;
    }

    currentSlots.push({
      drawIndex: info.index,
      slotName: info.slotName,
      boneName: '', // not needed for capture (uses slotName)
      attachmentName: info.attachmentName,
      isVisible: true,
    });
  }

  // Push the last batch
  if (currentSlots.length > 0) {
    layers.push({
      id: `dc-${batchIdx}`,
      label: `DC ${batchIdx + 1}`,
      color: layerColor(batchIdx),
      slots: currentSlots,
      meta: `${batchPage} · ${batchBlend}`,
    });
  }

  return layers;
}

function sliceByTreeDepth(spine: Spine, maxDepth: number): SliceLayer[] {
  const tree = buildBoneTree(spine);
  const depthBuckets = new Map<number, SliceSlotInfo[]>();

  function walk(node: BoneTreeNode) {
    const effectiveDepth = Math.min(node.depth, maxDepth);
    for (const s of node.directSlots) {
      const arr = depthBuckets.get(effectiveDepth) ?? [];
      arr.push(s);
      depthBuckets.set(effectiveDepth, arr);
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  walk(tree);

  const layers: SliceLayer[] = [];
  const sorted = [...depthBuckets.entries()].sort((a, b) => a[0] - b[0]);
  sorted.forEach(([depth, slots], i) => {
    const sortedSlots = slots.sort((a, b) => a.drawIndex - b.drawIndex);
    layers.push({
      id: `depth-${depth}`,
      label: `Depth ${depth}`,
      color: layerColor(i),
      slots: sortedSlots,
    });
  });
  return layers;
}

function sliceByCustomLock(tree: BoneTreeNode): SliceLayer[] {
  const layers: SliceLayer[] = [];
  let layerIndex = 0;

  function walk(node: BoneTreeNode) {
    if (node.locked) {
      // Entire subtree becomes one layer
      const allSlots = collectSlotsFromSubtree(node);
      if (allSlots.length > 0) {
        layers.push({
          id: `lock-${node.name}`,
          label: node.name,
          color: layerColor(layerIndex++),
          slots: allSlots,
        });
      }
      return; // don't descend
    }

    // Direct slots of this node become their own micro-layers
    for (const s of node.directSlots) {
      layers.push({
        id: `slot-${s.slotName}-${s.drawIndex}`,
        label: s.attachmentName ?? s.slotName,
        color: layerColor(layerIndex++),
        slots: [s],
      });
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  walk(tree);
  // Sort each layer's internal slots by draw order
  return layers.map(l => ({
    ...l,
    slots: l.slots.sort((a, b) => a.drawIndex - b.drawIndex),
  }));
}

/* ── Hook ──────────────────────────────────────────────────────────── */

const DC_POLL_MS = 250;

export function useZSlice(spineInstance: Spine | null) {
  const [mode, setMode] = useState<SliceMode>('draw-call');
  const [treeDepth, setTreeDepth] = useState(3);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [isolatedLayerId, setIsolatedLayerId] = useState<string | null>(null);
  const [layerSpacing, setLayerSpacing] = useState(40);

  // Build the bone tree for custom-lock mode
  const [boneTree, setBoneTree] = useState<BoneTreeNode | null>(null);

  // Rebuild tree when spine instance changes
  useEffect(() => {
    if (spineInstance) {
      setBoneTree(buildBoneTree(spineInstance));
    } else {
      setBoneTree(null);
    }
  }, [spineInstance]);

  const toggleLock = useCallback((nodeName: string) => {
    if (!boneTree) return;

    function toggle(node: BoneTreeNode): BoneTreeNode {
      if (node.name === nodeName) {
        return { ...node, locked: !node.locked };
      }
      return { ...node, children: node.children.map(toggle) };
    }

    setBoneTree(toggle(boneTree));
  }, [boneTree]);

  // ── Live draw-call layers (polled via rAF) ───────────────────────
  const [dcLayers, setDcLayers] = useState<SliceLayer[]>([]);
  const lastDcPollRef = useRef(0);
  /** Fingerprint of the previous DC layer structure to avoid React re-renders when nothing changed */
  const prevDcFingerprintRef = useRef('');

  useEffect(() => {
    if (!spineInstance || mode !== 'draw-call') {
      setDcLayers([]);
      prevDcFingerprintRef.current = '';
      return;
    }

    let rafId: number;
    let running = true;

    const tick = () => {
      if (!running) return;
      const now = performance.now();
      if (now - lastDcPollRef.current >= DC_POLL_MS) {
        lastDcPollRef.current = now;
        try {
          const next = sliceByDrawCall(spineInstance);
          // Build a structural fingerprint: "layerCount|id0:slotCount0|id1:slotCount1|..."
          // Only update React state when this changes, avoiding massive mesh rebuilds
          const fp = next.length + '|' + next.map(l => l.id + ':' + l.slots.length).join('|');
          if (fp !== prevDcFingerprintRef.current) {
            prevDcFingerprintRef.current = fp;
            setDcLayers(next);
          }
        } catch {
          // skeleton may not be ready
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
  }, [spineInstance, mode]);

  // ── Static layers for non-live modes ─────────────────────────────
  const staticLayers = useMemo<SliceLayer[]>(() => {
    if (!spineInstance) return [];
    switch (mode) {
      case 'draw-call':
        return []; // handled by dcLayers state
      case 'tree-depth':
        return sliceByTreeDepth(spineInstance, treeDepth);
      case 'custom-lock':
        return boneTree ? sliceByCustomLock(boneTree) : [];
    }
  }, [spineInstance, mode, treeDepth, boneTree]);

  const layers = mode === 'draw-call' ? dcLayers : staticLayers;

  const slotInfos = useMemo(() => {
    if (!spineInstance) return [];
    return extractSlotInfos(spineInstance);
  }, [spineInstance]);

  const maxTreeDepth = useMemo(() => {
    if (!boneTree) return 0;
    function maxD(node: BoneTreeNode): number {
      if (node.children.length === 0) return node.depth;
      return Math.max(...node.children.map(maxD));
    }
    return maxD(boneTree);
  }, [boneTree]);

  return {
    mode,
    setMode,
    treeDepth,
    setTreeDepth,
    maxTreeDepth,
    layers,
    slotInfos,
    boneTree,
    toggleLock,
    hoveredLayerId,
    setHoveredLayerId,
    isolatedLayerId,
    setIsolatedLayerId,
    layerSpacing,
    setLayerSpacing,
  };
}
