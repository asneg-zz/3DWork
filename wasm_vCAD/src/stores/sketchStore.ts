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

  // Construction geometry flags (parallel to elements)
  construction: boolean[]
  revolveAxis: number | null    // Index of element marked as revolve axis
  symmetryAxis: number | null   // Index of element marked as mirror/symmetry axis

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

  // Grid settings
  gridSize: number
  snapToGrid: boolean

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
  loadSketch: (bodyId: string, sketchId: string, plane: SketchPlane, elements: SketchElement[], planeOffset?: number) => void
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

  // Grid
  snapPoint: (point: Point2D) => Point2D

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
}

interface HistoryState {
  elements: SketchElement[]
  construction: boolean[]
  constraints: SketchConstraint[]
  revolveAxis: number | null
  symmetryAxis: number | null
}

export const useSketchStore = create<SketchState>()(
  immer((set, get) => {
    let history: HistoryState[] = []
    let historyIndex = -1

    const saveHistory = () => {
      const state = get()
      const snapshot = {
        elements: [...state.elements],
        construction: [...state.construction],
        constraints: [...state.constraints],
        revolveAxis: state.revolveAxis,
        symmetryAxis: state.symmetryAxis,
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
      construction: [],
      revolveAxis: null,
      symmetryAxis: null,
      constraints: [],
      tool: null,
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      arcMidPoint: null,
      polylinePoints: [],
      gridSize: 0.5,
      snapToGrid: true,
      snapSettings: {
        enabled: true,
        endpoint: true,
        midpoint: true,
        center: true,
        quadrant: true,
        grid: true,
        gridSize: 0.5,
        snapRadius: 0.5,
      },
      currentSnapPoint: null,
      zoom: 50,
      panX: 0,
      panY: 0,
      selectedElementIds: [],

    startSketch: (bodyId, sketchId, plane, planeOffset = 0, faceCoordSystem = null) =>
      set((state) => {
        state.active = true
        state.bodyId = bodyId
        state.sketchId = sketchId
        state.plane = plane
        state.planeOffset = planeOffset
        state.faceCoordSystem = faceCoordSystem
        state.elements = []
        state.construction = []
        state.revolveAxis = null
        state.symmetryAxis = null
        state.tool = 'select'
        state.zoom = 50
        state.panX = 0
        state.panY = 0
        state.selectedElementIds = []
        history = []
        historyIndex = -1
      }),

    loadSketch: (bodyId, sketchId, plane, elements, planeOffset = 0) =>
      set((state) => {
        state.active = true
        state.bodyId = bodyId
        state.sketchId = sketchId
        state.plane = plane
        state.planeOffset = planeOffset
        state.elements = [...elements]
        state.construction = []  // Will be loaded from sketch data if available
        state.revolveAxis = null
        state.symmetryAxis = null
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
        state.construction = []
        state.revolveAxis = null
        state.symmetryAxis = null
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
        const snapped = state.snapToGrid ? get().snapPoint(point) : point
        state.isDrawing = true
        state.startPoint = snapped
        state.currentPoint = snapped
        state.arcMidPoint = null  // Reset for new arc
      }),

    updateDrawing: (point) =>
      set((state) => {
        if (!state.isDrawing) return
        const snapped = state.snapToGrid ? get().snapPoint(point) : point
        state.currentPoint = snapped
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
        const snapped = state.snapToGrid ? get().snapPoint(point) : point

        if (state.polylinePoints.length === 0) {
          // First point
          state.isDrawing = true
          state.polylinePoints.push(snapped)
          state.startPoint = snapped
          state.currentPoint = snapped
        } else {
          // Add additional point
          state.polylinePoints.push(snapped)
          state.currentPoint = snapped
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

    snapPoint: (point) => {
      const { gridSize } = get()
      return {
        x: Math.round(point.x / gridSize) * gridSize,
        y: Math.round(point.y / gridSize) * gridSize,
      }
    },

    // Undo/Redo
    undo: () =>
      set((state) => {
        if (historyIndex > 0) {
          historyIndex--
          const snapshot = history[historyIndex]
          state.elements = [...snapshot.elements]
          state.construction = [...snapshot.construction]
          state.constraints = [...snapshot.constraints]
          state.revolveAxis = snapshot.revolveAxis
          state.symmetryAxis = snapshot.symmetryAxis
          state.selectedElementIds = []
        }
      }),

    redo: () =>
      set((state) => {
        if (historyIndex < history.length - 1) {
          historyIndex++
          const snapshot = history[historyIndex]
          state.elements = [...snapshot.elements]
          state.construction = [...snapshot.construction]
          state.constraints = [...snapshot.constraints]
          state.revolveAxis = snapshot.revolveAxis
          state.symmetryAxis = snapshot.symmetryAxis
          state.selectedElementIds = []
        }
      }),

    saveToHistory: () => {
      saveHistory()
    },

    // Construction geometry
    toggleConstruction: (elementId) =>
      set((state) => {
        const index = state.elements.findIndex(el => el.id === elementId)
        if (index === -1) return

        // Extend construction array if needed
        while (state.construction.length <= index) {
          state.construction.push(false)
        }

        // Toggle the flag
        state.construction[index] = !state.construction[index]
        saveHistory()
      }),

    isConstruction: (elementId) => {
      const state = get()
      const index = state.elements.findIndex(el => el.id === elementId)
      if (index === -1) return false
      return state.construction[index] || false
    },

    setSymmetryAxis: (elementId) =>
      set((state) => {
        const index = state.elements.findIndex(el => el.id === elementId)
        if (index === -1) return

        const element = state.elements[index]
        // Only lines can be symmetry axis
        if (element.type !== 'line') return

        // Toggle: if already set, clear it
        if (state.symmetryAxis === index) {
          state.symmetryAxis = null
        } else {
          state.symmetryAxis = index
        }
        saveHistory()
      }),

    clearSymmetryAxis: () =>
      set((state) => {
        state.symmetryAxis = null
      }),

    isSymmetryAxis: (elementId) => {
      const state = get()
      const index = state.elements.findIndex(el => el.id === elementId)
      if (index === -1) return false
      return state.symmetryAxis === index
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
    }
  })
)
