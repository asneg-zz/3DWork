/**
 * Store for face selection mode (selecting faces on 3D bodies to create sketches)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SketchPlane, FaceCoordSystem } from '@/types/scene'

interface SelectedFace {
  bodyId: string
  featureId: string
  faceType: 'top' | 'bottom' | 'side'
  plane: SketchPlane
  offset: number
  faceCoordSystem?: FaceCoordSystem | null
}

interface FaceSelectionState {
  // Face selection mode active
  active: boolean

  // Currently hovered face
  hoveredFace: SelectedFace | null

  // Actions
  startFaceSelection: () => void
  exitFaceSelection: () => void
  setHoveredFace: (face: SelectedFace | null) => void
}

export const useFaceSelectionStore = create<FaceSelectionState>()(
  immer((set) => ({
    active: false,
    hoveredFace: null,

    startFaceSelection: () =>
      set((state) => {
        state.active = true
        state.hoveredFace = null
      }),

    exitFaceSelection: () =>
      set((state) => {
        state.active = false
        state.hoveredFace = null
      }),

    setHoveredFace: (face) =>
      set((state) => {
        state.hoveredFace = face
      }),
  }))
)
