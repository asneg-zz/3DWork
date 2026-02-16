import { useSceneStore } from '@/stores/sceneStore'
import { useMemo } from 'react'
import * as THREE from 'three'
import { engine } from '@/wasm/engine'
import type { MeshData } from '@/types/mesh'
import type { Feature, Body } from '@/types/scene'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'

// Helper to create Three.js BufferGeometry from WASM MeshData
function createGeometryFromMeshData(meshData: MeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  // Convert to Float32Array if needed
  const vertices = meshData.vertices instanceof Float32Array
    ? meshData.vertices
    : new Float32Array(meshData.vertices)

  const normals = meshData.normals instanceof Float32Array
    ? meshData.normals
    : new Float32Array(meshData.normals)

  const indices = meshData.indices instanceof Uint32Array
    ? meshData.indices
    : new Uint32Array(meshData.indices)

  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  return geometry
}

// Component for rendering a single primitive feature
function PrimitiveFeature({ feature, isSelected }: { feature: Feature; isSelected: boolean }) {
  const transform = feature.transform || {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
  }

  const color = isSelected ? '#4a9eff' : '#808080'

  // Generate geometry from WASM (memoized per feature)
  const geometry = useMemo(() => {
    if (!feature.primitive) {
      return new THREE.BoxGeometry(1, 1, 1)
    }

    try {
      let meshData: MeshData

      switch (feature.primitive.type) {
        case 'cube':
          meshData = engine.generateCubeMesh(
            feature.primitive.width || 1,
            feature.primitive.height || 1,
            feature.primitive.depth || 1
          )
          break

        case 'cylinder':
          meshData = engine.generateCylinderMesh(
            feature.primitive.radius || 0.5,
            feature.primitive.height || 1
          )
          break

        case 'sphere':
          meshData = engine.generateSphereMesh(
            feature.primitive.radius || 0.5
          )
          break

        case 'cone':
          meshData = engine.generateConeMesh(
            feature.primitive.radius || 0.5,
            feature.primitive.height || 1
          )
          break

        default:
          // Fallback to Three.js geometry
          return new THREE.BoxGeometry(1, 1, 1)
      }

      return createGeometryFromMeshData(meshData)
    } catch (error) {
      console.error('Failed to generate mesh from WASM:', error)
      // Fallback to Three.js geometry
      return new THREE.BoxGeometry(1, 1, 1)
    }
  }, [feature.primitive])

  return (
    <mesh
      position={transform.position as [number, number, number]}
      rotation={transform.rotation as [number, number, number]}
      scale={transform.scale as [number, number, number]}
      geometry={geometry}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.3}
        roughness={0.4}
      />

      {/* Wireframe overlay when selected */}
      {isSelected && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#4a9eff"
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </mesh>
  )
}

// Component for rendering extrude feature
function ExtrudeFeature({ feature, body, isSelected }: { feature: Feature; body: Body; isSelected: boolean }) {
  const color = isSelected ? '#4a9eff' : '#808080'

  // Get extrude parameters
  const height = feature.extrude_params?.height || 1
  const heightBackward = feature.extrude_params?.height_backward || 0

  // Generate geometry from sketch
  const geometry = useMemo(() => {
    // Find the sketch feature this extrude is based on
    const sketchFeature = body.features.find(f => f.id === feature.sketch_id)

    if (!sketchFeature || sketchFeature.type !== 'sketch' || !sketchFeature.sketch) {
      // Fallback to box if sketch not found
      console.warn('Sketch not found for extrude, using fallback box')
      return new THREE.BoxGeometry(2, height + heightBackward, 2)
    }

    try {
      // Generate extrude mesh from sketch elements
      return generateExtrudeMesh(
        sketchFeature.sketch.elements,
        sketchFeature.sketch.plane,
        height,
        heightBackward
      )
    } catch (error) {
      console.error('Failed to generate extrude mesh:', error)
      // Fallback to box on error
      return new THREE.BoxGeometry(2, height + heightBackward, 2)
    }
  }, [feature.sketch_id, height, heightBackward, body.features])

  return (
    <mesh
      geometry={geometry}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.3}
        roughness={0.4}
      />

      {/* Wireframe overlay when selected */}
      {isSelected && (
        <mesh geometry={geometry}>
          <meshBasicMaterial
            color="#4a9eff"
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </mesh>
  )
}

export function SceneObjects() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)

  return (
    <>
      {bodies.map(body => {
        if (!body.visible) return null

        const isSelected = selectedBodyIds.includes(body.id)

        return (
          <group key={body.id}>
            {body.features.map(feature => {
              // Render primitive features
              if (feature.type === 'primitive' && feature.primitive) {
                return (
                  <PrimitiveFeature
                    key={feature.id}
                    feature={feature}
                    isSelected={isSelected}
                  />
                )
              }

              // Render extrude features
              if (feature.type === 'extrude') {
                return (
                  <ExtrudeFeature
                    key={feature.id}
                    feature={feature}
                    body={body}
                    isSelected={isSelected}
                  />
                )
              }

              return null
            })}
          </group>
        )
      })}
    </>
  )
}
