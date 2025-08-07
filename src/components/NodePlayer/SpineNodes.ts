import { ClassicPreset } from "rete";
import { Spine } from '@esotericsoftware/spine-pixi-v8';

const socket = new ClassicPreset.Socket("socket");

export interface SpineNodeContext {
  spineInstance: Spine | null;
  log: (text: string) => void;
}

// Custom dropdown control for animation selection
export class AnimationDropdownControl extends ClassicPreset.Control {
  constructor(
    public value: string,
    public options: string[],
    public onChange?: (value: string) => void
  ) {
    super();
  }
}

// Custom checkbox control for loop option
export class LoopCheckboxControl extends ClassicPreset.Control {
  constructor(
    public value: boolean,
    public onChange?: (value: boolean) => void
  ) {
    super();
  }
}

// Start Node - Entry point for the flow
export class StartNode extends ClassicPreset.Node<{}, { exec: ClassicPreset.Socket }, {}> {
  width = 180;
  height = 90;

  constructor() {
    super("Start");
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
  }

  execute(_: never, forward: (output: "exec") => void) {
    forward("exec");
  }
}

// Set Animation Node - Sets an animation on a specific track
export class SetAnimationNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {
    track: ClassicPreset.InputControl<"number">;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
    mixDuration: ClassicPreset.InputControl<"number">;
  }
> {
  width = 220;
  height = 200;

  constructor(
    private context: SpineNodeContext,
    track: number = 0,
    animation: string = "",
    loop: boolean = true,
    mixDuration: number = 0.2
  ) {
    super("Set Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Get available animations from spine instance
    const availableAnimations = this.context.spineInstance
      ? this.context.spineInstance.skeleton.data.animations.map(anim => anim.name)
      : [];
    
    // Add controls after exec pins
    this.addControl("track", new ClassicPreset.InputControl("number", {
      initial: track,
      readonly: false
    }));
    
    this.addControl("animation", new AnimationDropdownControl(
      animation || (availableAnimations.length > 0 ? availableAnimations[0] : ""),
      availableAnimations,
      (value: string) => {
        this.controls.animation.value = value;
      }
    ));
    
    this.addControl("loop", new LoopCheckboxControl(
      loop,
      (value: boolean) => {
        this.controls.loop.value = value;
      }
    ));
    
    this.addControl("mixDuration", new ClassicPreset.InputControl("number", {
      initial: mixDuration,
      readonly: false
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.context.spineInstance) {
      this.context.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = this.controls.loop.value as boolean;
    const mixDuration = this.controls.mixDuration.value as number;

    try {
      // Set the animation on the specified track
      const entry = this.context.spineInstance.state.setAnimation(track, animationName, loop);
      
      if (entry && mixDuration > 0) {
        entry.mixDuration = mixDuration;
      }
      
      this.context.log(`Set animation "${animationName}" on track ${track} (loop: ${loop})`);
      forward("exec");
    } catch (error) {
      this.context.log(`Error setting animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Add Animation Node - Adds an animation to the queue after current
export class AddAnimationNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {
    track: ClassicPreset.InputControl<"number">;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
    delay: ClassicPreset.InputControl<"number">;
  }
> {
  width = 220;
  height = 180;

  constructor(
    private context: SpineNodeContext,
    track: number = 0,
    animation: string = "",
    loop: boolean = false,
    delay: number = 0
  ) {
    super("Add Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Get available animations from spine instance
    const availableAnimations = this.context.spineInstance
      ? this.context.spineInstance.skeleton.data.animations.map(anim => anim.name)
      : [];
    
    // Add controls after exec pins
    this.addControl("track", new ClassicPreset.InputControl("number", {
      initial: track,
      readonly: false
    }));
    
    this.addControl("animation", new AnimationDropdownControl(
      animation || (availableAnimations.length > 1 ? availableAnimations[1] : availableAnimations[0] || ""),
      availableAnimations,
      (value: string) => {
        this.controls.animation.value = value;
      }
    ));
    
    this.addControl("loop", new LoopCheckboxControl(
      loop,
      (value: boolean) => {
        this.controls.loop.value = value;
      }
    ));
    
    this.addControl("delay", new ClassicPreset.InputControl("number", {
      initial: delay,
      readonly: false
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.context.spineInstance) {
      this.context.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = this.controls.loop.value as boolean;
    const delay = this.controls.delay.value as number;

    try {
      // Add the animation to the queue
      const entry = this.context.spineInstance.state.addAnimation(track, animationName, loop, delay);
      
      this.context.log(`Added animation "${animationName}" to track ${track} queue (loop: ${loop}, delay: ${delay}s)`);
      forward("exec");
    } catch (error) {
      this.context.log(`Error adding animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Wait Node - Delays execution for a specified duration
export class WaitNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { duration: ClassicPreset.InputControl<"number"> }
> {
  width = 180;
  height = 120;

  constructor(private context: SpineNodeContext, duration: number = 1) {
    super("Wait");
    
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    this.addControl("duration", new ClassicPreset.InputControl("number", { 
      initial: duration,
      readonly: false 
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    const duration = this.controls.duration.value as number;
    
    this.context.log(`Waiting ${duration} seconds...`);
    
    setTimeout(() => {
      this.context.log(`Wait completed`);
      forward("exec");
    }, duration * 1000);
  }
}

// Set Mix Duration Node - Sets mix duration between two animations
export class SetMixNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { 
    fromAnimation: ClassicPreset.InputControl<"text">;
    toAnimation: ClassicPreset.InputControl<"text">;
    duration: ClassicPreset.InputControl<"number">;
  }
> {
  width = 220;
  height = 160;

  constructor(
    private context: SpineNodeContext,
    fromAnimation: string = "",
    toAnimation: string = "",
    duration: number = 0.2
  ) {
    super("Set Mix");
    
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    this.addControl("fromAnimation", new ClassicPreset.InputControl("text", { 
      initial: fromAnimation,
      readonly: false 
    }));
    this.addControl("toAnimation", new ClassicPreset.InputControl("text", { 
      initial: toAnimation,
      readonly: false 
    }));
    this.addControl("duration", new ClassicPreset.InputControl("number", { 
      initial: duration,
      readonly: false 
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.context.spineInstance) {
      this.context.log("Error: No Spine instance available");
      return;
    }

    const fromAnimation = this.controls.fromAnimation.value as string;
    const toAnimation = this.controls.toAnimation.value as string;
    const duration = this.controls.duration.value as number;

    try {
      // Set mix duration in the animation state data
      this.context.spineInstance.state.data.setMix(fromAnimation, toAnimation, duration);
      
      this.context.log(`Set mix duration from "${fromAnimation}" to "${toAnimation}": ${duration}s`);
      forward("exec");
    } catch (error) {
      this.context.log(`Error setting mix: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Clear Track Node - Clears a specific track
export class ClearTrackNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { track: ClassicPreset.InputControl<"number"> }
> {
  width = 180;
  height = 120;

  constructor(private context: SpineNodeContext, track: number = 0) {
    super("Clear Track");
    
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    this.addControl("track", new ClassicPreset.InputControl("number", { 
      initial: track,
      readonly: false 
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.context.spineInstance) {
      this.context.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;

    try {
      this.context.spineInstance.state.clearTrack(track);
      this.context.log(`Cleared track ${track}`);
      forward("exec");
    } catch (error) {
      this.context.log(`Error clearing track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Log Node - Logs a message
export class LogNode extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { message: ClassicPreset.InputControl<"text"> }
> {
  width = 180;
  height = 120;

  constructor(private context: SpineNodeContext, message: string = "") {
    super("Log");
    
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    this.addControl("message", new ClassicPreset.InputControl("text", { 
      initial: message,
      readonly: false 
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    const message = this.controls.message.value as string;
    this.context.log(message);
    forward("exec");
  }
}

// Connection class for type safety
export class SpineConnection<
  A extends SpineNodeProps,
  B extends SpineNodeProps
> extends ClassicPreset.Connection<A, B> {
  isLoop?: boolean;
}

// Union type for all node types
export type SpineNodeProps = 
  | StartNode 
  | SetAnimationNode 
  | AddAnimationNode 
  | WaitNode 
  | SetMixNode 
  | ClearTrackNode 
  | LogNode;

// Union type for all connection types
export type SpineConnProps = ClassicPreset.Connection<SpineNodeProps, SpineNodeProps>;