/**
 * Control point dragging logic
 */

import { useState, useCallback } from 'react'
import type { Point2D, SketchElement, SketchConstraint } from '@/types/scene'
import { useSketchStore } from '@/stores/sketchStore'
import { updateElementPoint, createSketchForWasm, processWasmResult } from '../../sketchUtils'
import { engine } from '@/wasm/engine'

interface DraggedPoint {
  elementId: string
  pointIndex: number
}

export function useDragControl(
  elements: SketchElement[],
  constraints: SketchConstraint[],
  wasmPlane: 'XY' | 'XZ' | 'YZ'
) {
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<DraggedPoint | null>(null)
  const [hoveredControlPoint, setHoveredControlPoint] = useState<DraggedPoint | null>(null)

  const setElements = useSketchStore(s => s.setElements)
  const saveToHistory = useSketchStore(s => s.saveToHistory)

  /**
   * Start dragging a control point
   */
  const startDragging = useCallback((elementId: string, pointIndex: number) => {
    setIsDraggingPoint(true)
    setDraggedPoint({ elementId, pointIndex })
  }, [])

  /**
   * Update element position during drag
   */
  const updateDrag = useCallback((snappedPoint: Point2D) => {
    if (!draggedPoint) return

    const elementIndex = elements.findIndex(el => el.id === draggedPoint.elementId)
    if (elementIndex < 0) return

    const updatedElement = updateElementPoint(
      elements[elementIndex],
      draggedPoint.pointIndex,
      snappedPoint
    )
    const newElements = [...elements]
    newElements[elementIndex] = updatedElement

    // Apply constraint solving if there are constraints
    if (constraints.length > 0) {
      try {
        const sketch = createSketchForWasm(newElements, wasmPlane, constraints)
        const resultJson = engine.solveConstraints(JSON.stringify(sketch))
        const elementsWithIds = processWasmResult(resultJson, newElements)
        setElements(elementsWithIds, true)
      } catch {
        setElements(newElements, true)
      }
    } else {
      setElements(newElements, true)
    }
  }, [draggedPoint, elements, constraints, wasmPlane, setElements])

  /**
   * Finish dragging - solve constraints and save to history
   */
  const finishDragging = useCallback(() => {
    if (constraints.length > 0) {
      try {
        const sketch = createSketchForWasm(elements, wasmPlane, constraints)
        const resultJson = engine.solveConstraints(JSON.stringify(sketch))
        const elementsWithIds = processWasmResult(resultJson, elements)
        setElements(elementsWithIds, true)
      } catch (error) {
        console.error('Constraint solving failed after drag:', error)
      }
    }
    saveToHistory()
    setIsDraggingPoint(false)
    setDraggedPoint(null)
  }, [constraints, elements, wasmPlane, setElements, saveToHistory])

  /**
   * Cancel dragging
   */
  const cancelDragging = useCallback(() => {
    setIsDraggingPoint(false)
    setDraggedPoint(null)
  }, [])

  return {
    isDraggingPoint,
    draggedPoint,
    hoveredControlPoint,
    setHoveredControlPoint,
    startDragging,
    updateDrag,
    finishDragging,
    cancelDragging,
  }
}
