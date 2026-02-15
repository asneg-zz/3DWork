import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SceneDescription, Body, Feature } from '@/types/scene'

interface SceneState {
  scene: SceneDescription
  selectedBodyIds: string[]
  selectedFeatureId: string | null

  // Actions
  addBody: (body: Body) => void
  removeBody: (bodyId: string) => void
  updateBody: (bodyId: string, updates: Partial<Body>) => void

  addFeature: (bodyId: string, feature: Feature) => void
  removeFeature: (bodyId: string, featureId: string) => void
  updateFeature: (bodyId: string, featureId: string, updates: Partial<Feature>) => void

  selectBody: (bodyId: string) => void
  deselectBody: (bodyId: string) => void
  clearSelection: () => void

  selectFeature: (featureId: string | null) => void
}

export const useSceneStore = create<SceneState>()(
  immer((set) => ({
    scene: {
      bodies: [],
      operations: []
    },
    selectedBodyIds: [],
    selectedFeatureId: null,

    addBody: (body) =>
      set((state) => {
        state.scene.bodies.push(body)
      }),

    removeBody: (bodyId) =>
      set((state) => {
        state.scene.bodies = state.scene.bodies.filter(b => b.id !== bodyId)
        state.selectedBodyIds = state.selectedBodyIds.filter(id => id !== bodyId)
      }),

    updateBody: (bodyId, updates) =>
      set((state) => {
        const body = state.scene.bodies.find(b => b.id === bodyId)
        if (body) {
          Object.assign(body, updates)
        }
      }),

    addFeature: (bodyId, feature) =>
      set((state) => {
        const body = state.scene.bodies.find(b => b.id === bodyId)
        if (body) {
          body.features.push(feature)
        }
      }),

    removeFeature: (bodyId, featureId) =>
      set((state) => {
        const body = state.scene.bodies.find(b => b.id === bodyId)
        if (body) {
          body.features = body.features.filter(f => f.id !== featureId)
        }
      }),

    updateFeature: (bodyId, featureId, updates) =>
      set((state) => {
        const body = state.scene.bodies.find(b => b.id === bodyId)
        if (body) {
          const feature = body.features.find(f => f.id === featureId)
          if (feature) {
            Object.assign(feature, updates)
          }
        }
      }),

    selectBody: (bodyId) =>
      set((state) => {
        if (!state.selectedBodyIds.includes(bodyId)) {
          state.selectedBodyIds.push(bodyId)
        }
      }),

    deselectBody: (bodyId) =>
      set((state) => {
        state.selectedBodyIds = state.selectedBodyIds.filter(id => id !== bodyId)
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedBodyIds = []
        state.selectedFeatureId = null
      }),

    selectFeature: (featureId) =>
      set((state) => {
        state.selectedFeatureId = featureId
      }),
  }))
)
