import { useEffect } from "react";
import { Viewport } from "./components/Viewport/Viewport";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { SketchToolbar } from "./components/SketchToolbar/SketchToolbar";
import { SceneTree } from "./components/SceneTree/SceneTree";
import { Properties } from "./components/Properties/Properties";
import { Chat } from "./components/Chat/Chat";
import { initBridge } from "./wasm/bridge";
import { useStore } from "./store/useStore";
import "./App.css";

function App() {
  useEffect(() => {
    initBridge().catch(console.error);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      // Escape — выход из режима эскиза
      if (e.key === "Escape") {
        const { activeSketchId, sketchTool, setSketchTool, exitSketchEdit } =
          useStore.getState();
        if (sketchTool) {
          // Сначала сбросить инструмент
          setSketchTool(null);
        } else if (activeSketchId) {
          exitSketchEdit();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useStore.getState().redo();
        } else {
          useStore.getState().undo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const activeSketchId = useStore((s) => s.activeSketchId);

  return (
    <div className="app">
      <Toolbar />
      {activeSketchId && <SketchToolbar />}
      <div className="app-body">
        <div className="panel-left">
          <SceneTree />
        </div>
        <div className="panel-center">
          <Viewport />
        </div>
        <div className="panel-right">
          <div className="panel-right-top">
            <Properties />
          </div>
          <div className="panel-right-bottom">
            <Chat />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
