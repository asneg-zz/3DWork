import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface BooleanState {
  active: boolean
  operation: 'union' | 'difference' | 'intersection' | null
  selectedBodies: string[]

  // Actions
  startBoolean: (operation: 'union' | 'difference' | 'intersection') => void
  cancel: () => void
  toggleBodySelection: (bodyId: string) => void
  clearSelection: () => void
}

export const useBooleanStore = create<BooleanState>()(
  immer((set) => ({
    active: false,
    operation: null,
    selectedBodies: [],

    startBoolean: (operation) =>
      set((state) => {
        state.active = true
        state.operation = operation
        state.selectedBodies = []
      }),

    cancel: () =>
      set((state) => {
        state.active = false
        state.operation = null
        state.selectedBodies = []
      }),

    toggleBodySelection: (bodyId) =>
      set((state) => {
        const index = state.selectedBodies.indexOf(bodyId)
        if (index >= 0) {
          state.selectedBodies.splice(index, 1)
        } else {
          if (state.selectedBodies.length < 2) {
            state.selectedBodies.push(bodyId)
          }
        }
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedBodies = []
      }),
  }))
)
