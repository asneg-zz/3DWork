/**
 * SketchScene3D - Sketch editor integrated into 3D viewport.
 * Renders sketch elements as Three.js objects and handles pointer events
 * via ray-plane intersection. Replaces the 2D HTML Canvas SketchCanvas.
 *
 * Refactored: handlers extracted to sketch3D/handlers/
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'
import type { Point2D } from '@/types/scene'

// Sub-modules
import { sketchToWorld, worldToSketch, planeRotation, planePosition, gridHelperRotation, PLANE_EPSILON } from './sketch3D/coords'
import { SketchElements3D, SketchControlPoints3D } from './sketch3D/SketchElements3D'
import { SnapIndicator3D } from './sketch3D/SnapIndicator3D'
import { SketchPreview3D } from './sketch3D/SketchPreview3D'

// Extracted handlers
import {
  useKeyboardHandler,
  useSnapPoints,
  useConstraintHandler,
  useSketchOperations,
  useDragControl,
  usePointerHandler,
} from './sketch3D/handlers'

// Re-export coordinate utilities for external consumers (Viewport3D, etc.)
export { sketchToWorld, worldToSketch }

// ─── Main SketchScene3D component ────────────────────────────────────────────

export function SketchScene3D() {
  // ─── Store state ───────────────────────────────────────────────────────────

  const elements = useSketchStore(s => s.elements)
  const constructionIds = useSketchStore(s => s.constructionIds)
  const symmetryAxisId = useSketchStore(s => s.symmetryAxisId)
  const isDrawing = useSketchStore(s => s.isDrawing)
  const startPoint = useSketchStore(s => s.startPoint)
  const currentPoint = useSketchStore(s => s.currentPoint)
  const arcMidPoint = useSketchStore(s => s.arcMidPoint)
  const polylinePoints = useSketchStore(s => s.polylinePoints)
  const tool = useSketchStore(s => s.tool)
  const selectedElementIds = useSketchStore(s => s.selectedElementIds)
  const sketchPlane = useSketchStore(s => s.plane)
  const planeOffset = useSketchStore(s => s.planeOffset)
  const faceCoordSystem = useSketchStore(s => s.faceCoordSystem)
  const constraints = useSketchStore(s => s.constraints)

  // Actions needed for global handler registration
  const deleteSelected = useSketchStore(s => s.deleteSelected)
  const toggleConstruction = useSketchStore(s => s.toggleConstruction)
  const isConstruction = useSketchStore(s => s.isConstruction)
  const setSymmetryAxis = useSketchStore(s => s.setSymmetryAxis)
  const isSymmetryAxisFn = useSketchStore(s => s.isSymmetryAxis)
  const exitSketch = useSketchStore(s => s.exitSketch)
  const setTool = useSketchStore(s => s.setTool)

  // Local state
  const [cursorSketchPoint, setCursorSketchPoint] = useState<Point2D | null>(null)

  // For WASM calls that only accept axis-aligned planes, fall back to 'XY' for CUSTOM
  const wasmPlane = (sketchPlane === 'CUSTOM' ? 'XY' : sketchPlane) as 'XY' | 'XZ' | 'YZ'

  // ─── Handlers ──────────────────────────────────────────────────────────────

  // Snap points
  const { snapPoints, updateSnapPoints, getSnappedPoint } = useSnapPoints(elements, wasmPlane)

  // Drag control
  const {
    isDraggingPoint,
    draggedPoint,
    hoveredControlPoint,
    setHoveredControlPoint,
    startDragging,
    updateDrag,
    finishDragging,
  } = useDragControl(elements, constraints, wasmPlane)

  // Constraints
  const {
    hasConstraint,
    handleAddConstraint,
    addCoincidentConstraint,
  } = useConstraintHandler(elements, constraints, wasmPlane)

  // Sketch operations
  const {
    handleOffset,
    handleMirror,
    handleLinearPattern,
    handleCircularPattern,
    handleDuplicate,
  } = useSketchOperations(elements, wasmPlane, cursorSketchPoint)

  // Pointer events
  const pointerHandler = usePointerHandler({
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
  })

  // Keyboard events
  useKeyboardHandler({
    selectingCoincidentPoints: pointerHandler.selectingCoincidentPoints,
    setSelectingCoincidentPoints: pointerHandler.setSelectingCoincidentPoints,
    setCoincidentPoint1: pointerHandler.setCoincidentPoint1,
  })

  // ─── Global handler registration ───────────────────────────────────────────
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
    store._setSelectingCoincidentPoints = pointerHandler.setSelectingCoincidentPoints
    store._setCoincidentPoint1 = pointerHandler.setCoincidentPoint1
    store._exitSketch = exitSketch
    store._setTool = setTool
    store._selectedElementIds = selectedElementIds
  }, [
    handleOffset, handleMirror, handleLinearPattern, handleCircularPattern,
    handleDuplicate, handleAddConstraint, hasConstraint,
    deleteSelected, toggleConstruction, isConstruction,
    setSymmetryAxis, isSymmetryAxisFn, exitSketch, setTool, selectedElementIds,
    pointerHandler.setSelectingCoincidentPoints, pointerHandler.setCoincidentPoint1,
  ])

  // ─── Render ────────────────────────────────────────────────────────────────

  const rot = planeRotation(sketchPlane, faceCoordSystem)
  const gridRot = gridHelperRotation(sketchPlane, faceCoordSystem)
  const pos = planePosition(sketchPlane, planeOffset, faceCoordSystem)

  // Offset visual elements slightly above the face to prevent Z-fighting
  const renderOffset = sketchPlane !== 'CUSTOM' ? planeOffset + PLANE_EPSILON : planeOffset
  const renderFcs = useMemo(() => {
    if (!faceCoordSystem || sketchPlane !== 'CUSTOM') return faceCoordSystem
    const n = faceCoordSystem.normal
    return {
      ...faceCoordSystem,
      origin: [
        faceCoordSystem.origin[0] + n[0] * PLANE_EPSILON,
        faceCoordSystem.origin[1] + n[1] * PLANE_EPSILON,
        faceCoordSystem.origin[2] + n[2] * PLANE_EPSILON,
      ] as [number, number, number],
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceCoordSystem, sketchPlane])

  // Axis lines with proper memory management
  const xAxisLineRef = useRef<THREE.Line | null>(null)
  const yAxisLineRef = useRef<THREE.Line | null>(null)

  // Create/update axis lines
  useEffect(() => {
    // Dispose old
    if (xAxisLineRef.current) {
      xAxisLineRef.current.geometry.dispose()
      ;(xAxisLineRef.current.material as THREE.Material).dispose()
    }
    if (yAxisLineRef.current) {
      yAxisLineRef.current.geometry.dispose()
      ;(yAxisLineRef.current.material as THREE.Material).dispose()
    }

    // Create new X axis
    const xGeo = new THREE.BufferGeometry().setFromPoints([
      sketchToWorld(-20, 0, sketchPlane, renderOffset, renderFcs),
      sketchToWorld(20, 0, sketchPlane, renderOffset, renderFcs),
    ])
    const xMat = new THREE.LineBasicMaterial({ color: '#4a9eff' })
    xAxisLineRef.current = new THREE.Line(xGeo, xMat)

    // Create new Y axis
    const yGeo = new THREE.BufferGeometry().setFromPoints([
      sketchToWorld(0, -20, sketchPlane, renderOffset, renderFcs),
      sketchToWorld(0, 20, sketchPlane, renderOffset, renderFcs),
    ])
    const yMat = new THREE.LineBasicMaterial({ color: '#4ade80' })
    yAxisLineRef.current = new THREE.Line(yGeo, yMat)

    return () => {
      if (xAxisLineRef.current) {
        xAxisLineRef.current.geometry.dispose()
        ;(xAxisLineRef.current.material as THREE.Material).dispose()
      }
      if (yAxisLineRef.current) {
        yAxisLineRef.current.geometry.dispose()
        ;(yAxisLineRef.current.material as THREE.Material).dispose()
      }
    }
  }, [sketchPlane, renderOffset, renderFcs])

  return (
    <group>
      {/* Sketch plane helper - subtle grid */}
      <gridHelper
        args={[40, 40, '#2a2a3e', '#1e1e2e']}
        position={pos}
        rotation={gridRot}
      />

      {/* Axes on sketch plane */}
      {xAxisLineRef.current && <primitive object={xAxisLineRef.current} />}
      {yAxisLineRef.current && <primitive object={yAxisLineRef.current} />}

      {/* Sketch elements */}
      <SketchElements3D
        elements={elements}
        selectedIds={selectedElementIds}
        constructionIds={constructionIds}
        symmetryAxisId={symmetryAxisId}
        plane={sketchPlane}
        offset={renderOffset}
        fcs={renderFcs}
      />

      {/* Control points for selected elements */}
      <SketchControlPoints3D
        elements={elements}
        selectedIds={selectedElementIds}
        hoveredPoint={hoveredControlPoint}
        plane={sketchPlane}
        offset={renderOffset}
        fcs={renderFcs}
      />

      {/* Snap indicator */}
      <SnapIndicator3D
        snapPoints={snapPoints}
        plane={sketchPlane}
        offset={renderOffset}
        fcs={renderFcs}
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
        offset={renderOffset}
        fcs={renderFcs}
      />

      {/* Invisible interaction plane - captures pointer events */}
      <mesh
        position={pos}
        rotation={rot}
        onPointerDown={pointerHandler.handlePointerDown}
        onPointerMove={pointerHandler.handlePointerMove}
        onPointerUp={pointerHandler.handlePointerUp}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
