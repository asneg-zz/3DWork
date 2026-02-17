/**
 * Extrude mesh generation from sketch elements
 * Ported from desktop version: crates/gui/src/extrude.rs
 */

import type { SketchElement, SketchPlane, FaceCoordSystem } from '@/types/scene'
import * as THREE from 'three'

interface Point2D {
  x: number
  y: number
}

/**
 * Convert 2D sketch point to 3D coordinates based on plane, offset, and optional FCS
 */
function sketchTo3D(
  x: number,
  y: number,
  plane: SketchPlane,
  offset: number,
  fcs?: FaceCoordSystem | null
): [number, number, number] {
  if (plane === 'CUSTOM' && fcs) {
    // origin + x*uAxis + y*vAxis
    return [
      fcs.origin[0] + x * fcs.uAxis[0] + y * fcs.vAxis[0],
      fcs.origin[1] + x * fcs.uAxis[1] + y * fcs.vAxis[1],
      fcs.origin[2] + x * fcs.uAxis[2] + y * fcs.vAxis[2],
    ]
  }
  switch (plane) {
    case 'XY':
      return [x, y, offset]
    case 'XZ':
      return [x, offset, y]
    case 'YZ':
      return [offset, x, y]
    default:
      return [x, y, offset]
  }
}

/**
 * Get plane normal vector
 */
function getPlaneNormal(
  plane: SketchPlane,
  fcs?: FaceCoordSystem | null
): [number, number, number] {
  if (plane === 'CUSTOM' && fcs) {
    return [fcs.normal[0], fcs.normal[1], fcs.normal[2]]
  }
  switch (plane) {
    case 'XY':
      return [0, 0, 1]
    case 'XZ':
      return [0, 1, 0]
    case 'YZ':
      return [1, 0, 0]
    default:
      return [0, 0, 1]
  }
}

/**
 * Extract 2D profile points from sketch element
 */
function elementToPoints(element: SketchElement, segments: number = 32): Point2D[] {
  const points: Point2D[] = []

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        points.push({ x: element.start.x, y: element.start.y })
        points.push({ x: element.end.x, y: element.end.y })
      }
      break

    case 'rectangle': {
      const { corner, width, height } = element
      if (corner && width !== undefined && height !== undefined) {
        points.push({ x: corner.x, y: corner.y })
        points.push({ x: corner.x + width, y: corner.y })
        points.push({ x: corner.x + width, y: corner.y + height })
        points.push({ x: corner.x, y: corner.y + height })
      }
      break
    }

    case 'circle': {
      const { center, radius } = element
      if (center && radius !== undefined) {
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2
          points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
          })
        }
      }
      break
    }

    case 'arc': {
      const { center, radius, start_angle, end_angle } = element
      if (center && radius !== undefined && start_angle !== undefined && end_angle !== undefined) {
        let angle = start_angle
        const angleStep = (end_angle - start_angle) / segments

        for (let i = 0; i <= segments; i++) {
          points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
          })
          angle += angleStep
        }
      }
      break
    }

    case 'polyline':
    case 'spline':
      if (element.points) {
        points.push(...element.points.map(p => ({ x: p.x, y: p.y })))
      }
      break
  }

  return points
}

const COINCIDENCE_TOL = 0.001

function ptEq(a: Point2D, b: Point2D): boolean {
  return Math.abs(a.x - b.x) < COINCIDENCE_TOL && Math.abs(a.y - b.y) < COINCIDENCE_TOL
}

/**
 * Chain open segments (lines, arcs) into closed loops.
 * Each segment is an ordered array of points (start → ... → end).
 */
function chainSegments(segments: Point2D[][]): Point2D[][] {
  const used = new Array(segments.length).fill(false)
  const loops: Point2D[][] = []

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue

    const chain: Point2D[] = [...segments[start]]
    used[start] = true

    // Keep extending the chain until no more connected segment found
    let progress = true
    while (progress) {
      progress = false
      const tail = chain[chain.length - 1]

      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue
        const seg = segments[i]

        if (ptEq(seg[0], tail)) {
          chain.push(...seg.slice(1))
          used[i] = true
          progress = true
          break
        } else if (ptEq(seg[seg.length - 1], tail)) {
          chain.push(...[...seg].reverse().slice(1))
          used[i] = true
          progress = true
          break
        }
      }
    }

    if (chain.length < 3) continue

    const first = chain[0]
    const last = chain[chain.length - 1]
    const closeDist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2)

    // Accept if closed or nearly closed (within 0.01 units)
    if (closeDist > 0.01) continue

    if (!ptEq(first, last)) chain.push({ ...first })
    loops.push(chain)
  }

  return loops
}

/**
 * Extract closed 2D profiles from sketch elements.
 * Handles both single closed elements (circle, rectangle, closed polyline)
 * and multi-segment closed contours assembled from connected lines/arcs.
 */
function extractProfiles(elements: SketchElement[]): Point2D[][] {
  const profiles: Point2D[][] = []
  const openSegments: Point2D[][] = []

  for (const element of elements) {
    if (element.type === 'dimension') continue

    const points = elementToPoints(element)
    if (points.length < 2) continue

    // Circles are already closed loops — use directly
    if (element.type === 'circle') {
      if (points.length >= 3) profiles.push(points)
      continue
    }

    // Rectangles are closed polygons — close and use directly
    if (element.type === 'rectangle') {
      if (points.length >= 3) {
        if (!ptEq(points[0], points[points.length - 1])) points.push({ ...points[0] })
        profiles.push(points)
      }
      continue
    }

    // Closed polyline/spline — use directly
    if ((element.type === 'polyline' || element.type === 'spline') && points.length >= 3) {
      if (ptEq(points[0], points[points.length - 1])) {
        profiles.push(points)
        continue
      }
    }

    // Everything else (lines, arcs, open polylines) — collect for chaining
    openSegments.push(points)
  }

  // Chain open segments into closed loops (e.g. triangle from 3 lines)
  if (openSegments.length > 0) {
    profiles.push(...chainSegments(openSegments))
  }

  return profiles
}

/**
 * Generate extruded mesh from sketch elements
 */
export function generateExtrudeMesh(
  elements: SketchElement[],
  plane: SketchPlane,
  height: number,
  heightBackward: number = 0,
  offset: number = 0,
  fcs?: FaceCoordSystem | null
): THREE.BufferGeometry {
  const profiles = extractProfiles(elements)
  const normal = getPlaneNormal(plane, fcs)
  const totalHeight = height + heightBackward

  // Extrusion vector
  const extrudeVec: [number, number, number] = [
    normal[0] * totalHeight,
    normal[1] * totalHeight,
    normal[2] * totalHeight
  ]

  // Normal vectors for caps
  const bottomNormal = height >= 0 ? [-normal[0], -normal[1], -normal[2]] : normal
  const topNormal = height >= 0 ? normal : [-normal[0], -normal[1], -normal[2]]

  const vertices: number[] = []
  const indices: number[] = []

  for (const profile of profiles) {
    const n = profile.length
    if (n < 3) continue

    // Convert 2D profile to 3D bottom points (with plane offset or FCS)
    const bottom3D = profile.map(p => sketchTo3D(p.x, p.y, plane, offset, fcs))

    // Calculate top points
    const top3D = bottom3D.map(p => [
      p[0] + extrudeVec[0],
      p[1] + extrudeVec[1],
      p[2] + extrudeVec[2]
    ] as [number, number, number])

    // Bottom cap (fan triangulation with separate vertices per triangle)
    for (let i = 1; i < n - 1; i++) {
      const triIdx = vertices.length / 9

      // Add 3 vertices for this triangle (no shared vertices)
      const triPoints = height >= 0
        ? [bottom3D[0], bottom3D[i + 1], bottom3D[i]]
        : [bottom3D[0], bottom3D[i], bottom3D[i + 1]]

      for (const p of triPoints) {
        vertices.push(p[0], p[1], p[2]) // position
        vertices.push(bottomNormal[0], bottomNormal[1], bottomNormal[2]) // normal
        vertices.push(0.6, 0.6, 0.65) // color
      }

      indices.push(triIdx, triIdx + 1, triIdx + 2)
    }

    // Top cap (fan triangulation with separate vertices per triangle)
    for (let i = 1; i < n - 1; i++) {
      const triIdx = vertices.length / 9

      // Add 3 vertices for this triangle (no shared vertices)
      const triPoints = height >= 0
        ? [top3D[0], top3D[i], top3D[i + 1]]
        : [top3D[0], top3D[i + 1], top3D[i]]

      for (const p of triPoints) {
        vertices.push(p[0], p[1], p[2]) // position
        vertices.push(topNormal[0], topNormal[1], topNormal[2]) // normal
        vertices.push(0.6, 0.6, 0.65) // color
      }

      indices.push(triIdx, triIdx + 1, triIdx + 2)
    }

    // Side walls (each triangle gets its own 3 vertices)
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n
      const b0 = bottom3D[i]
      const b1 = bottom3D[next]
      const t0 = top3D[i]
      const t1 = top3D[next]

      // Calculate face normal
      const edge1 = new THREE.Vector3(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2])
      const edge2 = new THREE.Vector3(t0[0] - b0[0], t0[1] - b0[1], t0[2] - b0[2])
      const faceNormal = height >= 0
        ? new THREE.Vector3().crossVectors(edge2, edge1).normalize()
        : new THREE.Vector3().crossVectors(edge1, edge2).normalize()

      // First triangle (b0, b1, t1)
      const tri1Idx = vertices.length / 9
      const tri1Points = height >= 0 ? [b0, b1, t1] : [b0, t1, b1]
      for (const p of tri1Points) {
        vertices.push(p[0], p[1], p[2])
        vertices.push(faceNormal.x, faceNormal.y, faceNormal.z)
        vertices.push(0.6, 0.6, 0.65)
      }
      indices.push(tri1Idx, tri1Idx + 1, tri1Idx + 2)

      // Second triangle (b0, t1, t0)
      const tri2Idx = vertices.length / 9
      const tri2Points = height >= 0 ? [b0, t1, t0] : [b0, t0, t1]
      for (const p of tri2Points) {
        vertices.push(p[0], p[1], p[2])
        vertices.push(faceNormal.x, faceNormal.y, faceNormal.z)
        vertices.push(0.6, 0.6, 0.65)
      }
      indices.push(tri2Idx, tri2Idx + 1, tri2Idx + 2)
    }
  }

  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry()

  // Extract positions and normals from interleaved data
  const positions = new Float32Array(vertices.length / 3)
  const normals = new Float32Array(vertices.length / 3)

  for (let i = 0; i < vertices.length / 9; i++) {
    const offset = i * 9
    // Position
    positions[i * 3] = vertices[offset]
    positions[i * 3 + 1] = vertices[offset + 1]
    positions[i * 3 + 2] = vertices[offset + 2]
    // Normal
    normals[i * 3] = vertices[offset + 3]
    normals[i * 3 + 1] = vertices[offset + 4]
    normals[i * 3 + 2] = vertices[offset + 5]
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(indices)

  return geometry
}
