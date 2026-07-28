import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Play, Pause, Plus, Trash2, Layers, Repeat } from "lucide-react";
import { Physics, type Spine } from "@esotericsoftware/spine-pixi-v8";
import { Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import type {
  TimelineRow,
  TimelineEffect,
} from "@xzdarcy/timeline-engine";

import { useSkeletonStore } from "@/entities/skeleton";
import {
  useMixerStore,
  usePlaybackStore,
  type MixerClip,
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
import { animationColor } from "./colors";
import "./timeline-theme.css";

const MIN_CLIP_SEC = 0.06;
const MAX_TRACKS = 6;
const SCALE_SEC = 1;
const SCALE_WIDTH = 130;
const ROW_HEIGHT = 34;
const ADD = "__add__";

/**
 * Track mixer, as a bottom timeline. Each row is a Spine track (0 = base);
 * each clip places one animation at a start time for its locked real
 * duration. The playhead drives the live AnimationState: as it crosses a
 * clip, that animation is set on its track at the matching trackTime, so
 * playing or scrubbing the timeline previews the layered result on stage.
 */
export function MixerTool() {
  const navigate = useNavigate();
  const spine = useSkeletonStore((s) => s.spine);
  const status = useSkeletonStore((s) => s.status);

  const clips = useMixerStore((s) => s.clips);
  const trackCount = useMixerStore((s) => s.trackCount);
  const playing = useMixerStore((s) => s.playing);
  const speed = useMixerStore((s) => s.speed);
  const loop = useMixerStore((s) => s.loop);

  const [shown, setShown] = useState(false);
  const [activeTrack, setActiveTrack] = useState(0);
  const [addKey, setAddKey] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // react-timeline-editor needs concrete pixel width AND height (its
  // virtualized grid collapses to 0 under "100%"), so we measure the box
  const [area, setArea] = useState({ w: 600, h: 240 });
  const areaRef = useRef<HTMLDivElement>(null);

  const timelineRef = useRef<TimelineState>(null);
  const spineRef = useRef<Spine | null>(spine);
  spineRef.current = spine;
  // track index -> id of the clip currently set on that spine track
  const currentRef = useRef(new Map<number, string>());
  // clip id -> clip, kept current so the (stable) effect callbacks resolve it
  const metaRef = useRef(new Map<string, MixerClip>());
  metaRef.current = new Map(clips.map((c) => [c.id, c]));

  const animations = useMemo(
    () => spine?.skeleton.data.animations.map((a) => a.name) ?? [],
    [spine],
  );
  /** timeline length = the end of the last clip. */
  const total = useMemo(
    () => clips.reduce((m, c) => Math.max(m, c.startSec + c.durationSec), 0),
    [clips],
  );
  const durOf = useCallback(
    (name: string): number => {
      const a = spine?.skeleton.data.animations.find((x) => x.name === name);
      return Math.max(MIN_CLIP_SEC, a?.duration ?? 0);
    },
    [spine],
  );

  /** Push the live pose to the canvas immediately (snappy scrub when paused). */
  const flush = useCallback(() => {
    const sp = spineRef.current;
    if (!sp) return;
    sp.state.apply(sp.skeleton);
    sp.skeleton.updateWorldTransform(Physics.update);
  }, []);

  /**
   * The skeleton is driven from the effect callbacks the engine fires as the
   * playhead crosses each clip (this is also what makes the engine treat the
   * clips as runnable, so play() actually advances). Stable across renders;
   * the latest clip data comes from metaRef.
   */
  const EFFECTS = useMemo<Record<string, TimelineEffect>>(() => {
    const setClip = ({
      action,
      time,
    }: {
      action: { id: string };
      time: number;
    }) => {
      const sp = spineRef.current;
      const clip = metaRef.current.get(action.id);
      if (!sp || !clip) return;
      const { trackIndex } = clip;
      if (currentRef.current.get(trackIndex) !== action.id) {
        sp.state.setAnimation(trackIndex, clip.animation, false);
        currentRef.current.set(trackIndex, action.id);
      }
      const entry = sp.state.tracks[trackIndex];
      if (entry) {
        entry.trackTime = Math.max(0, time - clip.startSec);
        entry.alpha = 1;
      }
      flush();
    };
    const clearClip = ({ action }: { action: { id: string } }) => {
      const sp = spineRef.current;
      const clip = metaRef.current.get(action.id);
      if (!sp || !clip) return;
      if (currentRef.current.get(clip.trackIndex) === action.id) {
        sp.state.clearTrack(clip.trackIndex);
        currentRef.current.delete(clip.trackIndex);
        flush();
      }
    };
    return {
      spine: { id: "spine", source: { enter: setClip, update: setClip, leave: clearClip } },
    };
  }, [flush]);

  /** Re-evaluate the timeline at the current time (drives the skeleton after edits). */
  const refresh = useCallback(() => {
    const ts = timelineRef.current;
    if (ts) ts.setTime(ts.getTime());
  }, []);

  // slide in
  useEffect(() => {
    const t = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  // keep the timeline sized to its container
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0)
        setArea((prev) =>
          prev.w === w && prev.h === h ? prev : { w, h },
        );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // redirect out if no skeleton
  useEffect(() => {
    if (status !== "ready" || !spine) navigate("/", { replace: true });
  }, [status, spine, navigate]);

  // per-skeleton init: freeze AnimationState, seed a base clip, apply at 0
  const initedFor = useRef<Spine | null>(null);
  useEffect(() => {
    if (status !== "ready" || !spine || initedFor.current === spine) return;
    initedFor.current = spine;
    spine.state.timeScale = 0;
    spine.state.clearTracks();
    spine.skeleton.setToSetupPose();
    currentRef.current.clear();

    const st = useMixerStore.getState();
    if (st.clips.length === 0) {
      const pb = usePlaybackStore.getState();
      const first =
        pb.selectedAnimation ?? spine.skeleton.data.animations[0]?.name ?? null;
      if (first) {
        st.addClip({
          id: st.allocId(),
          animation: first,
          trackIndex: 0,
          startSec: 0,
          durationSec: durOf(first),
        });
      }
    }
    // re-evaluate at 0 on the next tick, once the seeded clip is in editorData
    window.setTimeout(() => timelineRef.current?.setTime(0), 0);
  }, [spine, status, durOf]);

  // restore normal playback when leaving the mixer
  useEffect(() => {
    return () => {
      const sp = spineRef.current;
      if (!sp) return;
      const pb = usePlaybackStore.getState();
      sp.state.clearTracks();
      sp.skeleton.setToSetupPose();
      if (pb.selectedAnimation) {
        sp.state.setAnimation(0, pb.selectedAnimation, pb.loop);
        sp.state.timeScale = pb.isPlaying ? pb.speed : 0;
      } else {
        sp.state.timeScale = 1;
      }
    };
  }, []);

  // reflect the playhead position in the readout (playback + scrub)
  useEffect(() => {
    const ts = timelineRef.current;
    if (!ts) return;
    const onTime = (e: { time: number }) => setCurrentTime(e.time);
    ts.listener.on("setTimeByTick", onTime);
    ts.listener.on("afterSetTime", onTime);
    return () => {
      ts.listener.off("setTimeByTick", onTime);
      ts.listener.off("afterSetTime", onTime);
    };
  }, []);

  // loop at the end of the timeline
  useEffect(() => {
    const ts = timelineRef.current;
    if (!ts) return;
    const onEnded = () => {
      const st = useMixerStore.getState();
      if (st.loop && st.clips.length > 0) {
        // defer the restart so a degenerate (near-zero length) timeline
        // can't recurse end -> play -> end synchronously
        ts.setTime(0);
        window.setTimeout(() => ts.play({ autoEnd: true }), 0);
      } else {
        st.setPlaying(false);
      }
    };
    ts.listener.on("ended", onEnded);
    return () => {
      ts.listener.off("ended", onEnded);
    };
  }, []);

  const editorData = useMemo<TimelineRow[]>(() => {
    const rows: TimelineRow[] = [];
    for (let i = 0; i < trackCount; i++) {
      rows.push({
        id: `track-${i}`,
        actions: clips
          .filter((c) => c.trackIndex === i)
          .map((c) => ({
            id: c.id,
            start: c.startSec,
            end: c.startSec + c.durationSec,
            effectId: "spine",
            movable: true,
            flexible: false,
          })),
        classNames: i === activeTrack ? ["mixer-row-active"] : [],
      });
    }
    return rows;
  }, [clips, trackCount, activeTrack]);

  if (status !== "ready" || !spine) return null;

  const close = () => navigate("/");

  const togglePlay = () => {
    const ts = timelineRef.current;
    if (!ts) return;
    if (playing) {
      ts.pause();
      useMixerStore.getState().setPlaying(false);
    } else {
      if (clips.length === 0) return; // nothing to play
      ts.setPlayRate(speed);
      const started = ts.play({ autoEnd: true });
      if (started) useMixerStore.getState().setPlaying(true);
    }
  };
  const onSpeed = (v: number) => {
    useMixerStore.getState().setSpeed(v);
    timelineRef.current?.setPlayRate(v);
  };
  const onAddClip = (name: string) => {
    const st = useMixerStore.getState();
    const dur = durOf(name);
    const onTrack = st.clips.filter((c) => c.trackIndex === activeTrack);
    const start = onTrack.reduce(
      (max, c) => Math.max(max, c.startSec + c.durationSec),
      0,
    );
    st.addClip({
      id: st.allocId(),
      animation: name,
      trackIndex: activeTrack,
      startSec: start,
      durationSec: dur,
    });
    setAddKey((k) => k + 1);
    refresh();
  };
  const onAddTrack = () => {
    if (trackCount >= MAX_TRACKS) return;
    useMixerStore.getState().addTrack();
    setActiveTrack(trackCount);
  };
  const onRemoveTrack = () => {
    if (trackCount <= 1) return;
    const sp = spineRef.current;
    if (sp) {
      sp.state.clearTrack(activeTrack);
      currentRef.current.delete(activeTrack);
    }
    useMixerStore.getState().removeTrack(activeTrack);
    setActiveTrack((t) => Math.min(t, trackCount - 2));
    refresh();
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute inset-x-4 bottom-4 z-30 flex h-[44vh] flex-col rounded-2xl border border-border bg-card/85 shadow-2xl backdrop-blur-md transition-transform duration-300 ease-out",
        shown ? "translate-y-0" : "translate-y-[120%]",
      )}
    >
      {/* header + transport */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          <span className="text-sm font-medium">Timeline mixer</span>
        </div>

        <Button
          size="icon-sm"
          variant={playing ? "default" : "secondary"}
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Toggle
          size="sm"
          pressed={loop}
          onPressedChange={(v) => useMixerStore.getState().setLoop(v)}
          aria-label="Loop"
          title="Loop the timeline"
        >
          <Repeat className="size-3.5" />
        </Toggle>

        <span className="text-xs text-muted-foreground">Speed</span>
        <Slider
          value={[speed]}
          min={0.1}
          max={2}
          step={0.1}
          onValueChange={(v) => onSpeed(v[0])}
          className="w-28"
        />
        <span className="w-8 text-xs tabular-nums text-muted-foreground">
          {speed.toFixed(1)}x
        </span>

        <span className="ml-1 rounded-md bg-secondary/50 px-2 py-1 text-xs tabular-nums text-muted-foreground">
          {currentTime.toFixed(2)}
          <span className="text-muted-foreground/50"> / {total.toFixed(2)}s</span>
        </span>

        <span className="flex-1" />
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* edit toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">Track</span>
        <Select
          value={String(activeTrack)}
          onValueChange={(v) => setActiveTrack(Number(v))}
        >
          <SelectTrigger size="sm" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: trackCount }, (_, i) => (
              <SelectItem key={i} value={String(i)}>
                {i === 0 ? "0 base" : i}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select key={addKey} value={ADD} onValueChange={onAddClip}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Add animation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ADD} disabled>
              Add animation...
            </SelectItem>
            {animations.map((name) => (
              <SelectItem key={name} value={name}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: animationColor(name) }}
                  />
                  {name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="secondary"
          onClick={onAddTrack}
          disabled={trackCount >= MAX_TRACKS}
        >
          <Plus /> Track
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemoveTrack}
          disabled={trackCount <= 1}
          title="Remove the selected track"
        >
          <Trash2 className="size-3.5" />
        </Button>

        <span className="flex-1" />
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          drag clips to move &middot; right-click a clip to delete &middot; click
          a track to select
        </span>
      </div>

      {/* timeline */}
      <div
        ref={areaRef}
        className="mixer-timeline min-h-0 flex-1 overflow-hidden p-2"
        style={{ ["--mixer-row-h" as string]: `${ROW_HEIGHT}px` }}
      >
        <Timeline
          ref={timelineRef}
          editorData={editorData}
          effects={EFFECTS}
          scale={SCALE_SEC}
          scaleWidth={SCALE_WIDTH}
          startLeft={14}
          rowHeight={ROW_HEIGHT}
          autoScroll
          dragLine
          autoReRender
          style={{
            width: Math.max(320, area.w - 16),
            height: Math.max(120, area.h - 16),
          }}
          getActionRender={(action) => {
            const name = metaRef.current.get(action.id)?.animation ?? "";
            return (
              <div
                title={`${name} - drag to move, right-click to delete`}
                className="flex h-full items-center overflow-hidden rounded-md border border-white/20 px-1.5"
                style={{ background: animationColor(name) }}
              >
                <span className="truncate text-[11px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
                  {name}
                </span>
              </div>
            );
          }}
          onClickRow={(_e, { row }) =>
            setActiveTrack(Number(row.id.split("-")[1]))
          }
          onContextMenuAction={(e, { action }) => {
            e.preventDefault();
            const st = useMixerStore.getState();
            st.removeClip(action.id);
            currentRef.current.forEach((id, tr) => {
              if (id === action.id) {
                spineRef.current?.state.clearTrack(tr);
                currentRef.current.delete(tr);
              }
            });
            refresh();
          }}
          onActionMoving={({ action, row, start, end }) => {
            if (start < 0) return false;
            for (const a of row.actions) {
              if (a.id === action.id) continue;
              if (start < a.end && end > a.start) return false;
            }
            return undefined;
          }}
          onChange={(rows) => {
            const next = new Map<string, { start: number; track: number }>();
            rows.forEach((row, i) =>
              row.actions.forEach((a) => next.set(a.id, { start: a.start, track: i })),
            );
            const st = useMixerStore.getState();
            st.setClips(
              st.clips.map((c) => {
                const u = next.get(c.id);
                return u
                  ? { ...c, startSec: u.start, trackIndex: u.track }
                  : c;
              }),
            );
            refresh();
            return undefined;
          }}
        />
      </div>
    </div>
  );
}
