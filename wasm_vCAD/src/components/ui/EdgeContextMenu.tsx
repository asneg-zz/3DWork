/**
 * Context menu for edge selection
 */

import { useEffect } from 'react'
import { Pencil } from 'lucide-react'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'

export function EdgeContextMenu() {
  const contextMenu = useEdgeSelectionStore((s) => s.contextMenu)
  const hideContextMenu = useEdgeSelectionStore((s) => s.hideContextMenu)
  const exitEdgeSelection = useEdgeSelectionStore((s) => s.exitEdgeSelection)
  const startSketch = useSketchStore((s) => s.startSketch)

  // Close menu on click outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClick = () => hideContextMenu()
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      hideContextMenu()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [contextMenu, hideContextMenu])

  if (!contextMenu) return null

  const handleCreateSketch = () => {
    const { edge } = contextMenu

    // Create sketch on determined plane
    const sketchId = engine.createSketch(edge.plane)

    // Start sketch mode
    startSketch(edge.bodyId, sketchId, edge.plane, edge.offset)

    // Exit edge selection mode
    exitEdgeSelection()
    hideContextMenu()
  }

  return (
    <div
      className="fixed bg-cad-surface border border-cad-border rounded shadow-lg z-50 min-w-[180px]"
      style={{
        left: contextMenu.x,
        top: contextMenu.y
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="w-full px-4 py-2 text-left hover:bg-cad-hover flex items-center gap-2 transition-colors"
        onClick={handleCreateSketch}
      >
        <Pencil size={16} />
        <span className="text-sm">Create Sketch on Edge</span>
      </button>
    </div>
  )
}
