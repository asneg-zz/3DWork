/**
 * Hit testing utilities for sketch elements
 * Provides element detection at cursor position for selection, trimming, etc.
 */

import type { Point2D, SketchElement, Sketch } from '@/types/scene'
import { engine } from '@/wasm/engine'
import { distance2D } from '@/utils/mathUtils'
import { getElementControlPoints, type ControlPointHit } from './controlPoints'

// ─── Constants ────────────────────────────────────────────────────────────────

const HIT_THRESHOLD = 0.2
const EXTENSION_LINE_THRESHOLD_MULTIPLIER = 1.5

// ─── Element Hit Testing ─────────────────────────────────────────────────────

export interface FindElementOptions {
  /** Allow clicking inside circles/arcs (for dimension tool) */
  includeCircleInterior?: boolean
  /** Custom hit threshold */
  threshold?: number
}

/**
 * Find element at a given point using WASM hit detection
 * @returns Element ID or null if not found
 */
export function findElementAtPoint(
  point: Point2D,
  elements: SketchElement[],
  sketchPlane: 'XY' | 'XZ' | 'YZ',
  options: FindElementOptions | boolean = {}
): string | null {
  // Support legacy boolean parameter
  const opts: FindElementOptions = typeof options === 'boolean'
    ? { includeCircleInterior: options }
    : options

  const threshold = opts.threshold ?? HIT_THRESHOLD

  // 1. Check dimension elements (WASM doesn't handle them)
  const dimensionHit = findDimensionAtPoint(point, elements, threshold)
  if (dimensionHit) return dimensionHit

  // 2. For dimension tool: allow clicking inside circles/arcs
  if (opts.includeCircleInterior) {
    const interiorHit = findCircleInteriorAtPoint(point, elements)
    if (interiorHit) return interiorHit
  }

  // 3. Use WASM for edge detection (lines, circles, arcs, etc.)
  return findElementEdgeAtPoint(point, elements, sketchPlane, threshold)
}

/**
 * Find element by clicking inside a circle or arc
 */
function findCircleInteriorAtPoint(point: Point2D, elements: SketchElement[]): string | null {
  for (const element of elements) {
    if ((element.type === 'circle' || element.type === 'arc') &&
        element.center && element.radius !== undefined) {
      const distToCenter = distance2D(point, element.center)
      if (distToCenter <= element.radius) {
        return element.id
      }
    }
  }
  return null
}

/**
 * Find element edge using WASM hit detection
 */
function findElementEdgeAtPoint(
  point: Point2D,
  elements: SketchElement[],
  sketchPlane: 'XY' | 'XZ' | 'YZ',
  threshold: number
): string | null {
  try {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements
    }

    const elementIndex = engine.findElementAtPoint(
      JSON.stringify(sketch),
      point.x,
      point.y,
      threshold
    )

    if (elementIndex >= 0 && elementIndex < elements.length) {
      return elements[elementIndex].id
    }
  } catch (error) {
    console.error('[HitTest] WASM findElementAtPoint failed:', error)
  }

  return null
}

// ─── Dimension Hit Testing ───────────────────────────────────────────────────

/**
 * Find dimension element at point
 */
function findDimensionAtPoint(
  point: Point2D,
  elements: SketchElement[],
  threshold: number
): string | null {
  for (const element of elements) {
    if (element.type !== 'dimension' || !element.from || !element.to) continue

    const dimLine = calculateDimensionLinePosition(element)
    if (!dimLine) continue

    // Check distance to dimension line
    if (distanceToLineSegment(point, dimLine.start, dimLine.end) < threshold) {
      return element.id
    }

    // Check extension lines for linear dimensions
    if (!dimLine.isRadial) {
      const extThreshold = threshold * EXTENSION_LINE_THRESHOLD_MULTIPLIER
      if (distanceToLineSegment(point, element.from, dimLine.start) < extThreshold ||
          distanceToLineSegment(point, element.to, dimLine.end) < extThreshold) {
        return element.id
      }
    }
  }

  return null
}

interface DimensionLine {
  start: Point2D
  end: Point2D
  isRadial: boolean
}

/**
 * Calculate the visual position of a dimension line
 */
function calculateDimensionLinePosition(element: SketchElement): DimensionLine | null {
  if (!element.from || !element.to) return null

  const isRadial = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

  if (isRadial) {
    return { start: element.from, end: element.to, isRadial: true }
  }

  const dx = element.to.x - element.from.x
  const dy = element.to.y - element.from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.0001) return null

  if (element.dimension_line_pos) {
    const dirX = dx / len
    const dirY = dy / len
    const pos = element.dimension_line_pos

    const t1 = (element.from.x - pos.x) * dirX + (element.from.y - pos.y) * dirY
    const t2 = (element.to.x - pos.x) * dirX + (element.to.y - pos.y) * dirY

    return {
      start: { x: pos.x + t1 * dirX, y: pos.y + t1 * dirY },
      end: { x: pos.x + t2 * dirX, y: pos.y + t2 * dirY },
      isRadial: false
    }
  }

  // Auto-calculate offset
  const perpX = -dy / len
  const perpY = dx / len
  const offset = 0.5

  return {
    start: { x: element.from.x + perpX * offset, y: element.from.y + perpY * offset },
    end: { x: element.to.x + perpX * offset, y: element.to.y + perpY * offset },
    isRadial: false
  }
}

// ─── Geometry Helpers ─────────────────────────────────────────────────────────

/**
 * Calculate distance from point to line segment
 */
function distanceToLineSegment(point: Point2D, p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len2 = dx * dx + dy * dy

  if (len2 < 0.0001) {
    return distance2D(point, p1)
  }

  const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2))
  const projX = p1.x + t * dx
  const projY = p1.y + t * dy
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)
}

// ─── Control Point Hit Testing ───────────────────────────────────────────────

/**
 * Find closest control point to cursor among selected elements
 */
export function hitTestControlPoints(
  cursorPos: Point2D,
  elements: SketchElement[],
  selectedElementIds: string[],
  tolerance: number
): ControlPointHit | null {
  let best: ControlPointHit | null = null

  for (const element of elements) {
    if (!selectedElementIds.includes(element.id)) continue

    const controlPoints = getElementControlPoints(element)
    for (const cp of controlPoints) {
      const dist = distance2D(cursorPos, cp.position)
      if (dist < tolerance && (!best || dist < best.distance)) {
        best = {
          elementId: element.id,
          pointIndex: cp.pointIndex,
          position: cp.position,
          distance: dist
        }
      }
    }
  }

  return best
}
