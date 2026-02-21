/**
 * Sketch utilities - Re-exports from modular structure
 *
 * This file maintains backward compatibility.
 * New code should import directly from './sketch3D/utils'
 */

// Re-export all utilities from the new modular structure
export {
  // Control points
  type ControlPoint,
  type ControlPointHit,
  getElementControlPoints,
  // Hit testing
  findElementAtPoint,
  hitTestControlPoints,
  // Element operations
  duplicateElement,
  updateElementPoint,
  // WASM helpers
  createSketchForWasm,
  processWasmResult,
  applyWasmOperation,
  applyWasmOperationSafe,
  mergeNearbyEndpoints,
  joinConnectedElements,
} from './sketch3D/utils'
