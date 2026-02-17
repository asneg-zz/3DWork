/**
 * SketchCameraController
 * Runs inside <Canvas>. When sketch mode activates, smoothly moves the camera
 * to look perpendicular to the selected sketch plane, centered on the face.
 *
 * Plane → camera position (planeOffset = position of face along normal):
 *   XY  →  pos (0, 0, offset+d)  target (0, 0, offset)   up=(0,1,0)   front view
 *   XZ  →  pos (0, offset+d, 0)  target (0, offset, 0)   up=(0,0,-1)  top view (from above)
 *   YZ  →  pos (offset+d, 0, 0)  target (offset, 0, 0)   up=(0,0,1)   side view
 */

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSketchStore } from '@/stores/sketchStore'

const LERP_SPEED   = 0.12
const DONE_THRESHOLD = 0.005

export function SketchCameraController() {
  const { camera } = useThree()
  const controls = useThree((s) => s.controls as any)

  const sketchActive     = useSketchStore((s) => s.active)
  const sketchPlane      = useSketchStore((s) => s.plane)
  const planeOffset      = useSketchStore((s) => s.planeOffset)
  const faceCoordSystem  = useSketchStore((s) => s.faceCoordSystem)

  const targetPos  = useRef(new THREE.Vector3())
  const targetLook = useRef(new THREE.Vector3())
  const targetUp   = useRef(new THREE.Vector3(0, 1, 0))
  const animating  = useRef(false)

  useEffect(() => {
    if (!sketchActive) return

    // Keep current zoom distance, at least 6 units
    const dist = Math.max(camera.position.length(), 6)

    if (sketchPlane === 'CUSTOM' && faceCoordSystem) {
      // Arbitrary face: position camera along normal from face center
      const origin = new THREE.Vector3(...faceCoordSystem.origin)
      const normal = new THREE.Vector3(...faceCoordSystem.normal).normalize()
      const vAxis  = new THREE.Vector3(...faceCoordSystem.vAxis).normalize()

      targetPos.current.copy(origin).addScaledVector(normal, dist)
      targetLook.current.copy(origin)
      // "up" in the viewport = sketch Y direction (vAxis)
      targetUp.current.copy(vAxis)
    } else {
      switch (sketchPlane) {
        case 'XY':
          // Look from front (+Z), face at z=offset
          targetPos.current.set(0, 0, planeOffset + dist)
          targetLook.current.set(0, 0, planeOffset)
          targetUp.current.set(0, 1, 0)
          break
        case 'XZ':
          // Look from above (+Y), face at y=offset — camera must be ABOVE the face
          targetPos.current.set(0, planeOffset + dist, 0)
          targetLook.current.set(0, planeOffset, 0)
          targetUp.current.set(0, 0, -1)   // X→right, Z→down in viewport
          break
        case 'YZ':
          // Look from side (+X), face at x=offset
          targetPos.current.set(planeOffset + dist, 0, 0)
          targetLook.current.set(planeOffset, 0, 0)
          targetUp.current.set(0, 0, 1)
          break
      }
    }

    animating.current = true
  }, [sketchActive, sketchPlane, planeOffset, faceCoordSystem])

  useFrame(() => {
    if (!animating.current) return

    camera.position.lerp(targetPos.current, LERP_SPEED)
    camera.up.lerp(targetUp.current, LERP_SPEED)

    // Lerp controls target toward face center
    if (controls) {
      controls.target.lerp(targetLook.current, LERP_SPEED)
      controls.update()
    } else {
      camera.lookAt(targetLook.current)
    }

    if (camera.position.distanceTo(targetPos.current) < DONE_THRESHOLD) {
      camera.position.copy(targetPos.current)
      camera.up.copy(targetUp.current)
      if (controls) {
        controls.target.copy(targetLook.current)
        controls.update()
      } else {
        camera.lookAt(targetLook.current)
      }
      animating.current = false
    }
  })

  return null
}
