import { useStore } from "../../store/useStore";
import type { CSSProperties } from "react";

const TOOLS = [
  { id: "line", label: "Линия" },
  { id: "circle", label: "Окружность" },
  { id: "arc", label: "Дуга" },
  { id: "rectangle", label: "Прямоугольник" },
  { id: "polyline", label: "Полилиния" },
  { id: "spline", label: "Сплайн" },
  { id: "dimension", label: "Размеры" },
] as const;

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 16px",
  background: "#1a2a1a",
  borderBottom: "1px solid #3a5a3a",
  flexShrink: 0,
};

const btnStyle: CSSProperties = {
  padding: "5px 10px",
  background: "#2a2a30",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "12px",
};

const btnActiveStyle: CSSProperties = {
  ...btnStyle,
  background: "#2a4a7a",
  borderColor: "#5a8abb",
  color: "#fff",
};

const doneStyle: CSSProperties = {
  ...btnStyle,
  background: "#3a5a3a",
  borderColor: "#5a8a5a",
  marginLeft: "auto",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "#6a6",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginRight: "4px",
};

export function SketchToolbar() {
  const sketchTool = useStore((s) => s.sketchTool);
  const setSketchTool = useStore((s) => s.setSketchTool);
  const exitSketchEdit = useStore((s) => s.exitSketchEdit);
  const activeSketchId = useStore((s) => s.activeSketchId);

  if (!activeSketchId) return null;

  return (
    <div style={barStyle}>
      <span style={labelStyle}>Эскиз</span>
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          style={sketchTool === tool.id ? btnActiveStyle : btnStyle}
          onClick={() =>
            setSketchTool(sketchTool === tool.id ? null : tool.id)
          }
        >
          {tool.label}
        </button>
      ))}
      <button type="button" style={doneStyle} onClick={exitSketchEdit}>
        Готово
      </button>
    </div>
  );
}
