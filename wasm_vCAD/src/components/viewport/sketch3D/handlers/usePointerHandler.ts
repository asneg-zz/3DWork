/**
 * Pointer event handler for sketch editor
 * Handles: selection, trimming, dimension tool, drawing tools
 */

import { useCallback, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Point2D, SketchElement, SketchConstraint, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'
import {
  findElementAtPoint as findElementUtil,
  hitTestControlPoints,
  createSketchForWasm,
  processWasmResult,
} from '../../sketchUtils'
import { worldToSketch } from '../coords'
import { engine } from '@/wasm/engine'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UsePointerHandlerOptions {
  elements: SketchElement[]
  constraints: SketchConstraint[]
  sketchPlane: SketchPlane
  faceCoordSystem: FaceCoordSystem | null
  wasmPlane: 'XY' | 'XZ' | 'YZ'
  selectedElementIds: string[]
  // Snap
  getSnappedPoint: (point: Point2D) => Point2D
  updateSnapPoints: (point: Point2D) => void
  // Drag
  isDraggingPoint: boolean
  draggedPoint: { elementId: string; pointIndex: number } | null
  startDragging: (elementId: string, pointIndex: number) => void
  updateDrag: (point: Point2D) => void
  finishDragging: () => void
  setHoveredControlPoint: (point: { elementId: string; pointIndex: number } | null) => void
  // Constraint
  addCoincidentConstraint: (
    point1: { elementId: string; pointIndex: number },
    point2: { elementId: string; pointIndex: number }
  ) => void
  // Cursor position
  setCursorSketchPoint: (point: Point2D | null) => void
}

// ─── Main Hook ───────────────────────────────────────────────────────────────

export function usePointerHandler({
  elements,
  constraints,
  sketchPlane,
  faceCoordSystem,
  wasmPlane,
  selectedElementIds,
  getSnappedPoint,
  updateSnapPoints,
  isDraggingPoint,
  draggedPoint,
  startDragging,
  updateDrag,
  finishDragging,
  setHoveredControlPoint,
  addCoincidentConstraint,
  setCursorSketchPoint,
}: UsePointerHandlerOptions) {
  // ─── Local State ─────────────────────────────────────────────────────────────

  const [selectingCoincidentPoints, setSelectingCoincidentPoints] = useState(false)
  const [coincidentPoint1, setCoincidentPoint1] = useState<{ elementId: string; pointIndex: number } | null>(null)

  // ─── Store Actions ───────────────────────────────────────────────────────────

  const tool = useSketchStore(s => s.tool)
  const isDrawing = useSketchStore(s => s.isDrawing)
  const arcMidPoint = useSketchStore(s => s.arcMidPoint)
  const polylinePoints = useSketchStore(s => s.polylinePoints)

  const startDrawing = useSketchStore(s => s.startDrawing)
  const updateDrawing = useSketchStore(s => s.updateDrawing)
  const finishDrawing = useSketchStore(s => s.finishDrawing)
  const addPolylinePoint = useSketchStore(s => s.addPolylinePoint)
  const finishPolyline = useSketchStore(s => s.finishPolyline)
  const toggleElementSelection = useSketchStore(s => s.toggleElementSelection)
  const clearSelection = useSketchStore(s => s.clearSelection)
  const setElements = useSketchStore(s => s.setElements)
  const setTool = useSketchStore(s => s.setTool)
  const saveToHistory = useSketchStore(s => s.saveToHistory)

  const constraintDialog = useSketchUIStore(s => s.constraintDialog)
  const setConstraintDialog = useSketchUIStore(s => s.setConstraintDialog)
  const setContextMenu = useSketchUIStore(s => s.setContextMenu)
  const setToolsContextMenu = useSketchUIStore(s => s.setToolsContextMenu)

  // ─── Hit Detection Helper ────────────────────────────────────────────────────

  const findElementAtPoint = useCallback(
    (point: Point2D, includeCircleInterior = false): string | null => {
      return findElementUtil(point, elements, wasmPlane, { includeCircleInterior })
    },
    [elements, wasmPlane]
  )

  // ─── Selection Handler ───────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (sketchPoint: Point2D, multiSelect: boolean) => {
      // Check if clicking on a control point of selected element
      const pointHit = hitTestControlPoints(sketchPoint, elements, selectedElementIds, 0.3)
      if (pointHit) {
        const hitElementIndex = elements.findIndex(el => el.id === pointHit.elementId)
        const isFixed = constraints.some(c => c.type === 'fixed' && c.element === hitElementIndex)
        if (!isFixed) {
          startDragging(pointHit.elementId, pointHit.pointIndex)
        }
        return
      }

      // Find element at click point
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId) {
        if (multiSelect) {
          toggleElementSelection(elementId)
        } else {
          clearSelection()
          toggleElementSelection(elementId)
        }
      } else {
        clearSelection()
      }
    },
    [elements, selectedElementIds, constraints, findElementAtPoint, startDragging, toggleElementSelection, clearSelection]
  )

  // ─── Trim Handler ────────────────────────────────────────────────────────────

  const handleTrim = useCallback(
    (sketchPoint: Point2D) => {
      const elementId = findElementAtPoint(sketchPoint)
      if (!elementId) return

      const elementIndex = elements.findIndex(el => el.id === elementId)
      if (elementIndex < 0) return

      try {
        clearSelection()
        const sketch = createSketchForWasm(elements, wasmPlane)
        const resultJson = engine.trimElement(
          JSON.stringify(sketch),
          elementIndex,
          sketchPoint.x,
          sketchPoint.y
        )
        const newElements = processWasmResult(resultJson)
        setElements(newElements)
      } catch (error) {
        // Trim can fail if no intersections found - this is expected
        if (error instanceof Error && !error.message.includes('No intersection')) {
          console.error('Trim failed:', error)
        }
      }
    },
    [elements, wasmPlane, findElementAtPoint, clearSelection, setElements]
  )

  // ─── Dimension Handler ───────────────────────────────────────────────────────

  const handleDimension = useCallback(
    (sketchPoint: Point2D) => {
      const elementId = findElementAtPoint(sketchPoint, true)
      if (!elementId) return

      const element = elements.find(el => el.id === elementId)
      if (!element) return

      const elementIndex = elements.findIndex(el => el.id === elementId)

      if (element.type === 'line' && element.start && element.end) {
        createLinearDimension(element, elementIndex)
      } else if ((element.type === 'circle' || element.type === 'arc') &&
                 element.center && element.radius !== undefined) {
        createRadialDimension(element, elementIndex, sketchPoint)
      }
    },
    [elements, findElementAtPoint]
  )

  const createLinearDimension = useCallback(
    (element: SketchElement, elementIndex: number) => {
      if (!element.start || !element.end) return

      const dx = element.end.x - element.start.x
      const dy = element.end.y - element.start.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const len = distance
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
    },
    [elements, setElements, toggleElementSelection, setTool, saveToHistory]
  )

  const createRadialDimension = useCallback(
    (element: SketchElement, elementIndex: number, clickPoint: Point2D) => {
      if (!element.center || element.radius === undefined) return

      const distToCenter = Math.sqrt(
        (clickPoint.x - element.center.x) ** 2 +
        (clickPoint.y - element.center.y) ** 2
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
        const angle = Math.atan2(clickPoint.y - element.center.y, clickPoint.x - element.center.x)
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
    },
    [elements, setElements, toggleElementSelection, setTool, saveToHistory]
  )

  // ─── Coincident Point Selection ──────────────────────────────────────────────

  const handleCoincidentPointSelection = useCallback(
    (sketchPoint: Point2D) => {
      const pointHit = hitTestControlPoints(sketchPoint, elements, elements.map(el => el.id), 0.3)
      const hitElement = pointHit ? elements.find(el => el.id === pointHit.elementId) : null

      // Filter out UI-only handles (midpoint, radius handle)
      const isValidPoint = pointHit && hitElement && !(
        (hitElement.type === 'line' && pointHit.pointIndex === 2) ||
        (hitElement.type === 'circle' && pointHit.pointIndex === 1)
      )

      if (isValidPoint && pointHit) {
        if (!coincidentPoint1) {
          setCoincidentPoint1({ elementId: pointHit.elementId, pointIndex: pointHit.pointIndex })
        } else {
          addCoincidentConstraint(coincidentPoint1, pointHit)
          setSelectingCoincidentPoints(false)
          setCoincidentPoint1(null)
        }
      }
    },
    [elements, coincidentPoint1, addCoincidentConstraint]
  )

  // ─── Constraint Second Element Selection ─────────────────────────────────────

  const handleConstraintSecondElement = useCallback(
    (sketchPoint: Point2D) => {
      const elementId = findElementAtPoint(sketchPoint)
      if (elementId && elementId !== constraintDialog.elementId) {
        setConstraintDialog({
          ...constraintDialog,
          secondElementId: elementId,
          isOpen: true,
          needsSecondElement: false,
        })
      }
    },
    [constraintDialog, findElementAtPoint, setConstraintDialog]
  )

  // ─── Pointer Down ────────────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (e.button !== 0) return

      const sketchPoint = worldToSketch(e.point, sketchPlane, faceCoordSystem)
      const snappedPoint = getSnappedPoint(sketchPoint)

      // Mode-specific handlers
      if (selectingCoincidentPoints) {
        handleCoincidentPointSelection(sketchPoint)
        return
      }

      if (constraintDialog.needsSecondElement && constraintDialog.pendingConstraintType) {
        handleConstraintSecondElement(sketchPoint)
        return
      }

      // Tool-specific handlers
      switch (tool) {
        case 'select':
          handleSelect(sketchPoint, e.ctrlKey || e.metaKey)
          break

        case 'trim':
          handleTrim(sketchPoint)
          break

        case 'dimension':
          handleDimension(sketchPoint)
          break

        case 'polyline':
        case 'spline':
          addPolylinePoint(snappedPoint)
          break

        case 'line':
        case 'circle':
        case 'rectangle':
        case 'arc':
          if (tool === 'arc' && arcMidPoint) return
          startDrawing(snappedPoint)
          break
      }
    },
    [
      sketchPlane, faceCoordSystem, getSnappedPoint, tool, arcMidPoint,
      selectingCoincidentPoints, constraintDialog,
      handleSelect, handleTrim, handleDimension,
      handleCoincidentPointSelection, handleConstraintSecondElement,
      addPolylinePoint, startDrawing,
    ]
  )

  // ─── Pointer Move ────────────────────────────────────────────────────────────

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const sketchPoint = worldToSketch(e.point, sketchPlane, faceCoordSystem)
      setCursorSketchPoint(sketchPoint)
      updateSnapPoints(sketchPoint)

      // Dragging control point
      if (isDraggingPoint && draggedPoint) {
        const snappedPoint = getSnappedPoint(sketchPoint)
        updateDrag(snappedPoint)
        return
      }

      // Update hovered control point
      if (tool === 'select' && selectedElementIds.length > 0) {
        const pointHit = hitTestControlPoints(sketchPoint, elements, selectedElementIds, 0.3)
        setHoveredControlPoint(pointHit ? { elementId: pointHit.elementId, pointIndex: pointHit.pointIndex } : null)
      }

      // Drawing preview
      if (isDrawing) {
        const snappedPoint = getSnappedPoint(sketchPoint)
        updateDrawing(snappedPoint)
      }
    },
    [
      sketchPlane, faceCoordSystem, setCursorSketchPoint, updateSnapPoints,
      isDraggingPoint, draggedPoint, getSnappedPoint, updateDrag,
      tool, selectedElementIds, elements, setHoveredControlPoint,
      isDrawing, updateDrawing,
    ]
  )

  // ─── Pointer Up ──────────────────────────────────────────────────────────────

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      // Right-click context menu
      if (e.button === 2 && !isDraggingPoint) {
        const sketchPoint = worldToSketch(e.point, sketchPlane, faceCoordSystem)

        // Finish polyline/spline on right-click
        if ((tool === 'polyline' || tool === 'spline') && isDrawing && polylinePoints.length > 0) {
          finishPolyline()
          return
        }

        // Show context menu
        const elementId = findElementAtPoint(sketchPoint)
        if (elementId) {
          if (!selectedElementIds.includes(elementId)) {
            clearSelection()
            toggleElementSelection(elementId)
          }
          setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, elementId })
        } else {
          setToolsContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
        }
        return
      }

      // Finish dragging
      if (isDraggingPoint) {
        finishDragging()
        return
      }

      // Finish drawing
      if (e.button === 0 && isDrawing && tool !== 'polyline' && tool !== 'spline') {
        finishDrawing()
      }
    },
    [
      isDraggingPoint, sketchPlane, faceCoordSystem, tool, isDrawing, polylinePoints,
      selectedElementIds, finishPolyline, finishDragging, finishDrawing,
      findElementAtPoint, clearSelection, toggleElementSelection,
      setContextMenu, setToolsContextMenu,
    ]
  )

  // ─── Return ──────────────────────────────────────────────────────────────────

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    selectingCoincidentPoints,
    setSelectingCoincidentPoints,
    coincidentPoint1,
    setCoincidentPoint1,
  }
}
