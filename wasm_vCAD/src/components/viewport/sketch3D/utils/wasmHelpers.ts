/**
 * WASM helper functions for sketch operations
 */

import type { SketchElement, Sketch, SketchConstraint } from '@/types/scene'

// ─── Sketch Serialization ────────────────────────────────────────────────────

/**
 * Create a Sketch object for WASM operations
 * Ensures consistent structure and ID generation
 */
export function createSketchForWasm(
  elements: SketchElement[],
  plane: 'XY' | 'XZ' | 'YZ',
  constraints?: SketchConstraint[]
): Sketch {
  return {
    id: crypto.randomUUID(),
    plane,
    offset: 0.0,
    elements,
    ...(constraints && constraints.length > 0 ? { constraints } : {})
  }
}

// ─── Result Processing ───────────────────────────────────────────────────────

/**
 * Process WASM result preserving element IDs
 * Maintains original IDs where possible
 */
export function processWasmResult(
  resultJson: string,
  originalElements?: SketchElement[]
): SketchElement[] {
  const resultSketch: Sketch = JSON.parse(resultJson)

  return resultSketch.elements.map((elem, index) => ({
    ...elem,
    id: elem.id || originalElements?.[index]?.id || crypto.randomUUID()
  }))
}

/**
 * Apply a WASM operation and return updated elements
 * Handles the common pattern of calling WASM and processing results
 */
export function applyWasmOperation(
  operationFn: () => string
): SketchElement[] {
  const newSketchJson = operationFn()
  const newSketch: Sketch = JSON.parse(newSketchJson)

  return newSketch.elements.map(el => {
    if (!el.id) {
      return { ...el, id: crypto.randomUUID() }
    }
    return el
  })
}

/**
 * Safely apply a WASM operation with error handling
 */
export function applyWasmOperationSafe(
  operationFn: () => string
): { success: true; elements: SketchElement[] } | { success: false; error: string } {
  try {
    const elements = applyWasmOperation(operationFn)
    return { success: true, elements }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, error: errorMessage }
  }
}

// ─── Endpoint Merging & Element Joining ───────────────────────────────────────

interface Point2D {
  x: number
  y: number
}

const SNAP_TOLERANCE = 0.1 // Tolerance for endpoint merging (in sketch units)

/**
 * Calculate distance between two points
 */
function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Get all endpoint positions from an element
 */
function getElementEndpoints(elem: SketchElement): Point2D[] {
  switch (elem.type) {
    case 'line':
      if (elem.start && elem.end) {
        return [elem.start, elem.end]
      }
      break
    case 'arc':
      if (elem.center && elem.radius !== undefined &&
          elem.start_angle !== undefined && elem.end_angle !== undefined) {
        return [
          {
            x: elem.center.x + elem.radius * Math.cos(elem.start_angle),
            y: elem.center.y + elem.radius * Math.sin(elem.start_angle)
          },
          {
            x: elem.center.x + elem.radius * Math.cos(elem.end_angle),
            y: elem.center.y + elem.radius * Math.sin(elem.end_angle)
          }
        ]
      }
      break
    case 'polyline':
    case 'spline':
      if (elem.points && elem.points.length >= 2) {
        return [elem.points[0], elem.points[elem.points.length - 1]]
      }
      break
  }
  return []
}

/**
 * Merge nearby endpoints in sketch elements to form connected contours.
 * After trimming, intersection points may have slight numerical differences.
 * This function snaps endpoints that are within tolerance to exact same coordinates.
 *
 * NOTE: Both intersecting elements must be trimmed for their endpoints to meet
 * at the intersection point and be merged.
 */
export function mergeNearbyEndpoints(elements: SketchElement[]): SketchElement[] {
  // Collect all endpoints
  const allEndpoints: Point2D[] = []
  for (const elem of elements) {
    allEndpoints.push(...getElementEndpoints(elem))
  }

  // Create merged point clusters
  const mergedPoints: Point2D[] = []

  // For each endpoint, find if there's a nearby merged point or create new one
  const findOrCreateMergedPoint = (pt: Point2D): Point2D => {
    for (const merged of mergedPoints) {
      if (distance(pt, merged) < SNAP_TOLERANCE) {
        return merged
      }
    }
    // No nearby point found, add this one as a new merged point
    const newMerged = { x: pt.x, y: pt.y }
    mergedPoints.push(newMerged)
    return newMerged
  }

  // First pass: register all endpoints to build merged point list
  for (const pt of allEndpoints) {
    findOrCreateMergedPoint(pt)
  }

  // Helper to get the merged point for any point
  const getSnappedPoint = (pt: Point2D): Point2D => {
    for (const merged of mergedPoints) {
      if (distance(pt, merged) < SNAP_TOLERANCE) {
        return merged
      }
    }
    return pt
  }

  // Second pass: update elements with snapped endpoints
  return elements.map(elem => {
    switch (elem.type) {
      case 'line': {
        if (!elem.start || !elem.end) return elem
        const newStart = getSnappedPoint(elem.start)
        const newEnd = getSnappedPoint(elem.end)
        return {
          ...elem,
          start: { x: newStart.x, y: newStart.y },
          end: { x: newEnd.x, y: newEnd.y }
        }
      }

      case 'arc': {
        if (!elem.center || elem.radius === undefined ||
            elem.start_angle === undefined || elem.end_angle === undefined) return elem

        // Calculate current endpoints
        const startPt = {
          x: elem.center.x + elem.radius * Math.cos(elem.start_angle),
          y: elem.center.y + elem.radius * Math.sin(elem.start_angle)
        }
        const endPt = {
          x: elem.center.x + elem.radius * Math.cos(elem.end_angle),
          y: elem.center.y + elem.radius * Math.sin(elem.end_angle)
        }

        // Get snapped positions
        const snappedStart = getSnappedPoint(startPt)
        const snappedEnd = getSnappedPoint(endPt)

        // Recalculate angles from snapped positions
        const newStartAngle = Math.atan2(
          snappedStart.y - elem.center.y,
          snappedStart.x - elem.center.x
        )
        const newEndAngle = Math.atan2(
          snappedEnd.y - elem.center.y,
          snappedEnd.x - elem.center.x
        )

        return {
          ...elem,
          start_angle: newStartAngle,
          end_angle: newEndAngle
        }
      }

      case 'polyline':
      case 'spline': {
        if (!elem.points || elem.points.length < 2) return elem
        const newPoints = elem.points.map((pt, i) => {
          // Only snap first and last points (endpoints)
          if (i === 0 || i === elem.points!.length - 1) {
            const snapped = getSnappedPoint(pt)
            return { x: snapped.x, y: snapped.y }
          }
          return pt
        })
        return { ...elem, points: newPoints }
      }

      default:
        return elem
    }
  })
}

/**
 * Convert an element to an array of points (for joining into polyline)
 */
function elementToPointArray(elem: SketchElement): Point2D[] {
  switch (elem.type) {
    case 'line':
      if (elem.start && elem.end) {
        return [
          { x: elem.start.x, y: elem.start.y },
          { x: elem.end.x, y: elem.end.y }
        ]
      }
      break

    case 'arc':
      if (elem.center && elem.radius !== undefined &&
          elem.start_angle !== undefined && elem.end_angle !== undefined) {
        const points: Point2D[] = []
        const angleRange = elem.end_angle - elem.start_angle
        const segments = Math.max(8, Math.ceil(Math.abs(angleRange) / (Math.PI / 16)))

        for (let i = 0; i <= segments; i++) {
          const angle = elem.start_angle + (angleRange * i) / segments
          points.push({
            x: elem.center.x + elem.radius * Math.cos(angle),
            y: elem.center.y + elem.radius * Math.sin(angle)
          })
        }
        return points
      }
      break

    case 'polyline':
    case 'spline':
      if (elem.points && elem.points.length >= 2) {
        return elem.points.map(p => ({ x: p.x, y: p.y }))
      }
      break
  }
  return []
}

/**
 * Check if two points are coincident within tolerance
 */
function pointsCoincident(a: Point2D, b: Point2D): boolean {
  return distance(a, b) < SNAP_TOLERANCE
}

/**
 * Join connected open elements (lines, arcs, polylines) into single polylines.
 * Elements that share endpoints within tolerance will be merged.
 * Closed elements (circles, rectangles) and dimensions are kept as-is.
 */
export function joinConnectedElements(elements: SketchElement[]): SketchElement[] {
  // Separate joinable elements from non-joinable
  const joinable: { elem: SketchElement; points: Point2D[]; used: boolean }[] = []
  const nonJoinable: SketchElement[] = []

  for (const elem of elements) {
    if (elem.type === 'circle' || elem.type === 'rectangle' || elem.type === 'dimension') {
      nonJoinable.push(elem)
      continue
    }

    const points = elementToPointArray(elem)
    if (points.length >= 2) {
      joinable.push({ elem, points, used: false })
    } else {
      nonJoinable.push(elem)
    }
  }

  if (joinable.length === 0) {
    return elements
  }

  // Chain connected segments
  const chains: Point2D[][] = []

  for (let startIdx = 0; startIdx < joinable.length; startIdx++) {
    if (joinable[startIdx].used) continue

    // Start a new chain with this segment
    const chain: Point2D[] = [...joinable[startIdx].points]
    joinable[startIdx].used = true

    // Keep extending the chain in both directions
    let progress = true
    while (progress) {
      progress = false
      const chainStart = chain[0]
      const chainEnd = chain[chain.length - 1]

      for (let i = 0; i < joinable.length; i++) {
        if (joinable[i].used) continue
        const seg = joinable[i].points
        const segStart = seg[0]
        const segEnd = seg[seg.length - 1]

        // Try to connect at chain end
        if (pointsCoincident(segStart, chainEnd)) {
          // Append segment (skip first point as it's coincident with chain end)
          chain.push(...seg.slice(1))
          joinable[i].used = true
          progress = true
          break
        } else if (pointsCoincident(segEnd, chainEnd)) {
          // Append reversed segment
          chain.push(...seg.slice(0, -1).reverse())
          joinable[i].used = true
          progress = true
          break
        }
        // Try to connect at chain start
        else if (pointsCoincident(segEnd, chainStart)) {
          // Prepend segment (skip last point as it's coincident with chain start)
          chain.unshift(...seg.slice(0, -1))
          joinable[i].used = true
          progress = true
          break
        } else if (pointsCoincident(segStart, chainStart)) {
          // Prepend reversed segment
          chain.unshift(...seg.slice(1).reverse())
          joinable[i].used = true
          progress = true
          break
        }
      }
    }

    chains.push(chain)
  }

  // Convert chains to polyline elements
  const result: SketchElement[] = [...nonJoinable]

  for (const chain of chains) {
    if (chain.length < 2) continue

    // Check if the chain is closed (first and last points coincide)
    const isClosed = pointsCoincident(chain[0], chain[chain.length - 1])

    // Create polyline from chain
    const polyline: SketchElement = {
      type: 'polyline',
      id: crypto.randomUUID(),
      points: isClosed
        ? chain.slice(0, -1).map(p => ({ x: p.x, y: p.y }))  // Remove redundant closing point
        : chain.map(p => ({ x: p.x, y: p.y }))
    }

    // If closed, close the polyline by adding the first point at the end
    if (isClosed && polyline.points && polyline.points.length >= 3) {
      polyline.points.push({ ...polyline.points[0] })
    }

    result.push(polyline)
  }

  return result
}
