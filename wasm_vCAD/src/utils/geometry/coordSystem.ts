/**
 * Unified coordinate system utilities
 *
 * Single source of truth for plane coordinate systems.
 * Used by: extrudeMesh, manifoldCSG, coords (Three.js adapter)
 */

import type { SketchPlane, FaceCoordSystem, Point2D } from '@/types/scene'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Coordinate system for a sketch plane
 */
export interface CoordSystem {
  /** 3D world position at sketch origin (u=0, v=0) */
  origin: [number, number, number]
  /** Extrusion direction (unit vector) */
  normal: [number, number, number]
  /** World direction corresponding to sketch u (x) axis */
  uAxis: [number, number, number]
  /** World direction corresponding to sketch v (y) axis */
  vAxis: [number, number, number]
}

// ─── Main function ───────────────────────────────────────────────────────────

/**
 * Get the coordinate system for a sketch plane
 *
 * @param plane - Plane type (XY, XZ, YZ, or CUSTOM)
 * @param offset - Offset along plane normal
 * @param fcs - Face coordinate system (required for CUSTOM plane)
 * @returns CoordSystem with origin, normal, uAxis, vAxis
 */
export function getPlaneCoordSystem(
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): CoordSystem {
  if (plane === 'CUSTOM' && fcs) {
    return {
      origin: [...fcs.origin] as [number, number, number],
      normal: [...fcs.normal] as [number, number, number],
      uAxis: [...fcs.uAxis] as [number, number, number],
      vAxis: [...fcs.vAxis] as [number, number, number],
    }
  }

  switch (plane) {
    case 'XY':
      return {
        origin: [0, 0, offset],
        normal: [0, 0, 1],
        uAxis: [1, 0, 0],
        vAxis: [0, 1, 0],
      }
    case 'XZ':
      return {
        origin: [0, offset, 0],
        normal: [0, 1, 0],
        uAxis: [1, 0, 0],
        vAxis: [0, 0, 1],
      }
    case 'YZ':
      return {
        origin: [offset, 0, 0],
        normal: [1, 0, 0],
        uAxis: [0, 1, 0],
        vAxis: [0, 0, 1],
      }
    default:
      return {
        origin: [0, 0, offset],
        normal: [0, 0, 1],
        uAxis: [1, 0, 0],
        vAxis: [0, 1, 0],
      }
  }
}

// ─── Coordinate transformations ──────────────────────────────────────────────

/**
 * Convert 2D sketch coordinates to 3D world coordinates
 */
export function sketchToWorld3D(
  x: number,
  y: number,
  cs: CoordSystem
): [number, number, number] {
  return [
    cs.origin[0] + cs.uAxis[0] * x + cs.vAxis[0] * y,
    cs.origin[1] + cs.uAxis[1] * x + cs.vAxis[1] * y,
    cs.origin[2] + cs.uAxis[2] * x + cs.vAxis[2] * y,
  ]
}

/**
 * Convert 3D world coordinates to 2D sketch coordinates
 */
export function worldToSketch2D(
  worldX: number,
  worldY: number,
  worldZ: number,
  cs: CoordSystem
): Point2D {
  // Vector from origin to point
  const dx = worldX - cs.origin[0]
  const dy = worldY - cs.origin[1]
  const dz = worldZ - cs.origin[2]

  // Project onto u and v axes (dot products)
  const u = dx * cs.uAxis[0] + dy * cs.uAxis[1] + dz * cs.uAxis[2]
  const v = dx * cs.vAxis[0] + dy * cs.vAxis[1] + dz * cs.vAxis[2]

  return { x: u, y: v }
}

// ─── Shorthand helpers ───────────────────────────────────────────────────────

/**
 * Quick conversion for plane + offset (without creating CoordSystem first)
 */
export function sketchPointToWorld(
  point: Point2D,
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): [number, number, number] {
  const cs = getPlaneCoordSystem(plane, offset, fcs)
  return sketchToWorld3D(point.x, point.y, cs)
}

/**
 * Quick conversion for plane + offset (without creating CoordSystem first)
 */
export function worldPointToSketch(
  worldX: number,
  worldY: number,
  worldZ: number,
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): Point2D {
  const cs = getPlaneCoordSystem(plane, offset, fcs)
  return worldToSketch2D(worldX, worldY, worldZ, cs)
}

// ─── Vector utilities ────────────────────────────────────────────────────────

/**
 * Normalize a 3D vector
 */
export function normalizeVec3(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  if (len < 1e-10) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * Dot product of two 3D vectors
 */
export function dotVec3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Cross product of two 3D vectors
 */
export function crossVec3(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
