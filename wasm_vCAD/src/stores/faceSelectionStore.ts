/**
 * Store for face selection mode (selecting faces on 3D bodies to create sketches)
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SketchPlane } from '@/types/scene'

interface SelectedFace {
  bodyId: string
  featureId: string
  faceType: 'top' | 'bottom' | 'side'
  plane: SketchPlane
  offset: number
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
  selectFace: (face: SelectedFace) => void
}

export const useFaceSelectionStore = create<FaceSelectionState>()(
  immer((set) => ({
    active: false,
    hoveredFace: null,

    startFaceSelection: () =>
      set((state) => {
        console.log('[FaceSelectionStore] Starting face selection mode')
        state.active = true
        state.hoveredFace = null
      }),

    exitFaceSelection: () =>
      set((state) => {
        console.log('[FaceSelectionStore] Exiting face selection mode')
        state.active = false
        state.hoveredFace = null
      }),

    setHoveredFace: (face) =>
      set((state) => {
        state.hoveredFace = face
      }),

    selectFace: (face) => {
      // Face selected - will be handled by parent component via event
      console.log('Face selected:', face)
    },
  }))
)
