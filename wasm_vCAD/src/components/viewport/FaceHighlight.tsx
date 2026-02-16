/**
 * Face highlighting for extrude features
 * Shows interactive faces that can be selected for sketch creation
 */

import { useState } from 'react'
import * as THREE from 'three'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import type { Feature, Body } from '@/types/scene'

interface FaceHighlightProps {
  feature: Feature
  body: Body
}

export function FaceHighlight({ feature, body }: FaceHighlightProps) {
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const setHoveredFace = useFaceSelectionStore((s) => s.setHoveredFace)
  const selectFace = useFaceSelectionStore((s) => s.selectFace)

  const [hoveredFace, setLocalHoveredFace] = useState<'top' | 'bottom' | null>(null)

  if (!faceSelectionActive || feature.type !== 'extrude') {
    return null
  }

  // Get extrude parameters
  const height = feature.extrude_params?.height || 1
  const heightBackward = feature.extrude_params?.height_backward || 0

  // Find the sketch this extrude is based on
  const sketchFeature = body.features.find(f => f.id === feature.sketch_id)
  if (!sketchFeature || sketchFeature.type !== 'sketch' || !sketchFeature.sketch) {
    return null
  }

  const plane = sketchFeature.sketch.plane

  // Calculate face positions based on plane
  const getFacePosition = (faceType: 'top' | 'bottom'): [number, number, number] => {
    const offset = faceType === 'top' ? height : -heightBackward

    switch (plane) {
      case 'XY':
        return [0, 0, offset]
      case 'XZ':
        return [0, offset, 0]
      case 'YZ':
        return [offset, 0, 0]
    }
  }

  const getFaceRotation = (): [number, number, number] => {
    switch (plane) {
      case 'XY':
        return [0, 0, 0]
      case 'XZ':
        return [Math.PI / 2, 0, 0]
      case 'YZ':
        return [0, 0, Math.PI / 2]
    }
  }

  const handleFacePointerOver = (faceType: 'top' | 'bottom') => {
    setLocalHoveredFace(faceType)
    setHoveredFace({
      bodyId: body.id,
      featureId: feature.id,
      faceType,
      plane,
      offset: faceType === 'top' ? height : -heightBackward
    })
  }

  const handleFacePointerOut = () => {
    setLocalHoveredFace(null)
    setHoveredFace(null)
  }

  const handleFaceClick = (faceType: 'top' | 'bottom') => {
    const faceData = {
      bodyId: body.id,
      featureId: feature.id,
      faceType,
      plane,
      offset: faceType === 'top' ? height : -heightBackward
    }

    selectFace(faceData)

    // Dispatch custom event to notify Toolbar
    const event = new CustomEvent('face-selected', { detail: faceData })
    window.dispatchEvent(event)
  }

  // Simple rectangular plane for highlighting
  const planeGeometry = new THREE.PlaneGeometry(10, 10)

  return (
    <group>
      {/* Top face */}
      <mesh
        position={getFacePosition('top')}
        rotation={getFaceRotation()}
        geometry={planeGeometry}
        onPointerOver={() => handleFacePointerOver('top')}
        onPointerOut={handleFacePointerOut}
        onClick={() => handleFaceClick('top')}
      >
        <meshBasicMaterial
          color={hoveredFace === 'top' ? '#4a9eff' : '#ffffff'}
          transparent
          opacity={hoveredFace === 'top' ? 0.3 : 0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Bottom face */}
      {heightBackward > 0 && (
        <mesh
          position={getFacePosition('bottom')}
          rotation={getFaceRotation()}
          geometry={planeGeometry}
          onPointerOver={() => handleFacePointerOver('bottom')}
          onPointerOut={handleFacePointerOut}
          onClick={() => handleFaceClick('bottom')}
        >
          <meshBasicMaterial
            color={hoveredFace === 'bottom' ? '#4a9eff' : '#ffffff'}
            transparent
            opacity={hoveredFace === 'bottom' ? 0.3 : 0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  )
}
