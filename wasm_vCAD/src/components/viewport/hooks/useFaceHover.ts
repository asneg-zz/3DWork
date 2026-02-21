/**
 * Face hover hook
 * Manages raycast-based face detection and hover state
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { normalToPlane, calculateOffset, computeFaceCoordSystem } from '@/utils/faceUtils'
import { createFaceGeometry } from '../utils/faceDetection'
import type { Feature, Body, SketchPlane } from '@/types/scene'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HoveredFaceData {
  faceIndex: number
  geometry: THREE.BufferGeometry
  center: THREE.Vector3
  normal: THREE.Vector3
}

export interface UseFaceHoverOptions {
  feature: Feature
  body: Body
  geometry: THREE.BufferGeometry
}

export interface UseFaceHoverResult {
  meshRef: React.RefObject<THREE.Mesh>
  hoveredFaceData: HoveredFaceData | null
  handleClick: () => void
  isActive: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFaceHover({
  feature,
  body,
  geometry,
}: UseFaceHoverOptions): UseFaceHoverResult {
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const setHoveredFace = useFaceSelectionStore((s) => s.setHoveredFace)
  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)

  const meshRef = useRef<THREE.Mesh>(null)
  const [hoveredFaceData, setHoveredFaceData] = useState<HoveredFaceData | null>(null)

  const { raycaster, pointer, camera } = useThree()

  // Dispose previous geometry when hoveredFaceData changes to prevent memory leaks
  useEffect(() => {
    return () => {
      if (hoveredFaceData?.geometry) {
        hoveredFaceData.geometry.dispose()
      }
    }
  }, [hoveredFaceData])

  // Track mouse movement for hover highlighting
  useFrame(() => {
    if (!faceSelectionActive || !meshRef.current) {
      if (hoveredFaceData !== null) {
        setHoveredFaceData(null)
        setHoveredFace(null)
      }
      return
    }

    // Update raycaster
    raycaster.setFromCamera(pointer, camera)

    // Check intersection with mesh
    const intersects = raycaster.intersectObject(meshRef.current)

    if (intersects.length > 0) {
      const intersection = intersects[0]
      const faceIndex = intersection.faceIndex

      if (faceIndex !== undefined && faceIndex !== hoveredFaceData?.faceIndex) {
        // Extract the hovered face geometry
        const faceData = createFaceGeometry(geometry, faceIndex, intersection.point)

        if (faceData) {
          setHoveredFaceData({
            faceIndex,
            ...faceData,
          })

          // Transform normal to world space
          const worldNormal = faceData.normal.clone().applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
          ).normalize()

          const plane = normalToPlane(worldNormal) ?? 'CUSTOM'
          const offset = plane !== 'CUSTOM' ? calculateOffset(intersection.point, plane) : 0

          setHoveredFace({
            bodyId: body.id,
            featureId: feature.id,
            faceType: 'side',
            plane,
            offset,
          })
        }
      }
    } else if (hoveredFaceData !== null) {
      setHoveredFaceData(null)
      setHoveredFace(null)
    }
  })

  const handleClick = useCallback(() => {
    if (!faceSelectionActive || !meshRef.current || !hoveredFaceData) {
      return
    }

    // Transform normal and center to world space
    const worldNormal = hoveredFaceData.normal.clone().applyMatrix3(
      new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
    ).normalize()

    const worldCenter = hoveredFaceData.center.clone().applyMatrix4(meshRef.current.matrixWorld)

    // Always compute a full FaceCoordSystem (works for any face orientation)
    const faceCoordSystem = computeFaceCoordSystem(worldCenter, worldNormal)

    // Determine plane type (axis-aligned or CUSTOM for inclined faces)
    const axisPlane = normalToPlane(worldNormal)
    const plane: SketchPlane = axisPlane ?? 'CUSTOM'
    const offset = axisPlane ? calculateOffset(worldCenter, axisPlane) : 0

    const faceData = {
      bodyId: body.id,
      featureId: feature.id,
      faceType: 'side' as const,
      plane,
      offset,
      faceCoordSystem,
    }

    // Dispatch custom event to notify Toolbar
    const customEvent = new CustomEvent('face-selected', { detail: faceData })
    window.dispatchEvent(customEvent)
  }, [faceSelectionActive, hoveredFaceData, body.id, feature.id])

  const isActive = faceSelectionActive && !edgeSelectionActive

  return {
    meshRef,
    hoveredFaceData,
    handleClick,
    isActive,
  }
}
