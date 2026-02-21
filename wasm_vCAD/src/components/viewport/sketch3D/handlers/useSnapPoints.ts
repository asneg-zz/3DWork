/**
 * Snap points calculation hook
 * Calculates snap points based on cursor position and sketch elements
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import type { Point2D, SnapPoint, SketchElement } from '@/types/scene'
import { useSketchStore } from '@/stores/sketchStore'
import { createSketchForWasm } from '../../sketchUtils'
import { engine } from '@/wasm/engine'

export function useSnapPoints(elements: SketchElement[], wasmPlane: 'XY' | 'XZ' | 'YZ') {
  const [snapPoints, setSnapPoints] = useState<SnapPoint[]>([])
  const snapPointsRef = useRef<SnapPoint[]>([])

  const snapSettings = useSketchStore(s => s.snapSettings)
  const { camera } = useThree()

  // Keep ref in sync for use in callbacks that need latest value
  useEffect(() => {
    snapPointsRef.current = snapPoints
  }, [snapPoints])

  const updateSnapPoints = useCallback((sketchPoint: Point2D) => {
    // If snapping is disabled, clear snap points
    if (!snapSettings.enabled || elements.length === 0) {
      setSnapPoints([])
      return
    }
    try {
      const sketch = createSketchForWasm(elements, wasmPlane)
      const sketchJson = JSON.stringify(sketch)
      const snapRadius = snapSettings.snapRadius
      const settingsJson = JSON.stringify({
        enabled: snapSettings.enabled,
        endpoint: snapSettings.endpoint,
        midpoint: snapSettings.midpoint,
        center: snapSettings.center,
        quadrant: snapSettings.quadrant,
        grid: snapSettings.grid,
        grid_size: snapSettings.gridSize,
        snap_radius: snapRadius,
      })
      const points = engine.getSnapPoints(sketchJson, sketchPoint.x, sketchPoint.y, settingsJson)
      setSnapPoints(points.map(p => ({
        point: { x: p.x, y: p.y },
        snapType: p.snap_type as SnapPoint['snapType'],
        sourceElement: p.source_element ?? undefined,
      })))
    } catch {
      setSnapPoints([])
    }
  }, [elements, wasmPlane, snapSettings, camera])

  const getSnappedPoint = useCallback((sketchPoint: Point2D): Point2D => {
    if (!snapSettings.enabled) return sketchPoint
    const currentSnaps = snapPointsRef.current
    return currentSnaps.length > 0 ? currentSnaps[0].point : sketchPoint
  }, [snapSettings.enabled])

  return {
    snapPoints,
    snapPointsRef,
    updateSnapPoints,
    getSnappedPoint,
  }
}
