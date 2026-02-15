import { create } from 'zustand'
import { produce } from 'immer'
import type {
  Body,
  BodyId,
  ObjectId,
  Feature,
  Primitive,
  Transform,
  Sketch,
  SketchPlane,
  SceneDescriptionV2,
} from '../types/scene'
import { defaultTransform } from '../types/scene'

// Re-export types for convenience
export type { Body, Feature, Primitive, Transform, Sketch, SketchPlane }

// Selection types
export interface FaceSelection {
  bodyId: BodyId
  normal: [number, number, number]
  center: [number, number, number]
  triangleIndices: number[]
}

export interface EdgeSelection {
  bodyId: BodyId
  start: [number, number, number]
  end: [number, number, number]
  normal1: [number, number, number]
  normal2?: [number, number, number]
}

// Operation dialog state
export interface ExtrudeParams {
  height: number
  heightBackward: number
  draftAngle: number
}

export interface RevolveParams {
  angle: number
  segments: number
  axisStart?: [number, number]
  axisEnd?: [number, number]
}

export type OperationType = 'extrude' | 'cut' | 'revolve' | 'cut_revolve'

export interface OperationDialog {
  open: boolean
  type: OperationType
  sketchId?: ObjectId
  bodyId?: BodyId
  extrudeParams: ExtrudeParams
  revolveParams: RevolveParams
  editFeatureId?: ObjectId
}

// Sketch editing state
export interface SketchEditState {
  active: boolean
  bodyId?: BodyId
  featureId?: ObjectId
  tool: string | null
  selectedElementIndex: number | null
  drawingPoints: Array<{ x: number; y: number }>
  previewPoint: { x: number; y: number } | null
  snapSettings: {
    endpoint: boolean
    midpoint: boolean
    center: boolean
    quadrant: boolean
    grid: boolean
    gridSize: number
  }
}

// Fillet/Chamfer tool state
export interface Fillet3DState {
  active: boolean
  radius: number
  segments: number
  bodyId?: BodyId
  selectedEdges: EdgeSelection[]
}

export interface Chamfer3DState {
  active: boolean
  distance: number
  bodyId?: BodyId
  selectedEdges: EdgeSelection[]
}

// Main app state
interface AppState {
  // Scene (V2 Body-based model)
  scene: SceneDescriptionV2
  version: number

  // Selection
  selectedBodyIds: BodyId[]
  selectedFeatureId: ObjectId | null
  selectedFace: FaceSelection | null
  selectedEdges: EdgeSelection[]
  hoveredBodyId: BodyId | null

  // Undo/Redo
  undoStack: SceneDescriptionV2[]
  redoStack: SceneDescriptionV2[]

  // Tools
  operationDialog: OperationDialog
  sketchEdit: SketchEditState
  fillet3d: Fillet3DState
  chamfer3d: Chamfer3DState

  // Transform
  transformMode: 'translate' | 'rotate' | 'scale'
  transformEnabled: boolean

  // UI
  hiddenBodies: Set<string>

  // Actions - Scene
  addBody: (name?: string) => BodyId
  removeBody: (id: BodyId) => void
  addFeature: (bodyId: BodyId, feature: Feature) => void
  updateFeature: (bodyId: BodyId, featureId: ObjectId, updates: Partial<Feature>) => void
  removeFeature: (bodyId: BodyId, featureId: ObjectId) => void
  setScene: (scene: SceneDescriptionV2) => void
  clearScene: () => void

  // Actions - Selection
  selectBody: (id: BodyId, multi?: boolean) => void
  selectFeature: (id: ObjectId | null) => void
  selectFace: (face: FaceSelection | null) => void
  selectEdge: (edge: EdgeSelection, multi?: boolean) => void
  clearSelection: () => void
  setHovered: (id: BodyId | null) => void

  // Actions - Undo/Redo
  undo: () => void
  redo: () => void
  saveUndoState: () => void

  // Actions - Tools
  openOperationDialog: (type: OperationType, sketchId?: ObjectId, bodyId?: BodyId) => void
  closeOperationDialog: () => void
  updateExtrudeParams: (params: Partial<ExtrudeParams>) => void
  updateRevolveParams: (params: Partial<RevolveParams>) => void
  applyOperation: () => void

  // Actions - Sketch
  enterSketchEdit: (bodyId: BodyId, featureId: ObjectId) => void
  exitSketchEdit: () => void
  setSketchTool: (tool: string | null) => void
  addSketchElement: (element: Sketch['elements'][0]) => void
  updateSketchElement: (index: number, element: Sketch['elements'][0]) => void
  deleteSketchElement: (index: number) => void
  selectSketchElement: (index: number | null) => void

  // Actions - Fillet/Chamfer
  activateFillet3D: (bodyId?: BodyId) => void
  deactivateFillet3D: () => void
  updateFillet3DParams: (params: Partial<{ radius: number; segments: number }>) => void
  applyFillet3D: () => void
  activateChamfer3D: (bodyId?: BodyId) => void
  deactivateChamfer3D: () => void
  updateChamfer3DParams: (params: Partial<{ distance: number }>) => void
  applyChamfer3D: () => void

  // Actions - Transform
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void
  setTransformEnabled: (enabled: boolean) => void
  updateBodyTransform: (bodyId: BodyId, position: [number, number, number], rotation: [number, number, number], scale: [number, number, number]) => void

  // Actions - Visibility
  toggleBodyVisibility: (id: BodyId) => void

  // Helpers
  getBody: (id: BodyId) => Body | undefined
  getFeature: (bodyId: BodyId, featureId: ObjectId) => Feature | undefined
  getSketch: (bodyId: BodyId, featureId: ObjectId) => Sketch | undefined
}

let idCounter = 1
const generateId = (prefix = 'obj') => `${prefix}_${idCounter++}`

const defaultExtrudeParams: ExtrudeParams = {
  height: 10,
  heightBackward: 0,
  draftAngle: 0,
}

const defaultRevolveParams: RevolveParams = {
  angle: 360,
  segments: 32,
}

const defaultSketchEdit: SketchEditState = {
  active: false,
  tool: null,
  selectedElementIndex: null,
  drawingPoints: [],
  previewPoint: null,
  snapSettings: {
    endpoint: true,
    midpoint: true,
    center: true,
    quadrant: true,
    grid: true,
    gridSize: 1,
  },
}

const defaultFillet3D: Fillet3DState = {
  active: false,
  radius: 1,
  segments: 8,
  selectedEdges: [],
}

const defaultChamfer3D: Chamfer3DState = {
  active: false,
  distance: 1,
  selectedEdges: [],
}

export const useSceneStore = create<AppState>()((set, get) => ({
  // Initial state
  scene: { version: 2, bodies: [], body_operations: [] },
  version: 0,

  selectedBodyIds: [],
  selectedFeatureId: null,
  selectedFace: null,
  selectedEdges: [],
  hoveredBodyId: null,

  undoStack: [],
  redoStack: [],

  operationDialog: {
    open: false,
    type: 'extrude',
    extrudeParams: { ...defaultExtrudeParams },
    revolveParams: { ...defaultRevolveParams },
  },
  sketchEdit: { ...defaultSketchEdit },
  fillet3d: { ...defaultFillet3D },
  chamfer3d: { ...defaultChamfer3D },

  transformMode: 'translate',
  transformEnabled: true,

  hiddenBodies: new Set(),

  // Scene actions
  addBody: (name) => {
    const id = generateId('body')
    const bodyName = name || `Body ${get().scene.bodies.length + 1}`
    set(produce((state: AppState) => {
      state.scene.bodies.push({
        id,
        name: bodyName,
        features: [],
        visible: true,
      })
      state.version++
    }))
    get().saveUndoState()
    return id
  },

  removeBody: (id) => {
    get().saveUndoState()
    set(produce((state: AppState) => {
      state.scene.bodies = state.scene.bodies.filter((b) => b.id !== id)
      state.selectedBodyIds = state.selectedBodyIds.filter((bid) => bid !== id)
      state.version++
    }))
  },

  addFeature: (bodyId, feature) => {
    get().saveUndoState()
    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === bodyId)
      if (body) {
        body.features.push(feature)
        state.version++
      }
    }))
  },

  updateFeature: (bodyId, featureId, updates) => {
    get().saveUndoState()
    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === bodyId)
      if (body) {
        const feature = body.features.find((f) => f.id === featureId)
        if (feature) {
          Object.assign(feature, updates)
          state.version++
        }
      }
    }))
  },

  removeFeature: (bodyId, featureId) => {
    get().saveUndoState()
    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === bodyId)
      if (body) {
        body.features = body.features.filter((f) => f.id !== featureId)
        state.version++
      }
    }))
  },

  setScene: (scene) => {
    get().saveUndoState()
    set({ scene, version: get().version + 1 })
  },

  clearScene: () => {
    get().saveUndoState()
    set({
      scene: { version: 2, bodies: [], body_operations: [] },
      selectedBodyIds: [],
      selectedFeatureId: null,
      selectedFace: null,
      selectedEdges: [],
      version: get().version + 1,
    })
  },

  // Selection actions
  selectBody: (id, multi = false) => {
    set(produce((state: AppState) => {
      if (multi) {
        const idx = state.selectedBodyIds.indexOf(id)
        if (idx >= 0) {
          state.selectedBodyIds.splice(idx, 1)
        } else {
          state.selectedBodyIds.push(id)
        }
      } else {
        state.selectedBodyIds = [id]
      }
      state.selectedFeatureId = null
      state.selectedFace = null
      state.selectedEdges = []
    }))
  },

  selectFeature: (id) => {
    set({ selectedFeatureId: id })
  },

  selectFace: (face) => {
    set({ selectedFace: face, selectedEdges: [] })
  },

  selectEdge: (edge, multi = false) => {
    set(produce((state: AppState) => {
      // Determine which edge list to use based on active mode
      let targetEdges: EdgeSelection[]
      if (state.fillet3d.active) {
        targetEdges = state.fillet3d.selectedEdges
      } else if (state.chamfer3d.active) {
        targetEdges = state.chamfer3d.selectedEdges
      } else {
        targetEdges = state.selectedEdges
      }

      if (multi) {
        // Check if edge already selected (by comparing start/end)
        const idx = targetEdges.findIndex(
          (e) =>
            Math.abs(e.start[0] - edge.start[0]) < 0.001 &&
            Math.abs(e.start[1] - edge.start[1]) < 0.001 &&
            Math.abs(e.start[2] - edge.start[2]) < 0.001
        )
        if (idx >= 0) {
          targetEdges.splice(idx, 1)
        } else {
          targetEdges.push(edge)
        }
      } else {
        // Clear and add single edge
        targetEdges.length = 0
        targetEdges.push(edge)
      }
      state.selectedFace = null
    }))
  },

  clearSelection: () => {
    set({
      selectedBodyIds: [],
      selectedFeatureId: null,
      selectedFace: null,
      selectedEdges: [],
    })
  },

  setHovered: (id) => {
    set({ hoveredBodyId: id })
  },

  // Undo/Redo actions
  undo: () => {
    const { undoStack, scene, redoStack } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, scene],
      scene: prev,
      version: get().version + 1,
    })
  },

  redo: () => {
    const { redoStack, scene, undoStack } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, scene],
      scene: next,
      version: get().version + 1,
    })
  },

  saveUndoState: () => {
    const { scene, undoStack } = get()
    // Limit undo stack to 100 entries
    const newStack = [...undoStack, JSON.parse(JSON.stringify(scene))].slice(-100)
    set({ undoStack: newStack, redoStack: [] })
  },

  // Operation dialog actions
  openOperationDialog: (type, sketchId, bodyId) => {
    set({
      operationDialog: {
        open: true,
        type,
        sketchId,
        bodyId,
        extrudeParams: { ...defaultExtrudeParams },
        revolveParams: { ...defaultRevolveParams },
      },
    })
  },

  closeOperationDialog: () => {
    set(produce((state: AppState) => {
      state.operationDialog.open = false
    }))
  },

  updateExtrudeParams: (params) => {
    set(produce((state: AppState) => {
      Object.assign(state.operationDialog.extrudeParams, params)
    }))
  },

  updateRevolveParams: (params) => {
    set(produce((state: AppState) => {
      Object.assign(state.operationDialog.revolveParams, params)
    }))
  },

  applyOperation: () => {
    const { operationDialog, scene } = get()
    if (!operationDialog.sketchId || !operationDialog.bodyId) return

    const body = scene.bodies.find((b) => b.id === operationDialog.bodyId)
    if (!body) return

    get().saveUndoState()

    const featureId = generateId('feature')
    let feature: Feature

    switch (operationDialog.type) {
      case 'extrude':
        feature = {
          type: 'extrude',
          id: featureId,
          sketch_id: operationDialog.sketchId,
          height: operationDialog.extrudeParams.height,
          height_backward: operationDialog.extrudeParams.heightBackward,
          cut: false,
          draft_angle: operationDialog.extrudeParams.draftAngle,
        }
        break
      case 'cut':
        feature = {
          type: 'extrude',
          id: featureId,
          sketch_id: operationDialog.sketchId,
          height: operationDialog.extrudeParams.height,
          height_backward: operationDialog.extrudeParams.heightBackward,
          cut: true,
          draft_angle: operationDialog.extrudeParams.draftAngle,
        }
        break
      case 'revolve':
        feature = {
          type: 'revolve',
          id: featureId,
          sketch_id: operationDialog.sketchId,
          angle: operationDialog.revolveParams.angle,
          segments: operationDialog.revolveParams.segments,
          cut: false,
          axis_start: operationDialog.revolveParams.axisStart,
          axis_end: operationDialog.revolveParams.axisEnd,
        }
        break
      case 'cut_revolve':
        feature = {
          type: 'revolve',
          id: featureId,
          sketch_id: operationDialog.sketchId,
          angle: operationDialog.revolveParams.angle,
          segments: operationDialog.revolveParams.segments,
          cut: true,
          axis_start: operationDialog.revolveParams.axisStart,
          axis_end: operationDialog.revolveParams.axisEnd,
        }
        break
      default:
        return
    }

    set(produce((state: AppState) => {
      const b = state.scene.bodies.find((bod) => bod.id === operationDialog.bodyId)
      if (b) {
        b.features.push(feature)
        state.version++
      }
      state.operationDialog.open = false
    }))
  },

  // Sketch editing actions
  enterSketchEdit: (bodyId, featureId) => {
    set({
      sketchEdit: {
        ...defaultSketchEdit,
        active: true,
        bodyId,
        featureId,
      },
      selectedBodyIds: [bodyId],
      selectedFeatureId: featureId,
    })
  },

  exitSketchEdit: () => {
    set({ sketchEdit: { ...defaultSketchEdit } })
  },

  setSketchTool: (tool) => {
    set(produce((state: AppState) => {
      state.sketchEdit.tool = tool
      state.sketchEdit.drawingPoints = []
      state.sketchEdit.previewPoint = null
      state.sketchEdit.selectedElementIndex = null
    }))
  },

  addSketchElement: (element) => {
    const { sketchEdit } = get()
    if (!sketchEdit.active || !sketchEdit.bodyId || !sketchEdit.featureId) return

    get().saveUndoState()

    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === sketchEdit.bodyId)
      if (!body) return
      const feature = body.features.find((f) => f.id === sketchEdit.featureId)
      if (!feature) return

      let sketch: Sketch | null = null
      if (feature.type === 'sketch') {
        sketch = feature.sketch
      } else if (feature.type === 'base_extrude' || feature.type === 'base_revolve') {
        sketch = feature.sketch
      }

      if (sketch) {
        sketch.elements.push(element)
        state.version++
      }
    }))
  },

  updateSketchElement: (index, element) => {
    const { sketchEdit } = get()
    if (!sketchEdit.active || !sketchEdit.bodyId || !sketchEdit.featureId) return

    get().saveUndoState()

    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === sketchEdit.bodyId)
      if (!body) return
      const feature = body.features.find((f) => f.id === sketchEdit.featureId)
      if (!feature) return

      let sketch: Sketch | null = null
      if (feature.type === 'sketch') {
        sketch = feature.sketch
      } else if (feature.type === 'base_extrude' || feature.type === 'base_revolve') {
        sketch = feature.sketch
      }

      if (sketch && sketch.elements[index]) {
        sketch.elements[index] = element
        state.version++
      }
    }))
  },

  deleteSketchElement: (index) => {
    const { sketchEdit } = get()
    if (!sketchEdit.active || !sketchEdit.bodyId || !sketchEdit.featureId) return

    get().saveUndoState()

    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === sketchEdit.bodyId)
      if (!body) return
      const feature = body.features.find((f) => f.id === sketchEdit.featureId)
      if (!feature) return

      let sketch: Sketch | null = null
      if (feature.type === 'sketch') {
        sketch = feature.sketch
      } else if (feature.type === 'base_extrude' || feature.type === 'base_revolve') {
        sketch = feature.sketch
      }

      if (sketch) {
        sketch.elements.splice(index, 1)
        if (sketch.construction) {
          sketch.construction.splice(index, 1)
        }
        state.sketchEdit.selectedElementIndex = null
        state.version++
      }
    }))
  },

  selectSketchElement: (index) => {
    set(produce((state: AppState) => {
      state.sketchEdit.selectedElementIndex = index
    }))
  },

  // Fillet/Chamfer actions
  activateFillet3D: (bodyId) => {
    set({
      fillet3d: {
        ...defaultFillet3D,
        active: true,
        bodyId,
        selectedEdges: [],
      },
      chamfer3d: { ...defaultChamfer3D },
    })
  },

  deactivateFillet3D: () => {
    set({ fillet3d: { ...defaultFillet3D } })
  },

  updateFillet3DParams: (params) => {
    set(produce((state: AppState) => {
      Object.assign(state.fillet3d, params)
    }))
  },

  applyFillet3D: () => {
    const { fillet3d } = get()
    if (!fillet3d.bodyId || fillet3d.selectedEdges.length === 0) return

    get().saveUndoState()

    const featureId = generateId('fillet')
    const feature: Feature = {
      type: 'fillet_3d',
      id: featureId,
      radius: fillet3d.radius,
      segments: fillet3d.segments,
      edges: fillet3d.selectedEdges.map((e) => [
        e.start,
        e.end,
        e.normal1,
        e.normal2 || null,
      ]),
    }

    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === fillet3d.bodyId)
      if (body) {
        body.features.push(feature)
        state.version++
      }
      state.fillet3d = { ...defaultFillet3D }
    }))
  },

  activateChamfer3D: (bodyId) => {
    set({
      chamfer3d: {
        ...defaultChamfer3D,
        active: true,
        bodyId,
        selectedEdges: [],
      },
      fillet3d: { ...defaultFillet3D },
    })
  },

  deactivateChamfer3D: () => {
    set({ chamfer3d: { ...defaultChamfer3D } })
  },

  updateChamfer3DParams: (params) => {
    set(produce((state: AppState) => {
      Object.assign(state.chamfer3d, params)
    }))
  },

  applyChamfer3D: () => {
    const { chamfer3d } = get()
    if (!chamfer3d.bodyId || chamfer3d.selectedEdges.length === 0) return

    get().saveUndoState()

    const featureId = generateId('chamfer')
    const feature: Feature = {
      type: 'chamfer_3d',
      id: featureId,
      distance: chamfer3d.distance,
      edges: chamfer3d.selectedEdges.map((e) => [
        e.start,
        e.end,
        e.normal1,
        e.normal2 || null,
      ]),
    }

    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === chamfer3d.bodyId)
      if (body) {
        body.features.push(feature)
        state.version++
      }
      state.chamfer3d = { ...defaultChamfer3D }
    }))
  },

  // Transform actions
  setTransformMode: (mode) => {
    set({ transformMode: mode })
  },

  setTransformEnabled: (enabled) => {
    set({ transformEnabled: enabled })
  },

  updateBodyTransform: (bodyId, position, rotation, scale) => {
    set(produce((state: AppState) => {
      const body = state.scene.bodies.find((b) => b.id === bodyId)
      if (!body) return

      // Find base primitive feature and update its transform
      const baseFeature = body.features.find((f) => f.type === 'base_primitive')
      if (baseFeature && baseFeature.type === 'base_primitive') {
        baseFeature.transform = { position, rotation, scale }
        state.version++
      }
    }))
  },

  // Visibility actions
  toggleBodyVisibility: (id) => {
    set(produce((state: AppState) => {
      if (state.hiddenBodies.has(id)) {
        state.hiddenBodies.delete(id)
      } else {
        state.hiddenBodies.add(id)
      }
    }))
  },

  // Helper methods
  getBody: (id) => {
    return get().scene.bodies.find((b) => b.id === id)
  },

  getFeature: (bodyId, featureId) => {
    const body = get().scene.bodies.find((b) => b.id === bodyId)
    return body?.features.find((f) => f.id === featureId)
  },

  getSketch: (bodyId, featureId) => {
    const feature = get().getFeature(bodyId, featureId)
    if (!feature) return undefined
    if (feature.type === 'sketch') return feature.sketch
    if (feature.type === 'base_extrude' || feature.type === 'base_revolve') {
      return feature.sketch
    }
    return undefined
  },
}))

// Convenience hooks
export const useSelectedBody = () => {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedIds = useSceneStore((s) => s.selectedBodyIds)
  if (selectedIds.length !== 1) return null
  return bodies.find((b) => b.id === selectedIds[0]) || null
}

export const useSelectedFeature = () => {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const selectedFeatureId = useSceneStore((s) => s.selectedFeatureId)
  if (selectedBodyIds.length !== 1 || !selectedFeatureId) return null
  const body = bodies.find((b) => b.id === selectedBodyIds[0])
  return body?.features.find((f) => f.id === selectedFeatureId) || null
}

// Primitive creation helpers
export const createPrimitiveBody = {
  cube: (size = 1): Omit<Body, 'id'> => ({
    name: 'Cube',
    features: [{
      type: 'base_primitive',
      id: generateId('cube'),
      primitive: { type: 'cube', width: size, height: size, depth: size },
      transform: defaultTransform(),
    }],
    visible: true,
  }),

  cylinder: (radius = 0.5, height = 1): Omit<Body, 'id'> => ({
    name: 'Cylinder',
    features: [{
      type: 'base_primitive',
      id: generateId('cylinder'),
      primitive: { type: 'cylinder', radius, height },
      transform: defaultTransform(),
    }],
    visible: true,
  }),

  sphere: (radius = 0.5): Omit<Body, 'id'> => ({
    name: 'Sphere',
    features: [{
      type: 'base_primitive',
      id: generateId('sphere'),
      primitive: { type: 'sphere', radius },
      transform: defaultTransform(),
    }],
    visible: true,
  }),

  cone: (radius = 0.5, height = 1): Omit<Body, 'id'> => ({
    name: 'Cone',
    features: [{
      type: 'base_primitive',
      id: generateId('cone'),
      primitive: { type: 'cone', radius, height },
      transform: defaultTransform(),
    }],
    visible: true,
  }),
}
