/**
 * Element manipulation operations
 */

import type { Point2D, SketchElement } from '@/types/scene'
import { distance2D } from '@/utils/mathUtils'

// ─── Element Duplication ─────────────────────────────────────────────────────

/**
 * Duplicate a sketch element with offset
 */
export function duplicateElement(element: SketchElement, offset: number = 20): SketchElement {
  const duplicated: SketchElement = JSON.parse(JSON.stringify(element))
  duplicated.id = crypto.randomUUID()

  // Apply offset based on element type
  switch (duplicated.type) {
    case 'line':
      if (duplicated.start && duplicated.end) {
        duplicated.start.x += offset
        duplicated.start.y += offset
        duplicated.end.x += offset
        duplicated.end.y += offset
      }
      break

    case 'circle':
      if (duplicated.center) {
        duplicated.center.x += offset
        duplicated.center.y += offset
      }
      break

    case 'rectangle':
      if (duplicated.corner) {
        duplicated.corner.x += offset
        duplicated.corner.y += offset
      }
      break

    case 'arc':
      if (duplicated.center) {
        duplicated.center.x += offset
        duplicated.center.y += offset
      }
      break

    case 'polyline':
    case 'spline':
      if (duplicated.points) {
        duplicated.points = duplicated.points.map(pt => ({
          x: pt.x + offset,
          y: pt.y + offset
        }))
      }
      break
  }

  return duplicated
}

// ─── Element Point Updates ───────────────────────────────────────────────────

/**
 * Update element when a control point is moved
 */
export function updateElementPoint(
  element: SketchElement,
  pointIndex: number,
  newPosition: Point2D
): SketchElement {
  const updated = { ...element }

  switch (element.type) {
    case 'line':
      updateLinePoint(updated, pointIndex, newPosition)
      break

    case 'circle':
      updateCirclePoint(updated, pointIndex, newPosition)
      break

    case 'arc':
      updateArcPoint(updated, pointIndex, newPosition)
      break

    case 'rectangle':
      updateRectanglePoint(updated, pointIndex, newPosition)
      break

    case 'polyline':
    case 'spline':
      if (updated.points && pointIndex >= 0 && pointIndex < updated.points.length) {
        updated.points = [...updated.points]
        updated.points[pointIndex] = { ...newPosition }
      }
      break

    case 'dimension':
      updateDimensionPoint(updated, pointIndex, newPosition)
      break
  }

  return updated
}

// ─── Internal update helpers ─────────────────────────────────────────────────

function updateLinePoint(element: SketchElement, pointIndex: number, newPosition: Point2D): void {
  if (pointIndex === 0 && element.start) {
    element.start = { ...newPosition }
  } else if (pointIndex === 1 && element.end) {
    element.end = { ...newPosition }
  } else if (pointIndex === 2 && element.start && element.end) {
    // Move midpoint - translate entire line
    const currentMidX = (element.start.x + element.end.x) / 2
    const currentMidY = (element.start.y + element.end.y) / 2
    const dx = newPosition.x - currentMidX
    const dy = newPosition.y - currentMidY
    element.start = { x: element.start.x + dx, y: element.start.y + dy }
    element.end = { x: element.end.x + dx, y: element.end.y + dy }
  }
}

function updateCirclePoint(element: SketchElement, pointIndex: number, newPosition: Point2D): void {
  if (pointIndex === 0 && element.center) {
    element.center = { ...newPosition }
  } else if (pointIndex === 1 && element.center && element.radius !== undefined) {
    const dx = newPosition.x - element.center.x
    const dy = newPosition.y - element.center.y
    element.radius = Math.sqrt(dx * dx + dy * dy)
  }
}

function updateArcPoint(element: SketchElement, pointIndex: number, newPosition: Point2D): void {
  if (pointIndex === 0 && element.center) {
    element.center = { ...newPosition }
  } else if (pointIndex === 1 && element.center && element.radius !== undefined && element.start_angle !== undefined) {
    const dx = newPosition.x - element.center.x
    const dy = newPosition.y - element.center.y
    element.start_angle = Math.atan2(dy, dx)
    element.radius = distance2D(newPosition, element.center)
  } else if (pointIndex === 2 && element.center && element.radius !== undefined && element.end_angle !== undefined) {
    const dx = newPosition.x - element.center.x
    const dy = newPosition.y - element.center.y
    element.end_angle = Math.atan2(dy, dx)
    element.radius = distance2D(newPosition, element.center)
  }
}

function updateRectanglePoint(element: SketchElement, pointIndex: number, newPosition: Point2D): void {
  if (element.corner && element.width !== undefined && element.height !== undefined) {
    const corners = [
      element.corner,
      { x: element.corner.x + element.width, y: element.corner.y },
      { x: element.corner.x + element.width, y: element.corner.y + element.height },
      { x: element.corner.x, y: element.corner.y + element.height }
    ]

    if (pointIndex >= 0 && pointIndex < 4) {
      const oppositeIndex = (pointIndex + 2) % 4
      const opposite = corners[oppositeIndex]

      const minX = Math.min(newPosition.x, opposite.x)
      const minY = Math.min(newPosition.y, opposite.y)
      const maxX = Math.max(newPosition.x, opposite.x)
      const maxY = Math.max(newPosition.y, opposite.y)

      element.corner = { x: minX, y: minY }
      element.width = maxX - minX
      element.height = maxY - minY
    }
  }
}

function updateDimensionPoint(element: SketchElement, pointIndex: number, newPosition: Point2D): void {
  const isRadiusOrDiameter = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

  if (pointIndex === 0 && element.from && !isRadiusOrDiameter) {
    element.from = { ...newPosition }
    if (element.to) {
      const dx = element.to.x - newPosition.x
      const dy = element.to.y - newPosition.y
      element.value = Math.sqrt(dx * dx + dy * dy)
    }
  } else if (pointIndex === 1 && element.to && !isRadiusOrDiameter) {
    element.to = { ...newPosition }
    if (element.from) {
      const dx = newPosition.x - element.from.x
      const dy = newPosition.y - element.from.y
      element.value = Math.sqrt(dx * dx + dy * dy)
    }
  } else if (pointIndex === 2) {
    if (isRadiusOrDiameter && element.from && element.to) {
      // Move midpoint - translate entire dimension line
      const currentMidX = (element.from.x + element.to.x) / 2
      const currentMidY = (element.from.y + element.to.y) / 2
      const dx = newPosition.x - currentMidX
      const dy = newPosition.y - currentMidY
      element.from = { x: element.from.x + dx, y: element.from.y + dy }
      element.to = { x: element.to.x + dx, y: element.to.y + dy }
    } else {
      // Linear dimension - move dimension line position
      element.dimension_line_pos = { ...newPosition }
    }
  }
}
