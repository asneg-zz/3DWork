/**
 * Sketch utilities - modular exports
 */

// Control points
export {
  type ControlPoint,
  type ControlPointHit,
  getElementControlPoints,
} from './controlPoints'

// Hit testing
export {
  findElementAtPoint,
  hitTestControlPoints,
} from './hitTest'

// Element operations
export {
  duplicateElement,
  updateElementPoint,
} from './elementOperations'

// WASM helpers
export {
  createSketchForWasm,
  processWasmResult,
  applyWasmOperation,
  applyWasmOperationSafe,
  mergeNearbyEndpoints,
  joinConnectedElements,
} from './wasmHelpers'
