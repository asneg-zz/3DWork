/**
 * Edge highlighting and selection for 3D objects
 * Detects and highlights edges on meshes for sketch creation
 */

import { useRef, useState, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import type { Feature, Body, SketchPlane } from '@/types/scene'

interface EdgeHighlightProps {
  feature: Feature
  body: Body
  geometry: THREE.BufferGeometry
}

interface Edge {
  start: THREE.Vector3
  end: THREE.Vector3
  key: string
}

/**
 * Extract geometric edges from mesh using THREE.EdgesGeometry
 * This automatically filters for sharp edges (angle > threshold)
 */
function extractEdges(geometry: THREE.BufferGeometry): Edge[] {
  // Use Three.js EdgesGeometry to get only geometric edges (not mesh triangulation)
  // thresholdAngle = 1 degree means edges where angle between faces > 1 degree
  const edgesGeometry = new THREE.EdgesGeometry(geometry, 1)
  const position = edgesGeometry.attributes.position

  if (!position || !(position instanceof THREE.BufferAttribute)) {
    return []
  }

  const edges: Edge[] = []

  // EdgesGeometry contains line segments (pairs of vertices)
  for (let i = 0; i < position.count; i += 2) {
    const start = new THREE.Vector3(
      position.getX(i),
      position.getY(i),
      position.getZ(i)
    )
    const end = new THREE.Vector3(
      position.getX(i + 1),
      position.getY(i + 1),
      position.getZ(i + 1)
    )

    // Create key for this edge
    const key = [start, end]
      .map(v => `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`)
      .sort()
      .join('|')

    edges.push({ start, end, key })
  }

  return edges
}

/**
 * Find closest edge to a point
 */
function findClosestEdge(
  edges: Edge[],
  point: THREE.Vector3,
  threshold: number = 0.1
): Edge | null {
  let closestEdge: Edge | null = null
  let minDistance = threshold

  for (const edge of edges) {
    // Calculate distance from point to line segment
    const line = new THREE.Line3(edge.start, edge.end)
    const closestPoint = new THREE.Vector3()
    line.closestPointToPoint(point, true, closestPoint)
    const distance = point.distanceTo(closestPoint)

    if (distance < minDistance) {
      minDistance = distance
      closestEdge = edge
    }
  }

  return closestEdge
}

/**
 * Determine sketch plane from edge direction
 */
function edgeToPlane(edge: Edge): SketchPlane {
  const direction = new THREE.Vector3().subVectors(edge.end, edge.start).normalize()
  const absX = Math.abs(direction.x)
  const absY = Math.abs(direction.y)
  const absZ = Math.abs(direction.z)

  // Choose plane perpendicular to dominant direction
  if (absZ > absX && absZ > absY) {
    return 'XY' // Edge along Z, sketch on XY plane
  } else if (absY > absX && absY > absZ) {
    return 'XZ' // Edge along Y, sketch on XZ plane
  } else {
    return 'YZ' // Edge along X, sketch on YZ plane
  }
}

/**
 * Calculate offset for sketch plane
 */
function calculateOffset(point: THREE.Vector3, plane: SketchPlane): number {
  switch (plane) {
    case 'XY':
      return point.z
    case 'XZ':
      return point.y
    case 'YZ':
      return point.x
    default:
      return 0
  }
}

export function EdgeHighlight({ feature, body, geometry }: EdgeHighlightProps) {
  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)
  const setHoveredEdge = useEdgeSelectionStore((s) => s.setHoveredEdge)

  const groupRef = useRef<THREE.Group>(null)
  const [hoveredEdge, setLocalHoveredEdge] = useState<Edge | null>(null)

  const { raycaster, pointer, camera } = useThree()

  // Extract all edges from geometry
  const edges = useMemo(() => extractEdges(geometry), [geometry])

  // Track mouse movement for edge highlighting
  useFrame(() => {
    if (!edgeSelectionActive || !groupRef.current) {
      if (hoveredEdge !== null) {
        setLocalHoveredEdge(null)
        setHoveredEdge(null)
      }
      return
    }

    // Update raycaster
    raycaster.setFromCamera(pointer, camera)

    // Find intersection point with bounding box
    const box = new THREE.Box3().setFromObject(groupRef.current)
    const ray = raycaster.ray
    const intersectPoint = new THREE.Vector3()

    if (ray.intersectBox(box, intersectPoint)) {
      // Find closest edge to intersection point
      const closestEdge = findClosestEdge(edges, intersectPoint, 0.15)

      if (closestEdge && closestEdge.key !== hoveredEdge?.key) {
        setLocalHoveredEdge(closestEdge)

        // Determine plane and offset
        const plane = edgeToPlane(closestEdge)
        const midpoint = new THREE.Vector3()
          .addVectors(closestEdge.start, closestEdge.end)
          .multiplyScalar(0.5)
        const offset = calculateOffset(midpoint, plane)

        setHoveredEdge({
          bodyId: body.id,
          featureId: feature.id,
          edgeStart: closestEdge.start.toArray(),
          edgeEnd: closestEdge.end.toArray(),
          plane,
          offset
        })
      } else if (!closestEdge && hoveredEdge !== null) {
        setLocalHoveredEdge(null)
        setHoveredEdge(null)
      }
    } else if (hoveredEdge !== null) {
      setLocalHoveredEdge(null)
      setHoveredEdge(null)
    }
  })

  if (!edgeSelectionActive) {
    return null
  }

  return (
    <group ref={groupRef}>
      {/* Render all edges with highlighting */}
      {edges.map((edge) => {
        const isHovered = hoveredEdge?.key === edge.key
        return (
          <Line
            key={edge.key}
            points={[edge.start, edge.end]}
            color={isHovered ? '#4a9eff' : '#888888'}
            lineWidth={isHovered ? 3 : 1}
            transparent
            opacity={isHovered ? 1 : 0.3}
          />
        )
      })}
    </group>
  )
}
