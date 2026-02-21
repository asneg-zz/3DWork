/**
 * useSketchEditor - Facade hook for sketch editing
 *
 * Combines sketchStore and sketchUIStore into a unified interface.
 * Prevents components from importing multiple stores directly.
 */

import { useCallback } from 'react'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'
import type { SketchConstraint } from '@/types/scene'

/**
 * Hook for sketch editing operations
 * Use this instead of importing sketchStore + sketchUIStore separately
 */
export function useSketchEditor() {
  // ─── Core sketch state ─────────────────────────────────────────────────────

  const active = useSketchStore(s => s.active)
  const sketchId = useSketchStore(s => s.sketchId)
  const bodyId = useSketchStore(s => s.bodyId)
  const elements = useSketchStore(s => s.elements)
  const constraints = useSketchStore(s => s.constraints)
  const constructionIds = useSketchStore(s => s.constructionIds)
  const symmetryAxisId = useSketchStore(s => s.symmetryAxisId)
  const selectedElementIds = useSketchStore(s => s.selectedElementIds)

  // Plane configuration
  const plane = useSketchStore(s => s.plane)
  const planeOffset = useSketchStore(s => s.planeOffset)
  const faceCoordSystem = useSketchStore(s => s.faceCoordSystem)

  // Current tool and drawing state
  const tool = useSketchStore(s => s.tool)
  const isDrawing = useSketchStore(s => s.isDrawing)
  const startPoint = useSketchStore(s => s.startPoint)
  const currentPoint = useSketchStore(s => s.currentPoint)
  const arcMidPoint = useSketchStore(s => s.arcMidPoint)
  const polylinePoints = useSketchStore(s => s.polylinePoints)


  // ─── UI state ──────────────────────────────────────────────────────────────

  const contextMenu = useSketchUIStore(s => s.contextMenu)
  const toolsContextMenu = useSketchUIStore(s => s.toolsContextMenu)
  const constraintDialog = useSketchUIStore(s => s.constraintDialog)
  const offsetDialog = useSketchUIStore(s => s.offsetDialog)
  const mirrorDialog = useSketchUIStore(s => s.mirrorDialog)
  const linearPatternDialog = useSketchUIStore(s => s.linearPatternDialog)
  const circularPatternDialog = useSketchUIStore(s => s.circularPatternDialog)

  // ─── Sketch lifecycle ──────────────────────────────────────────────────────

  const startSketch = useSketchStore(s => s.startSketch)
  const loadSketch = useSketchStore(s => s.loadSketch)
  const exitSketch = useSketchStore(s => s.exitSketch)

  // ─── Tool management ───────────────────────────────────────────────────────

  const setTool = useSketchStore(s => s.setTool)

  // ─── Drawing actions ───────────────────────────────────────────────────────

  const startDrawing = useSketchStore(s => s.startDrawing)
  const updateDrawing = useSketchStore(s => s.updateDrawing)
  const finishDrawing = useSketchStore(s => s.finishDrawing)
  const cancelDrawing = useSketchStore(s => s.cancelDrawing)
  const addPolylinePoint = useSketchStore(s => s.addPolylinePoint)
  const finishPolyline = useSketchStore(s => s.finishPolyline)

  // ─── Element management ────────────────────────────────────────────────────

  const addElement = useSketchStore(s => s.addElement)
  const removeElement = useSketchStore(s => s.removeElement)
  const setElements = useSketchStore(s => s.setElements)
  const clearElements = useSketchStore(s => s.clearElements)

  // ─── Selection ─────────────────────────────────────────────────────────────

  const selectElement = useSketchStore(s => s.selectElement)
  const deselectElement = useSketchStore(s => s.deselectElement)
  const clearSelection = useSketchStore(s => s.clearSelection)
  const toggleElementSelection = useSketchStore(s => s.toggleElementSelection)
  const deleteSelected = useSketchStore(s => s.deleteSelected)

  // ─── History ───────────────────────────────────────────────────────────────

  const undo = useSketchStore(s => s.undo)
  const redo = useSketchStore(s => s.redo)
  const saveToHistory = useSketchStore(s => s.saveToHistory)

  // ─── Construction geometry ─────────────────────────────────────────────────

  const toggleConstruction = useSketchStore(s => s.toggleConstruction)
  const isConstruction = useSketchStore(s => s.isConstruction)
  const setSymmetryAxis = useSketchStore(s => s.setSymmetryAxis)
  const clearSymmetryAxis = useSketchStore(s => s.clearSymmetryAxis)
  const isSymmetryAxis = useSketchStore(s => s.isSymmetryAxis)

  // ─── Constraints ───────────────────────────────────────────────────────────

  const addConstraint = useSketchStore(s => s.addConstraint)
  const removeConstraint = useSketchStore(s => s.removeConstraint)
  const clearConstraints = useSketchStore(s => s.clearConstraints)
  const getElementConstraints = useSketchStore(s => s.getElementConstraints)

  // ─── UI actions ────────────────────────────────────────────────────────────

  const setContextMenu = useSketchUIStore(s => s.setContextMenu)
  const setToolsContextMenu = useSketchUIStore(s => s.setToolsContextMenu)
  const setConstraintDialog = useSketchUIStore(s => s.setConstraintDialog)
  const setOffsetDialog = useSketchUIStore(s => s.setOffsetDialog)
  const setMirrorDialog = useSketchUIStore(s => s.setMirrorDialog)
  const setLinearPatternDialog = useSketchUIStore(s => s.setLinearPatternDialog)
  const setCircularPatternDialog = useSketchUIStore(s => s.setCircularPatternDialog)

  // ─── Computed values ───────────────────────────────────────────────────────

  const wasmPlane = (plane === 'CUSTOM' ? 'XY' : plane) as 'XY' | 'XZ' | 'YZ'
  const hasSelection = selectedElementIds.length > 0
  const isAnyDialogOpen = constraintDialog.isOpen ||
    offsetDialog.isOpen ||
    mirrorDialog.isOpen ||
    linearPatternDialog.isOpen ||
    circularPatternDialog.isOpen

  // ─── Coordinated actions ───────────────────────────────────────────────────

  /**
   * Close all dialogs and menus
   */
  const closeAllDialogs = useCallback(() => {
    setContextMenu(null)
    setToolsContextMenu(null)
    setConstraintDialog({ isOpen: false, elementId: null, elementType: null })
    setOffsetDialog({ isOpen: false, elementId: null })
    setMirrorDialog({ isOpen: false, elementId: null })
    setLinearPatternDialog({ isOpen: false, elementId: null })
    setCircularPatternDialog({ isOpen: false, elementId: null })
  }, [
    setContextMenu, setToolsContextMenu, setConstraintDialog,
    setOffsetDialog, setMirrorDialog, setLinearPatternDialog, setCircularPatternDialog
  ])

  /**
   * Start constraint selection for two-element constraints
   */
  const startTwoElementConstraint = useCallback((
    constraintType: SketchConstraint['type'],
    firstElementId: string,
    firstElementType: string
  ) => {
    setConstraintDialog({
      isOpen: false,
      elementId: firstElementId,
      elementType: firstElementType,
      needsSecondElement: true,
      pendingConstraintType: constraintType,
    })
  }, [setConstraintDialog])

  return {
    // State
    active,
    sketchId,
    bodyId,
    elements,
    constraints,
    constructionIds,
    symmetryAxisId,
    selectedElementIds,
    plane,
    planeOffset,
    faceCoordSystem,
    tool,
    isDrawing,
    startPoint,
    currentPoint,
    arcMidPoint,
    polylinePoints,

    // UI state
    contextMenu,
    toolsContextMenu,
    constraintDialog,
    offsetDialog,
    mirrorDialog,
    linearPatternDialog,
    circularPatternDialog,

    // Computed
    wasmPlane,
    hasSelection,
    isAnyDialogOpen,

    // Lifecycle
    startSketch,
    loadSketch,
    exitSketch,

    // Tools
    setTool,

    // Drawing
    startDrawing,
    updateDrawing,
    finishDrawing,
    cancelDrawing,
    addPolylinePoint,
    finishPolyline,

    // Elements
    addElement,
    removeElement,
    setElements,
    clearElements,

    // Selection
    selectElement,
    deselectElement,
    clearSelection,
    toggleElementSelection,
    deleteSelected,

    // History
    undo,
    redo,
    saveToHistory,

    // Construction
    toggleConstruction,
    isConstruction,
    setSymmetryAxis,
    clearSymmetryAxis,
    isSymmetryAxis,

    // Constraints
    addConstraint,
    removeConstraint,
    clearConstraints,
    getElementConstraints,

    // UI actions
    setContextMenu,
    setToolsContextMenu,
    setConstraintDialog,
    setOffsetDialog,
    setMirrorDialog,
    setLinearPatternDialog,
    setCircularPatternDialog,

    // Coordinated actions
    closeAllDialogs,
    startTwoElementConstraint,
  }
}

/**
 * Selector hook for minimal re-renders
 * Use when you only need specific parts of sketch state
 */
export function useSketchState() {
  return {
    active: useSketchStore(s => s.active),
    sketchId: useSketchStore(s => s.sketchId),
    bodyId: useSketchStore(s => s.bodyId),
    plane: useSketchStore(s => s.plane),
    planeOffset: useSketchStore(s => s.planeOffset),
    faceCoordSystem: useSketchStore(s => s.faceCoordSystem),
  }
}

/**
 * Selector hook for drawing state only
 */
export function useSketchDrawing() {
  return {
    tool: useSketchStore(s => s.tool),
    isDrawing: useSketchStore(s => s.isDrawing),
    startPoint: useSketchStore(s => s.startPoint),
    currentPoint: useSketchStore(s => s.currentPoint),
    arcMidPoint: useSketchStore(s => s.arcMidPoint),
    polylinePoints: useSketchStore(s => s.polylinePoints),
  }
}
