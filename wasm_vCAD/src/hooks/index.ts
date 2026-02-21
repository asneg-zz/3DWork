/**
 * Hooks index - re-export all hooks
 */

// Facade hooks (use these instead of importing stores directly)
export { useSketchEditor, useSketchState, useSketchDrawing } from './useSketchEditor'
export { useSceneGraph, useBodies, useSelectedBodyIds, useBody } from './useSceneGraph'

// Feature-specific hooks
export { useSketchExtrude } from './useSketchExtrude'
export { useSketchSave } from './useSketchSave'
export { useFeatureEdit } from './useFeatureEdit'

// Three.js resource management
export {
  useDisposableGeometry,
  useDisposableMaterial,
  useEdgesGeometry,
  disposeObject,
} from './useDisposable'
