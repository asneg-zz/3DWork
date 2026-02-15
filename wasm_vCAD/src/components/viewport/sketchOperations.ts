/**
 * Sketch operations
 * Offset, mirror, pattern operations using WASM
 */

import type { SketchElement, Sketch, SketchPlane } from '@/types/scene'
import { engine } from '@/wasm/engine'
import { applyWasmOperation } from './sketchUtils'

export function offsetElement(
  elements: SketchElement[],
  elementId: string,
  distance: number,
  clickX: number,
  clickY: number,
  sketchPlane: SketchPlane
): SketchElement[] {
  const elementIndex = elements.findIndex(el => el.id === elementId)
  if (elementIndex === -1) return elements

  return applyWasmOperation(() => {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements: elements
    }
    const sketchJson = JSON.stringify(sketch)
    return engine.offsetElement(sketchJson, elementIndex, distance, clickX, clickY)
  })
}

export function mirrorElement(
  elements: SketchElement[],
  elementId: string,
  axis: 'horizontal' | 'vertical' | 'custom',
  symmetryAxis: number | null,
  sketchPlane: SketchPlane
): SketchElement[] | null {
  const elementIndex = elements.findIndex(el => el.id === elementId)
  if (elementIndex === -1) return null

  let axisStartX: number
  let axisStartY: number
  let axisEndX: number
  let axisEndY: number

  if (axis === 'custom' && symmetryAxis !== null && symmetryAxis !== undefined) {
    const axisElement = elements[symmetryAxis]
    if (axisElement && axisElement.type === 'line' && axisElement.start && axisElement.end) {
      axisStartX = axisElement.start.x
      axisStartY = axisElement.start.y
      axisEndX = axisElement.end.x
      axisEndY = axisElement.end.y
    } else {
      return null // Invalid axis
    }
  } else {
    axisStartX = axis === 'vertical' ? 0 : -1000
    axisStartY = axis === 'vertical' ? -1000 : 0
    axisEndX = axis === 'vertical' ? 0 : 1000
    axisEndY = axis === 'vertical' ? 1000 : 0
  }

  return applyWasmOperation(() => {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements: elements
    }
    const sketchJson = JSON.stringify(sketch)
    return engine.mirrorElement(sketchJson, elementIndex, axisStartX, axisStartY, axisEndX, axisEndY)
  })
}

export function linearPattern(
  elements: SketchElement[],
  elementId: string,
  count: number,
  dx: number,
  dy: number,
  sketchPlane: SketchPlane
): SketchElement[] {
  const elementIndex = elements.findIndex(el => el.id === elementId)
  if (elementIndex === -1) return elements

  return applyWasmOperation(() => {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements: elements
    }
    const sketchJson = JSON.stringify(sketch)
    return engine.linearPattern(sketchJson, elementIndex, count, dx, dy)
  })
}

export function circularPattern(
  elements: SketchElement[],
  elementId: string,
  count: number,
  centerX: number,
  centerY: number,
  angle: number,
  sketchPlane: SketchPlane
): SketchElement[] {
  const elementIndex = elements.findIndex(el => el.id === elementId)
  if (elementIndex === -1) return elements

  return applyWasmOperation(() => {
    const sketch: Sketch = {
      id: crypto.randomUUID(),
      plane: sketchPlane,
      offset: 0.0,
      elements: elements
    }
    const sketchJson = JSON.stringify(sketch)
    return engine.circularPattern(sketchJson, elementIndex, count, centerX, centerY, angle)
  })
}
