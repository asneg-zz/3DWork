import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'
import type { SceneDescription, Body, Feature, BooleanOperation } from '@/types/scene'
import { performCSG, serializeGeometry } from '@/utils/manifoldCSG'
import { geometryCache } from '@/utils/geometryCache'
import { serializeScene } from '@/utils/sceneSerializer'
import { useNotificationStore } from './notificationStore'

// ─── Fallback: download scene as JSON file ────────────────────────────────────

function downloadSceneJson(persistedJson: string): void {
  try {
    const parsed = JSON.parse(persistedJson)
    const scene: SceneDescription | undefined = parsed?.state?.scene
    if (!scene) return

    const data = serializeScene(scene)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const ts   = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    a.download = `vcad-autosave-${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // nothing we can do if download also fails
  }
}

// ─── Custom localStorage adapter with QuotaExceededError fallback ─────────────

const sceneStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),

  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        useNotificationStore.getState().show(
          'Превышен лимит хранилища браузера. Сцена автоматически сохранена в файл.',
          'warning'
        )
        downloadSceneJson(value)
      }
    }
  },

  removeItem: (name) => localStorage.removeItem(name),
}

// ─── Store types ──────────────────────────────────────────────────────────────

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
  /** Remove a sketch AND all features that reference it (extrude, cut, etc.) */
  removeSketchWithDependents: (bodyId: string, sketchId: string) => void
  updateFeature: (bodyId: string, featureId: string, updates: Partial<Feature>) => void

  selectBody: (bodyId: string) => void
  deselectBody: (bodyId: string) => void
  clearSelection: () => void

  selectFeature: (featureId: string | null) => void

  /** Replace the entire scene (used when loading a file) */
  setScene: (scene: SceneDescription) => void

  /**
   * Perform a CSG boolean operation between two selected bodies.
   * Creates a new body with the result and hides the source bodies.
   * Requires both body geometries to be registered in geometryCache.
   */
  performBoolean: (bodyId1: string, bodyId2: string, operation: BooleanOperation) => Promise<void>
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSceneStore = create<SceneState>()(
  persist(
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

      removeSketchWithDependents: (bodyId, sketchId) =>
        set((state) => {
          const body = state.scene.bodies.find(b => b.id === bodyId)
          if (body) {
            // Remove the sketch itself AND every feature that references it
            body.features = body.features.filter(
              f => f.id !== sketchId && f.sketch_id !== sketchId
            )
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

      setScene: (scene) =>
        set((state) => {
          state.scene = scene
          state.selectedBodyIds = []
          state.selectedFeatureId = null
        }),

      performBoolean: async (bodyId1, bodyId2, operation) => {
        const geoA = geometryCache.get(bodyId1)
        const geoB = geometryCache.get(bodyId2)

        if (!geoA || !geoB) {
          throw new Error(
            `Boolean ${operation}: geometry not found in cache for bodies ${bodyId1}, ${bodyId2}`
          )
        }

        const resultGeo = await performCSG(geoA, geoB, operation)
        const { vertices, indices } = serializeGeometry(resultGeo)

        const opLabels: Record<BooleanOperation, string> = {
          union:        'Union',
          difference:   'Difference',
          intersection: 'Intersection',
        }

        const newBodyId = crypto.randomUUID()
        const newFeatureId = crypto.randomUUID()

        const newBody: Body = {
          id: newBodyId,
          name: opLabels[operation],
          visible: true,
          features: [{
            id: newFeatureId,
            type: 'boolean',
            name: `${opLabels[operation]} (2 тела)`,
            boolean_operation: operation,
            boolean_body_ids: [bodyId1, bodyId2],
            cached_mesh_vertices: vertices,
            cached_mesh_indices:  indices,
          }],
        }

        set((state) => {
          // Add result body
          state.scene.bodies.push(newBody)

          // Hide source bodies
          for (const body of state.scene.bodies) {
            if (body.id === bodyId1 || body.id === bodyId2) {
              body.visible = false
            }
          }

          state.selectedBodyIds = [newBodyId]
          state.selectedFeatureId = null
        })
      },
    })),
    {
      name: 'vcad-scene',
      storage: createJSONStorage(() => sceneStorage),
      // Only persist the scene graph; selection is transient UI state
      partialize: (state) => ({ scene: state.scene }),
    }
  )
)
