/**
 * Drawing preview component.
 * Shows a dashed/preview line while the user is actively drawing a sketch element.
 */

import { useMemo, useCallback } from 'react'
import * as THREE from 'three'
import type { Point2D, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { sketchToWorld } from './coords'

interface SketchPreview3DProps {
  tool: string | null
  isDrawing: boolean
  startPoint: Point2D | null
  currentPoint: Point2D | null
  arcMidPoint: Point2D | null
  polylinePoints: Point2D[]
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

export function SketchPreview3D({ tool, isDrawing, startPoint, currentPoint, arcMidPoint, polylinePoints, plane, offset, fcs }: SketchPreview3DProps) {
  const s = useCallback((x: number, y: number) => sketchToWorld(x, y, plane, offset, fcs), [plane, offset, fcs])

  const geometry = useMemo(() => {
    if (!isDrawing || !currentPoint) return null

    let points: THREE.Vector3[] = []

    switch (tool) {
      case 'line':
        if (startPoint) {
          points = [s(startPoint.x, startPoint.y), s(currentPoint.x, currentPoint.y)]
        }
        break

      case 'circle':
        if (startPoint) {
          const dx = currentPoint.x - startPoint.x
          const dy = currentPoint.y - startPoint.y
          const r = Math.sqrt(dx * dx + dy * dy)
          const segs = 64
          for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2
            points.push(s(startPoint.x + Math.cos(a) * r, startPoint.y + Math.sin(a) * r))
          }
        }
        break

      case 'rectangle':
        if (startPoint) {
          const w = currentPoint.x - startPoint.x
          const h = currentPoint.y - startPoint.y
          points = [
            s(startPoint.x, startPoint.y),
            s(startPoint.x + w, startPoint.y),
            s(startPoint.x + w, startPoint.y + h),
            s(startPoint.x, startPoint.y + h),
            s(startPoint.x, startPoint.y),
          ]
        }
        break

      case 'arc':
        if (startPoint && arcMidPoint) {
          points = [s(startPoint.x, startPoint.y), s(arcMidPoint.x, arcMidPoint.y), s(currentPoint.x, currentPoint.y)]
        } else if (startPoint) {
          points = [s(startPoint.x, startPoint.y), s(currentPoint.x, currentPoint.y)]
        }
        break

      case 'polyline':
      case 'spline':
        if (polylinePoints.length > 0) {
          points = polylinePoints.map(p => s(p.x, p.y))
          points.push(s(currentPoint.x, currentPoint.y))
        }
        break
    }

    if (points.length < 2) return null
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [tool, isDrawing, startPoint, currentPoint, arcMidPoint, polylinePoints, s])

  const previewLine = useMemo(() => {
    if (!geometry) return null
    const mat = new THREE.LineBasicMaterial({ color: '#4a9eff' })
    return new THREE.Line(geometry, mat)
  }, [geometry])

  if (!previewLine) return null

  return <primitive object={previewLine} />
}
