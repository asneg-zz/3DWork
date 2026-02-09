import { useState } from "react";
import { useStore } from "../../store/useStore";
import type {
  Primitive,
  SceneOperation,
  SketchPlane,
  Sketch,
  BooleanOp,
} from "../../types/scene";
import { defaultTransform } from "../../types/scene";
import {
  DropdownMenu,
  DropdownItem,
} from "../DropdownMenu/DropdownMenu";
import "./Toolbar.css";

let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}_${++idCounter}`;
}

function addPrimitive(primitive: Primitive) {
  const id = nextId(primitive.type);
  const op: SceneOperation = {
    type: "create_primitive",
    id,
    primitive,
    transform: defaultTransform(),
  };
  useStore.getState().addOperation(op);
  useStore.getState().selectObject(id);
}

function addBoolean(op: BooleanOp) {
  const state = useStore.getState();
  const { selectedObjectIds } = state;
  if (selectedObjectIds.length < 2) return;
  const left = selectedObjectIds[0];
  const right = selectedObjectIds[1];
  const id = nextId("bool");
  const boolOp: SceneOperation = { type: "boolean", id, op, left, right };
  state.addOperation(boolOp);
  state.selectObject(id);
}

function addSketch(plane: SketchPlane) {
  const id = nextId("sketch");
  const sketch: Sketch = {
    plane,
    offset: 0,
    elements: [],
  };
  const op: SceneOperation = {
    type: "create_sketch",
    id,
    sketch,
    transform: defaultTransform(),
  };
  useStore.getState().addOperation(op);
  useStore.getState().selectObject(id);
}

export function Toolbar() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clearScene = useStore((s) => s.clearScene);
  const undoStack = useStore((s) => s.undoStack);
  const redoStack = useStore((s) => s.redoStack);
  const selectedObjectIds = useStore((s) => s.selectedObjectIds);

  const [sketchPlane, setSketchPlane] = useState<SketchPlane>("XY");
  const canBoolean = selectedObjectIds.length >= 2;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <DropdownMenu label="3D Тело">
          <DropdownItem
            onClick={() =>
              addPrimitive({ type: "cube", width: 4, height: 4, depth: 4 })
            }
          >
            Куб
          </DropdownItem>
          <DropdownItem
            onClick={() =>
              addPrimitive({ type: "cylinder", radius: 2, height: 4 })
            }
          >
            Цилиндр
          </DropdownItem>
          <DropdownItem
            onClick={() => addPrimitive({ type: "sphere", radius: 2 })}
          >
            Сфера
          </DropdownItem>
          <DropdownItem
            onClick={() =>
              addPrimitive({ type: "cone", radius: 2, height: 4 })
            }
          >
            Конус
          </DropdownItem>
        </DropdownMenu>
      </div>

      <div className="toolbar-group">
        <DropdownMenu label="Эскиз">
          <div className="sketch-plane-selector">
            <span className="sketch-plane-label">Плоскость:</span>
            {(["XY", "XZ", "YZ"] as SketchPlane[]).map((p) => (
              <button
                key={p}
                className={`sketch-plane-btn ${sketchPlane === p ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSketchPlane(p);
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="dropdown-divider" />
          <DropdownItem onClick={() => addSketch(sketchPlane)}>
            Новый эскиз ({sketchPlane})
          </DropdownItem>
        </DropdownMenu>
      </div>

      <div className="toolbar-group">
        <DropdownMenu label="Булевы">
          {!canBoolean && (
            <div className="dropdown-hint">
              Выберите 2 объекта (Ctrl+клик)
            </div>
          )}
          {canBoolean && (
            <div className="dropdown-hint">
              A = {selectedObjectIds[0]}, B = {selectedObjectIds[1]}
            </div>
          )}
          <div className="dropdown-divider" />
          <DropdownItem
            onClick={() => canBoolean && addBoolean("union")}
            disabled={!canBoolean}
          >
            Объединение (A + B)
          </DropdownItem>
          <DropdownItem
            onClick={() => canBoolean && addBoolean("difference")}
            disabled={!canBoolean}
          >
            Вычитание (A − B)
          </DropdownItem>
          <DropdownItem
            onClick={() => canBoolean && addBoolean("intersection")}
            disabled={!canBoolean}
          >
            Пересечение (A ∩ B)
          </DropdownItem>
        </DropdownMenu>
      </div>

      <div className="toolbar-group">
        <span className="toolbar-label">Правка</span>
        <button onClick={undo} disabled={undoStack.length === 0} title="Отменить">
          Отменить
        </button>
        <button onClick={redo} disabled={redoStack.length === 0} title="Повторить">
          Повторить
        </button>
        <button onClick={clearScene} title="Очистить сцену">
          Очистить
        </button>
      </div>
    </div>
  );
}
