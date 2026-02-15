import { useRef, useCallback, useMemo, useEffect, useState } from 'react'
import { ThreeEvent, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useSceneStore, EdgeSelection } from '@/stores/sceneStore'
import type { Body, Feature, Primitive, Transform } from '@/types/scene'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { extractEdges, pickEdge, MeshEdge } from '@/utils/edgeUtils'

export function SceneObjects() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const hoveredBodyId = useSceneStore((s) => s.hoveredBodyId)
  const hiddenBodies = useSceneStore((s) => s.hiddenBodies)
  const selectBody = useSceneStore((s) => s.selectBody)
  const setHovered = useSceneStore((s) => s.setHovered)
  const clearSelection = useSceneStore((s) => s.clearSelection)

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, id: string) => {
      e.stopPropagation()
      selectBody(id, e.ctrlKey || e.metaKey)
    },
    [selectBody]
  )

  const handlePointerOver = useCallback(
    (id: string) => {
      setHovered(id)
      document.body.style.cursor = 'pointer'
    },
    [setHovered]
  )

  const handlePointerOut = useCallback(() => {
    setHovered(null)
    document.body.style.cursor = 'auto'
  }, [setHovered])

  const handleMissed = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  // Only show transform gizmo for single selection
  const singleSelectedId = selectedBodyIds.length === 1 ? selectedBodyIds[0] : null

  return (
    <group onPointerMissed={handleMissed}>
      {bodies
        .filter((b) => b.visible && !hiddenBodies.has(b.id))
        .map((body) => (
          <BodyMesh
            key={body.id}
            body={body}
            isSelected={selectedBodyIds.includes(body.id)}
            isHovered={hoveredBodyId === body.id}
            showTransformGizmo={body.id === singleSelectedId}
            onClick={(e) => handleClick(e, body.id)}
            onPointerOver={() => handlePointerOver(body.id)}
            onPointerOut={handlePointerOut}
          />
        ))}
    </group>
  )
}

interface BodyMeshProps {
  body: Body
  isSelected: boolean
  isHovered: boolean
  showTransformGizmo: boolean
  onClick: (e: ThreeEvent<MouseEvent>) => void
  onPointerOver: () => void
  onPointerOut: () => void
}

function BodyMesh({
  body,
  isSelected,
  isHovered,
  showTransformGizmo,
  onClick,
  onPointerOver,
  onPointerOut,
}: BodyMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const transformRef = useRef<TransformControlsImpl>(null)
  const { camera, size } = useThree()
  const [hoveredEdge, setHoveredEdge] = useState<MeshEdge | null>(null)
  const [edges, setEdges] = useState<MeshEdge[]>([])

  const transformMode = useSceneStore((s) => s.transformMode)
  const transformEnabled = useSceneStore((s) => s.transformEnabled)
  const updateBodyTransform = useSceneStore((s) => s.updateBodyTransform)
  const fillet3d = useSceneStore((s) => s.fillet3d)
  const chamfer3d = useSceneStore((s) => s.chamfer3d)
  const selectEdge = useSceneStore((s) => s.selectEdge)

  const isEdgeMode = fillet3d.active || chamfer3d.active
  const selectedEdges = fillet3d.active ? fillet3d.selectedEdges : chamfer3d.selectedEdges

  // Get base geometry from first feature
  const { geometry, transform, color } = useMemo(() => {
    const baseFeature = body.features[0]
    if (!baseFeature) {
      return {
        geometry: <boxGeometry args={[1, 1, 1]} />,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } as Transform,
        color: '#6366f1',
      }
    }

    return getFeatureGeometry(baseFeature)
  }, [body.features])

  // Extract edges when in edge mode
  useEffect(() => {
    if (!isEdgeMode) {
      setEdges([])
      return
    }

    // Small delay to ensure mesh is rendered
    const timer = setTimeout(() => {
      if (!meshRef.current) return

      const geom = meshRef.current.geometry
      if (!geom) return

      // Update world matrix
      meshRef.current.updateMatrixWorld(true)
      const worldMatrix = meshRef.current.matrixWorld

      const localEdges = extractEdges(geom, 10)

      const worldEdges = localEdges.map(edge => ({
        ...edge,
        start: edge.start.clone().applyMatrix4(worldMatrix),
        end: edge.end.clone().applyMatrix4(worldMatrix),
        normal1: edge.normal1.clone().transformDirection(worldMatrix),
        normal2: edge.normal2?.clone().transformDirection(worldMatrix) ?? null
      }))

      setEdges(worldEdges)
    }, 100)

    return () => clearTimeout(timer)
  }, [isEdgeMode, body.features])

  // Handle transform changes
  useEffect(() => {
    const controls = transformRef.current
    if (!controls) return

    const handleChange = () => {
      if (!meshRef.current) return

      const pos = meshRef.current.position.toArray() as [number, number, number]
      const rot: [number, number, number] = [
        (meshRef.current.rotation.x * 180) / Math.PI,
        (meshRef.current.rotation.y * 180) / Math.PI,
        (meshRef.current.rotation.z * 180) / Math.PI,
      ]
      const sc = meshRef.current.scale.toArray() as [number, number, number]

      updateBodyTransform(body.id, pos, rot, sc)
    }

    controls.addEventListener('objectChange', handleChange)
    return () => controls.removeEventListener('objectChange', handleChange)
  }, [body.id, updateBodyTransform, showTransformGizmo])

  // Handle edge hover
  const handleEdgePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!isEdgeMode || edges.length === 0) return

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(event.pointer, camera)

    const hit = pickEdge(
      raycaster,
      edges,
      camera,
      { width: size.width, height: size.height },
      event.pointer,
      25  // Pixel tolerance for edge picking
    )

    setHoveredEdge(hit?.edge ?? null)
  }, [isEdgeMode, edges, camera, size])

  // Handle edge click
  const handleEdgeClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!isEdgeMode) {
      onClick(event)
      return
    }

    // In edge mode: ignore clicks that miss edges (don't clear selection)
    if (!hoveredEdge) {
      event.stopPropagation()
      return
    }

    event.stopPropagation()

    const edgeSelection: EdgeSelection = {
      bodyId: body.id,
      start: [hoveredEdge.start.x, hoveredEdge.start.y, hoveredEdge.start.z],
      end: [hoveredEdge.end.x, hoveredEdge.end.y, hoveredEdge.end.z],
      normal1: [hoveredEdge.normal1.x, hoveredEdge.normal1.y, hoveredEdge.normal1.z],
      normal2: hoveredEdge.normal2
        ? [hoveredEdge.normal2.x, hoveredEdge.normal2.y, hoveredEdge.normal2.z]
        : undefined
    }

    selectEdge(edgeSelection, event.ctrlKey || event.metaKey)
  }, [isEdgeMode, hoveredEdge, body.id, selectEdge, onClick])

  // Handle right-click to clear edge selection
  const handleContextMenu = useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!isEdgeMode) return

    event.nativeEvent.preventDefault()

    // Clear edge selection in fillet/chamfer mode
    const state = useSceneStore.getState()
    if (state.fillet3d.active) {
      state.fillet3d.selectedEdges.length = 0
      useSceneStore.setState({ fillet3d: { ...state.fillet3d } })
    } else if (state.chamfer3d.active) {
      state.chamfer3d.selectedEdges.length = 0
      useSceneStore.setState({ chamfer3d: { ...state.chamfer3d } })
    }
  }, [isEdgeMode])

  // Determine color based on state
  let finalColor = color
  if (isSelected) {
    finalColor = '#fbbf24' // Yellow for selected
  } else if (isHovered) {
    finalColor = '#a78bfa' // Light purple for hovered
  }

  const position = transform.position as [number, number, number]
  const rotation = transform.rotation.map((r) => (r * Math.PI) / 180) as [number, number, number]
  const scale = transform.scale as [number, number, number]

  // Create edge line geometries
  const edgeLinesGeometry = useMemo(() => {
    if (!isEdgeMode || edges.length === 0) return null
    const positions: number[] = []
    for (const edge of edges) {
      positions.push(edge.start.x, edge.start.y, edge.start.z)
      positions.push(edge.end.x, edge.end.y, edge.end.z)
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geom
  }, [isEdgeMode, edges])

  const selectedEdgesGeometry = useMemo(() => {
    if (selectedEdges.length === 0) return null
    const positions: number[] = []
    for (const sel of selectedEdges) {
      positions.push(sel.start[0], sel.start[1], sel.start[2])
      positions.push(sel.end[0], sel.end[1], sel.end[2])
    }
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geom
  }, [selectedEdges])

  const hoveredEdgeGeometry = useMemo(() => {
    if (!hoveredEdge) return null
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute([
      hoveredEdge.start.x, hoveredEdge.start.y, hoveredEdge.start.z,
      hoveredEdge.end.x, hoveredEdge.end.y, hoveredEdge.end.z
    ], 3))
    return geom
  }, [hoveredEdge])

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={isEdgeMode ? handleEdgeClick : onClick}
        onContextMenu={isEdgeMode ? handleContextMenu : undefined}
        onPointerMove={isEdgeMode ? handleEdgePointerMove : undefined}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
      >
        {geometry}
        <meshStandardMaterial
          color={finalColor}
          roughness={0.4}
          metalness={0.1}
        />
        {isSelected && meshRef.current && (
          <lineSegments>
            <edgesGeometry args={[meshRef.current.geometry]} />
            <lineBasicMaterial color="#fbbf24" linewidth={2} />
          </lineSegments>
        )}
      </mesh>

      {/* Edge visualization for fillet/chamfer mode */}
      {isEdgeMode && edgeLinesGeometry && (
        <lineSegments geometry={edgeLinesGeometry}>
          <lineBasicMaterial color="#666666" linewidth={1} transparent opacity={0.6} />
        </lineSegments>
      )}
      {selectedEdgesGeometry && (
        <lineSegments geometry={selectedEdgesGeometry}>
          <lineBasicMaterial color="#22c55e" linewidth={2} />
        </lineSegments>
      )}
      {hoveredEdgeGeometry && (
        <lineSegments geometry={hoveredEdgeGeometry}>
          <lineBasicMaterial color="#fbbf24" linewidth={2} />
        </lineSegments>
      )}

      {showTransformGizmo && transformEnabled && meshRef.current && !isEdgeMode && (
        <TransformControls
          ref={transformRef}
          object={meshRef.current}
          mode={transformMode}
          size={0.75}
        />
      )}
    </>
  )
}

function getFeatureGeometry(feature: Feature): {
  geometry: JSX.Element
  transform: Transform
  color: string
} {
  switch (feature.type) {
    case 'base_primitive':
      return {
        geometry: createPrimitiveGeometry(feature.primitive),
        transform: feature.transform,
        color: getPrimitiveColor(feature.primitive.type),
      }
    case 'base_extrude':
      // For base extrude, create a box approximation
      // In real implementation, this would create the actual extruded geometry
      return {
        geometry: <boxGeometry args={[1, feature.height, 1]} />,
        transform: feature.sketch_transform,
        color: '#22c55e',
      }
    case 'base_revolve':
      // For base revolve, create a lathe approximation
      return {
        geometry: <cylinderGeometry args={[0.5, 0.5, 1, 32]} />,
        transform: feature.sketch_transform,
        color: '#8b5cf6',
      }
    default:
      return {
        geometry: <boxGeometry args={[1, 1, 1]} />,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        color: '#6366f1',
      }
  }
}

function createPrimitiveGeometry(primitive: Primitive): JSX.Element {
  switch (primitive.type) {
    case 'cube': {
      const { width, height, depth } = primitive
      return <boxGeometry args={[width, height, depth]} />
    }
    case 'cylinder': {
      const { radius, height } = primitive
      return <cylinderGeometry args={[radius, radius, height, 32]} />
    }
    case 'sphere': {
      const { radius } = primitive
      return <sphereGeometry args={[radius, 32, 32]} />
    }
    case 'cone': {
      const { radius, height } = primitive
      return <coneGeometry args={[radius, height, 32]} />
    }
    default:
      return <boxGeometry args={[1, 1, 1]} />
  }
}

function getPrimitiveColor(type: string): string {
  switch (type) {
    case 'cube':
      return '#6366f1' // Indigo
    case 'cylinder':
      return '#22c55e' // Green
    case 'sphere':
      return '#f59e0b' // Amber
    case 'cone':
      return '#ec4899' // Pink
    default:
      return '#6366f1'
  }
}
