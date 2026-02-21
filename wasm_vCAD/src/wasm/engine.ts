/**
 * TypeScript wrapper for WASM vCAD engine
 * With error handling and result validation
 */

import type { MeshData } from '@/types/mesh'

// ─── Result types ────────────────────────────────────────────────────────────

/**
 * Result type for WASM operations
 * Use this for operations that might fail
 */
export type WasmResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Arc calculation result from WASM
 */
export interface ArcCalculationResult {
  center_x: number
  center_y: number
  radius: number
  start_angle: number
  end_angle: number
  valid: boolean
}

/**
 * Snap point from WASM
 */
export interface WasmSnapPoint {
  x: number
  y: number
  snap_type: string
  source_element: number | null
}

// ─── WASM Module ─────────────────────────────────────────────────────────────

let wasmModule: any = null

// ─── Engine class ────────────────────────────────────────────────────────────

export class VcadEngine {
  private ready = false

  /**
   * Initialize the WASM module
   * Must be called before any other methods
   */
  async initialize(): Promise<void> {
    if (this.ready) return

    try {
      wasmModule = await import('./pkg/vcad_engine.js')
      await wasmModule.default()
      this.ready = true
    } catch (error) {
      console.error('Failed to initialize WASM engine:', error)
      throw error
    }
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.ready
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('WASM engine not initialized. Call initialize() first.')
    }
  }

  /**
   * Safe wrapper for WASM calls
   * Returns WasmResult instead of throwing
   */
  private safeCall<T>(fn: () => T, operation: string): WasmResult<T> {
    try {
      this.ensureReady()
      const result = fn()
      return { success: true, data: result }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      console.error(`WASM ${operation} failed:`, e)
      return { success: false, error: errorMessage }
    }
  }

  // ========== Primitives ==========

  createCube(width: number, height: number, depth: number): string {
    this.ensureReady()
    return wasmModule.create_cube(width, height, depth)
  }

  createCylinder(radius: number, height: number): string {
    this.ensureReady()
    return wasmModule.create_cylinder(radius, height)
  }

  createSphere(radius: number): string {
    this.ensureReady()
    return wasmModule.create_sphere(radius)
  }

  createCone(radius: number, height: number): string {
    this.ensureReady()
    return wasmModule.create_cone(radius, height)
  }

  // ========== Sketch ==========

  createSketch(plane: 'XY' | 'XZ' | 'YZ'): string {
    this.ensureReady()
    return wasmModule.create_sketch(plane)
  }

  // ========== Extrude ==========

  extrudeSketch(
    sketchId: string,
    height: number,
    heightBackward: number,
    draftAngle: number
  ): string {
    this.ensureReady()
    return wasmModule.extrude_sketch(sketchId, height, heightBackward, draftAngle)
  }

  // ========== Boolean Operations ==========

  booleanUnion(bodyId1: string, bodyId2: string): string {
    this.ensureReady()
    return wasmModule.boolean_union(bodyId1, bodyId2)
  }

  booleanDifference(bodyId1: string, bodyId2: string): string {
    this.ensureReady()
    return wasmModule.boolean_difference(bodyId1, bodyId2)
  }

  booleanIntersection(bodyId1: string, bodyId2: string): string {
    this.ensureReady()
    return wasmModule.boolean_intersection(bodyId1, bodyId2)
  }

  // ========== Sketch Operations (WASM) ==========

  /**
   * Trim element at click point
   * @returns New sketch JSON or throws on error
   */
  trimElement(
    sketchJson: string,
    elementIndex: number,
    clickX: number,
    clickY: number
  ): string {
    this.ensureReady()
    return wasmModule.sketch_trim_element(sketchJson, elementIndex, clickX, clickY)
  }

  /**
   * Safe trim with error handling
   */
  trimElementSafe(
    sketchJson: string,
    elementIndex: number,
    clickX: number,
    clickY: number
  ): WasmResult<string> {
    return this.safeCall(
      () => wasmModule.sketch_trim_element(sketchJson, elementIndex, clickX, clickY),
      'trimElement'
    )
  }

  offsetElement(
    sketchJson: string,
    elementIndex: number,
    distance: number,
    clickX: number,
    clickY: number
  ): string {
    this.ensureReady()
    return wasmModule.sketch_offset_element(sketchJson, elementIndex, distance, clickX, clickY)
  }

  /**
   * Safe offset with error handling
   */
  offsetElementSafe(
    sketchJson: string,
    elementIndex: number,
    distance: number,
    clickX: number,
    clickY: number
  ): WasmResult<string> {
    return this.safeCall(
      () => wasmModule.sketch_offset_element(sketchJson, elementIndex, distance, clickX, clickY),
      'offsetElement'
    )
  }

  mirrorElement(
    sketchJson: string,
    elementIndex: number,
    axisStartX: number,
    axisStartY: number,
    axisEndX: number,
    axisEndY: number
  ): string {
    this.ensureReady()
    return wasmModule.sketch_mirror_element(
      sketchJson,
      elementIndex,
      axisStartX,
      axisStartY,
      axisEndX,
      axisEndY
    )
  }

  linearPattern(
    sketchJson: string,
    elementIndex: number,
    count: number,
    dx: number,
    dy: number
  ): string {
    this.ensureReady()
    return wasmModule.sketch_linear_pattern(sketchJson, elementIndex, count, dx, dy)
  }

  circularPattern(
    sketchJson: string,
    elementIndex: number,
    count: number,
    centerX: number,
    centerY: number,
    angle: number
  ): string {
    this.ensureReady()
    return wasmModule.sketch_circular_pattern(
      sketchJson,
      elementIndex,
      count,
      centerX,
      centerY,
      angle
    )
  }

  // ========== UI Helper Functions ==========

  /**
   * Find element at point
   * @returns Element index or -1 if not found
   */
  findElementAtPoint(
    sketchJson: string,
    pointX: number,
    pointY: number,
    threshold: number
  ): number {
    this.ensureReady()
    return wasmModule.sketch_find_element_at_point(sketchJson, pointX, pointY, threshold)
  }

  /**
   * Safe find element with error handling
   */
  findElementAtPointSafe(
    sketchJson: string,
    pointX: number,
    pointY: number,
    threshold: number
  ): WasmResult<number> {
    return this.safeCall(
      () => wasmModule.sketch_find_element_at_point(sketchJson, pointX, pointY, threshold),
      'findElementAtPoint'
    )
  }

  /**
   * Calculate arc from 3 points
   */
  calculateArcFrom3Points(
    p1x: number,
    p1y: number,
    p2x: number,
    p2y: number,
    p3x: number,
    p3y: number
  ): ArcCalculationResult {
    this.ensureReady()
    return wasmModule.sketch_calculate_arc_from_3_points(p1x, p1y, p2x, p2y, p3x, p3y)
  }

  /**
   * Get snap points for cursor position
   */
  getSnapPoints(
    sketchJson: string,
    cursorX: number,
    cursorY: number,
    settingsJson: string
  ): WasmSnapPoint[] {
    this.ensureReady()
    return wasmModule.sketch_get_snap_points(sketchJson, cursorX, cursorY, settingsJson)
  }

  /**
   * Safe snap points with error handling
   */
  getSnapPointsSafe(
    sketchJson: string,
    cursorX: number,
    cursorY: number,
    settingsJson: string
  ): WasmResult<WasmSnapPoint[]> {
    return this.safeCall(
      () => wasmModule.sketch_get_snap_points(sketchJson, cursorX, cursorY, settingsJson),
      'getSnapPoints'
    )
  }

  /**
   * Solve geometric constraints
   * @returns Updated sketch JSON
   */
  solveConstraints(sketchJson: string): string {
    this.ensureReady()
    return wasmModule.sketch_solve_constraints(sketchJson)
  }

  /**
   * Safe constraint solving with error handling
   */
  solveConstraintsSafe(sketchJson: string): WasmResult<string> {
    return this.safeCall(
      () => wasmModule.sketch_solve_constraints(sketchJson),
      'solveConstraints'
    )
  }

  // ========== Mesh Generation (WASM) ==========

  generateCubeMesh(width: number, height: number, depth: number): MeshData {
    this.ensureReady()
    return wasmModule.generate_cube_mesh(width, height, depth)
  }

  /**
   * Safe cube mesh generation
   */
  generateCubeMeshSafe(width: number, height: number, depth: number): WasmResult<MeshData> {
    return this.safeCall(
      () => wasmModule.generate_cube_mesh(width, height, depth),
      'generateCubeMesh'
    )
  }

  generateCylinderMesh(radius: number, height: number): MeshData {
    this.ensureReady()
    return wasmModule.generate_cylinder_mesh(radius, height)
  }

  /**
   * Safe cylinder mesh generation
   */
  generateCylinderMeshSafe(radius: number, height: number): WasmResult<MeshData> {
    return this.safeCall(
      () => wasmModule.generate_cylinder_mesh(radius, height),
      'generateCylinderMesh'
    )
  }

  generateSphereMesh(radius: number): MeshData {
    this.ensureReady()
    return wasmModule.generate_sphere_mesh(radius)
  }

  /**
   * Safe sphere mesh generation
   */
  generateSphereMeshSafe(radius: number): WasmResult<MeshData> {
    return this.safeCall(
      () => wasmModule.generate_sphere_mesh(radius),
      'generateSphereMesh'
    )
  }

  generateConeMesh(radius: number, height: number): MeshData {
    this.ensureReady()
    return wasmModule.generate_cone_mesh(radius, height)
  }

  /**
   * Safe cone mesh generation
   */
  generateConeMeshSafe(radius: number, height: number): WasmResult<MeshData> {
    return this.safeCall(
      () => wasmModule.generate_cone_mesh(radius, height),
      'generateConeMesh'
    )
  }
}

// ─── Singleton instance ──────────────────────────────────────────────────────

export const engine = new VcadEngine()

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Unwrap a WasmResult, throwing on error
 * Use when you want to propagate errors
 */
export function unwrapWasmResult<T>(result: WasmResult<T>, context?: string): T {
  if (result.success) {
    return result.data
  }
  throw new Error(context ? `${context}: ${result.error}` : result.error)
}

/**
 * Unwrap a WasmResult with a default value
 * Use when you want to handle errors gracefully
 */
export function unwrapWasmResultOr<T>(result: WasmResult<T>, defaultValue: T): T {
  return result.success ? result.data : defaultValue
}

/**
 * Check if a MeshData is valid
 */
export function isValidMeshData(mesh: MeshData): boolean {
  return (
    mesh &&
    Array.isArray(mesh.vertices) &&
    Array.isArray(mesh.indices) &&
    mesh.vertices.length > 0 &&
    mesh.indices.length > 0 &&
    mesh.vertices.length % 3 === 0 &&
    mesh.indices.length % 3 === 0
  )
}
