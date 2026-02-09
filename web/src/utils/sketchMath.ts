import { Vector3, Matrix, type Scene as BScene } from "@babylonjs/core";
import type { Point2D, SketchPlane } from "../types/scene";

/** 2D точка эскиза → 3D координаты мира */
export function point2Dto3D(
  p: Point2D,
  plane: SketchPlane,
  offset: number
): Vector3 {
  switch (plane) {
    case "XY":
      return new Vector3(p.x, p.y, offset);
    case "XZ":
      return new Vector3(p.x, offset, p.y);
    case "YZ":
      return new Vector3(offset, p.x, p.y);
  }
}

/** 3D координаты мира → 2D точка эскиза */
export function point3Dto2D(v: Vector3, plane: SketchPlane): Point2D {
  switch (plane) {
    case "XY":
      return { x: v.x, y: v.y };
    case "XZ":
      return { x: v.x, y: v.z };
    case "YZ":
      return { x: v.y, y: v.z };
  }
}

/** Пересечение луча камеры с плоскостью эскиза → 2D точка */
export function pickPointOnPlane(
  bScene: BScene,
  pointerX: number,
  pointerY: number,
  plane: SketchPlane,
  offset: number
): Point2D | null {
  const camera = bScene.activeCamera;
  if (!camera) return null;

  const ray = bScene.createPickingRay(
    pointerX,
    pointerY,
    Matrix.Identity(),
    camera
  );

  // Определяем нормаль и точку на плоскости
  let normal: Vector3;
  let planePoint: Vector3;

  switch (plane) {
    case "XY":
      normal = new Vector3(0, 0, 1);
      planePoint = new Vector3(0, 0, offset);
      break;
    case "XZ":
      normal = new Vector3(0, 1, 0);
      planePoint = new Vector3(0, offset, 0);
      break;
    case "YZ":
      normal = new Vector3(1, 0, 0);
      planePoint = new Vector3(offset, 0, 0);
      break;
  }

  // Ray-plane intersection: t = dot(planePoint - ray.origin, normal) / dot(ray.direction, normal)
  const denom = Vector3.Dot(ray.direction, normal);
  if (Math.abs(denom) < 1e-8) return null; // луч параллелен плоскости

  const diff = planePoint.subtract(ray.origin);
  const t = Vector3.Dot(diff, normal) / denom;
  if (t < 0) return null; // плоскость за камерой

  const hit = ray.origin.add(ray.direction.scale(t));
  return point3Dto2D(hit, plane);
}

/** Параметры камеры для ортогонального вида плоскости */
export function getCameraForPlane(
  plane: SketchPlane
): { alpha: number; beta: number } {
  switch (plane) {
    case "XY":
      // Смотрим вдоль -Z (фронтальный вид)
      return { alpha: -Math.PI / 2, beta: 0 };
    case "XZ":
      // Смотрим вдоль -Y (вид сверху)
      return { alpha: -Math.PI / 2, beta: 0.001 }; // beta=0 exact вызывает gimbal lock
    case "YZ":
      // Смотрим вдоль -X (вид сбоку)
      return { alpha: 0, beta: Math.PI / 2 };
  }
}

/** Расстояние между двумя 2D точками */
export function dist2D(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Угол от центра к точке (в радианах) */
export function angle2D(center: Point2D, p: Point2D): number {
  return Math.atan2(p.y - center.y, p.x - center.x);
}
