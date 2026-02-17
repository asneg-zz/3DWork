/**
 * Sketch 3D UI Store
 * Shared state for context menus and dialogs when sketch is in 3D viewport
 */

import { create } from 'zustand'
import type { SketchConstraintType } from '@/types/scene'

interface ContextMenuState {
  x: number
  y: number
  elementId: string
}

interface ToolsContextMenuState {
  x: number
  y: number
}

interface DialogState {
  isOpen: boolean
  elementId: string | null
}

interface ConstraintDialogState {
  isOpen: boolean
  elementId: string | null
  elementType: string | null
  secondElementId?: string | null
  needsSecondElement?: boolean
  pendingConstraintType?: SketchConstraintType
}

interface SketchUIState {
  contextMenu: ContextMenuState | null
  toolsContextMenu: ToolsContextMenuState | null
  offsetDialog: DialogState
  mirrorDialog: DialogState
  linearPatternDialog: DialogState
  circularPatternDialog: DialogState
  constraintDialog: ConstraintDialogState

  setContextMenu: (menu: ContextMenuState | null) => void
  setToolsContextMenu: (menu: ToolsContextMenuState | null) => void
  setOffsetDialog: (state: DialogState) => void
  setMirrorDialog: (state: DialogState) => void
  setLinearPatternDialog: (state: DialogState) => void
  setCircularPatternDialog: (state: DialogState) => void
  setConstraintDialog: (state: ConstraintDialogState) => void
}

export const useSketchUIStore = create<SketchUIState>()((set) => ({
  contextMenu: null,
  toolsContextMenu: null,
  offsetDialog: { isOpen: false, elementId: null },
  mirrorDialog: { isOpen: false, elementId: null },
  linearPatternDialog: { isOpen: false, elementId: null },
  circularPatternDialog: { isOpen: false, elementId: null },
  constraintDialog: {
    isOpen: false,
    elementId: null,
    elementType: null,
    secondElementId: null,
    needsSecondElement: false,
  },

  setContextMenu: (menu) => set({ contextMenu: menu }),
  setToolsContextMenu: (menu) => set({ toolsContextMenu: menu }),
  setOffsetDialog: (state) => set({ offsetDialog: state }),
  setMirrorDialog: (state) => set({ mirrorDialog: state }),
  setLinearPatternDialog: (state) => set({ linearPatternDialog: state }),
  setCircularPatternDialog: (state) => set({ circularPatternDialog: state }),
  setConstraintDialog: (state) => set({ constraintDialog: state }),
}))
