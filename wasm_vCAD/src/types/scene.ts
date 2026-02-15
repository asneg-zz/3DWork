// Scene types matching Rust shared types

export interface Point2D {
  x: number
  y: number
}

// Snap point types
export type SnapType = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'intersection' | 'grid'

export interface SnapPoint {
  point: Point2D
  snapType: SnapType
  sourceElement?: number  // Index of element that generated this snap point
}

export interface SnapSettings {
  enabled: boolean
  endpoint: boolean
  midpoint: boolean
  center: boolean
  quadrant: boolean
  grid: boolean
  gridSize: number
  snapRadius: number  // In world units
}

export type SketchPlane = 'XY' | 'XZ' | 'YZ'

export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export type PrimitiveType = 'cube' | 'cylinder' | 'sphere' | 'cone'

export interface Primitive {
  type: PrimitiveType
  width?: number
  height?: number
  depth?: number
  radius?: number
}

export type SketchElementType = 'line' | 'circle' | 'arc' | 'rectangle' | 'polyline' | 'spline'

export interface SketchElement {
  id: string
  type: SketchElementType
  // Line
  start?: Point2D
  end?: Point2D
  // Circle
  center?: Point2D
  radius?: number
  // Arc
  start_angle?: number
  end_angle?: number
  // Rectangle
  corner?: Point2D
  width?: number
  height?: number
  // Polyline/Spline
  points?: Point2D[]
}

export interface Sketch {
  id: string
  plane: SketchPlane
  offset: number
  elements: SketchElement[]
  face_normal?: [number, number, number]
  construction?: boolean[]  // Flags for construction geometry (parallel to elements)
  revolve_axis?: number     // Index of element marked as revolve axis
  symmetry_axis?: number    // Index of element marked as symmetry/mirror axis
}

export interface ExtrudeParams {
  height: number
  height_backward: number
  draft_angle: number
}

export type FeatureType = 'primitive' | 'sketch' | 'extrude' | 'cut' | 'revolve' | 'fillet' | 'chamfer'

export interface Feature {
  id: string
  type: FeatureType
  name: string

  // Primitive
  primitive?: Primitive
  transform?: Transform

  // Sketch
  sketch?: Sketch

  // Extrude/Cut
  sketch_id?: string
  extrude_params?: ExtrudeParams

  // Revolve
  axis_start?: Point2D
  axis_end?: Point2D
  angle?: number

  // Fillet/Chamfer
  edge_ids?: string[]
  radius?: number
  distance?: number
}

export interface Body {
  id: string
  name: string
  features: Feature[]
  visible: boolean
}

export interface SceneDescription {
  bodies: Body[]
  operations: any[] // SceneOperation from Rust
}

export interface BoundingBox {
  min: [number, number, number]
  max: [number, number, number]
}

export interface SceneMetrics {
  volume: number
  surface_area: number
  bounding_box: BoundingBox
  center_of_mass: [number, number, number]
}
