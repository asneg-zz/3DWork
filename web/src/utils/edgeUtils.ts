import * as THREE from 'three'

export interface MeshEdge {
  start: THREE.Vector3
  end: THREE.Vector3
  normal1: THREE.Vector3
  normal2: THREE.Vector3 | null
  index: number
}

export interface EdgeHit {
  edge: MeshEdge
  distance: number
  point: THREE.Vector3
}

/**
 * Extract edges from a BufferGeometry
 * Returns only "sharp" edges where faces meet at an angle
 */
export function extractEdges(geometry: THREE.BufferGeometry, sharpAngleThreshold = 30): MeshEdge[] {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()

  if (!position) return []

  const edges: MeshEdge[] = []
  const edgeMap = new Map<string, {
    start: THREE.Vector3,
    end: THREE.Vector3,
    normal1: THREE.Vector3,
    normal2: THREE.Vector3 | null
  }>()

  // Helper to create edge key
  const makeKey = (a: THREE.Vector3, b: THREE.Vector3): string => {
    const p1 = `${a.x.toFixed(4)},${a.y.toFixed(4)},${a.z.toFixed(4)}`
    const p2 = `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.z.toFixed(4)}`
    return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`
  }

  // Get triangle count
  const triCount = index ? index.count / 3 : position.count / 3

  for (let i = 0; i < triCount; i++) {
    let i0: number, i1: number, i2: number

    if (index) {
      i0 = index.getX(i * 3)
      i1 = index.getX(i * 3 + 1)
      i2 = index.getX(i * 3 + 2)
    } else {
      i0 = i * 3
      i1 = i * 3 + 1
      i2 = i * 3 + 2
    }

    const v0 = new THREE.Vector3().fromBufferAttribute(position, i0)
    const v1 = new THREE.Vector3().fromBufferAttribute(position, i1)
    const v2 = new THREE.Vector3().fromBufferAttribute(position, i2)

    // Calculate face normal
    const edge1 = new THREE.Vector3().subVectors(v1, v0)
    const edge2 = new THREE.Vector3().subVectors(v2, v0)
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()

    // Process each edge of the triangle
    const triEdges: [THREE.Vector3, THREE.Vector3][] = [
      [v0, v1],
      [v1, v2],
      [v2, v0]
    ]

    for (const [start, end] of triEdges) {
      const key = makeKey(start, end)
      const existing = edgeMap.get(key)

      if (existing) {
        // Second face sharing this edge
        if (!existing.normal2) {
          existing.normal2 = normal.clone()
        }
      } else {
        edgeMap.set(key, {
          start: start.clone(),
          end: end.clone(),
          normal1: normal.clone(),
          normal2: null
        })
      }
    }
  }

  // Filter to sharp edges only
  const thresholdRad = (sharpAngleThreshold * Math.PI) / 180
  let idx = 0

  for (const [, edge] of edgeMap) {
    if (edge.normal2) {
      // Calculate dihedral angle
      const dot = Math.abs(edge.normal1.dot(edge.normal2))
      const angle = Math.acos(Math.min(1, dot))

      if (angle > thresholdRad) {
        edges.push({
          start: edge.start,
          end: edge.end,
          normal1: edge.normal1,
          normal2: edge.normal2,
          index: idx++
        })
      }
    } else {
      // Boundary edge (only one face) - always include
      edges.push({
        start: edge.start,
        end: edge.end,
        normal1: edge.normal1,
        normal2: null,
        index: idx++
      })
    }
  }

  return edges
}

/**
 * Find the closest edge to a ray
 */
export function pickEdge(
  _raycaster: THREE.Raycaster,
  edges: MeshEdge[],
  camera: THREE.Camera,
  screenSize: { width: number, height: number },
  cursorNDC: THREE.Vector2,
  pixelTolerance = 15
): EdgeHit | null {
  let best: { edge: MeshEdge, screenDist: number, depth: number, point: THREE.Vector3 } | null = null

  const tempV3 = new THREE.Vector3()

  // Project point to screen
  const projectToScreen = (point: THREE.Vector3): THREE.Vector2 | null => {
    tempV3.copy(point).project(camera)
    if (tempV3.z < -1 || tempV3.z > 1) return null
    return new THREE.Vector2(
      (tempV3.x + 1) * 0.5 * screenSize.width,
      (1 - tempV3.y) * 0.5 * screenSize.height
    )
  }

  // Cursor in screen pixels
  const cursorScreen = new THREE.Vector2(
    (cursorNDC.x + 1) * 0.5 * screenSize.width,
    (1 - cursorNDC.y) * 0.5 * screenSize.height
  )

  for (const edge of edges) {
    const p0 = projectToScreen(edge.start)
    const p1 = projectToScreen(edge.end)

    if (!p0 || !p1) continue

    // Calculate distance from cursor to edge segment in screen space
    const screenDist = pointToSegmentDistance2D(cursorScreen, p0, p1)

    if (screenDist > pixelTolerance) continue

    // Calculate depth (distance from camera)
    const midpoint = new THREE.Vector3().addVectors(edge.start, edge.end).multiplyScalar(0.5)
    const depth = camera.position.distanceTo(midpoint)

    // Check if this edge is "dominated" by current best (same logic as GUI)
    const dominated = best !== null && (() => {
      // Use relative depth threshold (5% of distance)
      const depthThreshold = best.depth * 0.05

      // If significantly further from camera, dominated
      if (depth > best.depth + depthThreshold) {
        return true
      }
      // If significantly closer, not dominated
      if (depth < best.depth - depthThreshold) {
        return false
      }
      // Similar depth: prefer closer to cursor
      return screenDist > best.screenDist
    })()

    if (!dominated) {
      best = { edge, screenDist, depth, point: midpoint }
    }
  }

  return best ? { edge: best.edge, distance: best.screenDist, point: best.point } : null
}

/**
 * Calculate distance from a 2D point to a 2D line segment
 */
function pointToSegmentDistance2D(
  point: THREE.Vector2,
  p0: THREE.Vector2,
  p1: THREE.Vector2
): number {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-8) {
    return point.distanceTo(p0)
  }

  let t = ((point.x - p0.x) * dx + (point.y - p0.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = p0.x + t * dx
  const projY = p0.y + t * dy

  const ddx = point.x - projX
  const ddy = point.y - projY

  return Math.sqrt(ddx * ddx + ddy * ddy)
}
