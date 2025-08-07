import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from "react-dom/client";
import { NodeEditor, GetSchemes, ClassicPreset } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets
} from "rete-connection-plugin";
import { ReactPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import {
  AutoArrangePlugin,
  Presets as ArrangePresets
} from "rete-auto-arrange-plugin";
import { ControlFlowEngine } from "rete-engine";
import {
  ContextMenuExtra,
  ContextMenuPlugin,
  Presets as ContextMenuPresets
} from "rete-context-menu-plugin";
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import './NodePlayer.css';

const socket = new ClassicPreset.Socket("socket");

// Custom control classes for dropdown and checkbox
class AnimationDropdownControl extends ClassicPreset.Control {
  constructor(
    public value: string,
    public options: string[],
    public onChange?: (value: string) => void
  ) {
    super();
  }
}

class TrackDropdownControl extends ClassicPreset.Control {
  constructor(
    public value: number,
    public onChange?: (value: number) => void
  ) {
    super();
  }
}

class LoopCheckboxControl extends ClassicPreset.Control {
  constructor(
    public value: boolean,
    public onChange?: (value: boolean) => void
  ) {
    super();
  }
}

// Simple node classes using ClassicPreset
class Start extends ClassicPreset.Node<{}, { exec: ClassicPreset.Socket }, {}> {
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
class SetAnimation extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {
    track: TrackDropdownControl;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
  }
> {
  width = 240;
  height = 220;

  constructor(
    private spineInstance: Spine | null,
    private log: (text: string) => void,
    track: number = 0,
    animation: string = "",
    loop: boolean = true,
    availableAnimations: string[] = []
  ) {
    super("Set Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Add controls after exec pins
    this.addControl("track", new TrackDropdownControl(
      track,
      (value: number) => {
        this.controls.track.value = value;
      }
    ));
    
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
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.spineInstance) {
      this.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = this.controls.loop.value as boolean;

    try {
      this.spineInstance.state.setAnimation(track, animationName, loop);
      this.log(`Set animation "${animationName}" on track ${track} (loop: ${loop})`);
      forward("exec");
    } catch (error) {
      this.log(`Error setting animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

class AddAnimation extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {
    track: TrackDropdownControl;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
    delay: ClassicPreset.InputControl<"number">;
  }
> {
  width = 240;
  height = 240;

  constructor(
    private spineInstance: Spine | null,
    private log: (text: string) => void,
    track: number = 0,
    animation: string = "",
    loop: boolean = false,
    delay: number = 0,
    availableAnimations: string[] = []
  ) {
    super("Add Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Add controls after exec pins
    this.addControl("track", new TrackDropdownControl(
      track,
      (value: number) => {
        this.controls.track.value = value;
      }
    ));
    
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
    if (!this.spineInstance) {
      this.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = this.controls.loop.value as boolean;
    const delay = this.controls.delay.value as number;

    try {
      this.spineInstance.state.addAnimation(track, animationName, loop, delay);
      this.log(`Added animation "${animationName}" to track ${track} queue (loop: ${loop}, delay: ${delay}s)`);
      forward("exec");
    } catch (error) {
      this.log(`Error adding animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

class Wait extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { duration: ClassicPreset.InputControl<"number"> }
> {
  width = 180;
  height = 120;

  constructor(private log: (text: string) => void, duration: number = 1) {
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
    
    this.log(`Waiting ${duration} seconds...`);
    
    setTimeout(() => {
      this.log(`Wait completed`);
      forward("exec");
    }, duration * 1000);
  }
}

class Log extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { message: ClassicPreset.InputControl<"text"> }
> {
  width = 180;
  height = 120;

  constructor(private log: (text: string) => void, message: string = "") {
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
    this.log(message);
    forward("exec");
  }
}

class ClearTrack extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { track: TrackDropdownControl }
> {
  width = 180;
  height = 120;

  constructor(
    private spineInstance: Spine | null,
    private log: (text: string) => void,
    track: number = 0
  ) {
    super("Clear Track");
    
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    this.addControl("track", new TrackDropdownControl(
      track,
      (value: number) => {
        this.controls.track.value = value;
      }
    ));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!this.spineInstance) {
      this.log("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;

    try {
      this.spineInstance.state.clearTrack(track);
      this.log(`Cleared track ${track}`);
      forward("exec");
    } catch (error) {
      this.log(`Error clearing track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

type NodeProps = Start | SetAnimation | AddAnimation | Wait | Log | ClearTrack;
type ConnProps = ClassicPreset.Connection<NodeProps, NodeProps>;
type Schemes = GetSchemes<NodeProps, ConnProps>;
type AreaExtra = ReactArea2D<any> | ContextMenuExtra;

interface NodePlayerProps {
  spineInstance: Spine | null;
  onClose: () => void;
}

export const NodePlayer: React.FC<NodePlayerProps> = ({ spineInstance, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NodeEditor<Schemes> | null>(null);
  const engineRef = useRef<ControlFlowEngine<any> | null>(null);
  const areaRef = useRef<AreaPlugin<Schemes, AreaExtra> | null>(null);
  const isInitializedRef = useRef(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);

  // Log function that adds messages to the log panel
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };

  // Get available animations from spine instance
  useEffect(() => {
    if (spineInstance) {
      const animations = spineInstance.skeleton.data.animations.map(anim => anim.name);
      setAvailableAnimations(animations);
      addLog(`Loaded Spine with ${animations.length} animations: ${animations.join(', ')}`);
    }
  }, [spineInstance]);

  // Store cleanup functions
  const cleanupFunctionsRef = useRef<(() => void)[]>([]);

  // Cleanup function
  const cleanup = () => {
    if (areaRef.current) {
      try {
        areaRef.current.destroy();
      } catch (error) {
        console.warn('Error destroying area:', error);
      }
      areaRef.current = null;
    }
    
    // Run all cleanup functions
    cleanupFunctionsRef.current.forEach(fn => fn());
    cleanupFunctionsRef.current = [];
    
    editorRef.current = null;
    engineRef.current = null;
    isInitializedRef.current = false;
  };

  // Initialize the node editor
  useEffect(() => {
    if (!containerRef.current || !spineInstance || isInitializedRef.current || availableAnimations.length === 0) return;

    // Clear container first
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    const initEditor = async () => {
      try {
        const editor = new NodeEditor<Schemes>();
        const area = new AreaPlugin<Schemes, AreaExtra>(containerRef.current!);
        const connection = new ConnectionPlugin<any, any>();
        const render = new ReactPlugin<any, any>({ createRoot });
        const arrange = new AutoArrangePlugin<any>();
        const engine = new ControlFlowEngine<any>();
        
        // Store selector reference for deletion
        let selectorPlugin: any = null;
        
        // Delete functionality
        const deleteSelectedNodes = async () => {
          if (!selectorPlugin) {
            addLog("Error: Selector not available");
            return;
          }
          
          const selectedNodes = Array.from(selectorPlugin.entities || []);
          
          if (selectedNodes.length === 0) {
            addLog("No nodes selected for deletion");
            return;
          }
          
          for (const nodeId of selectedNodes) {
            try {
              // The selector returns an array where first element is the node ID
              let rawNodeId: string;
              if (typeof nodeId === 'string') {
                rawNodeId = nodeId;
              } else if (Array.isArray(nodeId) && nodeId.length > 0) {
                // First element of the array is the node ID
                rawNodeId = nodeId[0];
              } else if (nodeId && typeof nodeId === 'object') {
                // Fallback for other object types
                rawNodeId = (nodeId as any).id || (nodeId as any).nodeId || String(nodeId);
              } else {
                rawNodeId = String(nodeId);
              }
              
              // Remove "node_" prefix if present, as editor stores IDs without it
              const nodeIdStr = rawNodeId.startsWith('node_') ? rawNodeId.substring(5) : rawNodeId;
              
              const node = editor.getNode(nodeIdStr);
              if (node) {
                // Remove all connections to/from this node
                const connections = editor.getConnections();
                for (const connection of connections) {
                  if (connection.source === nodeIdStr || connection.target === nodeIdStr) {
                    await editor.removeConnection(connection.id);
                  }
                }
                // Remove the node
                await editor.removeNode(nodeIdStr);
                addLog(`Deleted node: ${node.label}`);
              } else {
                addLog(`Node not found with ID: ${nodeIdStr}`);
              }
            } catch (error) {
              addLog(`Error deleting node: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        };
        
        const contextMenu = new ContextMenuPlugin<Schemes>({
          items: ContextMenuPresets.classic.setup([
            ["Start", () => new Start()],
            ["Set Animation", () => new SetAnimation(spineInstance, addLog, 0, "", true, availableAnimations)],
            ["Add Animation", () => new AddAnimation(spineInstance, addLog, 0, "", false, 0, availableAnimations)],
            ["Wait", () => new Wait(addLog)],
            ["Clear Track", () => new ClearTrack(spineInstance, addLog)],
            ["Log", () => new Log(addLog)]
          ])
        });

        area.use(contextMenu);

        // Setup selectable nodes and store selector reference
        selectorPlugin = AreaExtensions.selector();
        AreaExtensions.selectableNodes(area, selectorPlugin, {
          accumulating: AreaExtensions.accumulateOnCtrl()
        });

        // Custom control rendering
        render.addPreset(Presets.contextMenu.setup());
        render.addPreset(Presets.classic.setup({
          customize: {
            control(data) {
              if (data.payload instanceof AnimationDropdownControl) {
                const control = data.payload as AnimationDropdownControl;
                return () => React.createElement('div', {
                  className: 'custom-select-control',
                  style: { pointerEvents: 'auto', zIndex: 1000 },
                  // Comprehensive event prevention for all phases
                  onPointerDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onPointerUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onClick: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  // Capture phase event handling
                  onClickCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onMouseDownCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onPointerDownCapture: (e: any) => {
                    e.stopPropagation();
                  }
                }, [
                  React.createElement('label', { key: 'label' }, 'ANIMATION'),
                  React.createElement('select', {
                    key: 'select',
                    value: control.value,
                    style: { pointerEvents: 'auto', zIndex: 1001 },
                    // Comprehensive event prevention for select element
                    onPointerDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onPointerUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onClick: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onMouseDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onMouseUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    // Capture phase event handling
                    onClickCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onMouseDownCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onPointerDownCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onChange: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                      control.value = e.target.value;
                      if (control.onChange) {
                        control.onChange(e.target.value);
                      }
                    },
                    onFocus: (e: any) => {
                      e.stopPropagation();
                    },
                    onBlur: (e: any) => {
                      e.stopPropagation();
                    }
                  }, control.options.length === 0 ? [
                    React.createElement('option', { key: 'empty', value: '' }, 'No animations available')
                  ] : control.options.map((option: string) =>
                    React.createElement('option', { key: option, value: option }, option)
                  ))
                ]);
              }
              
              if (data.payload instanceof TrackDropdownControl) {
                const control = data.payload as TrackDropdownControl;
                const trackOptions = Array.from({ length: 16 }, (_, i) => i);
                return () => React.createElement('div', {
                  className: 'custom-select-control',
                  style: { pointerEvents: 'auto', zIndex: 1000 },
                  // Comprehensive event prevention for all phases
                  onPointerDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onPointerUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onClick: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  // Capture phase event handling
                  onClickCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onMouseDownCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onPointerDownCapture: (e: any) => {
                    e.stopPropagation();
                  }
                }, [
                  React.createElement('label', { key: 'label' }, 'TRACK'),
                  React.createElement('select', {
                    key: 'select',
                    value: control.value.toString(),
                    style: { pointerEvents: 'auto', zIndex: 1001 },
                    // Comprehensive event prevention for select element
                    onPointerDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onPointerUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onClick: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onMouseDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onMouseUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    // Capture phase event handling
                    onClickCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onMouseDownCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onPointerDownCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onChange: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const newValue = parseInt(e.target.value, 10);
                      control.value = newValue;
                      if (control.onChange) {
                        control.onChange(newValue);
                      }
                    },
                    onFocus: (e: any) => {
                      e.stopPropagation();
                    },
                    onBlur: (e: any) => {
                      e.stopPropagation();
                    }
                  }, trackOptions.map((track: number) =>
                    React.createElement('option', { key: track, value: track.toString() }, `Track ${track}`)
                  ))
                ]);
              }
              
              if (data.payload instanceof LoopCheckboxControl) {
                const control = data.payload as LoopCheckboxControl;
                return () => React.createElement('div', {
                  className: 'custom-checkbox-control',
                  style: { pointerEvents: 'auto', zIndex: 1000 },
                  // Comprehensive event prevention for all phases
                  onPointerDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onPointerUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onClick: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseDown: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  onMouseUp: (e: any) => {
                    e.stopPropagation();
                    e.preventDefault();
                  },
                  // Capture phase event handling
                  onClickCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onMouseDownCapture: (e: any) => {
                    e.stopPropagation();
                  },
                  onPointerDownCapture: (e: any) => {
                    e.stopPropagation();
                  }
                }, [
                  React.createElement('label', {
                    key: 'label',
                    style: { pointerEvents: 'auto', zIndex: 1001 },
                    // Comprehensive event prevention for label
                    onPointerDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onPointerUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onClick: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // Manually toggle the checkbox
                      const newValue = !control.value;
                      control.value = newValue;
                      if (control.onChange) {
                        control.onChange(newValue);
                      }
                    },
                    onMouseDown: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    onMouseUp: (e: any) => {
                      e.stopPropagation();
                      e.preventDefault();
                    },
                    // Capture phase event handling
                    onClickCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onMouseDownCapture: (e: any) => {
                      e.stopPropagation();
                    },
                    onPointerDownCapture: (e: any) => {
                      e.stopPropagation();
                    }
                  }, [
                    React.createElement('input', {
                      key: 'checkbox',
                      type: 'checkbox',
                      checked: control.value,
                      style: { pointerEvents: 'auto', zIndex: 1002 },
                      // Comprehensive event prevention for checkbox
                      onPointerDown: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                      },
                      onPointerUp: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                      },
                      onClick: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // Manually toggle the checkbox
                        const newValue = !control.value;
                        control.value = newValue;
                        if (control.onChange) {
                          control.onChange(newValue);
                        }
                      },
                      onMouseDown: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                      },
                      onMouseUp: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                      },
                      // Capture phase event handling
                      onClickCapture: (e: any) => {
                        e.stopPropagation();
                      },
                      onMouseDownCapture: (e: any) => {
                        e.stopPropagation();
                      },
                      onPointerDownCapture: (e: any) => {
                        e.stopPropagation();
                      },
                      onChange: (e: any) => {
                        e.stopPropagation();
                        e.preventDefault();
                        // This should not be called due to manual handling above
                      },
                      onFocus: (e: any) => {
                        e.stopPropagation();
                      },
                      onBlur: (e: any) => {
                        e.stopPropagation();
                      }
                    }),
                    ' LOOP'
                  ])
                ]);
              }
              
              return null;
            }
          }
        }));

        connection.addPreset(ConnectionPresets.classic.setup());
        arrange.addPreset(ArrangePresets.classic.setup());

        editor.use(engine);
        editor.use(area);
        area.use(connection);
        area.use(render);
        area.use(arrange);

        AreaExtensions.simpleNodesOrder(area);
        AreaExtensions.showInputControl(area);
        // Add keyboard event listener for delete functionality
        const handleKeyDown = (event: KeyboardEvent) => {
          // Only handle delete/backspace when not typing in inputs
          if ((event.key === 'Delete' || event.key === 'Backspace') &&
              event.target &&
              !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
            event.preventDefault();
            event.stopPropagation();
            deleteSelectedNodes();
          }
        };
        
        // Add global event listener for delete functionality
        document.addEventListener('keydown', handleKeyDown);
        
        // Also add to container for backup
        const containerElement = containerRef.current;
        if (containerElement) {
          containerElement.addEventListener('keydown', handleKeyDown);
          
          // Make container focusable
          containerElement.tabIndex = 0;
          containerElement.style.outline = 'none'; // Remove focus outline
          
          // Focus container when clicking in it
          const handleContainerClick = (e: MouseEvent) => {
            // Only focus if clicking on the container itself or rete elements, not on inputs
            const target = e.target as HTMLElement;
            if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
              containerElement.focus();
            }
          };
          containerElement.addEventListener('click', handleContainerClick);
          
          // Store cleanup functions
          cleanupFunctionsRef.current.push(() => {
            document.removeEventListener('keydown', handleKeyDown);
            containerElement.removeEventListener('keydown', handleKeyDown);
            containerElement.removeEventListener('click', handleContainerClick);
          });
        }

        // Create initial example flow
        const start = new Start();
        const setAnim = new SetAnimation(spineInstance, addLog, 0, availableAnimations[0] || "idle", true, availableAnimations);
        const wait = new Wait(addLog, 2);
        const addAnim = new AddAnimation(spineInstance, addLog, 0, availableAnimations[1] || "walk", false, 0, availableAnimations);
        const log = new Log(addLog, "Animation sequence completed");

        const con1 = new ClassicPreset.Connection(start, "exec", setAnim, "exec");
        const con2 = new ClassicPreset.Connection(setAnim, "exec", wait, "exec");
        const con3 = new ClassicPreset.Connection(wait, "exec", addAnim, "exec");
        const con4 = new ClassicPreset.Connection(addAnim, "exec", log, "exec");

        await editor.addNode(start);
        await editor.addNode(setAnim);
        await editor.addNode(wait);
        await editor.addNode(addAnim);
        await editor.addNode(log);

        await editor.addConnection(con1 as any);
        await editor.addConnection(con2 as any);
        await editor.addConnection(con3 as any);
        await editor.addConnection(con4 as any);
        await arrange.layout();
        AreaExtensions.zoomAt(area, editor.getNodes());

        editorRef.current = editor;
        engineRef.current = engine;
        areaRef.current = area;
        isInitializedRef.current = true;

        addLog("Node editor initialized with example flow");
      } catch (error) {
        console.error('Error initializing editor:', error);
        addLog(`Error initializing editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    initEditor();

    return cleanup;
  }, [spineInstance, availableAnimations]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, []);

  // Execute the flow
  const executeFlow = () => {
    if (!editorRef.current || !engineRef.current) return;

    // Find the start node
    const nodes = editorRef.current.getNodes();
    const startNode = nodes.find(node => node instanceof Start);

    if (startNode) {
      addLog("Starting execution flow...");
      engineRef.current.execute(startNode.id);
    } else {
      addLog("Error: No Start node found in the flow");
    }
  };

  // Stop all animations
  const stopAnimations = () => {
    if (spineInstance) {
      // Clear all tracks
      for (let i = 0; i < 16; i++) {
        spineInstance.state.clearTrack(i);
      }
      addLog("Stopped all animations");
    }
  };

  return (
    <div className="node-player-overlay">
      <div className="node-player-container">
        <div className="node-player-header">
          <h2>Spine Animation Node Player</h2>
          <div className="node-player-controls">
            <button onClick={executeFlow} className="execute-btn">
              ▶ Execute Flow
            </button>
            <button onClick={stopAnimations} className="stop-btn">
              ⏹ Stop All
            </button>
            <button onClick={clearLogs} className="clear-logs-btn">
              🗑 Clear Logs
            </button>
            <button onClick={onClose} className="close-btn">
              ✕
            </button>
          </div>
        </div>
        
        <div className="node-player-content">
          <div className="node-editor-container">
            <div ref={containerRef} className="node-editor" />
            <div className="node-editor-help">
              <p><strong>Controls:</strong> Right-click on empty space to add nodes • Drag between pins to connect • Click to select nodes (Ctrl+click for multiple) • Press Delete/Backspace to remove selected nodes</p>
              <p><strong>Available animations:</strong> {availableAnimations.join(', ')}</p>
              <p><strong>Layout:</strong> Exec pins are positioned at the top • Animation nodes have increased height for better visibility</p>
              <p><strong>Features:</strong> Animation dropdown shows available animations • Loop checkbox for easy toggling</p>
            </div>
          </div>
          
          <div className="log-panel">
            <div className="log-header">
              <h3>Execution Log</h3>
            </div>
            <div className="log-content">
              {logs.map((log, index) => (
                <div key={index} className="log-entry">
                  {log}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="log-entry log-empty">
                  No logs yet. Execute a flow to see output.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};