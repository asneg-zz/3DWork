/**
 * Sketch utilities
 * Coordinate transformations and element operations
 */

import type { Point2D, SketchElement, Sketch } from '@/types/scene'
import { engine } from '@/wasm/engine'

export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  panX: number,
  panY: number
): Point2D {
  const x = ((screenX - canvasWidth / 2) / zoom) - panX
  const y = (-(screenY - canvasHeight / 2) / zoom) - panY
  return { x, y }
}

export function findElementAtPoint(
  point: Point2D,
  elements: SketchElement[],
  sketchPlane: 'XY' | 'XZ' | 'YZ'
): string | null {
  const threshold = 0.2

  // First, check dimension elements manually (WASM doesn't know about them)
  for (const element of elements) {
    if (element.type === 'dimension' && element.from && element.to) {
      const pFrom = element.from
      const pTo = element.to

      // Calculate actual dimension line position (same logic as rendering)
      let dimLineStart: Point2D
      let dimLineEnd: Point2D

      const isRadiusOrDiameter = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

      if (isRadiusOrDiameter) {
        // For radius/diameter, use direct line from -> to
        dimLineStart = pFrom
        dimLineEnd = pTo
      } else if (element.dimension_line_pos) {
        // Use dimension_line_pos to calculate actual dimension line
        const dx = pTo.x - pFrom.x
        const dy = pTo.y - pFrom.y
        const len = Math.sqrt(dx * dx + dy * dy)

        if (len < 0.0001) continue

        const dirX = dx / len
        const dirY = dy / len

        const t1 = ((pFrom.x - element.dimension_line_pos.x) * dirX +
                    (pFrom.y - element.dimension_line_pos.y) * dirY)
        const t2 = ((pTo.x - element.dimension_line_pos.x) * dirX +
                    (pTo.y - element.dimension_line_pos.y) * dirY)

        dimLineStart = {
          x: element.dimension_line_pos.x + t1 * dirX,
          y: element.dimension_line_pos.y + t1 * dirY
        }
        dimLineEnd = {
          x: element.dimension_line_pos.x + t2 * dirX,
          y: element.dimension_line_pos.y + t2 * dirY
        }
      } else {
        // Auto-calculate offset dimension line
        const dx = pTo.x - pFrom.x
        const dy = pTo.y - pFrom.y
        const len = Math.sqrt(dx * dx + dy * dy)

        if (len < 0.0001) continue

        const perpX = -dy / len
        const perpY = dx / len
        const offset = 0.5

        dimLineStart = { x: pFrom.x + perpX * offset, y: pFrom.y + perpY * offset }
        dimLineEnd = { x: pTo.x + perpX * offset, y: pTo.y + perpY * offset }
      }

      // Check distance to actual dimension line
      const dx = dimLineEnd.x - dimLineStart.x
      const dy = dimLineEnd.y - dimLineStart.y
      const len2 = dx * dx + dy * dy

      if (len2 > 0.0001) {
        const t = Math.max(0, Math.min(1, ((point.x - dimLineStart.x) * dx + (point.y - dimLineStart.y) * dy) / len2))
        const projX = dimLineStart.x + t * dx
        const projY = dimLineStart.y + t * dy
        const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)

        if (dist < threshold) {
          return element.id
        }
      }

      // Also check extension lines (more tolerance) - only for linear dimensions
      if (!isRadiusOrDiameter) {
        const extThreshold = threshold * 1.5

        // Extension line 1: from → dimLineStart
        const checkExtLine = (p1: Point2D, p2: Point2D) => {
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const len2 = dx * dx + dy * dy
          if (len2 > 0.0001) {
            const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2))
            const projX = p1.x + t * dx
            const projY = p1.y + t * dy
            return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2) < extThreshold
          }
          return false
        }

        if (checkExtLine(pFrom, dimLineStart) || checkExtLine(pTo, dimLineEnd)) {
          return element.id
        }
      }
    }
  }

  // Check if point is inside a circle or arc (for dimension tool)
  for (const element of elements) {
    if ((element.type === 'circle' || element.type === 'arc') && element.center && element.radius !== undefined) {
      const dx = point.x - element.center.x
      const dy = point.y - element.center.y
      const distToCenter = Math.sqrt(dx * dx + dy * dy)

      // If point is inside the circle/arc
      if (distToCenter <= element.radius) {
        return element.id
      }
    }
  }

  // Then try WASM for other element types (lines, edges, etc.)
  try {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements: elements
    }

    const sketchJson = JSON.stringify(sketch)
    const elementIndex = engine.findElementAtPoint(sketchJson, point.x, point.y, threshold)

    if (elementIndex >= 0 && elementIndex < elements.length) {
      return elements[elementIndex].id
    }
  } catch (error) {
    console.error('Find element failed:', error)
  }

  return null
}

export function duplicateElement(element: SketchElement, offset: number = 20): SketchElement {
  const duplicated: SketchElement = JSON.parse(JSON.stringify(element))
  duplicated.id = crypto.randomUUID()

  // Apply offset based on element type
  if (duplicated.type === 'line' && duplicated.start && duplicated.end) {
    duplicated.start.x += offset
    duplicated.start.y += offset
    duplicated.end.x += offset
    duplicated.end.y += offset
  } else if (duplicated.type === 'circle' && duplicated.center) {
    duplicated.center.x += offset
    duplicated.center.y += offset
  } else if (duplicated.type === 'rectangle' && duplicated.corner) {
    duplicated.corner.x += offset
    duplicated.corner.y += offset
  } else if (duplicated.type === 'arc' && duplicated.center) {
    duplicated.center.x += offset
    duplicated.center.y += offset
  } else if ((duplicated.type === 'polyline' || duplicated.type === 'spline') && duplicated.points) {
    duplicated.points = duplicated.points.map(pt => ({ x: pt.x + offset, y: pt.y + offset }))
  }

  return duplicated
}

export function applyWasmOperation(
  operationFn: () => string
): SketchElement[] {
  const newSketchJson = operationFn()
  const newSketch: Sketch = JSON.parse(newSketchJson)

  // Ensure all elements have unique IDs
  return newSketch.elements.map(el => {
    if (!el.id) {
      return { ...el, id: crypto.randomUUID() }
    }
    return el
  })
}

// ============================================================================
// Control Points (контрольные точки для редактирования)
// ============================================================================

export interface ControlPoint {
  elementId: string
  pointIndex: number
  position: Point2D
  type: 'start' | 'end' | 'center' | 'corner' | 'point' | 'radius' | 'midpoint'
}

export interface ControlPointHit {
  elementId: string
  pointIndex: number
  position: Point2D
  distance: number
}

/**
 * Получить все контрольные точки для элемента
 */
export function getElementControlPoints(element: SketchElement): ControlPoint[] {
  const points: ControlPoint[] = []

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.start,
          type: 'start'
        })
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: element.end,
          type: 'end'
        })
        // Midpoint for moving the entire line
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: {
            x: (element.start.x + element.end.x) / 2,
            y: (element.start.y + element.end.y) / 2
          },
          type: 'midpoint'
        })
      }
      break

    case 'circle':
      if (element.center && element.radius !== undefined) {
        // Центр окружности
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.center,
          type: 'center'
        })
        // Точка на окружности для изменения радиуса
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: { x: element.center.x + element.radius, y: element.center.y },
          type: 'radius'
        })
      }
      break

    case 'arc':
      if (element.center && element.radius !== undefined &&
          element.start_angle !== undefined && element.end_angle !== undefined) {
        // Центр дуги
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.center,
          type: 'center'
        })
        // Начальная точка дуги
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: {
            x: element.center.x + element.radius * Math.cos(element.start_angle),
            y: element.center.y + element.radius * Math.sin(element.start_angle)
          },
          type: 'start'
        })
        // Конечная точка дуги
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: {
            x: element.center.x + element.radius * Math.cos(element.end_angle),
            y: element.center.y + element.radius * Math.sin(element.end_angle)
          },
          type: 'end'
        })
      }
      break

    case 'rectangle':
      if (element.corner && element.width !== undefined && element.height !== undefined) {
        // 4 угла прямоугольника
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.corner,
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: { x: element.corner.x + element.width, y: element.corner.y },
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: { x: element.corner.x + element.width, y: element.corner.y + element.height },
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 3,
          position: { x: element.corner.x, y: element.corner.y + element.height },
          type: 'corner'
        })
      }
      break

    case 'polyline':
    case 'spline':
      if (element.points) {
        element.points.forEach((pt, i) => {
          points.push({
            elementId: element.id,
            pointIndex: i,
            position: pt,
            type: 'point'
          })
        })
      }
      break

    case 'dimension':
      if (element.from && element.to) {
        const isRadiusOrDiameter = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

        if (isRadiusOrDiameter) {
          // For radius/diameter: only midpoint to move the entire dimension
          points.push({
            elementId: element.id,
            pointIndex: 2,
            position: {
              x: (element.from.x + element.to.x) / 2,
              y: (element.from.y + element.to.y) / 2
            },
            type: 'midpoint'
          })
        } else {
          // For linear dimensions: start, end, and dimension line position
          points.push({
            elementId: element.id,
            pointIndex: 0,
            position: element.from,
            type: 'start'
          })
          points.push({
            elementId: element.id,
            pointIndex: 1,
            position: element.to,
            type: 'end'
          })

          // Dimension line position control point
          let dimLinePos = element.dimension_line_pos
          if (!dimLinePos) {
            const dx = element.to.x - element.from.x
            const dy = element.to.y - element.from.y
            const len = Math.sqrt(dx * dx + dy * dy)
            const perpX = len > 0.0001 ? -dy / len : 0
            const perpY = len > 0.0001 ? dx / len : 1
            const offset = 0.5
            const midX = (element.from.x + element.to.x) / 2
            const midY = (element.from.y + element.to.y) / 2
            dimLinePos = {
              x: midX + perpX * offset,
              y: midY + perpY * offset
            }
          }

          points.push({
            elementId: element.id,
            pointIndex: 2,
            position: dimLinePos,
            type: 'center'  // Use 'center' type for special rendering
          })
        }
      }
      break
  }

  return points
}

/**
 * Найти ближайшую контрольную точку к курсору
 */
export function hitTestControlPoints(
  cursorPos: Point2D,
  elements: SketchElement[],
  selectedElementIds: string[],
  tolerance: number
): ControlPointHit | null {
  let best: ControlPointHit | null = null

  // Проверяем только выбранные элементы
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

/**
 * Обновить элемент при перемещении контрольной точки
 */
export function updateElementPoint(
  element: SketchElement,
  pointIndex: number,
  newPosition: Point2D
): SketchElement {
  const updated = { ...element }

  switch (element.type) {
    case 'line':
      if (pointIndex === 0 && updated.start) {
        // Move start point
        updated.start = { ...newPosition }
      } else if (pointIndex === 1 && updated.end) {
        // Move end point
        updated.end = { ...newPosition }
      } else if (pointIndex === 2 && updated.start && updated.end) {
        // Move midpoint - translate entire line
        const currentMidX = (updated.start.x + updated.end.x) / 2
        const currentMidY = (updated.start.y + updated.end.y) / 2
        const dx = newPosition.x - currentMidX
        const dy = newPosition.y - currentMidY
        updated.start = { x: updated.start.x + dx, y: updated.start.y + dy }
        updated.end = { x: updated.end.x + dx, y: updated.end.y + dy }
      }
      break

    case 'circle':
      if (pointIndex === 0 && updated.center) {
        // Перемещение центра
        updated.center = { ...newPosition }
      } else if (pointIndex === 1 && updated.center && updated.radius !== undefined) {
        // Изменение радиуса
        const dx = newPosition.x - updated.center.x
        const dy = newPosition.y - updated.center.y
        updated.radius = Math.sqrt(dx * dx + dy * dy)
      }
      break

    case 'arc':
      if (pointIndex === 0 && updated.center) {
        // Перемещение центра
        updated.center = { ...newPosition }
      } else if (pointIndex === 1 && updated.center && updated.radius !== undefined && updated.start_angle !== undefined) {
        // Изменение начальной точки дуги
        const dx = newPosition.x - updated.center.x
        const dy = newPosition.y - updated.center.y
        updated.start_angle = Math.atan2(dy, dx)
        updated.radius = Math.sqrt(dx * dx + dy * dy)
      } else if (pointIndex === 2 && updated.center && updated.radius !== undefined && updated.end_angle !== undefined) {
        // Изменение конечной точки дуги
        const dx = newPosition.x - updated.center.x
        const dy = newPosition.y - updated.center.y
        updated.end_angle = Math.atan2(dy, dx)
        updated.radius = Math.sqrt(dx * dx + dy * dy)
      }
      break

    case 'rectangle':
      if (updated.corner && updated.width !== undefined && updated.height !== undefined) {
        // Изменение прямоугольника через углы
        const corners = [
          updated.corner,
          { x: updated.corner.x + updated.width, y: updated.corner.y },
          { x: updated.corner.x + updated.width, y: updated.corner.y + updated.height },
          { x: updated.corner.x, y: updated.corner.y + updated.height }
        ]

        if (pointIndex >= 0 && pointIndex < 4) {
          // Обновляем противоположный угол как фиксированную точку
          const oppositeIndex = (pointIndex + 2) % 4
          const opposite = corners[oppositeIndex]

          const minX = Math.min(newPosition.x, opposite.x)
          const minY = Math.min(newPosition.y, opposite.y)
          const maxX = Math.max(newPosition.x, opposite.x)
          const maxY = Math.max(newPosition.y, opposite.y)

          updated.corner = { x: minX, y: minY }
          updated.width = maxX - minX
          updated.height = maxY - minY
        }
      }
      break

    case 'polyline':
    case 'spline':
      if (updated.points && pointIndex >= 0 && pointIndex < updated.points.length) {
        updated.points = [...updated.points]
        updated.points[pointIndex] = { ...newPosition }
      }
      break

    case 'dimension':
      const isRadiusOrDiameter = updated.dimension_type === 'radius' || updated.dimension_type === 'diameter'

      if (pointIndex === 0 && updated.from && !isRadiusOrDiameter) {
        // Move from point (only for linear dimensions)
        updated.from = { ...newPosition }
        // Recalculate value
        if (updated.to) {
          const dx = updated.to.x - newPosition.x
          const dy = updated.to.y - newPosition.y
          updated.value = Math.sqrt(dx * dx + dy * dy)
        }
      } else if (pointIndex === 1 && updated.to && !isRadiusOrDiameter) {
        // Move to point (only for linear dimensions)
        updated.to = { ...newPosition }
        // Recalculate value
        if (updated.from) {
          const dx = newPosition.x - updated.from.x
          const dy = newPosition.y - updated.from.y
          updated.value = Math.sqrt(dx * dx + dy * dy)
        }
      } else if (pointIndex === 2) {
        if (isRadiusOrDiameter && updated.from && updated.to) {
          // Move midpoint - translate entire dimension line
          const currentMidX = (updated.from.x + updated.to.x) / 2
          const currentMidY = (updated.from.y + updated.to.y) / 2
          const dx = newPosition.x - currentMidX
          const dy = newPosition.y - currentMidY

          updated.from = { x: updated.from.x + dx, y: updated.from.y + dy }
          updated.to = { x: updated.to.x + dx, y: updated.to.y + dy }
        } else {
          // Linear dimension - move dimension line position
          updated.dimension_line_pos = { ...newPosition }
        }
      }
      break
  }

  return updated
}

function distance2D(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}
