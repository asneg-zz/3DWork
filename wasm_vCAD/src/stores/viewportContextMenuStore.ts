import { create } from 'zustand'
import type { SketchPlane, FaceCoordSystem } from '@/types/scene'

export interface ViewportFaceInfo {
  bodyId: string
  featureId: string
  plane: SketchPlane
  offset: number
  faceCoordSystem: FaceCoordSystem
}

interface ViewportContextMenuState {
  isOpen: boolean
  x: number
  y: number
  bodyId: string | null
  faceInfo: ViewportFaceInfo | null

  open: (x: number, y: number, bodyId: string, faceInfo?: ViewportFaceInfo) => void
  close: () => void
}

export const useViewportContextMenuStore = create<ViewportContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  bodyId: null,
  faceInfo: null,

  open: (x, y, bodyId, faceInfo) =>
    set({ isOpen: true, x, y, bodyId, faceInfo: faceInfo ?? null }),

  close: () =>
    set({ isOpen: false, bodyId: null, faceInfo: null }),
}))
