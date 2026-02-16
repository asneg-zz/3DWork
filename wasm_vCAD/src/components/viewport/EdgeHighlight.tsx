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
 * Extract unique edges from mesh geometry
 */
function extractEdges(geometry: THREE.BufferGeometry): Edge[] {
  const index = geometry.index
  const position = geometry.attributes.position

  if (!index || !position || !(position instanceof THREE.BufferAttribute)) {
    return []
  }

  const edges: Map<string, Edge> = new Map()

  // Iterate through all triangles
  for (let i = 0; i < index.count; i += 3) {
    const indices = [
      index.getX(i),
      index.getX(i + 1),
      index.getX(i + 2)
    ]

    // Get triangle vertices
    const vertices = indices.map(idx =>
      new THREE.Vector3(
        position.getX(idx),
        position.getY(idx),
        position.getZ(idx)
      )
    )

    // Add three edges of the triangle
    for (let j = 0; j < 3; j++) {
      const start = vertices[j]
      const end = vertices[(j + 1) % 3]

      // Create sorted key to avoid duplicates
      const key = [start, end]
        .map(v => `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`)
        .sort()
        .join('|')

      if (!edges.has(key)) {
        edges.set(key, { start, end, key })
      }
    }
  }

  return Array.from(edges.values())
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
  }
}

export function EdgeHighlight({ feature, body, geometry }: EdgeHighlightProps) {
  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)
  const setHoveredEdge = useEdgeSelectionStore((s) => s.setHoveredEdge)
  const showContextMenu = useEdgeSelectionStore((s) => s.showContextMenu)

  const groupRef = useRef<THREE.Group>(null)
  const [hoveredEdge, setLocalHoveredEdge] = useState<Edge | null>(null)

  const { raycaster, pointer, camera, gl } = useThree()

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

  const handleContextMenu = (event: MouseEvent) => {
    if (!edgeSelectionActive || !hoveredEdge) return

    event.preventDefault()
    event.stopPropagation()

    const plane = edgeToPlane(hoveredEdge)
    const midpoint = new THREE.Vector3()
      .addVectors(hoveredEdge.start, hoveredEdge.end)
      .multiplyScalar(0.5)
    const offset = calculateOffset(midpoint, plane)

    showContextMenu(event.clientX, event.clientY, {
      bodyId: body.id,
      featureId: feature.id,
      edgeStart: hoveredEdge.start.toArray(),
      edgeEnd: hoveredEdge.end.toArray(),
      plane,
      offset
    })
  }

  // Add context menu listener
  useMemo(() => {
    if (edgeSelectionActive) {
      const canvas = gl.domElement
      canvas.addEventListener('contextmenu', handleContextMenu as any)
      return () => {
        canvas.removeEventListener('contextmenu', handleContextMenu as any)
      }
    }
  }, [edgeSelectionActive, hoveredEdge, gl.domElement])

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
