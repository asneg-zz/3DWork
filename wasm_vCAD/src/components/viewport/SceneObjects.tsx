import { useSceneStore } from '@/stores/sceneStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useBooleanStore } from '@/stores/booleanStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useViewportContextMenuStore } from '@/stores/viewportContextMenuStore'
import { useMemo, useEffect, useCallback, useRef } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { engine } from '@/wasm/engine'
import type { MeshData } from '@/types/mesh'
import type { Feature, Body } from '@/types/scene'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { performCSGCut, serializeGeometry, deserializeGeometry } from '@/utils/manifoldCSG'
import { geometryCache } from '@/utils/geometryCache'
import { normalToPlane, calculateOffset, computeFaceCoordSystem, computeGeometricFaceData } from '@/utils/faceUtils'
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

// ─── Helper: build primitive geometry via WASM ────────────────────────────────

function buildPrimitiveGeo(primitive: NonNullable<Feature['primitive']>): THREE.BufferGeometry {
  try {
    let meshData: MeshData
    switch (primitive.type) {
      case 'cube':
        meshData = engine.generateCubeMesh(primitive.width || 1, primitive.height || 1, primitive.depth || 1)
        break
      case 'cylinder':
        meshData = engine.generateCylinderMesh(primitive.radius || 0.5, primitive.height || 1)
        break
      case 'sphere':
        meshData = engine.generateSphereMesh(primitive.radius || 0.5)
        break
      case 'cone':
        meshData = engine.generateConeMesh(primitive.radius || 0.5, primitive.height || 1)
        break
      default:
        return new THREE.BoxGeometry(1, 1, 1)
    }
    return createGeometryFromMeshData(meshData)
  } catch {
    return new THREE.BoxGeometry(1, 1, 1)
  }
}

// ─── Hook: rebuild CSG for cut features loaded from file (no cached mesh) ─────

function useRebuildUncachedCuts(bodies: Body[]) {
  const updateFeature = useSceneStore((s) => s.updateFeature)
  // Track which feature IDs we've already rebuilt so we don't loop infinitely
  const rebuiltRef = useRef(new Set<string>())

  useEffect(() => {
    const bodiesNeedingWork = bodies.filter(body =>
      body.features.some(
        f => f.type === 'cut' && !f.cached_mesh_vertices && !rebuiltRef.current.has(f.id)
      )
    )
    if (bodiesNeedingWork.length === 0) return

    let cancelled = false

    const run = async () => {
      for (const body of bodiesNeedingWork) {
        if (cancelled) break

        let bodyGeo: THREE.BufferGeometry | null = null

        for (const feature of body.features) {
          if (cancelled) break

          try {
            if (feature.type === 'primitive' && feature.primitive) {
              bodyGeo = buildPrimitiveGeo(feature.primitive)

            } else if (feature.type === 'extrude') {
              const sk = body.features.find(f => f.id === feature.sketch_id)
              if (sk?.type === 'sketch' && sk.sketch) {
                bodyGeo = generateExtrudeMesh(
                  sk.sketch.elements,
                  sk.sketch.plane,
                  feature.extrude_params?.height ?? 1,
                  feature.extrude_params?.height_backward ?? 0,
                  sk.sketch.offset ?? 0,
                  sk.sketch.face_coord_system ?? null
                )
              }

            } else if (feature.type === 'cut') {
              // Already cached from a previous session — use it as running geometry
              if (feature.cached_mesh_vertices && feature.cached_mesh_indices) {
                bodyGeo = deserializeGeometry({
                  vertices: feature.cached_mesh_vertices,
                  indices: feature.cached_mesh_indices,
                })
                continue
              }

              // Already scheduled for rebuild in a previous effect run
              if (rebuiltRef.current.has(feature.id)) continue

              if (!bodyGeo) continue

              const sk = body.features.find(f => f.id === feature.sketch_id)
              if (sk?.type !== 'sketch' || !sk.sketch) continue

              const toolH  = feature.extrude_params?.height          ?? 1000
              const toolHB = feature.extrude_params?.height_backward ?? 0
              const fcs = sk.sketch.face_coord_system ?? null

              const baseGeo = bodyGeo
              const result = await performCSGCut(
                baseGeo,
                sk.sketch.elements,
                sk.sketch.plane,
                sk.sketch.offset ?? 0,
                fcs,
                toolH,
                toolHB,
              )

              if (cancelled) break

              const { vertices, indices } = serializeGeometry(result)
              const { vertices: baseV, indices: baseI } = serializeGeometry(baseGeo)

              updateFeature(body.id, feature.id, {
                ...feature,
                cached_mesh_vertices: vertices,
                cached_mesh_indices: indices,
                base_mesh_vertices: baseV,
                base_mesh_indices: baseI,
              })

              rebuiltRef.current.add(feature.id)
              bodyGeo = result
            }
          } catch (err) {
            console.error('Cut rebuild failed for feature', feature.id, err)
          }
        }
      }
    }

    run()
    return () => { cancelled = true }
  }, [bodies, updateFeature])
}

// ─── Boolean feature component ────────────────────────────────────────────────

function BooleanFeature({ feature, body, isSelected }: { feature: Feature; body: Body; isSelected: boolean }) {
  const { bodyOpacity, bodyColor, selectionColor } = useSettingsStore()
  const color = isSelected ? selectionColor : bodyColor
  // When opaque: darken edges so they contrast with the fill; when transparent: same as fill
  const edgeColor = bodyOpacity >= 1 ? new THREE.Color(color).multiplyScalar(0.45) : color

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
          side={bodyOpacity < 1 ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={bodyOpacity >= 1}
          polygonOffset={true}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={edgeColor} />
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
  // When opaque: darken edges so they contrast with the fill; when transparent: same as fill
  const edgeColor = bodyOpacity >= 1 ? new THREE.Color(color).multiplyScalar(0.45) : color

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
          side={bodyOpacity < 1 ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={bodyOpacity >= 1}
          polygonOffset={true}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={edgeColor} />
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

  // Right-click → viewport context menu with face data
  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()

    const mesh = e.object as THREE.Mesh
    const faceIndex = e.faceIndex

    // Find a geometry-producing feature for featureId
    const geomFeature = body.features.find(
      f => f.type === 'extrude' || f.type === 'cut' || f.type === 'boolean' || f.type === 'primitive'
    )

    let faceInfo = undefined
    if (faceIndex !== undefined && mesh?.geometry && geomFeature) {
      const data = computeGeometricFaceData(mesh.geometry, faceIndex, mesh.matrixWorld)
      if (data) {
        const { worldNormal, worldCenter } = data
        const axisPlane = normalToPlane(worldNormal)
        const plane = axisPlane ?? 'CUSTOM'
        const offset = axisPlane ? calculateOffset(worldCenter, axisPlane) : 0
        const faceCoordSystem = computeFaceCoordSystem(worldCenter, worldNormal)
        faceInfo = {
          bodyId: body.id,
          featureId: geomFeature.id,
          plane,
          offset,
          faceCoordSystem,
        }
      }
    }

    useViewportContextMenuStore.getState().open(
      e.nativeEvent.clientX,
      e.nativeEvent.clientY,
      body.id,
      faceInfo
    )
  }, [body.id, body.features])

  // If the body has a cut feature with a cached mesh, render only that
  // (it represents body minus the cut tool — no need to also render primitive/extrude)
  const lastCutFeature = [...body.features].reverse().find(
    f => f.type === 'cut' && f.cached_mesh_vertices && f.cached_mesh_indices
  )

  return (
    <group onClick={handleBodyClick as any} onContextMenu={handleContextMenu as any}>
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
  // When opaque: darken edges so they contrast with the fill; when transparent: same as fill
  const edgeColor = bodyOpacity >= 1 ? new THREE.Color(color).multiplyScalar(0.45) : color

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
          side={bodyOpacity < 1 ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={bodyOpacity >= 1}
          polygonOffset={true}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={edgeColor} />
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
  // When opaque: darken edges so they contrast with the fill; when transparent: same as fill
  const edgeColor = bodyOpacity >= 1 ? new THREE.Color(color).multiplyScalar(0.45) : color

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
          side={bodyOpacity < 1 ? THREE.DoubleSide : THREE.FrontSide}
          depthWrite={bodyOpacity >= 1}
          polygonOffset={true}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {/* visible edges */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color={edgeColor} />
      </lineSegments>
      <FaceHighlight feature={feature} body={body} geometry={geometry} />
      <EdgeHighlight feature={feature} body={body} geometry={geometry} />
    </group>
  )
}

export function SceneObjects() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)

  // Rebuild CSG for cut features that were loaded from file without cached geometry
  useRebuildUncachedCuts(bodies)

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
