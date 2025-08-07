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

// Global context for spine operations
let globalSpineInstance: Spine | null = null;
let globalLogFunction: (text: string) => void = () => {};
let globalAvailableAnimations: string[] = [];
let globalDeleteFunction: (nodeId: string) => void = () => {};

class Start extends ClassicPreset.Node<{}, { exec: ClassicPreset.Socket }, {}> {
  width = 180;
  height = 120;

  constructor() {
    super("Start");
    // Add exec output first to ensure it appears at the top
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
    animation: ClassicPreset.InputControl<"text">;
    loop: ClassicPreset.InputControl<"text">;
  }
> {
  width = 280;
  height = 260;

  constructor(track: number = 0, animation: string = "", loop: boolean = true) {
    super("Set Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Add controls after exec pins
    this.addControl("track", new ClassicPreset.InputControl("number", {
      initial: track,
      readonly: false
    }));
    
    this.addControl("animation", new ClassicPreset.InputControl("text", {
      initial: animation || (globalAvailableAnimations.length > 0 ? globalAvailableAnimations[0] : ""),
      readonly: false
    }));
    
    this.addControl("loop", new ClassicPreset.InputControl("text", {
      initial: loop ? "true" : "false",
      readonly: false
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!globalSpineInstance) {
      globalLogFunction("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = (this.controls.loop.value as string).toLowerCase() === "true";

    try {
      globalSpineInstance.state.setAnimation(track, animationName, loop);
      globalLogFunction(`Set animation "${animationName}" on track ${track} (loop: ${loop})`);
      forward("exec");
    } catch (error) {
      globalLogFunction(`Error setting animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

class AddAnimation extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  {
    track: ClassicPreset.InputControl<"number">;
    animation: ClassicPreset.InputControl<"text">;
    loop: ClassicPreset.InputControl<"text">;
    delay: ClassicPreset.InputControl<"number">;
  }
> {
  width = 280;
  height = 280;

  constructor(track: number = 0, animation: string = "", loop: boolean = false, delay: number = 0) {
    super("Add Animation");
    
    // Add exec pins first to ensure they appear at the top
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    
    // Add controls after exec pins
    this.addControl("track", new ClassicPreset.InputControl("number", {
      initial: track,
      readonly: false
    }));
    this.addControl("animation", new ClassicPreset.InputControl("text", {
      initial: animation || (globalAvailableAnimations.length > 1 ? globalAvailableAnimations[1] : ""),
      readonly: false
    }));
    this.addControl("loop", new ClassicPreset.InputControl("text", {
      initial: loop ? "true" : "false",
      readonly: false
    }));
    this.addControl("delay", new ClassicPreset.InputControl("number", {
      initial: delay,
      readonly: false
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!globalSpineInstance) {
      globalLogFunction("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;
    const animationName = this.controls.animation.value as string;
    const loop = (this.controls.loop.value as string).toLowerCase() === "true";
    const delay = this.controls.delay.value as number;

    try {
      globalSpineInstance.state.addAnimation(track, animationName, loop, delay);
      globalLogFunction(`Added animation "${animationName}" to track ${track} queue (loop: ${loop}, delay: ${delay}s)`);
      forward("exec");
    } catch (error) {
      globalLogFunction(`Error adding animation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

class Delay extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { value: ClassicPreset.InputControl<"number"> }
> {
  width = 200;
  height = 180;

  constructor(seconds: number = 1) {
    super("Delay");
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    this.addControl("value", new ClassicPreset.InputControl("number", { initial: seconds }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    const value = this.controls.value.value;
    globalLogFunction(`Waiting ${value} seconds...`);
    setTimeout(() => {
      globalLogFunction(`Wait completed`);
      forward("exec");
    }, value ? value * 1000 : 1000);
  }
}

class Log extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { message: ClassicPreset.InputControl<"text"> }
> {
  width = 200;
  height = 180;

  constructor(message: string = "") {
    super("Log");
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    this.addControl("message", new ClassicPreset.InputControl("text", { initial: message }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    globalLogFunction(this.controls.message.value as string);
    forward("exec");
  }
}

class ClearTrack extends ClassicPreset.Node<
  { exec: ClassicPreset.Socket },
  { exec: ClassicPreset.Socket },
  { track: ClassicPreset.InputControl<"number"> }
> {
  width = 200;
  height = 160;

  constructor(track: number = 0) {
    super("Clear Track");
    this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
    this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    this.addControl("track", new ClassicPreset.InputControl("number", { 
      initial: track,
      readonly: false 
    }));
  }

  execute(input: "exec", forward: (output: "exec") => void) {
    if (!globalSpineInstance) {
      globalLogFunction("Error: No Spine instance available");
      return;
    }

    const track = this.controls.track.value as number;

    try {
      globalSpineInstance.state.clearTrack(track);
      globalLogFunction(`Cleared track ${track}`);
      forward("exec");
    } catch (error) {
      globalLogFunction(`Error clearing track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

type NodeProps = Start | SetAnimation | AddAnimation | Delay | Log | ClearTrack;
type ConnProps = ClassicPreset.Connection<NodeProps, NodeProps>;
type Schemes = GetSchemes<NodeProps, ConnProps>;
type AreaExtra = ReactArea2D<any> | ContextMenuExtra;

interface NodePlayerProps {
  spineInstance: Spine | null;
  onClose: () => void;
}

export const NodePlayer: React.FC<NodePlayerProps> = ({ spineInstance, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  const editorRef = useRef<{ destroy: () => void; editor: NodeEditor<Schemes> } | null>(null);

  // Log function that adds messages to the log panel
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Clear logs
  const clearLogs = () => {
    setLogs([]);
  };
  // Function to enhance controls with dropdown and checkbox
  const enhanceControls = () => {
    if (!containerRef.current) return;

    // Find all animation controls and replace with dropdowns
    const animationControls = containerRef.current.querySelectorAll('[data-testid="animation"]');
    animationControls.forEach((control) => {
      const input = control.querySelector('input[type="text"]') as HTMLInputElement;
      if (input && !control.querySelector('select')) {
        // Create dropdown
        const select = document.createElement('select');
        select.className = 'animation-dropdown';
        select.style.cssText = `
          background: #2a2a2a !important;
          border: 1px solid #555 !important;
          color: #fff !important;
          padding: 6px 10px !important;
          border-radius: 4px !important;
          font-size: 13px !important;
          width: 100% !important;
          box-sizing: border-box !important;
          cursor: pointer !important;
        `;

        // Add options
        if (availableAnimations.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No animations available';
          select.appendChild(option);
        } else {
          availableAnimations.forEach(animation => {
            const option = document.createElement('option');
            option.value = animation;
            option.textContent = animation;
            if (animation === input.value) {
              option.selected = true;
            }
            select.appendChild(option);
          });
        }

        // Handle change
        select.addEventListener('change', (e) => {
          const target = e.target as HTMLSelectElement;
          input.value = target.value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Hide original input and add dropdown
        input.style.display = 'none';
        input.parentNode?.appendChild(select);
      }
    });

    // Find all loop controls and replace with checkboxes
    const loopControls = containerRef.current.querySelectorAll('[data-testid="loop"]');
    loopControls.forEach((control) => {
      const input = control.querySelector('input[type="text"]') as HTMLInputElement;
      if (input && !control.querySelector('input[type="checkbox"]')) {
        // Create checkbox container
        const checkboxContainer = document.createElement('div');
        checkboxContainer.className = 'loop-checkbox-container';
        checkboxContainer.style.cssText = `
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
        `;

        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'loop-checkbox';
        checkbox.checked = input.value.toLowerCase() === 'true';
        checkbox.style.cssText = `
          width: 16px !important;
          height: 16px !important;
          accent-color: #4CAF50 !important;
          cursor: pointer !important;
        `;

        // Create label
        const label = document.createElement('label');
        label.textContent = 'Loop';
        label.style.cssText = `
          color: #ccc !important;
          font-size: 13px !important;
          cursor: pointer !important;
          user-select: none !important;
        `;

        // Handle change
        checkbox.addEventListener('change', (e) => {
          const target = e.target as HTMLInputElement;
          input.value = target.checked ? 'true' : 'false';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Handle label click
        label.addEventListener('click', () => {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Assemble checkbox control
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(label);

        // Hide original input and add checkbox
        input.style.display = 'none';
        input.parentNode?.appendChild(checkboxContainer);
      }
    });
  };

  // Get available animations from spine instance
  useEffect(() => {
    if (spineInstance) {
      const animations = spineInstance.skeleton.data.animations.map(anim => anim.name);
      setAvailableAnimations(animations);
      globalAvailableAnimations = animations;
      addLog(`Loaded Spine with ${animations.length} animations: ${animations.join(', ')}`);
    }
  }, [spineInstance]);

  // Initialize the node editor
  useEffect(() => {
    if (!containerRef.current || !spineInstance) return;

    // Set global context
    globalSpineInstance = spineInstance;
    globalLogFunction = addLog;

    const initEditor = async () => {
      const editor = new NodeEditor<Schemes>();
      const area = new AreaPlugin<Schemes, AreaExtra>(containerRef.current!);
      const connection = new ConnectionPlugin<Schemes, AreaExtra>();
      const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });
      const arrange = new AutoArrangePlugin<Schemes>();
      const engine = new ControlFlowEngine<Schemes>();
      
      // Set up delete functionality
      globalDeleteFunction = async (nodeId: string) => {
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
      };
      
      const contextMenu = new ContextMenuPlugin<Schemes>({
        items: ContextMenuPresets.classic.setup([
          ["Start", () => new Start()],
          ["Set Animation", () => new SetAnimation()],
          ["Add Animation", () => new AddAnimation()],
          ["Delay", () => new Delay(1)],
          ["Clear Track", () => new ClearTrack()],
          ["Log", () => new Log("")],
          ["Delete Selected", () => {
            // This will be handled by keyboard shortcut
            return null;
          }]
        ])
      });
      area.use(contextMenu);

      AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
        accumulating: AreaExtensions.accumulateOnCtrl()
      });

      render.addPreset(Presets.contextMenu.setup());
      render.addPreset(Presets.classic.setup());

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
          const selectedNodes = area.selector?.entities || [];
          selectedNodes.forEach(async (nodeId: string) => {
            globalDeleteFunction(nodeId);
          });
        }
      };
      
      document.addEventListener('keydown', handleKeyDown);

      // Create initial example flow
      const start = new Start();
      const setAnim = new SetAnimation(0, availableAnimations[0] || "idle", true);
      const delay = new Delay(2);
      const addAnim = new AddAnimation(0, availableAnimations[1] || "walk", false, 0);
      const log = new Log("Animation sequence completed");

      const con1 = new ClassicPreset.Connection(start, "exec", setAnim, "exec");
      const con2 = new ClassicPreset.Connection(setAnim, "exec", delay, "exec");
      const con3 = new ClassicPreset.Connection(delay, "exec", addAnim, "exec");
      const con4 = new ClassicPreset.Connection(addAnim, "exec", log, "exec");

      await editor.addNode(start);
      await editor.addNode(setAnim);
      await editor.addNode(delay);
      await editor.addNode(addAnim);
      await editor.addNode(log);

      await editor.addConnection(con1);
      await editor.addConnection(con2);
      await editor.addConnection(con3);
      await editor.addConnection(con4);

      await arrange.layout();
      AreaExtensions.zoomAt(area, editor.getNodes());

      editorRef.current = {
        destroy: () => {
          document.removeEventListener('keydown', handleKeyDown);
          area.destroy();
        },
        editor: editor
      };

      addLog("Node editor initialized with example flow");
      addLog("Press Delete or Backspace to delete selected nodes");
      
      // Enhance controls after a short delay to ensure DOM is ready
      setTimeout(() => {
        enhanceControls();
      }, 100);
    };

    initEditor().catch(console.error);

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      globalSpineInstance = null;
      globalLogFunction = () => {};
    };
  }, [spineInstance, availableAnimations]);

  // Re-enhance controls when new nodes are added
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new MutationObserver(() => {
      enhanceControls();
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true
    });

    return () => {
      observer.disconnect();
    };
  }, [availableAnimations]);

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

  // Execute flow manually
  const executeFlow = () => {
    if (editorRef.current) {
      addLog("Manually executing flow...");
      const nodes = editorRef.current.editor.getNodes();
      const startNode = nodes.find((node: any) => node instanceof Start);
      if (startNode) {
        const engine = new ControlFlowEngine<Schemes>();
        engine.execute(startNode.id);
        addLog("Flow execution triggered");
      } else {
        addLog("No Start node found");
      }
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
              <p><strong>Track numbers:</strong> 0-15 (use different tracks for layered animations)</p>
              <p><strong>Delete:</strong> Select nodes and press Delete or Backspace key</p>
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
                  No logs yet. Create a flow to see output.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};