/**
 * Store for edge selection mode (selecting edges on 3D bodies to create sketches)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SketchPlane } from '@/types/scene'

interface SelectedEdge {
  bodyId: string
  featureId: string
  edgeStart: [number, number, number]
  edgeEnd: [number, number, number]
  plane: SketchPlane
  offset: number
}

interface EdgeContextMenu {
  x: number
  y: number
  edge: SelectedEdge
}

interface EdgeSelectionState {
  // Edge selection mode active
  active: boolean

  // Currently hovered edge
  hoveredEdge: SelectedEdge | null

  // Context menu
  contextMenu: EdgeContextMenu | null

  // Actions
  startEdgeSelection: () => void
  exitEdgeSelection: () => void
  setHoveredEdge: (edge: SelectedEdge | null) => void
  showContextMenu: (x: number, y: number, edge: SelectedEdge) => void
  hideContextMenu: () => void
}

export const useEdgeSelectionStore = create<EdgeSelectionState>()(
  immer((set) => ({
    active: false,
    hoveredEdge: null,
    contextMenu: null,

    startEdgeSelection: () =>
      set((state) => {
        state.active = true
        state.hoveredEdge = null
        state.contextMenu = null
      }),

    exitEdgeSelection: () =>
      set((state) => {
        state.active = false
        state.hoveredEdge = null
        state.contextMenu = null
      }),

    setHoveredEdge: (edge) =>
      set((state) => {
        state.hoveredEdge = edge
      }),

    showContextMenu: (x, y, edge) =>
      set((state) => {
        state.contextMenu = { x, y, edge }
      }),

    hideContextMenu: () =>
      set((state) => {
        state.contextMenu = null
      }),
  }))
)
