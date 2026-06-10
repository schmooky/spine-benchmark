import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Play, Pause, Plus, Trash2, Layers } from "lucide-react";
import type { Spine } from "@esotericsoftware/spine-pixi-v8";

import { useSkeletonStore } from "@/entities/skeleton";
import {
  useMixerStore,
  usePlaybackStore,
  type MixerTrack,
} from "@/entities/playback";
import { Button } from "@/shared/ui/button";
import { Toggle } from "@/shared/ui/toggle";
import { Slider } from "@/shared/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";

const NONE = "__none__";
const MAX_TRACKS = 6;

function applyAnim(sp: Spine, t: MixerTrack): void {
  if (t.animation) {
    const entry = sp.state.setAnimation(t.index, t.animation, t.loop);
    entry.alpha = t.alpha;
  } else {
    sp.state.clearTrack(t.index);
  }
}

/**
 * Track mixer - layer animations on separate Spine tracks and watch them blend.
 * Track 0 is the base; higher tracks mix on top by their alpha. Drives the live
 * AnimationState directly. While this tool is open the single-track transport is
 * hidden (it would fight over track 0).
 */
export function MixerTool() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const tracks = useMixerStore((s) => s.tracks);
  const playing = useMixerStore((s) => s.playing);
  const speed = useMixerStore((s) => s.speed);

  const [shown, setShown] = useState(false);
  const animations = useMemo(
    () => spine?.skeleton.data.animations.map((a) => a.name) ?? [],
    [spine],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== "ready" || !spine) navigate("/", { replace: true });
  }, [status, spine, navigate]);

  // sync the spine to the mixer state once per skeleton
  const initedFor = useRef<Spine | null>(null);
  useEffect(() => {
    if (status !== "ready" || !spine || initedFor.current === spine) return;
    initedFor.current = spine;
    const store = useMixerStore.getState();
    let trks = store.tracks;
    if (trks.length === 0) {
      const pb = usePlaybackStore.getState();
      trks = [
        {
          id: store.allocId(),
          index: 0,
          animation: pb.selectedAnimation,
          loop: pb.loop,
          alpha: 1,
        },
      ];
      store.setTracks(trks);
    }
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
    for (const t of trks) applyAnim(spine, t);
    spine.state.timeScale = store.playing ? store.speed : 0;
  }, [spine, status]);

  if (status !== "ready" || !spine) return null;

  const close = () => navigate("/");
  const store = useMixerStore.getState;

  const onAnim = (id: number, value: string) => {
    const animation = value === NONE ? null : value;
    const t = store().tracks.find((x) => x.id === id);
    useMixerStore.getState().updateTrack(id, { animation });
    if (t) applyAnim(spine, { ...t, animation });
  };
  const onLoop = (id: number, loop: boolean) => {
    const t = store().tracks.find((x) => x.id === id);
    useMixerStore.getState().updateTrack(id, { loop });
    if (t) applyAnim(spine, { ...t, loop }); // restarts that track
  };
  const onAlpha = (id: number, alpha: number) => {
    useMixerStore.getState().updateTrack(id, { alpha });
    const t = store().tracks.find((x) => x.id === id);
    if (t) {
      const entry = spine.state.tracks[t.index];
      if (entry) entry.alpha = alpha; // live, no restart
    }
  };
  const onAdd = () => {
    const s = store();
    const index = s.tracks.length
      ? Math.max(...s.tracks.map((t) => t.index)) + 1
      : 0;
    useMixerStore
      .getState()
      .addTrack({ id: s.allocId(), index, animation: null, loop: true, alpha: 1 });
  };
  const onRemove = (id: number) => {
    const t = store().tracks.find((x) => x.id === id);
    if (t) spine.state.clearTrack(t.index);
    useMixerStore.getState().removeTrack(id);
  };
  const togglePlay = () => {
    const next = !playing;
    useMixerStore.getState().setPlaying(next);
    spine.state.timeScale = next ? speed : 0;
  };
  const onSpeed = (v: number) => {
    useMixerStore.getState().setSpeed(v);
    if (playing) spine.state.timeScale = v;
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-4 top-4 bottom-4 z-30 flex w-80 flex-col rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
        shown ? "translate-x-0" : "translate-x-[120%]",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <span className="text-sm font-medium">Track mixer</span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* global transport */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Button
          size="icon-sm"
          variant={playing ? "default" : "secondary"}
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <span className="text-xs text-muted-foreground">Speed</span>
        <Slider
          value={[speed]}
          min={0.1}
          max={2}
          step={0.1}
          onValueChange={(v) => onSpeed(v[0])}
          className="flex-1"
        />
        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
          {speed.toFixed(1)}x
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-2">
          {tracks.length === 0 && (
            <p className="px-1 py-4 text-center text-sm text-muted-foreground">
              No tracks. Add one to start layering.
            </p>
          )}

          {tracks.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-border bg-secondary/30 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Track {t.index}
                  {t.index === 0 && (
                    <span className="ml-1 text-muted-foreground/60">base</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(t.id)}
                  aria-label={`Remove track ${t.index}`}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={t.animation ?? NONE}
                  onValueChange={(v) => onAnim(t.id, v)}
                >
                  <SelectTrigger size="sm" className="flex-1">
                    <SelectValue placeholder="Animation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {animations.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Toggle
                  size="sm"
                  pressed={t.loop}
                  onPressedChange={(v) => onLoop(t.id, v)}
                  aria-label="Loop"
                  title="Loop"
                  className="shrink-0"
                >
                  <span className="text-[11px]">loop</span>
                </Toggle>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="w-10 text-[11px] text-muted-foreground">
                  alpha
                </span>
                <Slider
                  value={[t.alpha]}
                  min={0}
                  max={1}
                  step={0.05}
                  onValueChange={(v) => onAlpha(t.id, v[0])}
                  disabled={!t.animation}
                  className="flex-1"
                />
                <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                  {t.alpha.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={onAdd}
          disabled={tracks.length >= MAX_TRACKS}
        >
          <Plus /> Add track
        </Button>
      </div>
    </div>
  );
}
