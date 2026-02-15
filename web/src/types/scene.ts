// Types matching Rust shared crate (crates/shared/src/lib.rs)

export type ObjectId = string
export type BodyId = string

// Primitives
export type Primitive =
  | { type: 'cube'; width: number; height: number; depth: number }
  | { type: 'cylinder'; radius: number; height: number }
  | { type: 'sphere'; radius: number }
  | { type: 'cone'; radius: number; height: number }

export type BooleanOp = 'union' | 'difference' | 'intersection'

export type SketchPlane = 'XY' | 'XZ' | 'YZ'

export interface Point2D {
  x: number
  y: number
}

export type DimensionType = 'linear' | 'radius' | 'diameter'

// Sketch Elements
export type SketchElement =
  | { type: 'line'; start: Point2D; end: Point2D }
  | { type: 'circle'; center: Point2D; radius: number }
  | { type: 'arc'; center: Point2D; radius: number; start_angle: number; end_angle: number }
  | { type: 'rectangle'; corner: Point2D; width: number; height: number }
  | { type: 'polyline'; points: Point2D[] }
  | { type: 'spline'; points: Point2D[] }
  | {
      type: 'dimension'
      from: Point2D
      to: Point2D
      value: number
      parameter_name?: string
      dimension_line_pos?: Point2D
      target_element?: number
      dimension_type?: DimensionType
    }

// Point Reference for constraints
export interface PointRef {
  element_index: number
  point_index: number
}

// Sketch Constraints
export type SketchConstraint =
  | { type: 'horizontal'; element: number }
  | { type: 'vertical'; element: number }
  | { type: 'parallel'; element1: number; element2: number }
  | { type: 'perpendicular'; element1: number; element2: number }
  | { type: 'coincident'; point1: PointRef; point2: PointRef }
  | { type: 'fixed'; element: number }
  | { type: 'equal'; element1: number; element2: number }
  | { type: 'tangent'; element1: number; element2: number }
  | { type: 'concentric'; element1: number; element2: number }
  | { type: 'symmetric'; element1: number; element2: number; axis: number }

// Sketch
export interface Sketch {
  plane: SketchPlane
  offset: number
  elements: SketchElement[]
  face_normal?: [number, number, number]
  construction?: boolean[]
  revolve_axis?: number
  symmetry_axis?: number
  constraints?: SketchConstraint[]
}

// Transform
export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export const defaultTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
})

// Features (V2 Body-based model)
export type Feature =
  | {
      type: 'base_primitive'
      id: ObjectId
      primitive: Primitive
      transform: Transform
    }
  | {
      type: 'base_extrude'
      id: ObjectId
      sketch: Sketch
      sketch_transform: Transform
      height: number
      height_backward?: number
      draft_angle?: number
    }
  | {
      type: 'base_revolve'
      id: ObjectId
      sketch: Sketch
      sketch_transform: Transform
      angle: number
      segments: number
    }
  | {
      type: 'sketch'
      id: ObjectId
      sketch: Sketch
      transform: Transform
    }
  | {
      type: 'extrude'
      id: ObjectId
      sketch_id: ObjectId
      height: number
      height_backward?: number
      cut?: boolean
      draft_angle?: number
    }
  | {
      type: 'revolve'
      id: ObjectId
      sketch_id: ObjectId
      angle: number
      segments: number
      cut?: boolean
      axis_start?: [number, number]
      axis_end?: [number, number]
    }
  | {
      type: 'boolean_modify'
      id: ObjectId
      op: BooleanOp
      tool_body_id: BodyId
    }
  | {
      type: 'fillet_3d'
      id: ObjectId
      radius: number
      segments: number
      edges: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number] | null]>
    }
  | {
      type: 'chamfer_3d'
      id: ObjectId
      distance: number
      edges: Array<[[number, number, number], [number, number, number], [number, number, number], [number, number, number] | null]>
    }

// Parameter types
export interface ParameterRef {
  body_id?: string
  feature_id?: string
  property: string
}

export type ParameterValue =
  | { type: 'number'; value: number }
  | { type: 'formula'; expression: string }
  | { type: 'reference'; reference: ParameterRef }

export interface Parameter {
  name: string
  value: ParameterValue
  unit?: string
  description?: string
}

// Body
export interface Body {
  id: BodyId
  name: string
  features: Feature[]
  visible: boolean
  parameters?: Record<string, Parameter>
}

// Boolean result for body operations
export type BooleanResult =
  | { type: 'merge_into_left' }
  | { type: 'merge_into_right' }
  | { type: 'create_new_body'; new_body_id: BodyId; new_body_name: string }

// Body operations
export type BodyOperation = {
  type: 'boolean'
  id: ObjectId
  op: BooleanOp
  left_body_id: BodyId
  right_body_id: BodyId
  result: BooleanResult
}

// Scene Description V2 (Body-based)
export interface SceneDescriptionV2 {
  version: 2
  bodies: Body[]
  body_operations: BodyOperation[]
}

// Legacy V1 Operations (for compatibility)
export type SceneOperation =
  | { type: 'create_primitive'; id: ObjectId; primitive: Primitive; transform: Transform }
  | { type: 'boolean'; id: ObjectId; op: BooleanOp; left: ObjectId; right: ObjectId }
  | { type: 'create_sketch'; id: ObjectId; sketch: Sketch; transform: Transform }
  | { type: 'extrude'; id: ObjectId; sketch_id: ObjectId; height: number }
  | { type: 'revolve'; id: ObjectId; sketch_id: ObjectId; angle: number; segments: number }
  | { type: 'cut'; id: ObjectId; sketch_id: ObjectId; target_id: ObjectId; depth: number }

// Legacy Scene Description V1
export interface SceneDescription {
  operations: SceneOperation[]
}

// AI Chat types
export interface AiChatRequest {
  message: string
  scene: SceneDescription
}

export interface AiChatResponse {
  text: string
  operations: SceneOperation[]
}

// Helper functions
export function getFeatureId(feature: Feature): ObjectId {
  return feature.id
}

export function getFeatureSketch(feature: Feature): Sketch | null {
  switch (feature.type) {
    case 'base_extrude':
    case 'base_revolve':
      return feature.sketch
    case 'sketch':
      return feature.sketch
    default:
      return null
  }
}

export function isSketchConstruction(sketch: Sketch, index: number): boolean {
  return sketch.construction?.[index] ?? false
}

export function createDefaultSketch(plane: SketchPlane = 'XY', offset = 0): Sketch {
  return {
    plane,
    offset,
    elements: [],
    construction: [],
    constraints: [],
  }
}
