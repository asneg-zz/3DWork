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
          element.startAngle !== undefined && element.endAngle !== undefined) {
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
            x: element.center.x + element.radius * Math.cos(element.startAngle),
            y: element.center.y + element.radius * Math.sin(element.startAngle)
          },
          type: 'start'
        })
        // Конечная точка дуги
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: {
            x: element.center.x + element.radius * Math.cos(element.endAngle),
            y: element.center.y + element.radius * Math.sin(element.endAngle)
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
      } else if (pointIndex === 1 && updated.center && updated.radius !== undefined && updated.startAngle !== undefined) {
        // Изменение начальной точки дуги
        const dx = newPosition.x - updated.center.x
        const dy = newPosition.y - updated.center.y
        updated.startAngle = Math.atan2(dy, dx)
        updated.radius = Math.sqrt(dx * dx + dy * dy)
      } else if (pointIndex === 2 && updated.center && updated.radius !== undefined && updated.endAngle !== undefined) {
        // Изменение конечной точки дуги
        const dx = newPosition.x - updated.center.x
        const dy = newPosition.y - updated.center.y
        updated.endAngle = Math.atan2(dy, dx)
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
  }

  return updated
}

function distance2D(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}
