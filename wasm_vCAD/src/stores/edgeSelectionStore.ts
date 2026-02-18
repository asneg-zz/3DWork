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

interface EdgeSelectionState {
  // Edge selection mode active
  active: boolean

  // Currently hovered edge
  hoveredEdge: SelectedEdge | null

  // Actions
  startEdgeSelection: () => void
  exitEdgeSelection: () => void
  setHoveredEdge: (edge: SelectedEdge | null) => void
}

export const useEdgeSelectionStore = create<EdgeSelectionState>()(
  immer((set) => ({
    active: false,
    hoveredEdge: null,

    startEdgeSelection: () =>
      set((state) => {
        state.active = true
        state.hoveredEdge = null
      }),

    exitEdgeSelection: () =>
      set((state) => {
        state.active = false
        state.hoveredEdge = null
      }),

    setHoveredEdge: (edge) =>
      set((state) => {
        state.hoveredEdge = edge
      }),
  }))
)
