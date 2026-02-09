/** Mirrors shared Rust types */

export type ObjectId = string;

export type Primitive =
  | { type: "cube"; width: number; height: number; depth: number }
  | { type: "cylinder"; radius: number; height: number }
  | { type: "sphere"; radius: number }
  | { type: "cone"; radius: number; height: number };

export type BooleanOp = "union" | "difference" | "intersection";

export type SketchPlane = "XY" | "XZ" | "YZ";

export interface Point2D {
  x: number;
  y: number;
}

export type SketchElement =
  | { type: "line"; start: Point2D; end: Point2D }
  | { type: "circle"; center: Point2D; radius: number }
  | {
      type: "arc";
      center: Point2D;
      radius: number;
      startAngle: number;
      endAngle: number;
    }
  | { type: "rectangle"; corner: Point2D; width: number; height: number }
  | { type: "polyline"; points: Point2D[] }
  | { type: "spline"; points: Point2D[] }
  | { type: "dimension"; from: Point2D; to: Point2D; value: number };

export interface Sketch {
  plane: SketchPlane;
  offset: number;
  elements: SketchElement[];
}

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export const defaultTransform = (): Transform => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});

export type SceneOperation =
  | {
      type: "create_primitive";
      id: ObjectId;
      primitive: Primitive;
      transform: Transform;
    }
  | {
      type: "boolean";
      id: ObjectId;
      op: BooleanOp;
      left: ObjectId;
      right: ObjectId;
    }
  | {
      type: "create_sketch";
      id: ObjectId;
      sketch: Sketch;
      transform: Transform;
    };

export interface SceneDescription {
  operations: SceneOperation[];
}

export interface AiChatRequest {
  message: string;
  scene: SceneDescription;
}

export interface AiChatResponse {
  text: string;
  operations: SceneOperation[];
}
