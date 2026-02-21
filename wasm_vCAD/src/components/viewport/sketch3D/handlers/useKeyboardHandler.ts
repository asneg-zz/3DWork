/**
 * Keyboard event handler for sketch editor
 * Handles: Delete, Undo/Redo, Escape, Enter
 */

import { useEffect } from 'react'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'

interface UseKeyboardHandlerOptions {
  selectingCoincidentPoints: boolean
  setSelectingCoincidentPoints: (value: boolean) => void
  setCoincidentPoint1: (value: { elementId: string; pointIndex: number } | null) => void
}

export function useKeyboardHandler({
  selectingCoincidentPoints,
  setSelectingCoincidentPoints,
  setCoincidentPoint1,
}: UseKeyboardHandlerOptions) {
  const deleteSelected = useSketchStore(s => s.deleteSelected)
  const undo = useSketchStore(s => s.undo)
  const redo = useSketchStore(s => s.redo)
  const cancelDrawing = useSketchStore(s => s.cancelDrawing)
  const finishPolyline = useSketchStore(s => s.finishPolyline)
  const clearSelection = useSketchStore(s => s.clearSelection)
  const setConstraintDialog = useSketchUIStore(s => s.setConstraintDialog)

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

      // Delete selected elements
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused && !isDialogOpen) {
        const currentSelectedIds = useSketchStore.getState().selectedElementIds
        if (currentSelectedIds.length > 0) {
          e.preventDefault()
          deleteSelected()
        }
      }

      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault()
        redo()
      }

      // Escape: cancel drawing, constraint selection, or clear selection
      if (e.key === 'Escape') {
        const state = useSketchStore.getState()
        if (state.isDrawing) {
          e.preventDefault()
          cancelDrawing()
        } else if (currentConstraintDialog.needsSecondElement) {
          e.preventDefault()
          setConstraintDialog({
            isOpen: false,
            elementId: null,
            elementType: null,
            secondElementId: null,
            needsSecondElement: false,
          })
        } else if (selectingCoincidentPoints) {
          e.preventDefault()
          setSelectingCoincidentPoints(false)
          setCoincidentPoint1(null)
        } else if (state.selectedElementIds.length > 0) {
          // Clear all selections
          e.preventDefault()
          clearSelection()
        }
      }

      // Enter: finish polyline/spline
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
  }, [
    deleteSelected,
    undo,
    redo,
    cancelDrawing,
    finishPolyline,
    clearSelection,
    setConstraintDialog,
    selectingCoincidentPoints,
    setSelectingCoincidentPoints,
    setCoincidentPoint1,
  ])
}
