import {
  MeshBuilder,
  Vector3,
  Color3,
  type Scene as BScene,
} from "@babylonjs/core";
import type { SketchElement, SketchPlane, Point2D } from "../types/scene";
import { point2Dto3D } from "./sketchMath";

const ELEMENT_COLOR = new Color3(0.9, 0.9, 0.9);
const SELECTED_COLOR = new Color3(0.2, 0.7, 1.0);
const PREVIEW_COLOR = new Color3(1, 1, 0);
const DIMENSION_COLOR = new Color3(0.2, 0.9, 0.2);
const CIRCLE_SEGMENTS = 64;

/** Конвертирует массив 2D точек в массив 3D Vector3 */
function toV3(
  points: Point2D[],
  plane: SketchPlane,
  offset: number
): Vector3[] {
  return points.map((p) => point2Dto3D(p, plane, offset));
}

/** Генерирует точки окружности */
function circlePoints(
  center: Point2D,
  radius: number,
  segments: number = CIRCLE_SEGMENTS
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
    });
  }
  return pts;
}

/** Генерирует точки дуги */
function arcPoints(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = CIRCLE_SEGMENTS
): Point2D[] {
  const pts: Point2D[] = [];
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += Math.PI * 2;
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * sweep;
    pts.push({
      x: center.x + Math.cos(a) * radius,
      y: center.y + Math.sin(a) * radius,
    });
  }
  return pts;
}

/** Генерирует точки прямоугольника (замкнутый) */
function rectPoints(
  corner: Point2D,
  width: number,
  height: number
): Point2D[] {
  return [
    corner,
    { x: corner.x + width, y: corner.y },
    { x: corner.x + width, y: corner.y + height },
    { x: corner.x, y: corner.y + height },
    corner, // замыкаем
  ];
}

/** Простая интерполяция Catmull-Rom сплайна */
function splineInterpolate(controlPoints: Point2D[]): Point2D[] {
  if (controlPoints.length < 2) return controlPoints;
  if (controlPoints.length === 2) return controlPoints;

  const result: Point2D[] = [];
  const n = controlPoints.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[Math.min(n - 1, i + 1)];
    const p3 = controlPoints[Math.min(n - 1, i + 2)];

    for (let t = 0; t < 1; t += 0.05) {
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  result.push(controlPoints[n - 1]);
  return result;
}

/** Точки линии размера (линия + засечки) */
function dimensionPoints(from: Point2D, to: Point2D): Point2D[][] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-8) return [];

  // Нормаль к линии размера
  const nx = -dy / len;
  const ny = dx / len;
  const tick = 0.3;

  return [
    // Основная линия
    [from, to],
    // Засечка на from
    [
      { x: from.x - nx * tick, y: from.y - ny * tick },
      { x: from.x + nx * tick, y: from.y + ny * tick },
    ],
    // Засечка на to
    [
      { x: to.x - nx * tick, y: to.y - ny * tick },
      { x: to.x + nx * tick, y: to.y + ny * tick },
    ],
  ];
}

/** Конвертирует SketchElement в массивы 2D точек для отрисовки */
function elementToPointArrays(el: SketchElement): Point2D[][] {
  switch (el.type) {
    case "line":
      return [[el.start, el.end]];
    case "circle":
      return [circlePoints(el.center, el.radius)];
    case "arc":
      return [
        arcPoints(el.center, el.radius, el.startAngle, el.endAngle),
      ];
    case "rectangle":
      return [rectPoints(el.corner, el.width, el.height)];
    case "polyline":
      return [el.points];
    case "spline":
      return [splineInterpolate(el.points)];
    case "dimension":
      return dimensionPoints(el.from, el.to);
  }
}

/** Отрисовка всех элементов эскиза */
export function renderSketchElements(
  bScene: BScene,
  elements: SketchElement[],
  plane: SketchPlane,
  offset: number,
  namePrefix: string,
  selectedIndex?: number | null
): void {
  elements.forEach((el, i) => {
    const isSelected = selectedIndex === i;
    const color = isSelected
      ? SELECTED_COLOR
      : el.type === "dimension"
        ? DIMENSION_COLOR
        : ELEMENT_COLOR;
    const polylines = elementToPointArrays(el);

    polylines.forEach((pts, j) => {
      if (pts.length < 2) return;
      const points3d = toV3(pts, plane, offset);
      const mesh = MeshBuilder.CreateLines(
        `${namePrefix}_el_${i}_${j}`,
        { points: points3d },
        bScene
      );
      mesh.color = color;
      mesh.isPickable = false;
    });
  });
}

/** Отрисовка превью текущего рисуемого элемента */
export function renderPreviewElement(
  bScene: BScene,
  element: SketchElement | null,
  plane: SketchPlane,
  offset: number
): void {
  // Удаляем старое превью
  bScene.meshes
    .filter((m) => m.name.startsWith("__sketch_preview_"))
    .forEach((m) => m.dispose());

  if (!element) return;

  const polylines = elementToPointArrays(element);
  polylines.forEach((pts, j) => {
    if (pts.length < 2) return;
    const points3d = toV3(pts, plane, offset);
    const mesh = MeshBuilder.CreateLines(
      `__sketch_preview_${j}`,
      { points: points3d },
      bScene
    );
    mesh.color = PREVIEW_COLOR;
    mesh.isPickable = false;
  });
}

/** Удалить все элементы эскиза по префиксу */
export function clearSketchMeshes(
  bScene: BScene,
  namePrefix: string
): void {
  bScene.meshes
    .filter((m) => m.name.startsWith(namePrefix))
    .forEach((m) => m.dispose());
}
