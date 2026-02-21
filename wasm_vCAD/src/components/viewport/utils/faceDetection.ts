/**
 * Face detection utilities
 * Pure functions for extracting face geometry from meshes
 */

import * as THREE from 'three'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaceGeometryResult {
  geometry: THREE.BufferGeometry
  center: THREE.Vector3
  normal: THREE.Vector3
}

export interface TriangleData {
  center: THREE.Vector3
  faceNormal: THREE.Vector3
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Check if two normals are approximately equal
 */
export function normalsEqual(
  n1: THREE.Vector3,
  n2: THREE.Vector3,
  threshold: number = 0.01
): boolean {
  return n1.distanceTo(n2) < threshold
}

/**
 * Calculate triangle center and face normal from geometry (not vertex normals!)
 */
export function getTriangleData(
  position: THREE.BufferAttribute,
  a: number,
  b: number,
  c: number
): TriangleData {
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
export function createFaceGeometry(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  _intersectionPoint: THREE.Vector3
): FaceGeometryResult | null {
  const index = geometry.index
  const position = geometry.attributes.position

  if (!index || !position) return null
  if (!(position instanceof THREE.BufferAttribute)) {
    console.warn('[FaceDetection] Unsupported attribute type')
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
