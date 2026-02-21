/**
 * 3D sketch element rendering components.
 * Renders sketch geometry as Three.js Line objects.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
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

// ─── Dimension element ────────────────────────────────────────────────────────

interface DimensionElement3DProps {
  element: SketchElement
  isSelected: boolean
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

function DimensionElement3D({ element, isSelected, plane, offset, fcs }: DimensionElement3DProps) {
  const color = isSelected ? '#4ade80' : '#a0a0c0'

  const { segPoints, textPos, textLabel } = useMemo(() => {
    if (!element.from || !element.to || element.value === undefined) {
      return { segPoints: null, textPos: null, textLabel: '' }
    }

    const s = (x: number, y: number) => sketchToWorld(x, y, plane, offset, fcs)
    const { from, to, value, dimension_type, dimension_line_pos } = element

    const fmt = value.toFixed(2)

    // Radius / diameter: single line from center (or edge) to edge
    if (dimension_type === 'radius' || dimension_type === 'diameter') {
      const pFrom = s(from.x, from.y)
      const pTo = s(to.x, to.y)
      const mid = s((from.x + to.x) / 2, (from.y + to.y) / 2)
      const prefix = dimension_type === 'diameter' ? 'Ø' : 'R'
      return { segPoints: [pFrom, pTo], textPos: mid, textLabel: `${prefix}${fmt}` }
    }

    // Linear dimension
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.0001) return { segPoints: null, textPos: null, textLabel: '' }

    const perpX = -dy / len
    const perpY = dx / len
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }

    // Offset distance (signed) of the dimension line from the element
    let d = 0.5
    if (dimension_line_pos) {
      d = (dimension_line_pos.x - mid.x) * perpX + (dimension_line_pos.y - mid.y) * perpY
    }

    const dFrom = { x: from.x + perpX * d, y: from.y + perpY * d }
    const dTo   = { x: to.x   + perpX * d, y: to.y   + perpY * d }
    const dMid  = { x: (dFrom.x + dTo.x) / 2, y: (dFrom.y + dTo.y) / 2 }

    return {
      // LineSegments format: pairs of points per segment
      // segment 0: witness line A,  segment 1: witness line B,  segment 2: dimension line
      segPoints: [
        s(from.x, from.y), s(dFrom.x, dFrom.y),
        s(to.x,   to.y),   s(dTo.x,   dTo.y),
        s(dFrom.x, dFrom.y), s(dTo.x, dTo.y),
      ],
      textPos: s(dMid.x, dMid.y),
      textLabel: fmt,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(element), plane, offset, fcs])

  const lineObj = useMemo(() => {
    if (!segPoints || segPoints.length < 2) return null
    const geo = new THREE.BufferGeometry().setFromPoints(segPoints)
    const mat = new THREE.LineBasicMaterial({ color })
    // 2 points → Line (radius/diameter); 6 points → LineSegments (3 separate segs)
    return segPoints.length === 2
      ? new THREE.Line(geo, mat)
      : new THREE.LineSegments(geo, mat)
  }, [segPoints, color])

  if (!lineObj || !textPos) return null

  return (
    <group>
      <primitive object={lineObj} />
      <Html
        position={[textPos.x, textPos.y, textPos.z]}
        center
        occlude={false}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          color: isSelected ? '#4ade80' : '#d0d0e8',
          fontSize: '11px',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          textShadow: '0 0 4px #000, 0 0 4px #000',
          background: 'rgba(0,0,0,0.35)',
          padding: '0 3px',
          borderRadius: '2px',
        }}>
          {textLabel}
        </div>
      </Html>
    </group>
  )
}

// ─── Element list ─────────────────────────────────────────────────────────────

interface SketchElements3DProps {
  elements: SketchElement[]
  selectedIds: string[]
  constructionIds: string[]
  symmetryAxisId: string | null
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

export function SketchElements3D({ elements, selectedIds, constructionIds, symmetryAxisId, plane, offset, fcs }: SketchElements3DProps) {
  return (
    <>
      {elements.map((element) => {
        if (element.type === 'dimension') {
          return (
            <DimensionElement3D
              key={element.id}
              element={element}
              isSelected={selectedIds.includes(element.id)}
              plane={plane}
              offset={offset}
              fcs={fcs}
            />
          )
        }
        return (
          <SketchElement3D
            key={element.id}
            element={element}
            isSelected={selectedIds.includes(element.id)}
            isConstruction={constructionIds.includes(element.id)}
            isSymmetryAxis={symmetryAxisId === element.id}
            plane={plane}
            offset={offset}
            fcs={fcs}
          />
        )
      })}
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
