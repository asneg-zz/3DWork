/**
 * Extrude mesh generation from sketch elements
 * Ported from desktop version: crates/gui/src/extrude.rs
 */

import type { SketchElement, SketchPlane } from '@/types/scene'
import * as THREE from 'three'

interface Point2D {
  x: number
  y: number
}

/**
 * Convert 2D sketch point to 3D coordinates based on plane
 */
function sketchTo3D(x: number, y: number, plane: SketchPlane): [number, number, number] {
  switch (plane) {
    case 'XY':
      return [x, y, 0]
    case 'XZ':
      return [x, 0, y]
    case 'YZ':
      return [0, x, y]
  }
}

/**
 * Get plane normal vector
 */
function getPlaneNormal(plane: SketchPlane): [number, number, number] {
  switch (plane) {
    case 'XY':
      return [0, 0, 1]
    case 'XZ':
      return [0, 1, 0]
    case 'YZ':
      return [1, 0, 0]
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

/**
 * Extract closed 2D profiles from sketch elements
 * For now, treats each element as a separate profile
 */
function extractProfiles(elements: SketchElement[]): Point2D[][] {
  const profiles: Point2D[][] = []

  for (const element of elements) {
    const points = elementToPoints(element)
    if (points.length >= 3) {
      // Ensure the profile is closed
      const first = points[0]
      const last = points[points.length - 1]
      const distance = Math.sqrt(
        Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
      )

      if (distance > 0.001) {
        // Close the profile if not already closed
        points.push({ ...first })
      }

      profiles.push(points)
    }
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
  heightBackward: number = 0
): THREE.BufferGeometry {
  const profiles = extractProfiles(elements)
  const normal = getPlaneNormal(plane)
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

    // Convert 2D profile to 3D bottom points
    const bottom3D = profile.map(p => sketchTo3D(p.x, p.y, plane))

    // Calculate top points
    const top3D = bottom3D.map(p => [
      p[0] + extrudeVec[0],
      p[1] + extrudeVec[1],
      p[2] + extrudeVec[2]
    ] as [number, number, number])

    // Bottom cap (fan triangulation)
    const baseIdx = vertices.length / 9
    for (const p of bottom3D) {
      vertices.push(p[0], p[1], p[2]) // position
      vertices.push(bottomNormal[0], bottomNormal[1], bottomNormal[2]) // normal
      vertices.push(0.6, 0.6, 0.65) // color
    }
    for (let i = 1; i < n - 1; i++) {
      if (height >= 0) {
        indices.push(baseIdx, baseIdx + i + 1, baseIdx + i)
      } else {
        indices.push(baseIdx, baseIdx + i, baseIdx + i + 1)
      }
    }

    // Top cap (fan triangulation)
    const topBaseIdx = vertices.length / 9
    for (const p of top3D) {
      vertices.push(p[0], p[1], p[2]) // position
      vertices.push(topNormal[0], topNormal[1], topNormal[2]) // normal
      vertices.push(0.6, 0.6, 0.65) // color
    }
    for (let i = 1; i < n - 1; i++) {
      if (height >= 0) {
        indices.push(topBaseIdx, topBaseIdx + i, topBaseIdx + i + 1)
      } else {
        indices.push(topBaseIdx, topBaseIdx + i + 1, topBaseIdx + i)
      }
    }

    // Side walls
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

      const sideBaseIdx = vertices.length / 9

      // Add 4 vertices for quad
      for (const p of [b0, b1, t1, t0]) {
        vertices.push(p[0], p[1], p[2])
        vertices.push(faceNormal.x, faceNormal.y, faceNormal.z)
        vertices.push(0.6, 0.6, 0.65)
      }

      // Add 2 triangles
      if (height >= 0) {
        indices.push(sideBaseIdx, sideBaseIdx + 1, sideBaseIdx + 2)
        indices.push(sideBaseIdx, sideBaseIdx + 2, sideBaseIdx + 3)
      } else {
        indices.push(sideBaseIdx, sideBaseIdx + 2, sideBaseIdx + 1)
        indices.push(sideBaseIdx, sideBaseIdx + 3, sideBaseIdx + 2)
      }
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
