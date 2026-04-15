import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type { SliceLayer } from '../hooks/useZSlice';
import type { PrerenderFrame } from '../hooks/usePrerender';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Constants ─────────────────────────────────────────────────────── */
const BG_COLOR = 0x1a1a2e;
const GRID_COLOR = 0x333355;
const LABEL_FONT = '600 11px "Inter", system-ui, sans-serif';

/* ── Helpers ───────────────────────────────────────────────────────── */

function hexToThree(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function createLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 512;
  canvas.height = 48;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = LABEL_FONT;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let display = text;
  if (ctx.measureText(display).width > 480) {
    while (ctx.measureText(display + '...').width > 480 && display.length > 0) {
      display = display.slice(0, -1);
    }
    display += '...';
  }
  ctx.fillText(display, 8, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 0.4, 1);
  return sprite;
}

function createLayerOutline(
  width: number,
  height: number,
  color: string,
): THREE.Line {
  const hw = width / 2;
  const hh = height / 2;
  const points = [
    new THREE.Vector3(-hw, -hh, 0),
    new THREE.Vector3(hw, -hh, 0),
    new THREE.Vector3(hw, hh, 0),
    new THREE.Vector3(-hw, hh, 0),
    new THREE.Vector3(-hw, -hh, 0),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: hexToThree(color) });
  return new THREE.Line(geometry, material);
}

/* ── Per-layer Three.js texture entry ────────────────────────────── */

interface LayerTexEntry {
  canvas: HTMLCanvasElement;
  threeTex: THREE.CanvasTexture;
}

/* ── Component ─────────────────────────────────────────────────────── */

interface ThreeSliceViewerProps {
  layers: SliceLayer[];
  layerSpacing: number;
  /** The prerendered frames cache (from usePrerender) */
  prerenderFrames: PrerenderFrame[];
  /** Current frame index to display */
  currentFrame: number;
  /** Skeleton width/height for sizing planes (in world units) */
  skeletonSize?: { w: number; h: number };
  /**
   * When true, layer[0] is near camera and layer[N] is far.
   * When false (default / DC mode), layer[0] is far and layer[N] is near.
   */
  reverseZOrder?: boolean;
  hoveredLayerId: string | null;
  isolatedLayerId: string | null;
  onHoverLayer: (id: string | null) => void;
  onIsolateLayer: (id: string | null) => void;
}

export function ThreeSliceViewer({
  layers,
  layerSpacing,
  prerenderFrames,
  currentFrame,
  skeletonSize,
  reverseZOrder = false,
  hoveredLayerId,
  isolatedLayerId,
  onHoverLayer,
  onIsolateLayer,
}: ThreeSliceViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number>(0);
  const layerGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  /** Per-layer Three.js texture entries (persistent canvases bound to materials) */
  const texCacheRef = useRef<Map<string, LayerTexEntry>>(new Map());

  /** Refs for render-loop closure */
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const framesRef = useRef(prerenderFrames);
  framesRef.current = prerenderFrames;
  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  /** Structural fingerprint of layers */
  const layerFingerprint = useMemo(
    () => layers.map((l) => l.id).join('|'),
    [layers],
  );
  const prevFingerprintRef = useRef('');

  const planeSize = useMemo(() => {
    if (skeletonSize && skeletonSize.w > 0 && skeletonSize.h > 0) return skeletonSize;
    return { w: 6, h: 8 };
  }, [skeletonSize]);

  /* ── Three.js scene init ──────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG_COLOR);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(8, 6, 12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    const gridHelper = new THREE.GridHelper(20, 20, GRID_COLOR, 0x222244);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -1;
    scene.add(gridHelper);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const observer = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(container);

    // ── Render loop ─────────────────────────────────────────────
    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      controls.update();

      const cache = framesRef.current;
      const lrs = layersRef.current;
      const fi = currentFrameRef.current;

      // Blit the current cached frame's textures onto Three.js planes
      if (cache.length > 0 && lrs.length > 0) {
        const clampedIdx = Math.min(Math.max(fi, 0), cache.length - 1);
        const frame = cache[clampedIdx];
        if (frame) {
          for (const layer of lrs) {
            const cachedCanvas = frame.textures.get(layer.id);
            if (!cachedCanvas) continue;

            const group = layerGroupsRef.current.get(layer.id);
            if (!group) continue;

            let entry = texCacheRef.current.get(layer.id);
            if (!entry) {
              const persistent = document.createElement('canvas');
              persistent.width = cachedCanvas.width;
              persistent.height = cachedCanvas.height;
              const tex = new THREE.CanvasTexture(persistent);
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              tex.colorSpace = THREE.SRGBColorSpace;
              entry = { canvas: persistent, threeTex: tex };
              texCacheRef.current.set(layer.id, entry);
            }

            // Blit cached canvas -> persistent canvas -> Three.js texture
            const dstCtx = entry.canvas.getContext('2d');
            if (dstCtx) {
              if (entry.canvas.width !== cachedCanvas.width || entry.canvas.height !== cachedCanvas.height) {
                entry.canvas.width = cachedCanvas.width;
                entry.canvas.height = cachedCanvas.height;
              }
              dstCtx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
              dstCtx.drawImage(cachedCanvas, 0, 0);
              entry.threeTex.needsUpdate = true;
            }

            // Bind texture to mesh if not already bound
            group.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh && obj.userData?.isTexPlane) {
                const mesh = obj as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
                if (mesh.material.map !== entry!.threeTex) {
                  mesh.material.map = entry!.threeTex;
                  mesh.material.needsUpdate = true;
                }
              }
            });
          }
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  /* ── Rebuild layer meshes (only when structure changes) ────────── */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const { w, h } = planeSize;

    // Skip full rebuild if layer IDs unchanged - just reposition
    if (layerFingerprint === prevFingerprintRef.current && layerGroupsRef.current.size > 0) {
      const spacing = layerSpacing / 10;
      const totalHeight = (layers.length - 1) * spacing;
      const startZ = -totalHeight / 2;
      layers.forEach((layer, i) => {
        const group = layerGroupsRef.current.get(layer.id);
        if (!group) return;
        // reverseZOrder: layer[0]=near camera, layer[N]=far (tree-depth, custom-lock)
        // normal:        layer[0]=far,          layer[N]=near (DC mode)
        const z = reverseZOrder
          ? startZ + (layers.length - 1 - i) * spacing
          : startZ + i * spacing;
        group.children.forEach((child) => {
          if (child.userData?.isTexPlane) child.position.set(0, 0, z);
          else if (child.userData?.isFallback) child.position.set(0, 0, z - 0.01);
          else if ((child as THREE.Line).isLine) child.position.set(0, 0, z);
          else if ((child as THREE.Sprite).isSprite) {
            if (child.scale.y > 0.3) child.position.set(w / 2 + 2.2, 0, z);
            else child.position.set(w / 2 + 2.2, -0.5, z);
          }
        });
      });
      return;
    }
    prevFingerprintRef.current = layerFingerprint;

    // Clean up old groups
    for (const [, group] of layerGroupsRef.current) {
      scene.remove(group);
      group.traverse((obj) => {
        if ((obj as any).geometry) (obj as any).geometry.dispose();
        if ((obj as any).material) {
          const mat = (obj as any).material;
          if (mat.map && !mat.userData?.isCapture) mat.map.dispose();
          mat.dispose();
        }
      });
    }
    layerGroupsRef.current.clear();

    // Dispose stale texture cache entries
    const currentLayerIds = new Set(layers.map((l) => l.id));
    for (const [id, entry] of texCacheRef.current) {
      if (!currentLayerIds.has(id)) {
        entry.threeTex.dispose();
        texCacheRef.current.delete(id);
      }
    }


    if (layers.length === 0) return;

    const spacing = layerSpacing / 10;
    const totalHeight = (layers.length - 1) * spacing;
    const startZ = -totalHeight / 2;

    layers.forEach((layer, i) => {
      const group = new THREE.Group();
      group.userData = { layerId: layer.id, layerIndex: i };
      const z = reverseZOrder
        ? startZ + (layers.length - 1 - i) * spacing
        : startZ + i * spacing;

      // Textured plane
      const geo = new THREE.PlaneGeometry(w, h);
      const existingEntry = texCacheRef.current.get(layer.id);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: existingEntry?.threeTex ?? null,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const texPlane = new THREE.Mesh(geo, mat);
      texPlane.position.set(0, 0, z);
      texPlane.userData = { layerId: layer.id, isTexPlane: true };
      group.add(texPlane);

      // Fallback tinted plane
      const fallbackGeo = new THREE.PlaneGeometry(w, h);
      const fallbackMat = new THREE.MeshBasicMaterial({
        color: hexToThree(layer.color),
        transparent: true,
        opacity: existingEntry ? 0 : 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
      fallback.position.set(0, 0, z - 0.01);
      fallback.userData = { isFallback: true };
      group.add(fallback);

      const outline = createLayerOutline(w, h, layer.color);
      outline.position.set(0, 0, z);
      group.add(outline);

      const label = createLabelSprite(layer.label, layer.color);
      label.position.set(w / 2 + 2.2, 0, z);
      group.add(label);

      const countLabel = createLabelSprite(
        `${layer.slots.length} slot${layer.slots.length !== 1 ? 's' : ''}`,
        '#888',
      );
      countLabel.position.set(w / 2 + 2.2, -0.5, z);
      countLabel.scale.set(2.5, 0.25, 1);
      group.add(countLabel);

      scene.add(group);
      layerGroupsRef.current.set(layer.id, group);
    });

    // Reposition camera
    if (cameraRef.current && controlsRef.current) {
      const maxDim = Math.max(w, h, totalHeight);
      cameraRef.current.position.set(maxDim * 1.2, maxDim * 0.8, maxDim * 1.5);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [layers, layerSpacing, layerFingerprint, planeSize, reverseZOrder]);

  /* ── Hover / isolation visuals ────────────────────────────────── */
  useEffect(() => {
    for (const [layerId, group] of layerGroupsRef.current) {
      const isHovered = layerId === hoveredLayerId;
      const isIsolated = isolatedLayerId === null || layerId === isolatedLayerId;

      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.userData?.isTexPlane) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = !isIsolated ? 0.08 : isHovered ? 1.0 : 0.92;
        }
        if ((obj as THREE.Mesh).isMesh && obj.userData?.isFallback) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = isIsolated ? (texCacheRef.current.has(layerId) ? 0 : 0.18) : 0.03;
        }
        if ((obj as THREE.Sprite).isSprite) {
          (obj as THREE.Sprite).material.opacity = isIsolated ? 1 : 0.15;
        }
      });
      group.visible = true;
    }
  }, [hoveredLayerId, isolatedLayerId, layers]);

  /* ── Raycasting for hover / click ─────────────────────────────── */
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!renderer || !camera || !scene) return;
    const canvas = renderer.domElement;

    function getLayerIdFromIntersect(intersects: THREE.Intersection[]): string | null {
      for (const hit of intersects) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          if (obj.userData?.layerId) return obj.userData.layerId;
          obj = obj.parent;
        }
      }
      return null;
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera!);
      const intersects = raycasterRef.current.intersectObjects(scene!.children, true);
      onHoverLayer(getLayerIdFromIntersect(intersects));
    }

    function onClick(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera!);
      const intersects = raycasterRef.current.intersectObjects(scene!.children, true);
      const id = getLayerIdFromIntersect(intersects);
      onIsolateLayer(id === isolatedLayerId ? null : id);
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [onHoverLayer, onIsolateLayer, isolatedLayerId]);

  return (
    <div
      ref={containerRef}
      className="zslice-three-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
