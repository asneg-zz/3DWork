/**
 * 3D snap indicator visuals.
 * Shows snap point markers (endpoint, midpoint, center, etc.) in the 3D viewport.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { SnapPoint, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { sketchToWorld } from './coords'

// ─── Snap type config ─────────────────────────────────────────────────────────

const SNAP_CFG: Record<string, { color: string; label: string }> = {
  endpoint:     { color: '#22c55e', label: 'Конец' },
  midpoint:     { color: '#3b82f6', label: 'Середина' },
  center:       { color: '#ef4444', label: 'Центр' },
  quadrant:     { color: '#8b5cf6', label: 'Квадрант' },
  grid:         { color: '#64748b', label: 'Сетка' },
  intersection: { color: '#fbbf24', label: 'Пересечение' },
}

// ─── Shape builders ───────────────────────────────────────────────────────────

/**
 * Build line point-arrays for a snap shape in 3D world space.
 * Returns one or two arrays (shapes drawn as separate lines).
 */
function buildSnapLines(
  snapType: string,
  cx: number, cy: number,
  size: number,
  plane: SketchPlane, offset: number, fcs?: FaceCoordSystem | null
): THREE.Vector3[][] {
  const at = (dx: number, dy: number) => sketchToWorld(cx + dx, cy + dy, plane, offset, fcs)
  switch (snapType) {
    case 'endpoint':
      // Green square
      return [[at(-size,-size), at(size,-size), at(size,size), at(-size,size), at(-size,-size)]]
    case 'midpoint': {
      // Blue upward triangle
      const h = size * 1.732
      return [[at(-size, -h / 3), at(size, -h / 3), at(0, 2 * h / 3), at(-size, -h / 3)]]
    }
    case 'center':
    case 'intersection':
      // Red / amber X cross
      return [
        [at(-size, -size), at(size,  size)],
        [at( size, -size), at(-size, size)],
      ]
    case 'quadrant':
      // Purple diamond
      return [[at(0,-size), at(size,0), at(0,size), at(-size,0), at(0,-size)]]
    default:
      // Gray crosshair (grid or unknown)
      return [
        [at(-size, 0), at(size, 0)],
        [at(0, -size), at(0,  size)],
      ]
  }
}

// ─── Single marker ────────────────────────────────────────────────────────────

interface SingleSnapMarkerProps {
  sp: SnapPoint
  isActive: boolean
  size: number
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

function SingleSnapMarker({ sp, isActive, size, plane, offset, fcs }: SingleSnapMarkerProps) {
  const cfg = SNAP_CFG[sp.snapType] ?? { color: '#ffff00', label: sp.snapType }

  const lines = useMemo(() => {
    const arrays = buildSnapLines(sp.snapType, sp.point.x, sp.point.y, size, plane, offset, fcs)
    const mat = new THREE.LineBasicMaterial({ color: cfg.color })
    return arrays.map(pts => new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.snapType, sp.point.x, sp.point.y, size, cfg.color, plane, offset, fcs])

  const pos3D = useMemo(
    () => sketchToWorld(sp.point.x, sp.point.y, plane, offset, fcs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sp.point.x, sp.point.y, plane, offset, fcs]
  )

  return (
    <group renderOrder={999}>
      {lines.map((obj, i) => <primitive key={i} object={obj} />)}
      {isActive && (
        <Html position={pos3D} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <span style={{
            color: cfg.color,
            background: 'rgba(8,8,20,0.82)',
            padding: '1px 6px',
            fontSize: '10px',
            fontFamily: 'monospace',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            display: 'block',
            marginTop: '-18px',
            marginLeft: '10px',
            border: `1px solid ${cfg.color}44`,
          }}>
            {cfg.label}
          </span>
        </Html>
      )}
    </group>
  )
}

// ─── Indicator (shows up to 6 snap points) ────────────────────────────────────

interface SnapIndicator3DProps {
  snapPoints: SnapPoint[]
  plane: SketchPlane
  offset: number
  fcs?: FaceCoordSystem | null
}

export function SnapIndicator3D({ snapPoints, plane, offset, fcs }: SnapIndicator3DProps) {
  const { camera } = useThree()

  if (snapPoints.length === 0) return null

  // Scale indicator size with camera distance so it stays readable at any zoom
  const baseSize = Math.max(0.018, camera.position.length() * 0.007)

  return (
    <>
      {snapPoints.slice(0, 6).map((sp, i) => (
        <SingleSnapMarker
          key={`${sp.snapType}-${sp.point.x.toFixed(4)}-${sp.point.y.toFixed(4)}`}
          sp={sp}
          isActive={i === 0}
          size={baseSize * (i === 0 ? 1.0 : 0.6)}
          plane={plane}
          offset={offset}
          fcs={fcs}
        />
      ))}
    </>
  )
}
