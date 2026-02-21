import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { SketchElement, Point2D, SketchPlane, SnapSettings, SnapPoint, SketchConstraint, FaceCoordSystem } from '@/types/scene'
import { engine } from '@/wasm/engine'

interface SketchState {
  // Sketch mode active
  active: boolean

  // Current sketch being edited
  sketchId: string | null
  bodyId: string | null

  // Plane type and offset
  plane: SketchPlane
  planeOffset: number           // Offset along plane normal (axis-aligned planes)
  faceCoordSystem: FaceCoordSystem | null  // Set for inclined / arbitrary faces

  // Elements in current sketch
  elements: SketchElement[]

  // Construction geometry (by element ID)
  constructionIds: string[]
  revolveAxisId: string | null    // ID of element marked as revolve axis
  symmetryAxisId: string | null   // ID of element marked as mirror/symmetry axis

  // Constraints
  constraints: SketchConstraint[]

  // Current tool
  tool: 'select' | 'line' | 'circle' | 'rectangle' | 'arc' | 'polyline' | 'spline' | 'trim' | 'fillet' | 'offset' | 'mirror' | 'dimension' | null

  // Drawing state
  isDrawing: boolean
  startPoint: Point2D | null
  currentPoint: Point2D | null
  arcMidPoint: Point2D | null  // For 3-point arc
  polylinePoints: Point2D[]  // For polyline/spline

  // Snap settings
  snapSettings: SnapSettings
  currentSnapPoint: SnapPoint | null

  // Camera/Viewport settings
  zoom: number
  panX: number
  panY: number

  // Selection
  selectedElementIds: string[]

  // Actions
  startSketch: (bodyId: string, sketchId: string, plane: SketchPlane, planeOffset?: number, faceCoordSystem?: FaceCoordSystem | null) => void
  loadSketch: (bodyId: string, sketchId: string, plane: SketchPlane, elements: SketchElement[], planeOffset?: number, faceCoordSystem?: FaceCoordSystem | null, constructionIds?: string[], constraints?: SketchConstraint[]) => void
  exitSketch: () => void
  setTool: (tool: SketchState['tool']) => void

  // Drawing actions
  startDrawing: (point: Point2D) => void
  updateDrawing: (point: Point2D) => void
  finishDrawing: () => void
  cancelDrawing: () => void
  addPolylinePoint: (point: Point2D) => void  // Add point to polyline/spline
  finishPolyline: () => void  // Finish polyline/spline drawing

  // Element management
  addElement: (element: SketchElement) => void
  removeElement: (elementId: string) => void
  clearElements: () => void
  setElements: (elements: SketchElement[], preserveSelection?: boolean) => void

  // Selection
  selectElement: (elementId: string) => void
  deselectElement: (elementId: string) => void
  clearSelection: () => void
  toggleElementSelection: (elementId: string) => void
  deleteSelected: () => void

  // Camera
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  resetView: () => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  saveToHistory: () => void

  // Construction geometry
  toggleConstruction: (elementId: string) => void
  isConstruction: (elementId: string) => boolean
  setSymmetryAxis: (elementId: string) => void
  clearSymmetryAxis: () => void
  isSymmetryAxis: (elementId: string) => boolean

  // Constraints
  addConstraint: (constraint: SketchConstraint) => void
  removeConstraint: (index: number) => void
  clearConstraints: () => void
  getElementConstraints: (elementId: string) => SketchConstraint[]

  // Snap settings
  setSnapSetting: <K extends keyof SnapSettings>(key: K, value: SnapSettings[K]) => void
  toggleSnapEnabled: () => void
}

interface HistoryState {
  elements: SketchElement[]
  constructionIds: string[]
  constraints: SketchConstraint[]
  revolveAxisId: string | null
  symmetryAxisId: string | null
}

export const useSketchStore = create<SketchState>()(
  immer((set, get) => {
    let history: HistoryState[] = []
    let historyIndex = -1

    const saveHistory = () => {
      const state = get()
      const snapshot = {
        elements: [...state.elements],
        constructionIds: [...state.constructionIds],
        constraints: [...state.constraints],
        revolveAxisId: state.revolveAxisId,
        symmetryAxisId: state.symmetryAxisId,
      }

      // Remove any future history
      history = history.slice(0, historyIndex + 1)

      // Add new state
      history.push(snapshot)
      historyIndex = history.length - 1

      // Limit history to 50 states
      if (history.length > 50) {
        history.shift()
        historyIndex--
      }
    }

    return {
      active: false,
      sketchId: null,
      bodyId: null,
      plane: 'XY',
      planeOffset: 0,
      faceCoordSystem: null,
      elements: [],
      constructionIds: [],
      revolveAxisId: null,
      symmetryAxisId: null,
      constraints: [],
      tool: null,
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      arcMidPoint: null,
      polylinePoints: [],
      snapSettings: {
        enabled: true,
        endpoint: true,
        midpoint: true,
        center: true,
        quadrant: true,
        snapRadius: 0.5,
      },
      currentSnapPoint: null,
      zoom: 50,
      panX: 0,
      panY: 0,
      selectedElementIds: [],

    startSketch: (bodyId, sketchId, plane, planeOffset = 0, faceCoordSystem = null) =>
      set((state) => {
        // faceCoordSystem.origin always contains the correct face center position.
        // For axis-aligned planes planePosition/sketchToWorld only use planeOffset,
        // so derive it from fcs.origin when available.
        let effectivePlaneOffset = planeOffset
        if (faceCoordSystem && plane !== 'CUSTOM') {
          switch (plane) {
            case 'XY': effectivePlaneOffset = faceCoordSystem.origin[2]; break
            case 'XZ': effectivePlaneOffset = faceCoordSystem.origin[1]; break
            case 'YZ': effectivePlaneOffset = faceCoordSystem.origin[0]; break
          }
        }
        state.active = true
        state.bodyId = bodyId
        state.sketchId = sketchId
        state.plane = plane
        state.planeOffset = effectivePlaneOffset
        state.faceCoordSystem = faceCoordSystem
        state.elements = []
        state.constructionIds = []
        state.revolveAxisId = null
        state.symmetryAxisId = null
        state.tool = 'select'
        state.zoom = 50
        state.panX = 0
        state.panY = 0
        state.selectedElementIds = []
        history = []
        historyIndex = -1
      }),

    loadSketch: (bodyId, sketchId, plane, elements, planeOffset = 0, faceCoordSystem = null, constructionIds = [], constraints = []) =>
      set((state) => {
        state.active = true
        state.bodyId = bodyId
        state.sketchId = sketchId
        state.plane = plane
        state.planeOffset = planeOffset
        state.faceCoordSystem = faceCoordSystem
        state.elements = [...elements]
        state.constructionIds = [...constructionIds]
        state.constraints = [...constraints]
        state.revolveAxisId = null
        state.symmetryAxisId = null
        state.tool = 'select'
        state.zoom = 50
        state.panX = 0
        state.panY = 0
        state.selectedElementIds = []
        history = []
        historyIndex = -1
        // Save initial state to history
        saveHistory()
      }),

    exitSketch: () =>
      set((state) => {
        state.active = false
        state.bodyId = null
        state.sketchId = null
        state.faceCoordSystem = null
        state.elements = []
        state.constructionIds = []
        state.revolveAxisId = null
        state.symmetryAxisId = null
        state.tool = null
        state.isDrawing = false
        state.startPoint = null
        state.currentPoint = null
      }),

    setTool: (tool) =>
      set((state) => {
        state.tool = tool
        state.isDrawing = false
        state.startPoint = null
        state.currentPoint = null
        state.arcMidPoint = null
      }),

    startDrawing: (point) =>
      set((state) => {
        // Point already snapped by useSnapPoints hook in 3D mode
        state.isDrawing = true
        state.startPoint = point
        state.currentPoint = point
        state.arcMidPoint = null  // Reset for new arc
      }),

    updateDrawing: (point) =>
      set((state) => {
        if (!state.isDrawing) return
        // Point already snapped by useSnapPoints hook in 3D mode
        state.currentPoint = point
      }),

    finishDrawing: () =>
      set((state) => {
        if (!state.isDrawing || !state.startPoint || !state.currentPoint) return

        const { tool, startPoint, currentPoint } = state

        let element: SketchElement | null = null

        switch (tool) {
          case 'line':
            element = {
              id: crypto.randomUUID(),
              type: 'line',
              start: startPoint,
              end: currentPoint,
            }
            break

          case 'circle': {
            const dx = currentPoint.x - startPoint.x
            const dy = currentPoint.y - startPoint.y
            const radius = Math.sqrt(dx * dx + dy * dy)
            element = {
              id: crypto.randomUUID(),
              type: 'circle',
              center: startPoint,
              radius,
            }
            break
          }

          case 'rectangle': {
            const width = Math.abs(currentPoint.x - startPoint.x)
            const height = Math.abs(currentPoint.y - startPoint.y)
            const corner = {
              x: Math.min(startPoint.x, currentPoint.x),
              y: Math.min(startPoint.y, currentPoint.y),
            }
            element = {
              id: crypto.randomUUID(),
              type: 'rectangle',
              corner,
              width,
              height,
            }
            break
          }

          case 'arc': {
            // Arc needs 3 points: start, mid (through), end
            if (!state.arcMidPoint) {
              // First click: set mid point, continue drawing
              state.arcMidPoint = currentPoint
              return // Don't finish yet
            } else {
              // Second click: create arc from start -> mid -> end
              const p1 = startPoint
              const p2 = state.arcMidPoint
              const p3 = currentPoint

              // ARCHITECTURE: Calculate arc using WASM (no geometric calculations in TS)
              try {
                const arcParams = engine.calculateArcFrom3Points(
                  p1.x, p1.y,
                  p2.x, p2.y,
                  p3.x, p3.y
                )

                if (arcParams.valid && arcParams.radius > 0.001) {
                  element = {
                    id: crypto.randomUUID(),
                    type: 'arc',
                    center: { x: arcParams.center_x, y: arcParams.center_y },
                    radius: arcParams.radius,
                    start_angle: arcParams.start_angle,
                    end_angle: arcParams.end_angle,
                  }
                }
              } catch (error) {
                console.error('Arc calculation failed:', error)
              }
            }
            break
          }

          case 'dimension': {
            // Dimension: from -> to (2 clicks)
            const dx = currentPoint.x - startPoint.x
            const dy = currentPoint.y - startPoint.y
            const distance = Math.sqrt(dx * dx + dy * dy)

            // Calculate automatic dimension line position (perpendicular offset)
            const len = Math.sqrt(dx * dx + dy * dy)
            const perpX = len > 0.0001 ? -dy / len : 0
            const perpY = len > 0.0001 ? dx / len : 1
            const offset = 0.5 // offset in world units

            const midX = (startPoint.x + currentPoint.x) / 2
            const midY = (startPoint.y + currentPoint.y) / 2

            element = {
              id: crypto.randomUUID(),
              type: 'dimension',
              from: startPoint,
              to: currentPoint,
              value: distance,
              dimension_type: 'linear',
              dimension_line_pos: {
                x: midX + perpX * offset,
                y: midY + perpY * offset
              }
            }
            break
          }
        }

        if (element) {
          state.elements.push(element)
          saveHistory()

          // Auto-select dimension element and switch to select tool for immediate editing
          if (tool === 'dimension') {
            state.selectedElementIds = [element.id]
            state.tool = 'select'
          }
        }

        state.isDrawing = false
        state.startPoint = null
        state.currentPoint = null
        state.arcMidPoint = null
      }),

    cancelDrawing: () =>
      set((state) => {
        state.isDrawing = false
        state.startPoint = null
        state.currentPoint = null
        state.polylinePoints = []
        state.arcMidPoint = null
      }),

    // Polyline/Spline specific
    addPolylinePoint: (point) =>
      set((state) => {
        // Point already snapped by useSnapPoints hook in 3D mode
        if (state.polylinePoints.length === 0) {
          // First point
          state.isDrawing = true
          state.polylinePoints.push(point)
          state.startPoint = point
          state.currentPoint = point
        } else {
          // Add additional point
          state.polylinePoints.push(point)
          state.currentPoint = point
        }
      }),

    finishPolyline: () =>
      set((state) => {
        if (state.polylinePoints.length < 2) {
          // Need at least 2 points
          state.isDrawing = false
          state.polylinePoints = []
          return
        }

        const element: SketchElement = {
          id: crypto.randomUUID(),
          type: state.tool === 'spline' ? 'spline' : 'polyline',
          points: [...state.polylinePoints],
        }

        state.elements.push(element)
        state.isDrawing = false
        state.polylinePoints = []
        state.startPoint = null
        state.currentPoint = null
        saveHistory()
      }),

    addElement: (element) =>
      set((state) => {
        state.elements.push(element)
        saveHistory()
      }),

    removeElement: (elementId) =>
      set((state) => {
        state.elements = state.elements.filter((e) => e.id !== elementId)
        state.selectedElementIds = state.selectedElementIds.filter((id) => id !== elementId)
        saveHistory()
      }),

    clearElements: () =>
      set((state) => {
        state.elements = []
        state.selectedElementIds = []
        saveHistory()
      }),

    setElements: (elements, preserveSelection = false) =>
      set((state) => {
        const newElementIds = new Set(elements.map(el => el.id))
        const newLength = elements.length

        // Remove construction IDs for elements that no longer exist
        state.constructionIds = state.constructionIds.filter(id => newElementIds.has(id))

        // Reset symmetry axis if element no longer exists
        if (state.symmetryAxisId !== null && !newElementIds.has(state.symmetryAxisId)) {
          state.symmetryAxisId = null
        }

        // Reset revolve axis if element no longer exists
        if (state.revolveAxisId !== null && !newElementIds.has(state.revolveAxisId)) {
          state.revolveAxisId = null
        }

        // Filter constraints that reference non-existent elements (still index-based for WASM)
        state.constraints = state.constraints.filter(c => {
          switch (c.type) {
            case 'horizontal':
            case 'vertical':
            case 'fixed':
              return c.element < newLength
            case 'parallel':
            case 'perpendicular':
            case 'equal':
            case 'tangent':
            case 'concentric':
              return c.element1 < newLength && c.element2 < newLength
            case 'symmetric':
              return c.element1 < newLength && c.element2 < newLength && c.axis < newLength
            case 'coincident':
              return c.point1.element_index < newLength && c.point2.element_index < newLength
            default:
              return true
          }
        })

        state.elements = elements

        if (!preserveSelection) {
          state.selectedElementIds = []
          saveHistory()
        }
        // When preserving selection, caller should save history
      }),

    // Selection
    selectElement: (elementId) =>
      set((state) => {
        if (!state.selectedElementIds.includes(elementId)) {
          state.selectedElementIds.push(elementId)
        }
      }),

    deselectElement: (elementId) =>
      set((state) => {
        state.selectedElementIds = state.selectedElementIds.filter((id) => id !== elementId)
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedElementIds = []
      }),

    toggleElementSelection: (elementId) =>
      set((state) => {
        const index = state.selectedElementIds.indexOf(elementId)
        if (index >= 0) {
          state.selectedElementIds.splice(index, 1)
        } else {
          state.selectedElementIds.push(elementId)
        }
      }),

    deleteSelected: () =>
      set((state) => {
        state.elements = state.elements.filter(
          (e) => !state.selectedElementIds.includes(e.id)
        )
        state.selectedElementIds = []
        saveHistory()
      }),

    // Camera
    setZoom: (zoom) =>
      set((state) => {
        state.zoom = Math.max(10, Math.min(200, zoom))
      }),

    setPan: (x, y) =>
      set((state) => {
        state.panX = x
        state.panY = y
      }),

    resetView: () =>
      set((state) => {
        state.zoom = 50
        state.panX = 0
        state.panY = 0
      }),

    // Undo/Redo
    undo: () =>
      set((state) => {
        if (historyIndex > 0) {
          historyIndex--
          const snapshot = history[historyIndex]
          state.elements = [...snapshot.elements]
          state.constructionIds = [...snapshot.constructionIds]
          state.constraints = [...snapshot.constraints]
          state.revolveAxisId = snapshot.revolveAxisId
          state.symmetryAxisId = snapshot.symmetryAxisId
          state.selectedElementIds = []
        }
      }),

    redo: () =>
      set((state) => {
        if (historyIndex < history.length - 1) {
          historyIndex++
          const snapshot = history[historyIndex]
          state.elements = [...snapshot.elements]
          state.constructionIds = [...snapshot.constructionIds]
          state.constraints = [...snapshot.constraints]
          state.revolveAxisId = snapshot.revolveAxisId
          state.symmetryAxisId = snapshot.symmetryAxisId
          state.selectedElementIds = []
        }
      }),

    saveToHistory: () => {
      saveHistory()
    },

    // Construction geometry
    toggleConstruction: (elementId) =>
      set((state) => {
        // Verify element exists
        const exists = state.elements.some(el => el.id === elementId)
        if (!exists) return

        // Toggle the flag
        const idx = state.constructionIds.indexOf(elementId)
        if (idx >= 0) {
          state.constructionIds.splice(idx, 1)
        } else {
          state.constructionIds.push(elementId)
        }
        saveHistory()
      }),

    isConstruction: (elementId) => {
      const state = get()
      return state.constructionIds.includes(elementId)
    },

    setSymmetryAxis: (elementId) =>
      set((state) => {
        const element = state.elements.find(el => el.id === elementId)
        if (!element) return

        // Only lines can be symmetry axis
        if (element.type !== 'line') return

        // Toggle: if already set, clear it
        if (state.symmetryAxisId === elementId) {
          state.symmetryAxisId = null
        } else {
          state.symmetryAxisId = elementId
        }
        saveHistory()
      }),

    clearSymmetryAxis: () =>
      set((state) => {
        state.symmetryAxisId = null
      }),

    isSymmetryAxis: (elementId) => {
      const state = get()
      return state.symmetryAxisId === elementId
    },

    // Constraints
    addConstraint: (constraint) =>
      set((state) => {
        state.constraints.push(constraint)
        saveHistory()
      }),

    removeConstraint: (index) =>
      set((state) => {
        if (index >= 0 && index < state.constraints.length) {
          state.constraints.splice(index, 1)
        }
        saveHistory()
      }),

    clearConstraints: () =>
      set((state) => {
        state.constraints = []
      }),

    getElementConstraints: (elementId) => {
      const state = get()
      const elementIndex = state.elements.findIndex(el => el.id === elementId)
      if (elementIndex === -1) return []

      return state.constraints.filter(c => {
        switch (c.type) {
          case 'horizontal':
          case 'vertical':
          case 'fixed':
            return c.element === elementIndex
          case 'parallel':
          case 'perpendicular':
          case 'equal':
          case 'tangent':
          case 'concentric':
            return c.element1 === elementIndex || c.element2 === elementIndex
          case 'symmetric':
            return c.element1 === elementIndex || c.element2 === elementIndex || c.axis === elementIndex
          case 'coincident':
            return c.point1.element_index === elementIndex || c.point2.element_index === elementIndex
          default:
            return false
        }
      })
    },

    // Snap settings
    setSnapSetting: (key, value) =>
      set((state) => {
        state.snapSettings[key] = value
      }),

    toggleSnapEnabled: () =>
      set((state) => {
        state.snapSettings.enabled = !state.snapSettings.enabled
      }),
    }
  })
)
