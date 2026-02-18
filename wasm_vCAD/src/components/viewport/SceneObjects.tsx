import { useSceneStore } from '@/stores/sceneStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useBooleanStore } from '@/stores/booleanStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMemo, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { engine } from '@/wasm/engine'
import type { MeshData } from '@/types/mesh'
import type { Feature, Body } from '@/types/scene'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { deserializeGeometry } from '@/utils/manifoldCSG'
import { geometryCache } from '@/utils/geometryCache'
import { FaceHighlight } from './FaceHighlight'
import { EdgeHighlight } from './EdgeHighlight'

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

// ─── Boolean feature component ────────────────────────────────────────────────

function BooleanFeature({ feature, body, isSelected }: { feature: Feature; body: Body; isSelected: boolean }) {
  const { bodyOpacity, bodyColor, selectionColor } = useSettingsStore()
  const color = isSelected ? selectionColor : bodyColor

  const geometry = useMemo(() => {
    if (!feature.cached_mesh_vertices || !feature.cached_mesh_indices) {
      return new THREE.BoxGeometry(1, 1, 1)
    }
    return deserializeGeometry({
      vertices: feature.cached_mesh_vertices,
      indices:  feature.cached_mesh_indices,
    })
  }, [feature.cached_mesh_vertices, feature.cached_mesh_indices])

  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry, 15), [geometry])

  // Register geometry in cache so subsequent boolean ops can use this body
  useEffect(() => {
    geometryCache.set(body.id, geometry)
    return () => geometryCache.delete(body.id)
  }, [body.id, geometry])

  return (
    <group>
      {/* fill — transparent or solid depending on opacity setting */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent={bodyOpacity < 1}
          opacity={bodyOpacity}
          side={THREE.DoubleSide}
          depthWrite={bodyOpacity >= 1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <FaceHighlight feature={feature} body={body} geometry={geometry} />
      <EdgeHighlight feature={feature} body={body} geometry={geometry} />
    </group>
  )
}

// ─── Cut feature component ─────────────────────────────────────────────────────

function CutFeature({ feature, body, isSelected }: { feature: Feature; body: Body; isSelected: boolean }) {
  const { bodyOpacity, bodyColor, selectionColor } = useSettingsStore()
  const color = isSelected ? selectionColor : bodyColor

  const geometry = useMemo(() => {
    if (!feature.cached_mesh_vertices || !feature.cached_mesh_indices) {
      return new THREE.BoxGeometry(1, 1, 1)
    }
    return deserializeGeometry({
      vertices: feature.cached_mesh_vertices,
      indices:  feature.cached_mesh_indices,
    })
  }, [feature.cached_mesh_vertices, feature.cached_mesh_indices])

  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry, 15), [geometry])

  // Register geometry in cache so subsequent cuts/booleans can use this body
  useEffect(() => {
    geometryCache.set(body.id, geometry)
    return () => geometryCache.delete(body.id)
  }, [body.id, geometry])

  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent={bodyOpacity < 1}
          opacity={bodyOpacity}
          side={THREE.DoubleSide}
          depthWrite={bodyOpacity >= 1}
        />
      </mesh>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <FaceHighlight feature={feature} body={body} geometry={geometry} />
      <EdgeHighlight feature={feature} body={body} geometry={geometry} />
    </group>
  )
}

// ─── Body component (combines all features + registers body geometry in cache) ─

function BodyObject({ body, isSelected }: { body: Body; isSelected: boolean }) {
  const selectBody   = useSceneStore((s) => s.selectBody)
  const deselectBody = useSceneStore((s) => s.deselectBody)
  const clearSelection = useSceneStore((s) => s.clearSelection)
  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)
  const booleanActive = useBooleanStore((s) => s.active)
  const toggleBooleanSelection = useBooleanStore((s) => s.toggleBodySelection)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)

  // Click on body mesh in viewport → select/deselect body
  const handleBodyClick = useCallback((e: { nativeEvent: MouseEvent; stopPropagation: () => void }) => {
    // Don't steal click from face/edge selection modes
    if (faceSelectionActive || edgeSelectionActive) return
    e.stopPropagation()

    if (booleanActive) {
      toggleBooleanSelection(body.id)
      return
    }

    if (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey) {
      if (selectedBodyIds.includes(body.id)) {
        deselectBody(body.id)
      } else {
        selectBody(body.id)
      }
    } else {
      clearSelection()
      selectBody(body.id)
    }
  }, [body.id, faceSelectionActive, edgeSelectionActive, booleanActive,
      selectedBodyIds, selectBody, deselectBody, clearSelection, toggleBooleanSelection])

  // If the body has a cut feature with a cached mesh, render only that
  // (it represents body minus the cut tool — no need to also render primitive/extrude)
  const lastCutFeature = [...body.features].reverse().find(
    f => f.type === 'cut' && f.cached_mesh_vertices && f.cached_mesh_indices
  )

  return (
    <group onClick={handleBodyClick as any}>
      {lastCutFeature ? (
        <CutFeature feature={lastCutFeature} body={body} isSelected={isSelected} />
      ) : (
        body.features.map(feature => {
          if (feature.type === 'primitive' && feature.primitive) {
            return (
              <PrimitiveFeatureWithCache
                key={feature.id}
                feature={feature}
                body={body}
                isSelected={isSelected}
              />
            )
          }
          if (feature.type === 'extrude') {
            return (
              <ExtrudeFeatureWithCache
                key={feature.id}
                feature={feature}
                body={body}
                isSelected={isSelected}
              />
            )
          }
          if (feature.type === 'boolean') {
            return (
              <BooleanFeature
                key={feature.id}
                feature={feature}
                body={body}
                isSelected={isSelected}
              />
            )
          }
          return null
        })
      )}
    </group>
  )
}

// Wrappers that register geometry into the cache after computing it

function PrimitiveFeatureWithCache(props: { feature: Feature; body: Body; isSelected: boolean }) {
  const { feature, body, isSelected } = props
  const { bodyOpacity, bodyColor, selectionColor } = useSettingsStore()
  const color = isSelected ? selectionColor : bodyColor

  const geometry = useMemo(() => {
    if (!feature.primitive) return new THREE.BoxGeometry(1, 1, 1)
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
          meshData = engine.generateSphereMesh(feature.primitive.radius || 0.5)
          break
        case 'cone':
          meshData = engine.generateConeMesh(
            feature.primitive.radius || 0.5,
            feature.primitive.height || 1
          )
          break
        default:
          return new THREE.BoxGeometry(1, 1, 1)
      }
      return createGeometryFromMeshData(meshData)
    } catch {
      return new THREE.BoxGeometry(1, 1, 1)
    }
  }, [feature.primitive])

  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry, 15), [geometry])

  useEffect(() => {
    geometryCache.set(body.id, geometry)
    return () => geometryCache.delete(body.id)
  }, [body.id, geometry])

  const transform = feature.transform || { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] }

  return (
    <group
      position={transform.position as [number,number,number]}
      rotation={transform.rotation as [number,number,number]}
      scale={transform.scale as [number,number,number]}
    >
      {/* fill — transparent or solid depending on opacity setting */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent={bodyOpacity < 1}
          opacity={bodyOpacity}
          side={THREE.DoubleSide}
          depthWrite={bodyOpacity >= 1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <FaceHighlight feature={feature} body={body} geometry={geometry} />
      <EdgeHighlight feature={feature} body={body} geometry={geometry} />
    </group>
  )
}

function ExtrudeFeatureWithCache(props: { feature: Feature; body: Body; isSelected: boolean }) {
  const { feature, body, isSelected } = props
  const { bodyOpacity, bodyColor, selectionColor } = useSettingsStore()
  const color = isSelected ? selectionColor : bodyColor

  const height = feature.extrude_params?.height || 1
  const heightBackward = feature.extrude_params?.height_backward || 0

  const geometry = useMemo(() => {
    const sketchFeature = body.features.find(f => f.id === feature.sketch_id)
    if (!sketchFeature || sketchFeature.type !== 'sketch' || !sketchFeature.sketch) {
      return new THREE.BoxGeometry(2, height + heightBackward, 2)
    }
    try {
      return generateExtrudeMesh(
        sketchFeature.sketch.elements,
        sketchFeature.sketch.plane,
        height,
        heightBackward,
        sketchFeature.sketch.offset ?? 0,
        sketchFeature.sketch.face_coord_system ?? null
      )
    } catch {
      return new THREE.BoxGeometry(2, height + heightBackward, 2)
    }
  }, [feature.sketch_id, height, heightBackward, body.features])

  const edgesGeometry = useMemo(() => new THREE.EdgesGeometry(geometry, 15), [geometry])

  useEffect(() => {
    geometryCache.set(body.id, geometry)
    return () => geometryCache.delete(body.id)
  }, [body.id, geometry])

  return (
    <group>
      {/* fill — transparent or solid depending on opacity setting */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent={bodyOpacity < 1}
          opacity={bodyOpacity}
          side={THREE.DoubleSide}
          depthWrite={bodyOpacity >= 1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <FaceHighlight feature={feature} body={body} geometry={geometry} />
      <EdgeHighlight feature={feature} body={body} geometry={geometry} />
    </group>
  )
}

export function SceneObjects() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)

  return (
    <>
      {bodies.map(body => {
        if (!body.visible) return null
        return (
          <BodyObject
            key={body.id}
            body={body}
            isSelected={selectedBodyIds.includes(body.id)}
          />
        )
      })}
    </>
  )
}
