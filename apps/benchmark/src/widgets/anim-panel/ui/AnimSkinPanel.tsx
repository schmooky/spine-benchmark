import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Play, Pause, Square, Repeat, Film } from "lucide-react";
import type { TrackEntry } from "@esotericsoftware/spine-pixi-v8";

import { useSkeletonStore } from "@/entities/skeleton";
import { usePlaybackStore } from "@/entities/playback";
import { Button } from "@/shared/ui/button";
import { Toggle } from "@/shared/ui/toggle";
import { Slider } from "@/shared/ui/slider";
import { Separator } from "@/shared/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";
import { SkinDialog } from "./SkinDialog";

/**
 * Top transport - slides in shortly after a skeleton is ready. Plays animations
 * (select / play-pause / stop / loop / speed) and switches skins. Drives the
 * spine's AnimationState directly and mirrors state into the playback store,
 * which resets to defaults whenever a new skeleton loads.
 */
export function AnimSkinPanel() {
  const status = useSkeletonStore((s) => s.status);
  const spine = useSkeletonStore((s) => s.spine);
  const { pathname } = useLocation();

  const selectedAnimation = usePlaybackStore((s) => s.selectedAnimation);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const loop = usePlaybackStore((s) => s.loop);
  const speed = usePlaybackStore((s) => s.speed);
  const pb = usePlaybackStore;

  // true once the active non-looping animation has played to its end, so the
  // transport knows to flip back to Play (and to restart, not resume, on Play)
  const finishedRef = useRef(false);

  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (status !== "ready") {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 450);
    return () => window.clearTimeout(t);
  }, [status]);

  // when a non-looping animation completes on its own, switch Pause -> Play
  useEffect(() => {
    if (!spine) return;
    const listener = {
      complete: (entry: TrackEntry) => {
        if (!entry.loop) {
          finishedRef.current = true;
          usePlaybackStore.getState().setPlaying(false);
        }
      },
    };
    spine.state.addListener(listener);
    return () => {
      spine.state.removeListener(listener);
    };
  }, [spine]);

  const animations = useMemo(
    () => spine?.skeleton.data.animations.map((a) => a.name) ?? [],
    [spine],
  );
  const skins = useMemo(
    () => spine?.skeleton.data.skins.map((s) => s.name) ?? [],
    [spine],
  );

  // the track mixer takes over multi-track playback; hide the single-track
  // transport while it's open so they don't fight over track 0
  if (status !== "ready" || !spine || pathname === "/mixer") return null;

  const playAnim = (name: string, withLoop: boolean, withSpeed: number) => {
    const sp = useSkeletonStore.getState().spine;
    if (!sp) return;
    sp.state.setAnimation(0, name, withLoop);
    sp.state.timeScale = withSpeed;
  };

  const onSelectAnim = (name: string) => {
    finishedRef.current = false;
    pb.getState().setSelectedAnimation(name);
    pb.getState().setPlaying(true);
    playAnim(name, loop, speed);
  };

  const togglePlay = () => {
    const sp = useSkeletonStore.getState().spine;
    if (!sp) return;
    if (isPlaying) {
      sp.state.timeScale = 0;
      pb.getState().setPlaying(false);
      return;
    }
    if (!selectedAnimation) {
      if (animations[0]) onSelectAnim(animations[0]);
      return;
    }
    if (finishedRef.current) {
      // the animation already ran to its end - Play restarts it
      finishedRef.current = false;
      playAnim(selectedAnimation, loop, speed);
      pb.getState().setPlaying(true);
      return;
    }
    sp.state.timeScale = speed;
    pb.getState().setPlaying(true);
  };

  const stop = () => {
    const sp = useSkeletonStore.getState().spine;
    if (!sp) return;
    finishedRef.current = false;
    sp.state.clearTracks();
    sp.skeleton.setToSetupPose();
    pb.getState().setPlaying(false);
    pb.getState().setSelectedAnimation(null);
  };

  const onLoop = (next: boolean) => {
    pb.getState().setLoop(next);
    const sp = useSkeletonStore.getState().spine;
    if (sp && selectedAnimation) {
      finishedRef.current = false;
      sp.state.setAnimation(0, selectedAnimation, next);
      sp.state.timeScale = isPlaying ? speed : 0;
    }
  };

  const onSpeed = (next: number) => {
    pb.getState().setSpeed(next);
    const sp = useSkeletonStore.getState().spine;
    if (sp && isPlaying) sp.state.timeScale = next;
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-1/2 top-4 z-30 -translate-x-1/2 transition-all duration-500 ease-out",
        shown ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0",
      )}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/80 px-3 py-2 shadow-2xl backdrop-blur-md">
        {/* animation */}
        <div className="flex items-center gap-2">
          <Film className="size-4 text-primary" />
          <Select value={selectedAnimation ?? ""} onValueChange={onSelectAnim}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Animation" />
            </SelectTrigger>
            <SelectContent>
              {animations.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="icon"
            variant={isPlaying ? "default" : "secondary"}
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={animations.length === 0}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={stop}
            aria-label="Stop and reset to setup pose"
          >
            <Square />
          </Button>
          <Toggle
            size="sm"
            pressed={loop}
            onPressedChange={onLoop}
            aria-label="Loop"
            title="Loop"
          >
            <Repeat className="size-4" />
          </Toggle>
        </div>

        {/* speed */}
        <div className="flex w-32 items-center gap-2">
          <span className="text-xs text-muted-foreground">Speed</span>
          <Slider
            value={[speed]}
            min={0.1}
            max={2}
            step={0.1}
            onValueChange={(v) => onSpeed(v[0])}
          />
          <span className="w-8 text-xs tabular-nums text-muted-foreground">
            {speed.toFixed(1)}x
          </span>
        </div>

        {skins.length > 0 && (
          <>
            <Separator orientation="vertical" className="!h-7" />
            <SkinDialog skins={skins} />
          </>
        )}
      </div>
    </div>
  );
}
