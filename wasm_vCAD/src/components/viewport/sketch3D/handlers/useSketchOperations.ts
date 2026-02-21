/**
 * Sketch operations: offset, mirror, pattern, duplicate
 */

import { useCallback } from 'react'
import type { Point2D, SketchElement } from '@/types/scene'
import { useSketchStore } from '@/stores/sketchStore'
import { duplicateElement } from '../../sketchUtils'
import * as SketchOps from '../../sketchOperations'

export function useSketchOperations(
  elements: SketchElement[],
  wasmPlane: 'XY' | 'XZ' | 'YZ',
  cursorSketchPoint: Point2D | null
) {
  const setElements = useSketchStore(s => s.setElements)
  const symmetryAxisId = useSketchStore(s => s.symmetryAxisId)

  const handleOffset = useCallback((elementId: string, distance: number) => {
    const clickPoint = cursorSketchPoint || { x: 0, y: 0 }
    const newElements = SketchOps.offsetElement(
      elements,
      elementId,
      distance,
      clickPoint.x,
      clickPoint.y,
      wasmPlane
    )
    setElements(newElements)
  }, [elements, cursorSketchPoint, wasmPlane, setElements])

  const handleMirror = useCallback((
    elementId: string,
    axis: 'horizontal' | 'vertical' | 'custom'
  ) => {
    const newElements = SketchOps.mirrorElement(
      elements,
      elementId,
      axis,
      symmetryAxisId,
      wasmPlane
    )
    if (newElements) {
      setElements(newElements)
    }
  }, [elements, symmetryAxisId, wasmPlane, setElements])

  const handleLinearPattern = useCallback((
    elementId: string,
    count: number,
    dx: number,
    dy: number
  ) => {
    const newElements = SketchOps.linearPattern(
      elements,
      elementId,
      count,
      dx,
      dy,
      wasmPlane
    )
    setElements(newElements)
  }, [elements, wasmPlane, setElements])

  const handleCircularPattern = useCallback((
    elementId: string,
    count: number,
    centerX: number,
    centerY: number,
    angle: number
  ) => {
    const newElements = SketchOps.circularPattern(
      elements,
      elementId,
      count,
      centerX,
      centerY,
      angle,
      wasmPlane
    )
    setElements(newElements)
  }, [elements, wasmPlane, setElements])

  const handleDuplicate = useCallback((elementId: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return
    const duplicated = duplicateElement(element)
    setElements([...elements, duplicated])
  }, [elements, setElements])

  return {
    handleOffset,
    handleMirror,
    handleLinearPattern,
    handleCircularPattern,
    handleDuplicate,
  }
}
