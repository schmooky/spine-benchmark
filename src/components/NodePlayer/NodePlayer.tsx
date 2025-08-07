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
    track: ClassicPreset.InputControl<"number">;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
  }
> {
  width = 220;
  height = 180;

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
    track: ClassicPreset.InputControl<"number">;
    animation: AnimationDropdownControl;
    loop: LoopCheckboxControl;
    delay: ClassicPreset.InputControl<"number">;
  }
> {
  width = 220;
  height = 200;

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
  { track: ClassicPreset.InputControl<"number"> }
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
    
    this.addControl("track", new ClassicPreset.InputControl("number", { 
      initial: track,
      readonly: false 
    }));
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

  // Initialize the node editor
  useEffect(() => {
    if (!containerRef.current || !spineInstance) return;

    let cleanup: (() => void) | undefined;

    const initEditor = async () => {
      const editor = new NodeEditor<Schemes>();
      const area = new AreaPlugin<Schemes, AreaExtra>(containerRef.current!);
      const connection = new ConnectionPlugin<any, any>();
      const render = new ReactPlugin<any, any>({ createRoot });
      const arrange = new AutoArrangePlugin<any>();
      const engine = new ControlFlowEngine<any>();
      
      // Delete functionality
      const deleteSelectedNodes = async () => {
        const selectedNodes = (area as any).selector?.entities || [];
        for (const nodeId of selectedNodes) {
          try {
            const node = editor.getNode(nodeId);
            if (node) {
              // Remove all connections to/from this node
              const connections = editor.getConnections();
              for (const connection of connections) {
                if (connection.source === nodeId || connection.target === nodeId) {
                  await editor.removeConnection(connection.id);
                }
              }
              // Remove the node
              await editor.removeNode(nodeId);
              addLog(`Deleted node: ${node.label}`);
            }
          } catch (error) {
            addLog(`Error deleting node: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      };
      
      const contextMenu = new ContextMenuPlugin<any>({
        items: ContextMenuPresets.classic.setup([
          ["Start", () => new Start()],
          ["Set Animation", () => new SetAnimation(spineInstance, addLog, 0, "", true, availableAnimations)],
          ["Add Animation", () => new AddAnimation(spineInstance, addLog, 0, "", false, 0, availableAnimations)],
          ["Wait", () => new Wait(addLog)],
          ["Clear Track", () => new ClearTrack(spineInstance, addLog)],
          ["Log", () => new Log(addLog)],
          ["Delete Selected", () => {
            deleteSelectedNodes();
            return null as any;
          }]
        ])
      });

      area.use(contextMenu);

      AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
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
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          deleteSelectedNodes();
        }
      };
      
      // Add event listener to the container
      containerRef.current?.addEventListener('keydown', handleKeyDown);
      
      // Store cleanup function
      cleanup = () => {
        containerRef.current?.removeEventListener('keydown', handleKeyDown);
        area.destroy();
      };

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

      addLog("Node editor initialized with example flow");
    };

    initEditor().catch(console.error);

    return () => {
      if (cleanup) cleanup();
    };
  }, [spineInstance, availableAnimations]);

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
              <p><strong>Controls:</strong> Right-click to add nodes • Drag to connect • Select nodes and press Delete/Backspace to remove</p>
              <p><strong>Available animations:</strong> {availableAnimations.join(', ')}</p>
              <p><strong>Layout:</strong> Exec pins (input/output) are positioned at the top of each node for better flow visualization</p>
              <p><strong>New Features:</strong> Animation dropdown shows available animations • Loop checkbox for easy toggling</p>
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