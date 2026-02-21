/**
 * Constraint handling logic for sketch editor
 * Manages adding/removing constraints and constraint solving
 */

import { useCallback, useRef } from 'react'
import type { SketchElement, SketchConstraint } from '@/types/scene'
import { useSketchStore } from '@/stores/sketchStore'
import { createSketchForWasm, processWasmResult } from '../../sketchUtils'
import { engine } from '@/wasm/engine'

export function useConstraintHandler(
  elements: SketchElement[],
  constraints: SketchConstraint[],
  wasmPlane: 'XY' | 'XZ' | 'YZ'
) {
  const addConstraint = useSketchStore(s => s.addConstraint)
  const setElements = useSketchStore(s => s.setElements)

  // Debounce timer for constraint solving
  const solveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Solve constraints with debouncing
   */
  const solveConstraints = useCallback(() => {
    if (solveTimerRef.current !== null) {
      clearTimeout(solveTimerRef.current)
    }
    solveTimerRef.current = setTimeout(() => {
      solveTimerRef.current = null
      const curConstraints = useSketchStore.getState().constraints
      const curElements = useSketchStore.getState().elements
      if (curConstraints.length > 0) {
        try {
          const sketch = createSketchForWasm(curElements, wasmPlane, curConstraints)
          const resultJson = engine.solveConstraints(JSON.stringify(sketch))
          const elementsWithIds = processWasmResult(resultJson, curElements)
          setElements(elementsWithIds, true)
        } catch (error) {
          console.error('Constraint solving failed:', error)
        }
      }
    }, 0)
  }, [wasmPlane, setElements])

  /**
   * Check if element has a specific constraint
   */
  const hasConstraint = useCallback((constraintType: string, elementId: string): boolean => {
    const elementIndex = elements.findIndex(el => el.id === elementId)
    if (elementIndex === -1) return false
    return constraints.some(c => {
      switch (constraintType) {
        case 'horizontal': return c.type === 'horizontal' && c.element === elementIndex
        case 'vertical': return c.type === 'vertical' && c.element === elementIndex
        case 'fixed': return c.type === 'fixed' && c.element === elementIndex
        case 'parallel': return c.type === 'parallel' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'perpendicular': return c.type === 'perpendicular' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'equal': return c.type === 'equal' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'tangent': return c.type === 'tangent' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'concentric': return c.type === 'concentric' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'symmetric': return c.type === 'symmetric' && (c.element1 === elementIndex || c.element2 === elementIndex)
        default: return false
      }
    })
  }, [elements, constraints])

  /**
   * Add or remove a constraint (toggle behavior)
   */
  const handleAddConstraint = useCallback((
    constraintType: string,
    elementId: string,
    secondElementId?: string
  ) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return

    const elementIndex = elements.findIndex(el => el.id === elementId)
    if (elementIndex === -1) return

    let secondElementIndex: number | undefined
    if (secondElementId) {
      secondElementIndex = elements.findIndex(el => el.id === secondElementId)
      if (secondElementIndex === -1) return
    }

    // Check for existing constraint to toggle off
    const existingConstraintIndex = constraints.findIndex(c => {
      switch (constraintType) {
        case 'horizontal': return c.type === 'horizontal' && c.element === elementIndex
        case 'vertical': return c.type === 'vertical' && c.element === elementIndex
        case 'fixed': return c.type === 'fixed' && c.element === elementIndex
        case 'parallel': return c.type === 'parallel' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'perpendicular': return c.type === 'perpendicular' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'equal': return c.type === 'equal' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'tangent': return c.type === 'tangent' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'concentric': return c.type === 'concentric' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'symmetric': return c.type === 'symmetric' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        default: return false
      }
    })

    if (existingConstraintIndex >= 0) {
      // Remove existing constraint
      useSketchStore.getState().removeConstraint(existingConstraintIndex)
    } else {
      // Add new constraint
      switch (constraintType) {
        case 'horizontal': addConstraint({ type: 'horizontal', element: elementIndex }); break
        case 'vertical': addConstraint({ type: 'vertical', element: elementIndex }); break
        case 'fixed': addConstraint({ type: 'fixed', element: elementIndex }); break
        case 'parallel':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'parallel', element1: elementIndex, element2: secondElementIndex })
          break
        case 'perpendicular':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'perpendicular', element1: elementIndex, element2: secondElementIndex })
          break
        case 'equal':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'equal', element1: elementIndex, element2: secondElementIndex })
          break
        case 'tangent':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'tangent', element1: elementIndex, element2: secondElementIndex })
          break
        case 'concentric':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'concentric', element1: elementIndex, element2: secondElementIndex })
          break
        case 'symmetric': {
          const symmetryAxisId = useSketchStore.getState().symmetryAxisId
          if (secondElementIndex !== undefined && symmetryAxisId !== null) {
            const axisIndex = elements.findIndex(el => el.id === symmetryAxisId)
            if (axisIndex >= 0) {
              addConstraint({ type: 'symmetric', element1: elementIndex, element2: secondElementIndex, axis: axisIndex })
            }
          }
          break
        }
      }
    }

    // Solve constraints after change
    solveConstraints()
  }, [elements, constraints, addConstraint, solveConstraints])

  /**
   * Add coincident constraint between two points
   */
  const addCoincidentConstraint = useCallback((
    point1: { elementId: string; pointIndex: number },
    point2: { elementId: string; pointIndex: number }
  ) => {
    const element1Index = elements.findIndex(el => el.id === point1.elementId)
    const element2Index = elements.findIndex(el => el.id === point2.elementId)

    if (element1Index >= 0 && element2Index >= 0) {
      addConstraint({
        type: 'coincident',
        point1: { element_index: element1Index, point_index: point1.pointIndex },
        point2: { element_index: element2Index, point_index: point2.pointIndex },
      })
      solveConstraints()
    }
  }, [elements, addConstraint, solveConstraints])

  return {
    solveTimerRef,
    solveConstraints,
    hasConstraint,
    handleAddConstraint,
    addCoincidentConstraint,
  }
}
