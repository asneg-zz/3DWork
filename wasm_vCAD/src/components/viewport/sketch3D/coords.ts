/**
 * Coordinate utilities for the 3D sketch editor.
 * Converts between 2D sketch space and 3D world space.
 */

import * as THREE from 'three'
import type { Point2D, SketchElement, SketchPlane, FaceCoordSystem } from '@/types/scene'

// ─── Sketch ↔ World conversions ───────────────────────────────────────────────

export function sketchToWorld(
  x: number,
  y: number,
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): THREE.Vector3 {
  if (plane === 'CUSTOM' && fcs) {
    const o = new THREE.Vector3(...fcs.origin)
    const u = new THREE.Vector3(...fcs.uAxis)
    const v = new THREE.Vector3(...fcs.vAxis)
    return o.clone().addScaledVector(u, x).addScaledVector(v, y)
  }
  switch (plane) {
    case 'XY': return new THREE.Vector3(x, y, offset)
    case 'XZ': return new THREE.Vector3(x, offset, y)
    case 'YZ': return new THREE.Vector3(offset, x, y)
    default:   return new THREE.Vector3(x, y, offset)
  }
}

export function worldToSketch(
  point: THREE.Vector3,
  plane: SketchPlane,
  fcs?: FaceCoordSystem | null
): Point2D {
  if (plane === 'CUSTOM' && fcs) {
    const o = new THREE.Vector3(...fcs.origin)
    const u = new THREE.Vector3(...fcs.uAxis)
    const v = new THREE.Vector3(...fcs.vAxis)
    const p = point.clone().sub(o)
    return { x: p.dot(u), y: p.dot(v) }
  }
  switch (plane) {
    case 'XY': return { x: point.x, y: point.y }
    case 'XZ': return { x: point.x, y: point.z }
    case 'YZ': return { x: point.y, y: point.z }
    default:   return { x: point.x, y: point.y }
  }
}

// ─── Interaction plane helpers ────────────────────────────────────────────────

/** Rotation for the invisible interaction plane mesh */
export function planeRotation(plane: SketchPlane, fcs?: FaceCoordSystem | null): [number, number, number] {
  if (plane === 'CUSTOM' && fcs) {
    const target = new THREE.Vector3(...fcs.normal).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), // default planeGeometry normal
      target
    )
    const euler = new THREE.Euler().setFromQuaternion(q)
    return [euler.x, euler.y, euler.z]
  }
  switch (plane) {
    case 'XY': return [0, 0, 0]
    case 'XZ': return [-Math.PI / 2, 0, 0]
    case 'YZ': return [0, Math.PI / 2, 0]
    default:   return [0, 0, 0]
  }
}

/**
 * Position of the interaction plane.
 * Offset slightly toward the camera so it's hit before the body face.
 */
const PLANE_EPSILON = 0.004

export function planePosition(
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): [number, number, number] {
  if (plane === 'CUSTOM' && fcs) {
    const n = new THREE.Vector3(...fcs.normal)
    const o = new THREE.Vector3(...fcs.origin)
    const pos = o.clone().addScaledVector(n, PLANE_EPSILON)
    return [pos.x, pos.y, pos.z]
  }
  switch (plane) {
    case 'XY': return [0, 0, offset + PLANE_EPSILON]
    case 'XZ': return [0, offset + PLANE_EPSILON, 0]
    case 'YZ': return [offset + PLANE_EPSILON, 0, 0]
    default:   return [0, 0, offset + PLANE_EPSILON]
  }
}

// ─── Element → 3D points ──────────────────────────────────────────────────────

export function elementToPoints3D(
  element: SketchElement,
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): THREE.Vector3[] {
  const s = (x: number, y: number) => sketchToWorld(x, y, plane, offset, fcs)

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        return [s(element.start.x, element.start.y), s(element.end.x, element.end.y)]
      }
      break

    case 'circle': {
      if (element.center && element.radius !== undefined) {
        const pts: THREE.Vector3[] = []
        const segs = 64
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2
          pts.push(s(
            element.center.x + Math.cos(a) * element.radius,
            element.center.y + Math.sin(a) * element.radius
          ))
        }
        return pts
      }
      break
    }

    case 'arc': {
      if (element.center && element.radius !== undefined &&
          element.start_angle !== undefined && element.end_angle !== undefined) {
        const pts: THREE.Vector3[] = []
        const segs = 48
        let startA = element.start_angle
        let endA = element.end_angle
        if (endA < startA) endA += Math.PI * 2
        for (let i = 0; i <= segs; i++) {
          const a = startA + (i / segs) * (endA - startA)
          pts.push(s(
            element.center.x + Math.cos(a) * element.radius,
            element.center.y + Math.sin(a) * element.radius
          ))
        }
        return pts
      }
      break
    }

    case 'rectangle': {
      if (element.corner && element.width !== undefined && element.height !== undefined) {
        const { corner: c, width: w, height: h } = element
        return [
          s(c.x, c.y),
          s(c.x + w, c.y),
          s(c.x + w, c.y + h),
          s(c.x, c.y + h),
          s(c.x, c.y),
        ]
      }
      break
    }

    case 'polyline':
    case 'spline':
      if (element.points && element.points.length >= 2) {
        return element.points.map(p => s(p.x, p.y))
      }
      break

    case 'dimension':
      // Dimensions are rendered via Html overlay
      break
  }

  return []
}
