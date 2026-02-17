/**
 * 3D sketch element rendering components.
 * Renders sketch geometry as Three.js Line objects.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import type { SketchElement, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { getElementControlPoints } from '../sketchUtils'
import { sketchToWorld, elementToPoints3D } from './coords'

// ─── Single element ───────────────────────────────────────────────────────────

interface SketchElement3DProps {
  element: SketchElement
  isSelected: boolean
  isConstruction: boolean
  isSymmetryAxis: boolean
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

function SketchElement3D({ element, isSelected, isConstruction, isSymmetryAxis, plane, offset, fcs }: SketchElement3DProps) {
  const points = useMemo(
    () => elementToPoints3D(element, plane, offset, fcs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(element), plane, offset, fcs]
  )

  let color = '#e0e0e0'
  if (isSelected) color = '#4ade80'
  else if (isSymmetryAxis) color = '#8b5cf6'
  else if (isConstruction) color = '#fbbf24'

  const lineObject = useMemo(() => {
    if (points.length < 2) return null
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color })
    return new THREE.Line(geo, mat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, color])

  if (!lineObject) return null

  return <primitive object={lineObject} />
}

// ─── Element list ─────────────────────────────────────────────────────────────

interface SketchElements3DProps {
  elements: SketchElement[]
  selectedIds: string[]
  construction: boolean[]
  symmetryAxis: number | null
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

export function SketchElements3D({ elements, selectedIds, construction, symmetryAxis, plane, offset, fcs }: SketchElements3DProps) {
  return (
    <>
      {elements.map((element, index) => (
        <SketchElement3D
          key={element.id}
          element={element}
          isSelected={selectedIds.includes(element.id)}
          isConstruction={construction[index] ?? false}
          isSymmetryAxis={symmetryAxis === index}
          plane={plane}
          offset={offset}
          fcs={fcs}
        />
      ))}
    </>
  )
}

// ─── Control points ───────────────────────────────────────────────────────────

interface ControlPoint3DProps {
  position: THREE.Vector3
  isHovered: boolean
}

function ControlPoint3D({ position, isHovered }: ControlPoint3DProps) {
  const color = isHovered ? '#22c55e' : '#4ade80'
  return (
    <mesh position={position}>
      <boxGeometry args={[0.06, 0.06, 0.06]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

interface SketchControlPoints3DProps {
  elements: SketchElement[]
  selectedIds: string[]
  hoveredPoint: { elementId: string; pointIndex: number } | null
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

export function SketchControlPoints3D({ elements, selectedIds, hoveredPoint, plane, offset, fcs }: SketchControlPoints3DProps) {
  const selectedElements = elements.filter(e => selectedIds.includes(e.id))

  return (
    <>
      {selectedElements.map(element => {
        const controlPoints = getElementControlPoints(element)
        return controlPoints.map(cp => {
          const pos3D = sketchToWorld(cp.position.x, cp.position.y, plane, offset, fcs)
          const isHovered = hoveredPoint?.elementId === element.id && hoveredPoint?.pointIndex === cp.pointIndex
          return (
            <ControlPoint3D
              key={`${element.id}-${cp.pointIndex}`}
              position={pos3D}
              isHovered={isHovered}
            />
          )
        })
      })}
    </>
  )
}
