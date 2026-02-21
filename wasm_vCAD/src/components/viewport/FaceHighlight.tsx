/**
 * Face highlighting and selection for 3D objects
 * Uses raycasting to detect and highlight individual faces
 */

import * as THREE from 'three'
import { useFaceHover } from './hooks/useFaceHover'
import type { Feature, Body } from '@/types/scene'

interface FaceHighlightProps {
  feature: Feature
  body: Body
  geometry: THREE.BufferGeometry
}

export function FaceHighlight({ feature, body, geometry }: FaceHighlightProps) {
  const {
    meshRef,
    hoveredFaceData,
    handleClick,
    isActive,
  } = useFaceHover({ feature, body, geometry })

  if (!isActive) {
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
