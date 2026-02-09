import { useStore } from "../../store/useStore";
import type { SketchElement, Point2D } from "../../types/scene";
import "./Properties.css";

export function Properties() {
  const operations = useStore((s) => s.scene.operations);
  const selectedObjectId = useStore((s) => s.selectedObjectId);
  const activeSketchId = useStore((s) => s.activeSketchId);
  const selectedElementIndex = useStore((s) => s.selectedElementIndex);
  const updateElement = useStore((s) => s.updateElement);

  const selectedOp = operations.find((op) => op.id === selectedObjectId);

  if (!selectedOp) {
    return (
      <div className="properties">
        <div className="panel-header">Свойства</div>
        <div className="prop-empty">Выберите объект</div>
      </div>
    );
  }

  if (selectedOp.type === "create_sketch") {
    const { sketch } = selectedOp;
    const isEditing = activeSketchId === selectedOp.id;
    const selectedEl =
      isEditing && selectedElementIndex !== null
        ? sketch.elements[selectedElementIndex]
        : null;

    return (
      <div className="properties">
        <div className="panel-header">Свойства</div>
        <div className="prop-content">
          <div className="prop-section">
            <div className="prop-section-title">Эскиз</div>
            <PropRow label="ID" value={selectedOp.id} />
            <PropRow label="Плоскость" value={sketch.plane} />
            <PropRow label="Смещение" value={String(sketch.offset)} />
            <PropRow label="Элементов" value={String(sketch.elements.length)} />
          </div>

          {selectedEl && selectedElementIndex !== null && (
            <div className="prop-section">
              <div className="prop-section-title">
                {translateElementType(selectedEl.type)} #{selectedElementIndex + 1}
              </div>
              <ElementEditor
                element={selectedEl}
                onChange={(el) =>
                  updateElement(selectedOp.id, selectedElementIndex, el)
                }
              />
            </div>
          )}

          {!selectedEl && isEditing && (
            <div className="prop-section">
              <div className="prop-hint">
                Выберите элемент в панели Сцена для редактирования
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedOp.type !== "create_primitive") {
    return (
      <div className="properties">
        <div className="panel-header">Свойства</div>
        <div className="prop-empty">Выберите объект</div>
      </div>
    );
  }

  const { primitive, transform } = selectedOp;

  return (
    <div className="properties">
      <div className="panel-header">Свойства</div>
      <div className="prop-content">
        <div className="prop-section">
          <div className="prop-section-title">Объект</div>
          <PropRow label="ID" value={selectedOp.id} />
          <PropRow label="Тип" value={primitive.type} />
        </div>

        <div className="prop-section">
          <div className="prop-section-title">Размеры</div>
          {primitive.type === "cube" && (
            <>
              <PropField label="Ширина" value={primitive.width} />
              <PropField label="Высота" value={primitive.height} />
              <PropField label="Глубина" value={primitive.depth} />
            </>
          )}
          {primitive.type === "cylinder" && (
            <>
              <PropField label="Радиус" value={primitive.radius} />
              <PropField label="Высота" value={primitive.height} />
            </>
          )}
          {primitive.type === "sphere" && (
            <PropField label="Радиус" value={primitive.radius} />
          )}
          {primitive.type === "cone" && (
            <>
              <PropField label="Радиус" value={primitive.radius} />
              <PropField label="Высота" value={primitive.height} />
            </>
          )}
        </div>

        <div className="prop-section">
          <div className="prop-section-title">Трансформация</div>
          <PropRow
            label="Позиция"
            value={transform.position.map((v) => v.toFixed(1)).join(", ")}
          />
          <PropRow
            label="Вращение"
            value={transform.rotation.map((v) => v.toFixed(1)).join(", ")}
          />
          <PropRow
            label="Масштаб"
            value={transform.scale.map((v) => v.toFixed(1)).join(", ")}
          />
        </div>
      </div>
    </div>
  );
}

// --- Редактор элемента эскиза ---

function ElementEditor({
  element,
  onChange,
}: {
  element: SketchElement;
  onChange: (el: SketchElement) => void;
}) {
  switch (element.type) {
    case "line":
      return (
        <>
          <PointEditor
            label="Начало"
            point={element.start}
            onChange={(p) => onChange({ ...element, start: p })}
          />
          <PointEditor
            label="Конец"
            point={element.end}
            onChange={(p) => onChange({ ...element, end: p })}
          />
        </>
      );
    case "circle":
      return (
        <>
          <PointEditor
            label="Центр"
            point={element.center}
            onChange={(p) => onChange({ ...element, center: p })}
          />
          <NumericField
            label="Радиус"
            value={element.radius}
            onChange={(v) => onChange({ ...element, radius: v })}
          />
        </>
      );
    case "arc":
      return (
        <>
          <PointEditor
            label="Центр"
            point={element.center}
            onChange={(p) => onChange({ ...element, center: p })}
          />
          <NumericField
            label="Радиус"
            value={element.radius}
            onChange={(v) => onChange({ ...element, radius: v })}
          />
          <NumericField
            label="Нач. угол"
            value={toDeg(element.startAngle)}
            onChange={(v) => onChange({ ...element, startAngle: toRad(v) })}
            suffix="°"
          />
          <NumericField
            label="Кон. угол"
            value={toDeg(element.endAngle)}
            onChange={(v) => onChange({ ...element, endAngle: toRad(v) })}
            suffix="°"
          />
        </>
      );
    case "rectangle":
      return (
        <>
          <PointEditor
            label="Угол"
            point={element.corner}
            onChange={(p) => onChange({ ...element, corner: p })}
          />
          <NumericField
            label="Ширина"
            value={element.width}
            onChange={(v) => onChange({ ...element, width: v })}
          />
          <NumericField
            label="Высота"
            value={element.height}
            onChange={(v) => onChange({ ...element, height: v })}
          />
        </>
      );
    case "polyline":
      return (
        <PointListEditor
          label="Точки"
          points={element.points}
          onChange={(pts) => onChange({ ...element, points: pts })}
        />
      );
    case "spline":
      return (
        <PointListEditor
          label="Контр. точки"
          points={element.points}
          onChange={(pts) => onChange({ ...element, points: pts })}
        />
      );
    case "dimension":
      return (
        <>
          <PointEditor
            label="От"
            point={element.from}
            onChange={(p) => {
              const dist = Math.sqrt(
                (p.x - element.to.x) ** 2 + (p.y - element.to.y) ** 2
              );
              onChange({ ...element, from: p, value: dist });
            }}
          />
          <PointEditor
            label="До"
            point={element.to}
            onChange={(p) => {
              const dist = Math.sqrt(
                (element.from.x - p.x) ** 2 + (element.from.y - p.y) ** 2
              );
              onChange({ ...element, to: p, value: dist });
            }}
          />
          <PropRow label="Значение" value={element.value.toFixed(2)} />
        </>
      );
  }
}

// --- Компоненты ---

function PointEditor({
  label,
  point,
  onChange,
}: {
  label: string;
  point: Point2D;
  onChange: (p: Point2D) => void;
}) {
  return (
    <div className="prop-point">
      <span className="prop-label">{label}</span>
      <div className="prop-point-fields">
        <label className="prop-coord">
          <span className="prop-coord-label">X</span>
          <input
            className="prop-input"
            type="number"
            step="0.1"
            value={round(point.x)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange({ ...point, x: v });
            }}
          />
        </label>
        <label className="prop-coord">
          <span className="prop-coord-label">Y</span>
          <input
            className="prop-input"
            type="number"
            step="0.1"
            value={round(point.y)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange({ ...point, y: v });
            }}
          />
        </label>
      </div>
    </div>
  );
}

function PointListEditor({
  label,
  points,
  onChange,
}: {
  label: string;
  points: Point2D[];
  onChange: (pts: Point2D[]) => void;
}) {
  return (
    <div className="prop-point-list">
      <span className="prop-label">{label} ({points.length})</span>
      {points.map((p, i) => (
        <div key={i} className="prop-point-list-row">
          <span className="prop-point-list-idx">#{i + 1}</span>
          <label className="prop-coord">
            <span className="prop-coord-label">X</span>
            <input
              className="prop-input"
              type="number"
              step="0.1"
              value={round(p.x)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) {
                  const updated = [...points];
                  updated[i] = { ...p, x: v };
                  onChange(updated);
                }
              }}
            />
          </label>
          <label className="prop-coord">
            <span className="prop-coord-label">Y</span>
            <input
              className="prop-input"
              type="number"
              step="0.1"
              value={round(p.y)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) {
                  const updated = [...points];
                  updated[i] = { ...p, y: v };
                  onChange(updated);
                }
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

function NumericField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <div className="prop-numeric-wrap">
        <input
          className="prop-input"
          type="number"
          step="0.1"
          value={round(value)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
        />
        {suffix && <span className="prop-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-value">{value}</span>
    </div>
  );
}

function PropField({ label, value }: { label: string; value: number }) {
  return (
    <div className="prop-row">
      <span className="prop-label">{label}</span>
      <span className="prop-value">{value}</span>
    </div>
  );
}

function translateElementType(type: string): string {
  switch (type) {
    case "line":
      return "Линия";
    case "circle":
      return "Окружность";
    case "arc":
      return "Дуга";
    case "rectangle":
      return "Прямоугольник";
    case "polyline":
      return "Полилиния";
    case "spline":
      return "Сплайн";
    case "dimension":
      return "Размер";
    default:
      return type;
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function toDeg(rad: number): number {
  return round((rad * 180) / Math.PI);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
