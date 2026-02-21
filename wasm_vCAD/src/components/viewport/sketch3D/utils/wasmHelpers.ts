/**
 * WASM helper functions for sketch operations
 */

import type { SketchElement, Sketch, SketchConstraint } from '@/types/scene'

// ─── Sketch Serialization ────────────────────────────────────────────────────

/**
 * Create a Sketch object for WASM operations
 * Ensures consistent structure and ID generation
 */
export function createSketchForWasm(
  elements: SketchElement[],
  plane: 'XY' | 'XZ' | 'YZ',
  constraints?: SketchConstraint[]
): Sketch {
  return {
    id: crypto.randomUUID(),
    plane,
    offset: 0.0,
    elements,
    ...(constraints && constraints.length > 0 ? { constraints } : {})
  }
}

// ─── Result Processing ───────────────────────────────────────────────────────

/**
 * Process WASM result preserving element IDs
 * Maintains original IDs where possible
 */
export function processWasmResult(
  resultJson: string,
  originalElements?: SketchElement[]
): SketchElement[] {
  const resultSketch: Sketch = JSON.parse(resultJson)

  return resultSketch.elements.map((elem, index) => ({
    ...elem,
    id: elem.id || originalElements?.[index]?.id || crypto.randomUUID()
  }))
}

/**
 * Apply a WASM operation and return updated elements
 * Handles the common pattern of calling WASM and processing results
 */
export function applyWasmOperation(
  operationFn: () => string
): SketchElement[] {
  const newSketchJson = operationFn()
  const newSketch: Sketch = JSON.parse(newSketchJson)

  return newSketch.elements.map(el => {
    if (!el.id) {
      return { ...el, id: crypto.randomUUID() }
    }
    return el
  })
}

/**
 * Safely apply a WASM operation with error handling
 */
export function applyWasmOperationSafe(
  operationFn: () => string
): { success: true; elements: SketchElement[] } | { success: false; error: string } {
  try {
    const elements = applyWasmOperation(operationFn)
    return { success: true, elements }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    return { success: false, error: errorMessage }
  }
}
