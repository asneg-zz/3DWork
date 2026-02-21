/**
 * WASM data normalizers
 *
 * Handles conversion between Rust snake_case and TypeScript camelCase.
 * Use these functions at the boundary with WASM to normalize data.
 */

import type { SketchElement, Sketch, ExtrudeParams, SketchConstraint, PointRef } from '@/types/scene'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Raw element type from WASM (snake_case)
 * Use this for direct WASM communication
 */
export interface SketchElementRaw {
  id: string
  type: string
  // Line
  start?: { x: number; y: number }
  end?: { x: number; y: number }
  // Circle/Arc
  center?: { x: number; y: number }
  radius?: number
  start_angle?: number
  end_angle?: number
  // Rectangle
  corner?: { x: number; y: number }
  width?: number
  height?: number
  // Polyline/Spline
  points?: { x: number; y: number }[]
  // Dimension
  from?: { x: number; y: number }
  to?: { x: number; y: number }
  value?: number
  parameter_name?: string
  dimension_line_pos?: { x: number; y: number }
  target_element?: number
  dimension_type?: string
  element_id?: string
}

export interface SketchRaw {
  id: string
  plane: string
  offset: number
  elements: SketchElementRaw[]
  face_normal?: [number, number, number]
  face_coord_system?: {
    origin: [number, number, number]
    normal: [number, number, number]
    uAxis: [number, number, number]
    vAxis: [number, number, number]
  }
  construction?: boolean[]
  revolve_axis?: number
  symmetry_axis?: number
  constraints?: SketchConstraintRaw[]
}

export interface ExtrudeParamsRaw {
  height: number
  height_backward: number
  draft_angle: number
}

export interface PointRefRaw {
  element_index: number
  point_index: number
}

export interface SketchConstraintRaw {
  type: string
  element?: number
  element1?: number
  element2?: number
  point1?: PointRefRaw
  point2?: PointRefRaw
  axis?: number
}

// ─── Normalizers (snake_case → TypeScript) ────────────────────────────────────

/**
 * Normalize a sketch element from WASM format
 * Currently a no-op since types match, but provides the conversion point
 */
export function normalizeElement(raw: SketchElementRaw): SketchElement {
  // Note: The current implementation uses snake_case in TypeScript types
  // to match Rust. This function serves as the conversion point if we
  // decide to switch to camelCase in the future.
  return raw as unknown as SketchElement
}

/**
 * Normalize a sketch from WASM format
 */
export function normalizeSketch(raw: SketchRaw): Sketch {
  return {
    ...raw,
    elements: raw.elements.map(normalizeElement),
  } as unknown as Sketch
}

/**
 * Normalize extrude params from WASM format
 */
export function normalizeExtrudeParams(raw: ExtrudeParamsRaw): ExtrudeParams {
  return raw as ExtrudeParams
}

/**
 * Normalize a point reference from WASM format
 */
export function normalizePointRef(raw: PointRefRaw): PointRef {
  return {
    element_index: raw.element_index,
    point_index: raw.point_index,
  }
}

/**
 * Normalize a constraint from WASM format
 */
export function normalizeConstraint(raw: SketchConstraintRaw): SketchConstraint {
  const base = { type: raw.type }

  switch (raw.type) {
    case 'horizontal':
    case 'vertical':
    case 'fixed':
      return { ...base, element: raw.element! } as SketchConstraint

    case 'parallel':
    case 'perpendicular':
    case 'equal':
    case 'tangent':
    case 'concentric':
      return {
        ...base,
        element1: raw.element1!,
        element2: raw.element2!,
      } as SketchConstraint

    case 'coincident':
      return {
        ...base,
        point1: normalizePointRef(raw.point1!),
        point2: normalizePointRef(raw.point2!),
      } as SketchConstraint

    case 'symmetric':
      return {
        ...base,
        element1: raw.element1!,
        element2: raw.element2!,
        axis: raw.axis!,
      } as SketchConstraint

    default:
      return raw as unknown as SketchConstraint
  }
}

// ─── Denormalizers (TypeScript → snake_case for WASM) ─────────────────────────

/**
 * Convert sketch element to WASM format (snake_case)
 */
export function denormalizeElement(el: SketchElement): SketchElementRaw {
  // Currently a no-op since types match
  return el as unknown as SketchElementRaw
}

/**
 * Convert sketch to WASM format
 */
export function denormalizeSketch(sketch: Sketch): SketchRaw {
  return {
    ...sketch,
    elements: sketch.elements.map(denormalizeElement),
  } as unknown as SketchRaw
}

/**
 * Convert extrude params to WASM format
 */
export function denormalizeExtrudeParams(params: ExtrudeParams): ExtrudeParamsRaw {
  return params as ExtrudeParamsRaw
}

// ─── Utility: Generic snake_case ↔ camelCase converters ──────────────────────

/**
 * Convert snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert camelCase string to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
}

/**
 * Deep convert object keys from snake_case to camelCase
 */
export function deepSnakeToCamel<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (Array.isArray(obj)) return obj.map(deepSnakeToCamel) as T
  if (typeof obj !== 'object') return obj as T

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[snakeToCamel(key)] = deepSnakeToCamel(value)
  }
  return result as T
}

/**
 * Deep convert object keys from camelCase to snake_case
 */
export function deepCamelToSnake<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T
  if (Array.isArray(obj)) return obj.map(deepCamelToSnake) as T
  if (typeof obj !== 'object') return obj as T

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[camelToSnake(key)] = deepCamelToSnake(value)
  }
  return result as T
}
