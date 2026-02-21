/**
 * useSceneGraph - Facade hook for scene management
 *
 * Combines sceneStore with selection stores for unified scene access.
 * Prevents components from importing multiple stores directly.
 */

import { useCallback, useMemo } from 'react'
import { useSceneStore } from '@/stores/sceneStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useBooleanStore } from '@/stores/booleanStore'
import type { Body, Feature } from '@/types/scene'

/**
 * Main hook for scene graph operations
 */
export function useSceneGraph() {
  // ─── Scene state ───────────────────────────────────────────────────────────

  const scene = useSceneStore(s => s.scene)
  const bodies = scene.bodies
  const selectedBodyIds = useSceneStore(s => s.selectedBodyIds)
  const selectedFeatureId = useSceneStore(s => s.selectedFeatureId)

  // ─── Body operations ───────────────────────────────────────────────────────

  const addBody = useSceneStore(s => s.addBody)
  const removeBody = useSceneStore(s => s.removeBody)
  const updateBody = useSceneStore(s => s.updateBody)

  // ─── Feature operations ────────────────────────────────────────────────────

  const addFeature = useSceneStore(s => s.addFeature)
  const removeFeature = useSceneStore(s => s.removeFeature)
  const removeSketchWithDependents = useSceneStore(s => s.removeSketchWithDependents)
  const updateFeature = useSceneStore(s => s.updateFeature)

  // ─── Selection ─────────────────────────────────────────────────────────────

  const selectBody = useSceneStore(s => s.selectBody)
  const deselectBody = useSceneStore(s => s.deselectBody)
  const clearSelection = useSceneStore(s => s.clearSelection)
  const selectFeature = useSceneStore(s => s.selectFeature)

  // ─── Scene management ──────────────────────────────────────────────────────

  const setScene = useSceneStore(s => s.setScene)
  const performBoolean = useSceneStore(s => s.performBoolean)

  // ─── Edge/Face selection ───────────────────────────────────────────────────

  const edgeSelection = useEdgeSelectionStore()
  const faceSelection = useFaceSelectionStore()

  // ─── Boolean operation state ───────────────────────────────────────────────

  const booleanStore = useBooleanStore()

  // ─── Computed values ───────────────────────────────────────────────────────

  const selectedBodies = useMemo(() => {
    return bodies.filter(b => selectedBodyIds.includes(b.id))
  }, [bodies, selectedBodyIds])

  const selectedBody = useMemo(() => {
    return selectedBodies.length === 1 ? selectedBodies[0] : null
  }, [selectedBodies])

  const visibleBodies = useMemo(() => {
    return bodies.filter(b => b.visible)
  }, [bodies])

  const hasSelection = selectedBodyIds.length > 0
  const hasSingleSelection = selectedBodyIds.length === 1
  const hasMultipleSelection = selectedBodyIds.length > 1
  const canPerformBoolean = selectedBodyIds.length === 2

  // ─── Coordinated actions ───────────────────────────────────────────────────

  /**
   * Get a body by ID
   */
  const getBody = useCallback((bodyId: string): Body | undefined => {
    return bodies.find(b => b.id === bodyId)
  }, [bodies])

  /**
   * Get a feature by ID (searches all bodies)
   */
  const getFeature = useCallback((featureId: string): { body: Body; feature: Feature } | undefined => {
    for (const body of bodies) {
      const feature = body.features.find(f => f.id === featureId)
      if (feature) {
        return { body, feature }
      }
    }
    return undefined
  }, [bodies])

  /**
   * Get the currently selected feature with its parent body
   */
  const getSelectedFeature = useCallback((): { body: Body; feature: Feature } | undefined => {
    if (!selectedFeatureId) return undefined
    return getFeature(selectedFeatureId)
  }, [selectedFeatureId, getFeature])

  /**
   * Toggle body selection
   */
  const toggleBodySelection = useCallback((bodyId: string, additive: boolean = false) => {
    if (selectedBodyIds.includes(bodyId)) {
      deselectBody(bodyId)
    } else {
      if (!additive) {
        clearSelection()
      }
      selectBody(bodyId)
    }
  }, [selectedBodyIds, selectBody, deselectBody, clearSelection])

  /**
   * Toggle body visibility
   */
  const toggleBodyVisibility = useCallback((bodyId: string) => {
    const body = getBody(bodyId)
    if (body) {
      updateBody(bodyId, { visible: !body.visible })
    }
  }, [getBody, updateBody])

  /**
   * Clear all selection states (bodies, features, edges, faces)
   */
  const clearAllSelections = useCallback(() => {
    clearSelection()
    edgeSelection.exitEdgeSelection()
    faceSelection.exitFaceSelection()
  }, [clearSelection, edgeSelection, faceSelection])

  /**
   * Delete selected bodies
   */
  const deleteSelectedBodies = useCallback(() => {
    for (const bodyId of selectedBodyIds) {
      removeBody(bodyId)
    }
  }, [selectedBodyIds, removeBody])

  return {
    // Scene data
    scene,
    bodies,
    visibleBodies,
    selectedBodyIds,
    selectedBodies,
    selectedBody,
    selectedFeatureId,

    // Computed flags
    hasSelection,
    hasSingleSelection,
    hasMultipleSelection,
    canPerformBoolean,

    // Body operations
    addBody,
    removeBody,
    updateBody,
    getBody,

    // Feature operations
    addFeature,
    removeFeature,
    removeSketchWithDependents,
    updateFeature,
    getFeature,
    getSelectedFeature,

    // Selection
    selectBody,
    deselectBody,
    clearSelection,
    selectFeature,
    toggleBodySelection,
    clearAllSelections,
    deleteSelectedBodies,

    // Visibility
    toggleBodyVisibility,

    // Scene management
    setScene,
    performBoolean,

    // Sub-stores (for components that need direct access)
    edgeSelection,
    faceSelection,
    booleanStore,
  }
}

/**
 * Lightweight selector for body list only
 */
export function useBodies() {
  return useSceneStore(s => s.scene.bodies)
}

/**
 * Selector for selected body IDs only
 */
export function useSelectedBodyIds() {
  return useSceneStore(s => s.selectedBodyIds)
}

/**
 * Get a specific body by ID
 */
export function useBody(bodyId: string) {
  return useSceneStore(s => s.scene.bodies.find(b => b.id === bodyId))
}
