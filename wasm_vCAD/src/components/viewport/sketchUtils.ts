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
