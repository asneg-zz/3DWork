import { useEffect } from 'react'
import { useSceneStore } from '@/stores/sceneStore'
import { saveSceneToFile, loadSceneFromFile } from '@/utils/fileOperations'

export function useKeyboardShortcuts() {
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const removeBody = useSceneStore((s) => s.removeBody)
  const clearSelection = useSceneStore((s) => s.clearSelection)
  const exitSketchEdit = useSceneStore((s) => s.exitSketchEdit)
  const deactivateFillet3D = useSceneStore((s) => s.deactivateFillet3D)
  const deactivateChamfer3D = useSceneStore((s) => s.deactivateChamfer3D)
  const deleteSketchElement = useSceneStore((s) => s.deleteSketchElement)
  const setScene = useSceneStore((s) => s.setScene)
  const setTransformMode = useSceneStore((s) => s.setTransformMode)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useSceneStore.getState()

      // Ignore if typing in input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // Ctrl/Cmd + Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)
      ) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl/Cmd + S = Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveSceneToFile(useSceneStore.getState().scene, 'scene.vcad')
        return
      }

      // Ctrl/Cmd + O = Open/Load
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        loadSceneFromFile()
          .then((scene) => setScene(scene))
          .catch((err) => console.error('Failed to load:', err))
        return
      }

      // Delete or Backspace = Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()

        // In sketch mode, delete selected element
        if (state.sketchEdit.active && state.sketchEdit.selectedElementIndex !== null) {
          deleteSketchElement(state.sketchEdit.selectedElementIndex)
          return
        }

        // Delete selected bodies
        if (state.selectedBodyIds.length > 0) {
          state.selectedBodyIds.forEach((id) => removeBody(id))
          return
        }
      }

      // Escape = Cancel current operation
      if (e.key === 'Escape') {
        e.preventDefault()

        if (state.sketchEdit.active) {
          exitSketchEdit()
          return
        }

        if (state.fillet3d.active) {
          deactivateFillet3D()
          return
        }

        if (state.chamfer3d.active) {
          deactivateChamfer3D()
          return
        }

        clearSelection()
        return
      }

      // Ctrl/Cmd + A = Select all bodies
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const allBodyIds = state.scene.bodies.map((b) => b.id)
        // Select all by selecting first and then adding others
        if (allBodyIds.length > 0) {
          useSceneStore.setState({ selectedBodyIds: allBodyIds })
        }
        return
      }

      // W = Move/Translate mode
      if (e.key === 'w' && !e.ctrlKey && !e.metaKey && !state.sketchEdit.active) {
        e.preventDefault()
        setTransformMode('translate')
        return
      }

      // E = Rotate mode
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey && !state.sketchEdit.active) {
        e.preventDefault()
        setTransformMode('rotate')
        return
      }

      // R = Scale mode
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && !state.sketchEdit.active) {
        e.preventDefault()
        setTransformMode('scale')
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    undo,
    redo,
    removeBody,
    clearSelection,
    exitSketchEdit,
    deactivateFillet3D,
    deactivateChamfer3D,
    deleteSketchElement,
    setScene,
    setTransformMode,
  ])
}
