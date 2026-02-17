/**
 * SketchScene3D - Sketch editor integrated into 3D viewport
 * Renders sketch elements as Three.js objects and handles pointer events
 * via ray-plane intersection. Replaces the 2D HTML Canvas SketchCanvas.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'
import type { Point2D, SketchElement, SketchPlane, SnapPoint } from '@/types/scene'
import {
  findElementAtPoint as findElementUtil,
  getElementControlPoints,
  hitTestControlPoints,
  updateElementPoint,
  createSketchForWasm,
  processWasmResult,
  duplicateElement,
} from './sketchUtils'
import * as SketchOps from './sketchOperations'
import { engine } from '@/wasm/engine'

// ─── Coordinate utilities ────────────────────────────────────────────────────

export function sketchToWorld(
  x: number,
  y: number,
  plane: SketchPlane,
  offset: number
): THREE.Vector3 {
  switch (plane) {
    case 'XY': return new THREE.Vector3(x, y, offset)
    case 'XZ': return new THREE.Vector3(x, offset, y)
    case 'YZ': return new THREE.Vector3(offset, x, y)
  }
}

export function worldToSketch(point: THREE.Vector3, plane: SketchPlane): Point2D {
  switch (plane) {
    case 'XY': return { x: point.x, y: point.y }
    case 'XZ': return { x: point.x, y: point.z }
    case 'YZ': return { x: point.y, y: point.z }
  }
}

// Rotation for the interaction plane mesh
function planeRotation(plane: SketchPlane): [number, number, number] {
  switch (plane) {
    case 'XY': return [0, 0, 0]
    case 'XZ': return [-Math.PI / 2, 0, 0]
    case 'YZ': return [0, Math.PI / 2, 0]
  }
}

// Position of the interaction plane (offset along normal)
function planePosition(plane: SketchPlane, offset: number): [number, number, number] {
  switch (plane) {
    case 'XY': return [0, 0, offset]
    case 'XZ': return [0, offset, 0]
    case 'YZ': return [offset, 0, 0]
  }
}

// ─── Element → 3D points ─────────────────────────────────────────────────────

function elementToPoints3D(
  element: SketchElement,
  plane: SketchPlane,
  offset: number
): THREE.Vector3[] {
  const s = (x: number, y: number) => sketchToWorld(x, y, plane, offset)

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        return [s(element.start.x, element.start.y), s(element.end.x, element.end.y)]
      }
      break

    case 'circle': {
      if (element.center && element.radius !== undefined) {
        const pts: THREE.Vector3[] = []
        const segs = 64
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2
          pts.push(s(
            element.center.x + Math.cos(a) * element.radius,
            element.center.y + Math.sin(a) * element.radius
          ))
        }
        return pts
      }
      break
    }

    case 'arc': {
      if (element.center && element.radius !== undefined &&
          element.start_angle !== undefined && element.end_angle !== undefined) {
        const pts: THREE.Vector3[] = []
        const segs = 48
        let startA = element.start_angle
        let endA = element.end_angle
        // Ensure arc goes in right direction
        if (endA < startA) endA += Math.PI * 2
        for (let i = 0; i <= segs; i++) {
          const a = startA + (i / segs) * (endA - startA)
          pts.push(s(
            element.center.x + Math.cos(a) * element.radius,
            element.center.y + Math.sin(a) * element.radius
          ))
        }
        return pts
      }
      break
    }

    case 'rectangle': {
      if (element.corner && element.width !== undefined && element.height !== undefined) {
        const { corner: c, width: w, height: h } = element
        return [
          s(c.x, c.y),
          s(c.x + w, c.y),
          s(c.x + w, c.y + h),
          s(c.x, c.y + h),
          s(c.x, c.y),
        ]
      }
      break
    }

    case 'polyline':
    case 'spline':
      if (element.points && element.points.length >= 2) {
        return element.points.map(p => s(p.x, p.y))
      }
      break

    case 'dimension':
      // Dimensions are rendered via Html overlay, skip here
      break
  }

  return []
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SketchElement3DProps {
  element: SketchElement
  isSelected: boolean
  isConstruction: boolean
  isSymmetryAxis: boolean
  plane: SketchPlane
  offset: number
}

function SketchElement3D({ element, isSelected, isConstruction, isSymmetryAxis, plane, offset }: SketchElement3DProps) {
  const points = useMemo(
    () => elementToPoints3D(element, plane, offset),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(element), plane, offset]
  )

  let color = '#e0e0e0'
  if (isSelected) color = '#4ade80'
  else if (isSymmetryAxis) color = '#8b5cf6'
  else if (isConstruction) color = '#fbbf24'

  const lineObject = useMemo(() => {
    if (points.length < 2) return null
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color })
    return new THREE.Line(geo, mat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, color])

  if (!lineObject) return null

  return <primitive object={lineObject} />
}

interface SketchElements3DProps {
  elements: SketchElement[]
  selectedIds: string[]
  construction: boolean[]
  symmetryAxis: number | null
  plane: SketchPlane
  offset: number
}

function SketchElements3D({ elements, selectedIds, construction, symmetryAxis, plane, offset }: SketchElements3DProps) {
  return (
    <>
      {elements.map((element, index) => (
        <SketchElement3D
          key={element.id}
          element={element}
          isSelected={selectedIds.includes(element.id)}
          isConstruction={construction[index] ?? false}
          isSymmetryAxis={symmetryAxis === index}
          plane={plane}
          offset={offset}
        />
      ))}
    </>
  )
}

interface ControlPoint3DProps {
  position: THREE.Vector3
  isHovered: boolean
}

function ControlPoint3D({ position, isHovered }: ControlPoint3DProps) {
  const color = isHovered ? '#22c55e' : '#4ade80'
  return (
    <mesh position={position}>
      <boxGeometry args={[0.06, 0.06, 0.06]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

interface SketchControlPoints3DProps {
  elements: SketchElement[]
  selectedIds: string[]
  hoveredPoint: { elementId: string; pointIndex: number } | null
  plane: SketchPlane
  offset: number
}

function SketchControlPoints3D({ elements, selectedIds, hoveredPoint, plane, offset }: SketchControlPoints3DProps) {
  const selectedElements = elements.filter(e => selectedIds.includes(e.id))

  return (
    <>
      {selectedElements.map(element => {
        const controlPoints = getElementControlPoints(element)
        return controlPoints.map(cp => {
          const pos3D = sketchToWorld(cp.position.x, cp.position.y, plane, offset)
          const isHovered = hoveredPoint?.elementId === element.id && hoveredPoint?.pointIndex === cp.pointIndex
          return (
            <ControlPoint3D
              key={`${element.id}-${cp.pointIndex}`}
              position={pos3D}
              isHovered={isHovered}
            />
          )
        })
      })}
    </>
  )
}

interface SnapIndicator3DProps {
  snapPoint: SnapPoint | null
  plane: SketchPlane
  offset: number
}

function SnapIndicator3D({ snapPoint, plane, offset }: SnapIndicator3DProps) {
  const size = 0.1
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: '#ffff00' }), [])
  const line1 = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0),
      new THREE.Vector3(size, 0, 0),
    ])
    return new THREE.Line(geo, mat)
  }, [mat])
  const line2 = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -size, 0),
      new THREE.Vector3(0, size, 0),
    ])
    return new THREE.Line(geo, mat)
  }, [mat])

  if (!snapPoint) return null

  const pos = sketchToWorld(snapPoint.point.x, snapPoint.point.y, plane, offset)

  return (
    <group position={pos}>
      <primitive object={line1} />
      <primitive object={line2} />
    </group>
  )
}

interface SketchPreview3DProps {
  tool: string | null
  isDrawing: boolean
  startPoint: Point2D | null
  currentPoint: Point2D | null
  arcMidPoint: Point2D | null
  polylinePoints: Point2D[]
  plane: SketchPlane
  offset: number
}

function SketchPreview3D({ tool, isDrawing, startPoint, currentPoint, arcMidPoint, polylinePoints, plane, offset }: SketchPreview3DProps) {
  const s = useCallback((x: number, y: number) => sketchToWorld(x, y, plane, offset), [plane, offset])

  const geometry = useMemo(() => {
    if (!isDrawing || !currentPoint) return null

    let points: THREE.Vector3[] = []

    switch (tool) {
      case 'line':
        if (startPoint) {
          points = [s(startPoint.x, startPoint.y), s(currentPoint.x, currentPoint.y)]
        }
        break

      case 'circle':
        if (startPoint) {
          const dx = currentPoint.x - startPoint.x
          const dy = currentPoint.y - startPoint.y
          const r = Math.sqrt(dx * dx + dy * dy)
          const segs = 64
          for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2
            points.push(s(startPoint.x + Math.cos(a) * r, startPoint.y + Math.sin(a) * r))
          }
        }
        break

      case 'rectangle':
        if (startPoint) {
          const w = currentPoint.x - startPoint.x
          const h = currentPoint.y - startPoint.y
          points = [
            s(startPoint.x, startPoint.y),
            s(startPoint.x + w, startPoint.y),
            s(startPoint.x + w, startPoint.y + h),
            s(startPoint.x, startPoint.y + h),
            s(startPoint.x, startPoint.y),
          ]
        }
        break

      case 'arc':
        if (startPoint && arcMidPoint) {
          // Draw arc from start through mid to current
          // Simple preview: line from start through midpoint to current
          points = [s(startPoint.x, startPoint.y), s(arcMidPoint.x, arcMidPoint.y), s(currentPoint.x, currentPoint.y)]
        } else if (startPoint) {
          points = [s(startPoint.x, startPoint.y), s(currentPoint.x, currentPoint.y)]
        }
        break

      case 'polyline':
      case 'spline':
        if (polylinePoints.length > 0) {
          points = polylinePoints.map(p => s(p.x, p.y))
          points.push(s(currentPoint.x, currentPoint.y))
        }
        break
    }

    if (points.length < 2) return null
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [tool, isDrawing, startPoint, currentPoint, arcMidPoint, polylinePoints, s])

  const previewLine = useMemo(() => {
    if (!geometry) return null
    const mat = new THREE.LineBasicMaterial({ color: '#4a9eff' })
    return new THREE.Line(geometry, mat)
  }, [geometry])

  if (!previewLine) return null

  return <primitive object={previewLine} />
}

// ─── Main SketchScene3D component ────────────────────────────────────────────

export function SketchScene3D() {
  const {
    elements,
    construction,
    symmetryAxis,
    isDrawing,
    startPoint,
    currentPoint,
    arcMidPoint,
    polylinePoints,
    tool,
    snapToGrid,
    gridSize,
    zoom,
    selectedElementIds,
    plane: sketchPlane,
    planeOffset,
    constraints,
  } = useSketchStore()

  const startDrawing = useSketchStore(s => s.startDrawing)
  const updateDrawing = useSketchStore(s => s.updateDrawing)
  const finishDrawing = useSketchStore(s => s.finishDrawing)
  const addPolylinePoint = useSketchStore(s => s.addPolylinePoint)
  const finishPolyline = useSketchStore(s => s.finishPolyline)
  const cancelDrawing = useSketchStore(s => s.cancelDrawing)
  const toggleElementSelection = useSketchStore(s => s.toggleElementSelection)
  const clearSelection = useSketchStore(s => s.clearSelection)
  const deleteSelected = useSketchStore(s => s.deleteSelected)
  const undo = useSketchStore(s => s.undo)
  const redo = useSketchStore(s => s.redo)
  const saveToHistory = useSketchStore(s => s.saveToHistory)
  const setElements = useSketchStore(s => s.setElements)
  const addConstraint = useSketchStore(s => s.addConstraint)
  const setTool = useSketchStore(s => s.setTool)
  const toggleConstruction = useSketchStore(s => s.toggleConstruction)
  const isConstruction = useSketchStore(s => s.isConstruction)
  const setSymmetryAxis = useSketchStore(s => s.setSymmetryAxis)
  const isSymmetryAxisFn = useSketchStore(s => s.isSymmetryAxis)
  const exitSketch = useSketchStore(s => s.exitSketch)

  const {
    constraintDialog,
    setContextMenu,
    setToolsContextMenu,
    setConstraintDialog,
  } = useSketchUIStore()

  // Local state
  const [snapPoints, setSnapPoints] = useState<SnapPoint[]>([])
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<{ elementId: string; pointIndex: number } | null>(null)
  const [hoveredControlPoint, setHoveredControlPoint] = useState<{ elementId: string; pointIndex: number } | null>(null)
  const [selectingCoincidentPoints, setSelectingCoincidentPoints] = useState(false)
  const [coincidentPoint1, setCoincidentPoint1] = useState<{ elementId: string; pointIndex: number } | null>(null)
  const [cursorSketchPoint, setCursorSketchPoint] = useState<Point2D | null>(null)

  // Use ref for latest snap points to avoid stale closures
  const snapPointsRef = useRef<SnapPoint[]>([])
  useEffect(() => { snapPointsRef.current = snapPoints }, [snapPoints])

  const findElementAtPoint = useCallback((point: Point2D): string | null => {
    return findElementUtil(point, elements, sketchPlane)
  }, [elements, sketchPlane])

  // ─── Keyboard events ──────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      const currentConstraintDialog = useSketchUIStore.getState().constraintDialog
      const isDialogOpen = currentConstraintDialog.isOpen ||
        useSketchUIStore.getState().offsetDialog.isOpen ||
        useSketchUIStore.getState().mirrorDialog.isOpen ||
        useSketchUIStore.getState().linearPatternDialog.isOpen ||
        useSketchUIStore.getState().circularPatternDialog.isOpen

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && !isDialogOpen) {
        const currentSelectedIds = useSketchStore.getState().selectedElementIds
        if (currentSelectedIds.length > 0) {
          e.preventDefault()
          deleteSelected()
        }
      }

      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }

      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault()
        redo()
      }

      if (e.key === 'Escape') {
        const state = useSketchStore.getState()
        if (state.isDrawing) {
          e.preventDefault()
          cancelDrawing()
        }
        if (currentConstraintDialog.needsSecondElement) {
          e.preventDefault()
          setConstraintDialog({
            isOpen: false,
            elementId: null,
            elementType: null,
            secondElementId: null,
            needsSecondElement: false,
          })
        }
        if (selectingCoincidentPoints) {
          e.preventDefault()
          setSelectingCoincidentPoints(false)
          setCoincidentPoint1(null)
        }
      }

      if (e.key === 'Enter') {
        const state = useSketchStore.getState()
        if (state.isDrawing && (state.tool === 'polyline' || state.tool === 'spline')) {
          e.preventDefault()
          finishPolyline()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteSelected, undo, redo, cancelDrawing, finishPolyline, setConstraintDialog, selectingCoincidentPoints])

  // ─── Snap point calculation ───────────────────────────────────────────────

  const updateSnapPoints = useCallback((sketchPoint: Point2D) => {
    if (elements.length === 0) {
      setSnapPoints([])
      return
    }
    try {
      const sketch = createSketchForWasm(elements, sketchPlane)
      const sketchJson = JSON.stringify(sketch)
      const settingsJson = JSON.stringify({
        enabled: true,
        endpoint: true,
        midpoint: true,
        center: true,
        quadrant: true,
        grid: snapToGrid,
        grid_size: gridSize,
        snap_radius: 0.3 / zoom,
      })
      const points = engine.getSnapPoints(sketchJson, sketchPoint.x, sketchPoint.y, settingsJson)
      setSnapPoints(points.map(p => ({
        point: { x: p.x, y: p.y },
        snapType: p.snap_type as any,
        sourceElement: p.source_element ?? undefined,
      })))
    } catch {
      setSnapPoints([])
    }
  }, [elements, sketchPlane, snapToGrid, gridSize, zoom])

  // ─── Pointer events ───────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()

    // Right button handled by context menu
    if (e.button === 2) return

    const sketchPoint = worldToSketch(e.point, sketchPlane)
    const currentSnaps = snapPointsRef.current
    const snappedPoint = currentSnaps.length > 0 ? currentSnaps[0].point : sketchPoint

    // Coincident constraint point selection mode
    if (selectingCoincidentPoints) {
      const pointHit = hitTestControlPoints(sketchPoint, elements, elements.map(el => el.id), 0.3)
      if (pointHit) {
        if (!coincidentPoint1) {
          setCoincidentPoint1({ elementId: pointHit.elementId, pointIndex: pointHit.pointIndex })
        } else {
          const element1Index = elements.findIndex(el => el.id === coincidentPoint1.elementId)
          const element2Index = elements.findIndex(el => el.id === pointHit.elementId)
          if (element1Index >= 0 && element2Index >= 0) {
            addConstraint({
              type: 'coincident',
              point1: { element_index: element1Index, point_index: coincidentPoint1.pointIndex },
              point2: { element_index: element2Index, point_index: pointHit.pointIndex },
            })
            setTimeout(() => {
              const curConstraints = useSketchStore.getState().constraints
              const curElements = useSketchStore.getState().elements
              if (curConstraints.length > 0) {
                try {
                  const sketch = createSketchForWasm(curElements, sketchPlane, curConstraints)
                  const resultJson = engine.solveConstraints(JSON.stringify(sketch))
                  const elementsWithIds = processWasmResult(resultJson, curElements)
                  setElements(elementsWithIds, true)
                } catch (error) {
                  console.error('Constraint solving failed:', error)
                }
              }
            }, 0)
            setSelectingCoincidentPoints(false)
            setCoincidentPoint1(null)
          }
        }
      }
      return
    }

    // Waiting for second element for constraint
    if (constraintDialog.needsSecondElement && constraintDialog.pendingConstraintType) {
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId && elementId !== constraintDialog.elementId) {
        setConstraintDialog({
          ...constraintDialog,
          secondElementId: elementId,
          isOpen: true,
          needsSecondElement: false,
        })
      }
      return
    }

    // Select tool
    if (tool === 'select') {
      const pointHit = hitTestControlPoints(sketchPoint, elements, selectedElementIds, 0.3)
      if (pointHit) {
        setIsDraggingPoint(true)
        setDraggedPoint({ elementId: pointHit.elementId, pointIndex: pointHit.pointIndex })
        return
      }
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId) {
        if (e.ctrlKey || e.metaKey) {
          toggleElementSelection(elementId)
        } else {
          clearSelection()
          toggleElementSelection(elementId)
        }
      } else {
        clearSelection()
      }
      return
    }

    // Trim tool
    if (tool === 'trim') {
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId) {
        const elementIndex = elements.findIndex(el => el.id === elementId)
        if (elementIndex >= 0) {
          try {
            const sketch = createSketchForWasm(elements, sketchPlane)
            const resultJson = engine.trimElement(JSON.stringify(sketch), elementIndex, sketchPoint.x, sketchPoint.y)
            const elementsWithIds = processWasmResult(resultJson)
            setElements(elementsWithIds)
          } catch (error) {
            console.error('Trim failed:', error)
          }
        }
      }
      return
    }

    // Dimension tool
    if (tool === 'dimension') {
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId) {
        const element = elements.find(el => el.id === elementId)
        if (element) {
          const elementIndex = elements.findIndex(el => el.id === elementId)

          if (element.type === 'line' && element.start && element.end) {
            const dx = element.end.x - element.start.x
            const dy = element.end.y - element.start.y
            const distance = Math.sqrt(dx * dx + dy * dy)
            const len = Math.sqrt(dx * dx + dy * dy)
            const perpX = len > 0.0001 ? -dy / len : 0
            const perpY = len > 0.0001 ? dx / len : 1
            const offset = 0.5
            const midX = (element.start.x + element.end.x) / 2
            const midY = (element.start.y + element.end.y) / 2

            const newDimension: SketchElement = {
              id: crypto.randomUUID(),
              type: 'dimension',
              from: element.start,
              to: element.end,
              value: distance,
              dimension_type: 'linear',
              dimension_line_pos: { x: midX + perpX * offset, y: midY + perpY * offset },
              target_element: elementIndex,
            }
            setElements([...elements, newDimension])
            toggleElementSelection(newDimension.id)
            setTool('select')
            saveToHistory()
          } else if ((element.type === 'circle' || element.type === 'arc') && element.center && element.radius !== undefined) {
            const distToCenter = Math.sqrt(
              (sketchPoint.x - element.center.x) ** 2 +
              (sketchPoint.y - element.center.y) ** 2
            )
            const isNearCenter = distToCenter < 0.3
            const dimensionType = isNearCenter ? 'radius' : 'diameter'
            const value = isNearCenter ? element.radius : element.radius * 2

            let from: Point2D
            let to: Point2D
            if (isNearCenter) {
              from = element.center
              to = { x: element.center.x + element.radius, y: element.center.y }
            } else {
              const angle = Math.atan2(sketchPoint.y - element.center.y, sketchPoint.x - element.center.x)
              from = {
                x: element.center.x - element.radius * Math.cos(angle),
                y: element.center.y - element.radius * Math.sin(angle),
              }
              to = {
                x: element.center.x + element.radius * Math.cos(angle),
                y: element.center.y + element.radius * Math.sin(angle),
              }
            }

            const newDimension: SketchElement = {
              id: crypto.randomUUID(),
              type: 'dimension',
              from,
              to,
              value,
              dimension_type: dimensionType,
              target_element: elementIndex,
            }
            setElements([...elements, newDimension])
            toggleElementSelection(newDimension.id)
            setTool('select')
            saveToHistory()
          }
        }
      }
      return
    }

    // Polyline / Spline
    if (tool === 'polyline' || tool === 'spline') {
      addPolylinePoint(snappedPoint)
      return
    }

    // Standard drawing tools
    const standardTools = ['line', 'circle', 'rectangle', 'arc'] as const
    if (tool && (standardTools as readonly string[]).includes(tool)) {
      if (tool === 'arc' && arcMidPoint) {
        return
      }
      startDrawing(snappedPoint)
    }
  }, [
    sketchPlane, selectingCoincidentPoints, coincidentPoint1, constraintDialog,
    tool, elements, selectedElementIds, arcMidPoint,
    addConstraint, setElements, findElementAtPoint, toggleElementSelection,
    clearSelection, setTool, saveToHistory, addPolylinePoint, startDrawing,
    setConstraintDialog,
  ])

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const sketchPoint = worldToSketch(e.point, sketchPlane)
    setCursorSketchPoint(sketchPoint)

    // Update snap points from WASM
    updateSnapPoints(sketchPoint)

    // Dragging control point
    if (isDraggingPoint && draggedPoint) {
      const currentSnaps = snapPointsRef.current
      const snappedPoint = currentSnaps.length > 0 ? currentSnaps[0].point : sketchPoint

      const elementIndex = elements.findIndex(el => el.id === draggedPoint.elementId)
      if (elementIndex >= 0) {
        const updatedElement = updateElementPoint(elements[elementIndex], draggedPoint.pointIndex, snappedPoint)
        const newElements = [...elements]
        newElements[elementIndex] = updatedElement

        if (constraints.length > 0) {
          try {
            const sketch = createSketchForWasm(newElements, sketchPlane, constraints)
            const resultJson = engine.solveConstraints(JSON.stringify(sketch))
            const elementsWithIds = processWasmResult(resultJson, newElements)
            setElements(elementsWithIds, true)
          } catch {
            setElements(newElements, true)
          }
        } else {
          setElements(newElements, true)
        }
      }
      return
    }

    // Update hovered control point
    if (tool === 'select' && selectedElementIds.length > 0) {
      const pointHit = hitTestControlPoints(sketchPoint, elements, selectedElementIds, 0.3)
      setHoveredControlPoint(pointHit ? { elementId: pointHit.elementId, pointIndex: pointHit.pointIndex } : null)
    }

    // Drawing preview
    if (isDrawing) {
      const currentSnaps = snapPointsRef.current
      const snappedPoint = currentSnaps.length > 0 ? currentSnaps[0].point : sketchPoint
      updateDrawing(snappedPoint)
    }
  }, [
    sketchPlane, isDraggingPoint, draggedPoint, elements, constraints,
    tool, selectedElementIds, isDrawing,
    setElements, updateDrawing, updateSnapPoints,
  ])

  const handlePointerUp = useCallback((_e: ThreeEvent<PointerEvent>) => {
    if (isDraggingPoint) {
      if (constraints.length > 0) {
        try {
          const sketch = createSketchForWasm(elements, sketchPlane, constraints)
          const resultJson = engine.solveConstraints(JSON.stringify(sketch))
          const elementsWithIds = processWasmResult(resultJson, elements)
          setElements(elementsWithIds, true)
        } catch (error) {
          console.error('Constraint solving failed after drag:', error)
        }
      }
      saveToHistory()
      setIsDraggingPoint(false)
      setDraggedPoint(null)
      return
    }

    if (isDrawing && tool !== 'polyline' && tool !== 'spline') {
      finishDrawing()
    }
  }, [isDraggingPoint, constraints, elements, sketchPlane, isDrawing, tool,
      setElements, saveToHistory, finishDrawing])

  const handleContextMenu = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()

    const nativeEvent = e.nativeEvent
    const sketchPoint = worldToSketch(e.point, sketchPlane)

    // Finish polyline on right click
    if ((tool === 'polyline' || tool === 'spline') && isDrawing && polylinePoints.length > 0) {
      finishPolyline()
      return
    }

    const elementId = findElementAtPoint(sketchPoint)

    if (elementId) {
      if (!selectedElementIds.includes(elementId)) {
        clearSelection()
        toggleElementSelection(elementId)
      }
      setContextMenu({ x: nativeEvent.clientX, y: nativeEvent.clientY, elementId })
    } else {
      setToolsContextMenu({ x: nativeEvent.clientX, y: nativeEvent.clientY })
    }
  }, [
    sketchPlane, tool, isDrawing, polylinePoints, selectedElementIds,
    findElementAtPoint, clearSelection, toggleElementSelection,
    finishPolyline, setContextMenu, setToolsContextMenu,
  ])

  // Expose functions needed by SketchDialogs3D via store helpers
  const handleAddConstraint = useCallback((constraintType: string, elementId: string, secondElementId?: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return

    const elementIndex = elements.findIndex(el => el.id === elementId)
    if (elementIndex === -1) return

    let secondElementIndex: number | undefined
    if (secondElementId) {
      secondElementIndex = elements.findIndex(el => el.id === secondElementId)
      if (secondElementIndex === -1) return
    }

    const existingConstraintIndex = constraints.findIndex(c => {
      switch (constraintType) {
        case 'horizontal': return c.type === 'horizontal' && c.element === elementIndex
        case 'vertical': return c.type === 'vertical' && c.element === elementIndex
        case 'fixed': return c.type === 'fixed' && c.element === elementIndex
        case 'parallel': return c.type === 'parallel' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'perpendicular': return c.type === 'perpendicular' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'equal': return c.type === 'equal' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'tangent': return c.type === 'tangent' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        case 'concentric': return c.type === 'concentric' &&
          ((c.element1 === elementIndex && c.element2 === secondElementIndex) ||
           (c.element1 === secondElementIndex && c.element2 === elementIndex))
        default: return false
      }
    })

    if (existingConstraintIndex >= 0) {
      useSketchStore.getState().removeConstraint(existingConstraintIndex)
    } else {
      switch (constraintType) {
        case 'horizontal': addConstraint({ type: 'horizontal', element: elementIndex }); break
        case 'vertical': addConstraint({ type: 'vertical', element: elementIndex }); break
        case 'fixed': addConstraint({ type: 'fixed', element: elementIndex }); break
        case 'parallel':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'parallel', element1: elementIndex, element2: secondElementIndex })
          break
        case 'perpendicular':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'perpendicular', element1: elementIndex, element2: secondElementIndex })
          break
        case 'equal':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'equal', element1: elementIndex, element2: secondElementIndex })
          break
        case 'tangent':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'tangent', element1: elementIndex, element2: secondElementIndex })
          break
        case 'concentric':
          if (secondElementIndex !== undefined)
            addConstraint({ type: 'concentric', element1: elementIndex, element2: secondElementIndex })
          break
      }
    }

    setTimeout(() => {
      const curConstraints = useSketchStore.getState().constraints
      const curElements = useSketchStore.getState().elements
      if (curConstraints.length > 0) {
        try {
          const sketch = createSketchForWasm(curElements, sketchPlane, curConstraints)
          const resultJson = engine.solveConstraints(JSON.stringify(sketch))
          const elementsWithIds = processWasmResult(resultJson, curElements)
          setElements(elementsWithIds, true)
        } catch (error) {
          console.error('Constraint solving failed:', error)
        }
      }
    }, 0)
  }, [elements, constraints, sketchPlane, addConstraint, setElements])

  // Store additional ops for dialogs
  const handleOffset = useCallback((elementId: string, distance: number) => {
    const clickPoint = cursorSketchPoint || { x: 0, y: 0 }
    const newElements = SketchOps.offsetElement(elements, elementId, distance, clickPoint.x, clickPoint.y, sketchPlane)
    setElements(newElements)
  }, [elements, cursorSketchPoint, sketchPlane, setElements])

  const handleMirror = useCallback((elementId: string, axis: 'horizontal' | 'vertical' | 'custom') => {
    const newElements = SketchOps.mirrorElement(elements, elementId, axis, symmetryAxis, sketchPlane)
    if (newElements) {
      setElements(newElements)
    }
  }, [elements, symmetryAxis, sketchPlane, setElements])

  const handleLinearPattern = useCallback((elementId: string, count: number, dx: number, dy: number) => {
    const newElements = SketchOps.linearPattern(elements, elementId, count, dx, dy, sketchPlane)
    setElements(newElements)
  }, [elements, sketchPlane, setElements])

  const handleCircularPattern = useCallback((elementId: string, count: number, centerX: number, centerY: number, angle: number) => {
    const newElements = SketchOps.circularPattern(elements, elementId, count, centerX, centerY, angle, sketchPlane)
    setElements(newElements)
  }, [elements, sketchPlane, setElements])

  const handleDuplicate = useCallback((elementId: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return
    const duplicated = duplicateElement(element)
    setElements([...elements, duplicated])
  }, [elements, setElements])

  const hasConstraint = useCallback((constraintType: string, elementId: string): boolean => {
    const elementIndex = elements.findIndex(el => el.id === elementId)
    if (elementIndex === -1) return false
    return constraints.some(c => {
      switch (constraintType) {
        case 'horizontal': return c.type === 'horizontal' && c.element === elementIndex
        case 'vertical': return c.type === 'vertical' && c.element === elementIndex
        case 'fixed': return c.type === 'fixed' && c.element === elementIndex
        case 'parallel': return c.type === 'parallel' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'perpendicular': return c.type === 'perpendicular' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'equal': return c.type === 'equal' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'tangent': return c.type === 'tangent' && (c.element1 === elementIndex || c.element2 === elementIndex)
        case 'concentric': return c.type === 'concentric' && (c.element1 === elementIndex || c.element2 === elementIndex)
        default: return false
      }
    })
  }, [elements, constraints])

  // Store sketch ops in global handler refs for dialogs to call
  useEffect(() => {
    const store = useSketchUIStore.getState() as any
    store._handleOffset = handleOffset
    store._handleMirror = handleMirror
    store._handleLinearPattern = handleLinearPattern
    store._handleCircularPattern = handleCircularPattern
    store._handleDuplicate = handleDuplicate
    store._handleAddConstraint = handleAddConstraint
    store._hasConstraint = hasConstraint
    store._deleteSelected = deleteSelected
    store._toggleConstruction = toggleConstruction
    store._isConstruction = isConstruction
    store._setSymmetryAxis = setSymmetryAxis
    store._isSymmetryAxis = isSymmetryAxisFn
    store._setSelectingCoincidentPoints = setSelectingCoincidentPoints
    store._setCoincidentPoint1 = setCoincidentPoint1
    store._exitSketch = exitSketch
    store._setTool = setTool
    store._selectedElementIds = selectedElementIds
  }, [
    handleOffset, handleMirror, handleLinearPattern, handleCircularPattern,
    handleDuplicate, handleAddConstraint, hasConstraint,
    deleteSelected, toggleConstruction, isConstruction,
    setSymmetryAxis, isSymmetryAxisFn, exitSketch, setTool, selectedElementIds,
  ])

  // ─── Render ───────────────────────────────────────────────────────────────

  const rot = planeRotation(sketchPlane)
  const pos = planePosition(sketchPlane, planeOffset)
  const currentSnap = snapPoints.length > 0 ? snapPoints[0] : null

  const xAxisLine = useMemo(() => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      sketchToWorld(-20, 0, sketchPlane, planeOffset),
      sketchToWorld(20, 0, sketchPlane, planeOffset),
    ]),
    new THREE.LineBasicMaterial({ color: '#4a9eff' })
  ), [sketchPlane, planeOffset])

  const yAxisLine = useMemo(() => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      sketchToWorld(0, -20, sketchPlane, planeOffset),
      sketchToWorld(0, 20, sketchPlane, planeOffset),
    ]),
    new THREE.LineBasicMaterial({ color: '#4ade80' })
  ), [sketchPlane, planeOffset])

  return (
    <group>
      {/* Sketch plane helper - subtle grid */}
      <gridHelper
        args={[40, 40, '#2a2a3e', '#1e1e2e']}
        position={pos}
        rotation={rot}
      />

      {/* Axes on sketch plane */}
      <primitive object={xAxisLine} />
      <primitive object={yAxisLine} />

      {/* Sketch elements */}
      <SketchElements3D
        elements={elements}
        selectedIds={selectedElementIds}
        construction={construction}
        symmetryAxis={symmetryAxis}
        plane={sketchPlane}
        offset={planeOffset}
      />

      {/* Control points for selected elements */}
      <SketchControlPoints3D
        elements={elements}
        selectedIds={selectedElementIds}
        hoveredPoint={hoveredControlPoint}
        plane={sketchPlane}
        offset={planeOffset}
      />

      {/* Snap indicator */}
      <SnapIndicator3D
        snapPoint={currentSnap}
        plane={sketchPlane}
        offset={planeOffset}
      />

      {/* Drawing preview */}
      <SketchPreview3D
        tool={tool}
        isDrawing={isDrawing}
        startPoint={startPoint}
        currentPoint={currentPoint}
        arcMidPoint={arcMidPoint}
        polylinePoints={polylinePoints}
        plane={sketchPlane}
        offset={planeOffset}
      />

      {/* Invisible interaction plane - captures pointer events */}
      <mesh
        position={pos}
        rotation={rot}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu as any}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
