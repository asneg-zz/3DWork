import * as THREE from 'three'
import type { SketchPlane, FaceCoordSystem } from '@/types/scene'

/** Determine sketch plane from axis-aligned face normal. Returns null for inclined faces. */
export function normalToPlane(normal: THREE.Vector3): SketchPlane | null {
  const x = Math.abs(normal.x)
  const y = Math.abs(normal.y)
  const z = Math.abs(normal.z)
  if (z > x && z > y && z > 0.9) return 'XY'
  if (y > x && y > z && y > 0.9) return 'XZ'
  if (x > y && x > z && x > 0.9) return 'YZ'
  return null
}

/** Calculate plane offset from a world-space point on an axis-aligned plane. */
export function calculateOffset(point: THREE.Vector3, plane: SketchPlane): number {
  switch (plane) {
    case 'XY': return point.z
    case 'XZ': return point.y
    case 'YZ': return point.x
    case 'CUSTOM': return 0
  }
}

/** Compute a full FaceCoordSystem from a face center and world-space normal. */
export function computeFaceCoordSystem(
  faceCenter: THREE.Vector3,
  faceNormal: THREE.Vector3
): FaceCoordSystem {
  const ref = Math.abs(faceNormal.dot(new THREE.Vector3(0, 1, 0))) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0)

  const uAxis = new THREE.Vector3().crossVectors(ref, faceNormal).normalize()
  const vAxis = new THREE.Vector3().crossVectors(faceNormal, uAxis).normalize()

  return {
    origin: [faceCenter.x, faceCenter.y, faceCenter.z],
    normal: [faceNormal.x, faceNormal.y, faceNormal.z],
    uAxis:  [uAxis.x,   uAxis.y,   uAxis.z],
    vAxis:  [vAxis.x,   vAxis.y,   vAxis.z],
  }
}

/**
 * Compute geometric face normal (cross product) for the triangle at faceIndex.
 * Returns world-space normal + world-space triangle center.
 */
export function computeGeometricFaceData(
  geometry: THREE.BufferGeometry,
  faceIndex: number,
  matrixWorld: THREE.Matrix4
): { worldNormal: THREE.Vector3; worldCenter: THREE.Vector3 } | null {
  const idx = geometry.index
  const pos = geometry.attributes.position
  if (!idx || !pos) return null

  const a = idx.getX(faceIndex * 3)
  const b = idx.getX(faceIndex * 3 + 1)
  const c = idx.getX(faceIndex * 3 + 2)

  const v1 = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a))
  const v2 = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b))
  const v3 = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c))

  const localNormal = new THREE.Vector3()
    .crossVectors(v2.clone().sub(v1), v3.clone().sub(v1))
    .normalize()

  const localCenter = v1.clone().add(v2).add(v3).divideScalar(3)

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrixWorld)
  const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize()
  const worldCenter = localCenter.applyMatrix4(matrixWorld)

  return { worldNormal, worldCenter }
}
