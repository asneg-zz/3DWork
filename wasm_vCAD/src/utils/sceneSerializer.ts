/**
 * sceneSerializer.ts
 * Converts between the web app's SceneDescription and the desktop-compatible
 * SceneDescriptionV2 JSON format (crates/shared/src/lib.rs).
 *
 * Desktop JSON structure:
 * { "version": 2, "bodies": [...], "body_operations": [] }
 *
 * Feature type mapping:
 *   web 'primitive'  → desktop "base_primitive"
 *   web 'sketch'     → desktop "sketch"
 *   web 'extrude'    → desktop "extrude"  (cut: false)
 *   web 'cut'        → desktop "extrude"  (cut: true)
 *   desktop "base_extrude" → web sketch + extrude (split on load)
 */

import type {
  SceneDescription,
  Body,
  Feature,
  Primitive,
  Sketch,
  SketchElement,
  Transform,
} from '@/types/scene'

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultTransform(): object {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}

function defaultTransformObj(): Transform {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Serialize (web → desktop JSON) ─────────────────────────────────────────

function serializePrimitive(p: Primitive): object {
  switch (p.type) {
    case 'cube':
      return { type: 'cube', width: p.width ?? 1, height: p.height ?? 1, depth: p.depth ?? 1 }
    case 'cylinder':
      return { type: 'cylinder', radius: p.radius ?? 0.5, height: p.height ?? 1 }
    case 'sphere':
      return { type: 'sphere', radius: p.radius ?? 0.5 }
    case 'cone':
      return { type: 'cone', radius: p.radius ?? 0.5, height: p.height ?? 1 }
  }
}

function serializeSketchElement(el: SketchElement): object {
  const base: Record<string, unknown> = { type: el.type }
  if (el.id) base.id = el.id

  switch (el.type) {
    case 'line':
      return { ...base, start: el.start, end: el.end }
    case 'circle':
      return { ...base, center: el.center, radius: el.radius }
    case 'arc':
      return { ...base, center: el.center, radius: el.radius, start_angle: el.start_angle, end_angle: el.end_angle }
    case 'rectangle':
      return { ...base, corner: el.corner, width: el.width, height: el.height }
    case 'polyline':
    case 'spline':
      return { ...base, points: el.points }
    case 'dimension': {
      const d: Record<string, unknown> = { ...base, from: el.from, to: el.to, value: el.value }
      if (el.parameter_name)     d.parameter_name     = el.parameter_name
      if (el.dimension_line_pos) d.dimension_line_pos = el.dimension_line_pos
      if (el.target_element !== undefined) d.target_element = el.target_element
      d.dimension_type = el.dimension_type ?? 'linear'
      return d
    }
    default:
      return base
  }
}

function serializeSketch(sketch: Sketch): object {
  const s: Record<string, unknown> = {
    plane: sketch.plane,
    offset: sketch.offset,
    elements: sketch.elements.map(serializeSketchElement),
  }
  if (sketch.face_normal)                         s.face_normal   = sketch.face_normal
  if (sketch.construction?.length)                s.construction  = sketch.construction
  if (sketch.revolve_axis !== undefined)          s.revolve_axis  = sketch.revolve_axis
  if (sketch.symmetry_axis !== undefined)         s.symmetry_axis = sketch.symmetry_axis
  if (sketch.constraints?.length)                 s.constraints   = sketch.constraints
  return s
}

function serializeFeature(feature: Feature): object | null {
  switch (feature.type) {
    case 'primitive':
      if (!feature.primitive) return null
      return {
        type: 'base_primitive',
        id: feature.id,
        primitive: serializePrimitive(feature.primitive),
        transform: feature.transform ?? defaultTransform(),
      }

    case 'sketch':
      if (!feature.sketch) return null
      return {
        type: 'sketch',
        id: feature.id,
        sketch: serializeSketch(feature.sketch),
        transform: defaultTransform(),
      }

    case 'extrude':
      return {
        type: 'extrude',
        id: feature.id,
        sketch_id: feature.sketch_id,
        height: feature.extrude_params?.height ?? 1,
        height_backward: feature.extrude_params?.height_backward ?? 0,
        draft_angle: feature.extrude_params?.draft_angle ?? 0,
        cut: false,
      }

    case 'cut':
      return {
        type: 'extrude',
        id: feature.id,
        sketch_id: feature.sketch_id,
        height: feature.extrude_params?.height ?? 1,
        height_backward: feature.extrude_params?.height_backward ?? 0,
        draft_angle: feature.extrude_params?.draft_angle ?? 0,
        cut: true,
      }

    case 'revolve':
      return {
        type: 'revolve',
        id: feature.id,
        sketch_id: feature.sketch_id,
        angle: feature.angle ?? 360,
        segments: 64,
        cut: false,
        ...(feature.axis_start ? { axis_start: [feature.axis_start.x, feature.axis_start.y] } : {}),
        ...(feature.axis_end   ? { axis_end:   [feature.axis_end.x,   feature.axis_end.y]   } : {}),
      }

    default:
      return null
  }
}

function serializeBody(body: Body): object {
  return {
    id: body.id,
    name: body.name,
    visible: body.visible,
    features: body.features.map(serializeFeature).filter(Boolean),
  }
}

/** Converts the web SceneDescription to desktop-compatible SceneDescriptionV2 JSON. */
export function serializeScene(scene: SceneDescription): object {
  return {
    version: 2,
    bodies: scene.bodies.map(serializeBody),
    body_operations: scene.operations ?? [],
  }
}

// ─── Deserialize (desktop JSON → web) ───────────────────────────────────────

function deserializePrimitive(p: any): Primitive {
  switch (p?.type) {
    case 'cube':
      return { type: 'cube', width: p.width, height: p.height, depth: p.depth }
    case 'cylinder':
      return { type: 'cylinder', radius: p.radius, height: p.height }
    case 'sphere':
      return { type: 'sphere', radius: p.radius }
    case 'cone':
      return { type: 'cone', radius: p.radius, height: p.height }
    default:
      return { type: 'cube', width: 1, height: 1, depth: 1 }
  }
}

function deserializeSketch(s: any, id: string): Sketch {
  return {
    id,
    plane: s?.plane ?? 'XY',
    offset: s?.offset ?? 0,
    elements: (s?.elements ?? []) as SketchElement[],
    face_normal: s?.face_normal,
    construction: s?.construction,
    revolve_axis: s?.revolve_axis,
    symmetry_axis: s?.symmetry_axis,
    constraints: s?.constraints ?? [],
  }
}

function deserializeFeatures(features: any[]): Feature[] {
  const result: Feature[] = []

  for (const f of features) {
    switch (f.type) {
      case 'base_primitive':
        result.push({
          id: f.id,
          type: 'primitive',
          name: capitalize(f.primitive?.type ?? 'Primitive'),
          primitive: deserializePrimitive(f.primitive),
          transform: (f.transform as Transform) ?? defaultTransformObj(),
        })
        break

      case 'base_extrude': {
        // Desktop inlines sketch into extrude — split into sketch + extrude
        const sketchId: string = crypto.randomUUID()
        result.push({
          id: sketchId,
          type: 'sketch',
          name: 'Эскиз',
          sketch: deserializeSketch(f.sketch, sketchId),
        })
        result.push({
          id: f.id,
          type: 'extrude',
          name: 'Выдавливание',
          sketch_id: sketchId,
          extrude_params: {
            height: f.height ?? 1,
            height_backward: f.height_backward ?? 0,
            draft_angle: f.draft_angle ?? 0,
          },
        })
        break
      }

      case 'sketch':
        result.push({
          id: f.id,
          type: 'sketch',
          name: 'Эскиз',
          sketch: deserializeSketch(f.sketch, f.id),
        })
        break

      case 'extrude':
        result.push({
          id: f.id,
          type: f.cut ? 'cut' : 'extrude',
          name: f.cut ? 'Вырез' : 'Выдавливание',
          sketch_id: f.sketch_id,
          extrude_params: {
            height: f.height ?? 1,
            height_backward: f.height_backward ?? 0,
            draft_angle: f.draft_angle ?? 0,
          },
        })
        break

      case 'revolve':
        result.push({
          id: f.id,
          type: 'revolve',
          name: 'Вращение',
          sketch_id: f.sketch_id,
          angle: f.angle ?? 360,
          axis_start: f.axis_start ? { x: f.axis_start[0], y: f.axis_start[1] } : undefined,
          axis_end:   f.axis_end   ? { x: f.axis_end[0],   y: f.axis_end[1]   } : undefined,
        })
        break

      // fillet_3d, chamfer_3d, boolean_modify — skip for now
    }
  }

  return result
}

function deserializeBody(b: any): Body {
  return {
    id: b.id,
    name: b.name,
    visible: b.visible ?? true,
    features: deserializeFeatures(b.features ?? []),
  }
}

/** Parses a desktop SceneDescriptionV2 JSON object into a web SceneDescription. */
export function deserializeScene(json: any): SceneDescription {
  if (json.version !== 2) {
    throw new Error(`Неподдерживаемая версия файла: ${json.version}. Ожидается версия 2.`)
  }
  return {
    bodies: (json.bodies ?? []).map(deserializeBody),
    operations: json.body_operations ?? [],
  }
}
