import { useStore } from "../../store/useStore";
import type { SketchElement } from "../../types/scene";
import "./SceneTree.css";

export function SceneTree() {
  const operations = useStore((s) => s.scene.operations);
  const selectedObjectIds = useStore((s) => s.selectedObjectIds);
  const selectObject = useStore((s) => s.selectObject);
  const toggleSelectObject = useStore((s) => s.toggleSelectObject);
  const enterSketchEdit = useStore((s) => s.enterSketchEdit);
  const activeSketchId = useStore((s) => s.activeSketchId);
  const selectedElementIndex = useStore((s) => s.selectedElementIndex);
  const selectElement = useStore((s) => s.selectElement);
  const deleteElement = useStore((s) => s.deleteElement);

  const handleObjectClick = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelectObject(id);
    } else {
      selectObject(id);
    }
  };

  const items = operations.filter(
    (op) => op.type === "create_primitive" || op.type === "create_sketch"
  );

  return (
    <div className="scene-tree">
      <div className="panel-header">Сцена</div>
      <div className="tree-list">
        {items.length === 0 && (
          <div className="tree-empty">Нет объектов</div>
        )}
        {items.map((op) => {
          const isSelected = selectedObjectIds.includes(op.id);

          if (op.type === "create_primitive") {
            return (
              <div
                key={op.id}
                className={`tree-item ${isSelected ? "selected" : ""}`}
                onClick={(e) => handleObjectClick(op.id, e)}
              >
                <span className="tree-icon">
                  {getIcon(op.primitive.type)}
                </span>
                <span className="tree-name">{op.id}</span>
                <span className="tree-type">{translateType(op.primitive.type)}</span>
              </div>
            );
          }

          if (op.type === "create_sketch") {
            const isEditing = activeSketchId === op.id;
            return (
              <div key={op.id}>
                <div
                  className={`tree-item ${isSelected ? "selected" : ""} ${isEditing ? "editing" : ""}`}
                  onClick={(e) => handleObjectClick(op.id, e)}
                  onDoubleClick={() => enterSketchEdit(op.id)}
                >
                  <span className="tree-icon tree-icon-sketch">&#9998;</span>
                  <span className="tree-name">{op.id}</span>
                  <span className="tree-type">
                    {isEditing ? "✏ редактирование" : `эскиз (${op.sketch.plane})`}
                  </span>
                </div>

                {isEditing && op.sketch.elements.length > 0 && (
                  <div className="tree-children">
                    {op.sketch.elements.map((el, i) => (
                      <div
                        key={i}
                        className={`tree-item tree-item-child ${selectedElementIndex === i ? "selected" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectElement(selectedElementIndex === i ? null : i);
                        }}
                      >
                        <span className="tree-icon tree-icon-el">
                          {getElementIcon(el)}
                        </span>
                        <span className="tree-name">
                          {translateElementType(el.type)} #{i + 1}
                        </span>
                        <button
                          type="button"
                          className="tree-delete-btn"
                          title="Удалить"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteElement(op.id, i);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

function getIcon(type: string): string {
  switch (type) {
    case "cube":
      return "\u25A1";
    case "cylinder":
      return "\u25CB";
    case "sphere":
      return "\u25CF";
    case "cone":
      return "\u25B3";
    default:
      return "\u25A0";
  }
}

function translateType(type: string): string {
  switch (type) {
    case "cube":
      return "куб";
    case "cylinder":
      return "цилиндр";
    case "sphere":
      return "сфера";
    case "cone":
      return "конус";
    default:
      return type;
  }
}

function getElementIcon(el: SketchElement): string {
  switch (el.type) {
    case "line":
      return "╱";
    case "circle":
      return "◯";
    case "arc":
      return "◠";
    case "rectangle":
      return "▭";
    case "polyline":
      return "⏥";
    case "spline":
      return "〜";
    case "dimension":
      return "↔";
  }
}

function translateElementType(type: string): string {
  switch (type) {
    case "line":
      return "линия";
    case "circle":
      return "окружность";
    case "arc":
      return "дуга";
    case "rectangle":
      return "прямоуг.";
    case "polyline":
      return "полилиния";
    case "spline":
      return "сплайн";
    case "dimension":
      return "размер";
    default:
      return type;
  }
}
