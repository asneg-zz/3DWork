/**
 * Face highlighting and selection for 3D objects
 * Uses raycasting to detect and highlight individual faces
 */

import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { normalToPlane, calculateOffset, computeFaceCoordSystem } from '@/utils/faceUtils'
import type { Feature, Body, SketchPlane } from '@/types/scene'

interface FaceHighlightProps {
  feature: Feature
  body: Body
  geometry: THREE.BufferGeometry
}

/**
 * Check if two normals are approximately equal
 */
function normalsEqual(n1: THREE.Vector3, n2: THREE.Vector3, threshold: number = 0.01): boolean {
  return n1.distanceTo(n2) < threshold
}

/**
 * Calculate triangle center and face normal from geometry (not vertex normals!)
 */
function getTriangleData(
  position: THREE.BufferAttribute,
  a: number,
  b: number,
  c: number
): { center: THREE.Vector3; faceNormal: THREE.Vector3 } {
  const v1 = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))
  const v2 = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b))
  const v3 = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c))

  const center = new THREE.Vector3()
    .add(v1)
    .add(v2)
    .add(v3)
    .divideScalar(3)

  // Calculate face normal using cross product (geometric normal, not vertex normal)
  const edge1 = new THREE.Vector3().subVectors(v2, v1)
  const edge2 = new THREE.Vector3().subVectors(v3, v1)
  const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize()

  return { center, faceNormal }
}

/**
 * Extract all triangles that form a single planar face
 * Uses clicked triangle center and normal to find coplanar triangles
 */
function createFaceGeometry(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  _intersectionPoint: THREE.Vector3
): { geometry: THREE.BufferGeometry; center: THREE.Vector3; normal: THREE.Vector3 } | null {
  const index = geometry.index
  const position = geometry.attributes.position

  if (!index || !position) return null
  if (!(position instanceof THREE.BufferAttribute)) {
    console.warn('[FaceHighlight] Unsupported attribute type')
    return null
  }

  // Get the clicked triangle's geometric normal and center
  const a = index.getX(faceIndex * 3)
  const b = index.getX(faceIndex * 3 + 1)
  const c = index.getX(faceIndex * 3 + 2)

  const clickedData = getTriangleData(position, a, b, c)
  const clickedNormal = clickedData.faceNormal
  const clickedTriangleCenter = clickedData.center

  // Calculate reference plane distance: project clicked triangle center onto normal
  const clickedPlaneD = clickedTriangleCenter.dot(clickedNormal)

  // Find all triangles with the same normal AND same plane position
  const faceTriangles: number[] = []
  const triangleCount = index.count / 3

  // Plane distance threshold - must be on the same plane
  const planeThreshold = 0.01

  for (let i = 0; i < triangleCount; i++) {
    const a = index.getX(i * 3)
    const b = index.getX(i * 3 + 1)
    const c = index.getX(i * 3 + 2)

    // Calculate geometric face normal (not vertex normal!)
    const triangleData = getTriangleData(position, a, b, c)
    const triangleNormal = triangleData.faceNormal
    const triangleCenter = triangleData.center

    // Check if normals are the same
    if (!normalsEqual(clickedNormal, triangleNormal)) {
      continue
    }

    // Check if triangle is on the same plane by comparing plane distance
    // For a plane with normal n passing through point p: d = p · n
    const trianglePlaneD = triangleCenter.dot(clickedNormal)
    const planeDiff = Math.abs(trianglePlaneD - clickedPlaneD)

    // Only check coplanarity - all triangles with same normal on same plane are one face
    if (planeDiff < planeThreshold) {
      faceTriangles.push(i)
    }
  }

  if (faceTriangles.length === 0) return null

  // Build geometry from all triangles on the same face
  const faceVertices: number[] = []
  const faceNormals: number[] = []
  const uniqueVertices: THREE.Vector3[] = []

  for (const triangleIndex of faceTriangles) {
    const a = index.getX(triangleIndex * 3)
    const b = index.getX(triangleIndex * 3 + 1)
    const c = index.getX(triangleIndex * 3 + 2)

    // Add triangle vertices
    const v1 = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))
    const v2 = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b))
    const v3 = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c))

    faceVertices.push(
      v1.x, v1.y, v1.z,
      v2.x, v2.y, v2.z,
      v3.x, v3.y, v3.z
    )

    uniqueVertices.push(v1, v2, v3)

    // Add normals
    faceNormals.push(
      clickedNormal.x, clickedNormal.y, clickedNormal.z,
      clickedNormal.x, clickedNormal.y, clickedNormal.z,
      clickedNormal.x, clickedNormal.y, clickedNormal.z
    )
  }

  // Calculate center from all vertices
  const center = new THREE.Vector3()
  for (const v of uniqueVertices) {
    center.add(v)
  }
  center.divideScalar(uniqueVertices.length)

  // Create geometry
  const faceGeometry = new THREE.BufferGeometry()
  faceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceVertices), 3))
  faceGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(faceNormals), 3))

  return { geometry: faceGeometry, center, normal: clickedNormal }
}

export function FaceHighlight({ feature, body, geometry }: FaceHighlightProps) {
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const setHoveredFace = useFaceSelectionStore((s) => s.setHoveredFace)
  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)

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
        const faceData = createFaceGeometry(geometry, faceIndex, intersection.point)

        if (faceData) {
          setHoveredFaceData({
            faceIndex,
            ...faceData
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
            offset
          })
        }
      }
    } else if (hoveredFaceData !== null) {
      setHoveredFaceData(null)
      setHoveredFace(null)
    }
  })

  const handleClick = () => {
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
  }

  if (!faceSelectionActive || edgeSelectionActive) {
    return null
  }

  return (
    <group>
      {/* Transparent mesh for raycasting */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={handleClick}
        onPointerOver={(e) => e.stopPropagation()}
        onPointerOut={(e) => e.stopPropagation()}
      >
        <meshBasicMaterial
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Highlight overlay for hovered face only */}
      {hoveredFaceData && (
        <mesh
          geometry={hoveredFaceData.geometry}
          renderOrder={1000}
          onClick={handleClick}
        >
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
