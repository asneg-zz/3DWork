/**
 * Face highlighting and selection for 3D objects
 * Uses raycasting to detect and select actual mesh faces
 */

import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import type { Feature, Body, SketchPlane } from '@/types/scene'

interface FaceHighlightProps {
  feature: Feature
  body: Body
  geometry: THREE.BufferGeometry
}

/**
 * Determine sketch plane from face normal
 */
function normalToPlane(normal: THREE.Vector3): SketchPlane | null {
  // Round to handle floating point precision
  const x = Math.abs(normal.x)
  const y = Math.abs(normal.y)
  const z = Math.abs(normal.z)

  // Find dominant axis
  if (z > x && z > y && z > 0.9) {
    return 'XY' // Normal points along Z axis
  } else if (y > x && y > z && y > 0.9) {
    return 'XZ' // Normal points along Y axis
  } else if (x > y && x > z && x > 0.9) {
    return 'YZ' // Normal points along X axis
  }

  return null
}

/**
 * Calculate plane offset from point and plane
 */
function calculateOffset(point: THREE.Vector3, plane: SketchPlane): number {
  switch (plane) {
    case 'XY':
      return point.z
    case 'XZ':
      return point.y
    case 'YZ':
      return point.x
  }
}

export function FaceHighlight({ feature, body, geometry }: FaceHighlightProps) {
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const setHoveredFace = useFaceSelectionStore((s) => s.setHoveredFace)
  const selectFace = useFaceSelectionStore((s) => s.selectFace)

  const meshRef = useRef<THREE.Mesh>(null)
  const [hoveredFaceIndex, setHoveredFaceIndex] = useState<number | null>(null)
  const [hoveredFaceColor, setHoveredFaceColor] = useState<THREE.Color | null>(null)

  const { raycaster, pointer, camera } = useThree()

  // Track mouse movement for hover highlighting
  useFrame(() => {
    if (!faceSelectionActive || !meshRef.current) {
      if (hoveredFaceIndex !== null) {
        setHoveredFaceIndex(null)
        setHoveredFaceColor(null)
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

      if (faceIndex !== undefined && faceIndex !== hoveredFaceIndex) {
        setHoveredFaceIndex(faceIndex)

        // Get face normal to determine plane
        const normal = intersection.face?.normal
        if (normal) {
          // Transform normal to world space
          const worldNormal = normal.clone().applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
          ).normalize()

          const plane = normalToPlane(worldNormal)
          if (plane) {
            // Calculate offset
            const offset = calculateOffset(intersection.point, plane)

            setHoveredFace({
              bodyId: body.id,
              featureId: feature.id,
              faceType: 'side', // Generic type, actual plane determined by normal
              plane,
              offset
            })

            // Highlight color
            setHoveredFaceColor(new THREE.Color('#4a9eff'))
          }
        }
      }
    } else if (hoveredFaceIndex !== null) {
      setHoveredFaceIndex(null)
      setHoveredFaceColor(null)
      setHoveredFace(null)
    }
  })

  const handleClick = (event: any) => {
    console.log('[FaceHighlight] Click detected, faceSelectionActive:', faceSelectionActive)

    if (!faceSelectionActive) {
      console.log('[FaceHighlight] Face selection not active, ignoring click')
      return
    }

    event.stopPropagation?.()

    // Get intersection info from Three.js raycaster
    if (!meshRef.current) {
      console.log('[FaceHighlight] No mesh ref, ignoring click')
      return
    }

    // Use current raycaster state
    raycaster.setFromCamera(pointer, camera)
    const intersects = raycaster.intersectObject(meshRef.current)

    console.log('[FaceHighlight] Intersects:', intersects.length)

    if (intersects.length === 0) return

    const intersection = intersects[0]
    if (!intersection.face) {
      console.log('[FaceHighlight] No face in intersection')
      return
    }

    const normal = intersection.face.normal

    // Transform normal to world space
    const worldNormal = normal.clone().applyMatrix3(
      new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
    ).normalize()

    console.log('[FaceHighlight] Face normal (world):', worldNormal)

    const plane = normalToPlane(worldNormal)
    if (!plane) {
      console.warn('[FaceHighlight] Could not determine sketch plane from face normal:', worldNormal)
      return
    }

    console.log('[FaceHighlight] Determined plane:', plane)

    // Calculate offset from intersection point
    const offset = calculateOffset(intersection.point, plane)

    console.log('[FaceHighlight] Calculated offset:', offset)

    const faceData = {
      bodyId: body.id,
      featureId: feature.id,
      faceType: 'side' as const,
      plane,
      offset
    }

    console.log('[FaceHighlight] Dispatching face-selected event with data:', faceData)

    selectFace(faceData)

    // Dispatch custom event to notify Toolbar
    const customEvent = new CustomEvent('face-selected', { detail: faceData })
    window.dispatchEvent(customEvent)

    console.log('[FaceHighlight] Event dispatched')
  }

  if (!faceSelectionActive) {
    return null
  }

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      onClick={handleClick}
      onPointerOver={(e) => {
        console.log('[FaceHighlight] Pointer over')
        e.stopPropagation()
      }}
      onPointerOut={(e) => {
        console.log('[FaceHighlight] Pointer out')
        e.stopPropagation()
      }}
      renderOrder={999}
    >
      <meshBasicMaterial
        color={hoveredFaceColor || '#4a9eff'}
        transparent
        opacity={hoveredFaceIndex !== null ? 0.4 : 0.2}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  )
}
