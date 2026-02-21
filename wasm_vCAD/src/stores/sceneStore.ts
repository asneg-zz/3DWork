import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SceneDescription, Body, Feature, BooleanOperation } from '@/types/scene'
import { performCSG, serializeGeometry } from '@/utils/manifoldCSG'
import { geometryCache } from '@/utils/geometryCache'

// ─── Last file path storage ───────────────────────────────────────────────────

const LAST_FILE_KEY = 'vcad-last-file'
const OLD_SCENE_KEY = 'vcad-scene'

// Clean up old localStorage scene data (no longer used)
if (localStorage.getItem(OLD_SCENE_KEY)) {
  localStorage.removeItem(OLD_SCENE_KEY)
}

export function getLastFilePath(): string | null {
  return localStorage.getItem(LAST_FILE_KEY)
}

export function setLastFilePath(path: string): void {
  localStorage.setItem(LAST_FILE_KEY, path)
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
    }))
)
