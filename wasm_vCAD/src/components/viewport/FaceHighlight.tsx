/**
 * Face highlighting and selection for 3D objects
 * Uses raycasting to detect and highlight individual faces
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

/**
 * Extract face vertices to create highlight geometry
 */
function createFaceGeometry(
  geometry: THREE.BufferGeometry,
  faceIndex: number
): { geometry: THREE.BufferGeometry; center: THREE.Vector3; normal: THREE.Vector3 } | null {
  const index = geometry.index
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal

  if (!index || !position || !normal) return null

  // Get the three vertices of the face
  const a = index.getX(faceIndex * 3)
  const b = index.getX(faceIndex * 3 + 1)
  const c = index.getX(faceIndex * 3 + 2)

  // Get positions
  const v1 = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))
  const v2 = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b))
  const v3 = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c))

  // Calculate face center
  const center = new THREE.Vector3()
    .add(v1)
    .add(v2)
    .add(v3)
    .divideScalar(3)

  // Get face normal
  const faceNormal = new THREE.Vector3(
    normal.getX(a),
    normal.getY(a),
    normal.getZ(a)
  )

  // Create triangle geometry for the face
  const faceGeometry = new THREE.BufferGeometry()
  const vertices = new Float32Array([
    v1.x, v1.y, v1.z,
    v2.x, v2.y, v2.z,
    v3.x, v3.y, v3.z
  ])
  const normals = new Float32Array([
    faceNormal.x, faceNormal.y, faceNormal.z,
    faceNormal.x, faceNormal.y, faceNormal.z,
    faceNormal.x, faceNormal.y, faceNormal.z
  ])

  faceGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  faceGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  return { geometry: faceGeometry, center, normal: faceNormal }
}

export function FaceHighlight({ feature, body, geometry }: FaceHighlightProps) {
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const setHoveredFace = useFaceSelectionStore((s) => s.setHoveredFace)
  const selectFace = useFaceSelectionStore((s) => s.selectFace)

  const meshRef = useRef<THREE.Mesh>(null)
  const [hoveredFaceData, setHoveredFaceData] = useState<{
    faceIndex: number
    geometry: THREE.BufferGeometry
    center: THREE.Vector3
    normal: THREE.Vector3
  } | null>(null)

  const { raycaster, pointer, camera } = useThree()

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
        const faceData = createFaceGeometry(geometry, faceIndex)

        if (faceData) {
          setHoveredFaceData({
            faceIndex,
            ...faceData
          })

          // Transform normal to world space
          const worldNormal = faceData.normal.clone().applyMatrix3(
            new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
          ).normalize()

          const plane = normalToPlane(worldNormal)
          if (plane) {
            const offset = calculateOffset(intersection.point, plane)

            setHoveredFace({
              bodyId: body.id,
              featureId: feature.id,
              faceType: 'side',
              plane,
              offset
            })
          }
        }
      }
    } else if (hoveredFaceData !== null) {
      setHoveredFaceData(null)
      setHoveredFace(null)
    }
  })

  const handleClick = () => {
    console.log('[FaceHighlight] Click detected, faceSelectionActive:', faceSelectionActive)

    if (!faceSelectionActive || !meshRef.current || !hoveredFaceData) {
      console.log('[FaceHighlight] Cannot process click - no active selection or hovered face')
      return
    }

    // Transform normal to world space
    const worldNormal = hoveredFaceData.normal.clone().applyMatrix3(
      new THREE.Matrix3().getNormalMatrix(meshRef.current.matrixWorld)
    ).normalize()

    console.log('[FaceHighlight] Face normal (world):', worldNormal)

    const plane = normalToPlane(worldNormal)
    if (!plane) {
      console.warn('[FaceHighlight] Could not determine sketch plane from face normal:', worldNormal)
      return
    }

    console.log('[FaceHighlight] Determined plane:', plane)

    // Calculate offset from face center
    const worldCenter = hoveredFaceData.center.clone().applyMatrix4(meshRef.current.matrixWorld)
    const offset = calculateOffset(worldCenter, plane)

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
    <group>
      {/* Transparent mesh for raycasting */}
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
      >
        <meshBasicMaterial
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Highlight overlay for hovered face only */}
      {hoveredFaceData && (
        <mesh geometry={hoveredFaceData.geometry} renderOrder={1000}>
          <meshBasicMaterial
            color="#4a9eff"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
