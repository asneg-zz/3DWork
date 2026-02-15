import { useEffect, useRef, useState } from 'react'
import { useSketchStore } from '@/stores/sketchStore'
import type { Point2D, SketchElement, SnapPoint } from '@/types/scene'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { OffsetDialog } from '@/components/dialogs/OffsetDialog'
import { MirrorDialog } from '@/components/dialogs/MirrorDialog'
import { LinearPatternDialog } from '@/components/dialogs/LinearPatternDialog'
import { CircularPatternDialog } from '@/components/dialogs/CircularPatternDialog'
import { drawElement, drawElementControlPoints } from './sketchRendering'
import {
  screenToWorld as screenToWorldUtil,
  findElementAtPoint as findElementUtil,
  duplicateElement,
  getElementControlPoints,
  hitTestControlPoints,
  updateElementPoint
} from './sketchUtils'
import * as SketchOps from './sketchOperations'
import { getContextMenuItems, type ContextMenuCallbacks } from './sketchContextMenu'
import { getToolsContextMenuItems, type ToolsContextMenuCallbacks } from './sketchToolsContextMenu'
import { engine } from '@/wasm/engine'

interface SketchCanvasProps {
  width: number
  height: number
}

export function SketchCanvas({ width, height }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const {
    elements,
    construction,
    symmetryAxis,
    isDrawing,
    startPoint,
    currentPoint,
    arcMidPoint,
    polylinePoints,
    tool,
    gridSize,
    snapToGrid,
    zoom,
    panX,
    panY,
    selectedElementIds,
  } = useSketchStore()

  const startDrawing = useSketchStore((s) => s.startDrawing)
  const updateDrawing = useSketchStore((s) => s.updateDrawing)
  const finishDrawing = useSketchStore((s) => s.finishDrawing)
  const addPolylinePoint = useSketchStore((s) => s.addPolylinePoint)
  const finishPolyline = useSketchStore((s) => s.finishPolyline)
  const cancelDrawing = useSketchStore((s) => s.cancelDrawing)
  const setZoom = useSketchStore((s) => s.setZoom)
  const setPan = useSketchStore((s) => s.setPan)
  const toggleElementSelection = useSketchStore((s) => s.toggleElementSelection)
  const clearSelection = useSketchStore((s) => s.clearSelection)
  const deleteSelected = useSketchStore((s) => s.deleteSelected)
  const undo = useSketchStore((s) => s.undo)
  const redo = useSketchStore((s) => s.redo)
  const setElements = useSketchStore((s) => s.setElements)
  const sketchPlane = useSketchStore((s) => s.plane)
  const toggleConstruction = useSketchStore((s) => s.toggleConstruction)
  const isConstruction = useSketchStore((s) => s.isConstruction)
  const setSymmetryAxis = useSketchStore((s) => s.setSymmetryAxis)
  const isSymmetryAxis = useSketchStore((s) => s.isSymmetryAxis)
  const setTool = useSketchStore((s) => s.setTool)
  const exitSketch = useSketchStore((s) => s.exitSketch)

  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null)
  const [snapPoints, setSnapPoints] = useState<SnapPoint[]>([])
  const [cursorWorldPoint, setCursorWorldPoint] = useState<Point2D | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string } | null>(null)
  const [toolsContextMenu, setToolsContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Control point dragging state
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)
  const [draggedPoint, setDraggedPoint] = useState<{ elementId: string; pointIndex: number } | null>(null)
  const [hoveredControlPoint, setHoveredControlPoint] = useState<{ elementId: string; pointIndex: number } | null>(null)

  // Dialog states
  const [offsetDialog, setOffsetDialog] = useState<{ isOpen: boolean; elementId: string | null }>({ isOpen: false, elementId: null })
  const [mirrorDialog, setMirrorDialog] = useState<{ isOpen: boolean; elementId: string | null }>({ isOpen: false, elementId: null })
  const [linearPatternDialog, setLinearPatternDialog] = useState<{ isOpen: boolean; elementId: string | null }>({ isOpen: false, elementId: null })
  const [circularPatternDialog, setCircularPatternDialog] = useState<{ isOpen: boolean; elementId: string | null }>({ isOpen: false, elementId: null })

  // Convert screen coords to world coords (wrapper for canvas-specific logic)
  const screenToWorld = (screenX: number, screenY: number): Point2D => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    // Adjust for canvas position
    return screenToWorldUtil(
      screenX - rect.left,
      screenY - rect.top,
      width,
      height,
      zoom,
      panX,
      panY
    )
  }

  // Find element at point (wrapper with sketch plane)
  const findElementAtPoint = (point: Point2D): string | null => {
    return findElementUtil(point, elements, sketchPlane)
  }

  // Draw everything
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, width, height)

    // Transform to center origin
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.scale(zoom, -zoom)
    ctx.translate(panX, panY)

    // Draw grid
    if (snapToGrid) {
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 1 / zoom
      const range = 20
      for (let i = -range; i <= range; i += gridSize) {
        // Vertical lines
        ctx.beginPath()
        ctx.moveTo(i, -range)
        ctx.lineTo(i, range)
        ctx.stroke()

        // Horizontal lines
        ctx.beginPath()
        ctx.moveTo(-range, i)
        ctx.lineTo(range, i)
        ctx.stroke()
      }
    }

    // Draw axes
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2 / zoom

    // X axis
    ctx.beginPath()
    ctx.moveTo(-10, 0)
    ctx.lineTo(10, 0)
    ctx.stroke()

    // Y axis
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(0, 10)
    ctx.stroke()

    // Draw elements using extracted rendering module
    elements.forEach((element, index) => {
      drawElement(ctx, element, index, selectedElementIds, construction, symmetryAxis, zoom)
    })

    // Draw control points for selected elements
    if (tool === 'select' && selectedElementIds.length > 0) {
      const selectedElements = elements.filter(el => selectedElementIds.includes(el.id))
      const controlPoints = selectedElements.flatMap(el => getElementControlPoints(el))
      drawElementControlPoints(ctx, controlPoints, zoom, hoveredControlPoint)
    }

    // Draw preview while drawing
    if (isDrawing && startPoint && currentPoint) {
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 2 / zoom

      switch (tool) {
        case 'line':
          // Draw line preview
          ctx.beginPath()
          ctx.moveTo(startPoint.x, startPoint.y)
          ctx.lineTo(currentPoint.x, currentPoint.y)
          ctx.stroke()

          // Draw start point
          ctx.beginPath()
          ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#22c55e'
          ctx.fill()

          // Draw end point
          ctx.beginPath()
          ctx.arc(currentPoint.x, currentPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#fbbf24'
          ctx.fill()
          break

        case 'circle': {
          const dx = currentPoint.x - startPoint.x
          const dy = currentPoint.y - startPoint.y
          const radius = Math.sqrt(dx * dx + dy * dy)

          // Draw circle preview
          ctx.beginPath()
          ctx.arc(startPoint.x, startPoint.y, radius, 0, Math.PI * 2)
          ctx.stroke()

          // Draw center point
          ctx.beginPath()
          ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#22c55e'
          ctx.fill()

          // Draw radius line (dashed)
          ctx.setLineDash([5 / zoom, 5 / zoom])
          ctx.beginPath()
          ctx.moveTo(startPoint.x, startPoint.y)
          ctx.lineTo(currentPoint.x, currentPoint.y)
          ctx.stroke()
          ctx.setLineDash([])

          // Draw point on circle
          ctx.beginPath()
          ctx.arc(currentPoint.x, currentPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#fbbf24'
          ctx.fill()

          // Show radius value
          ctx.save()
          ctx.scale(1, -1)
          ctx.fillStyle = '#fbbf24'
          ctx.font = `${14 / zoom}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const midX = (startPoint.x + currentPoint.x) / 2
          const midY = (startPoint.y + currentPoint.y) / 2
          ctx.fillText(`R: ${radius.toFixed(2)}`, midX, -midY)
          ctx.restore()
          break
        }

        case 'rectangle': {
          const w = currentPoint.x - startPoint.x
          const h = currentPoint.y - startPoint.y

          // Draw rectangle preview
          ctx.strokeRect(startPoint.x, startPoint.y, w, h)

          // Draw corner points
          ctx.beginPath()
          ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#22c55e'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(currentPoint.x, currentPoint.y, 4 / zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#fbbf24'
          ctx.fill()

          // Show dimensions
          ctx.save()
          ctx.scale(1, -1)
          ctx.fillStyle = '#fbbf24'
          ctx.font = `${14 / zoom}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${Math.abs(w).toFixed(2)} × ${Math.abs(h).toFixed(2)}`,
            startPoint.x + w / 2,
            -(startPoint.y + h / 2))
          ctx.restore()
          break
        }

        case 'arc': {
          // Arc preview: show the arc being drawn through 3 points
          if (arcMidPoint && currentPoint && startPoint) {
            // We have all 3 points, calculate and draw preview arc
            try {
              const arcParams = engine.calculateArcFrom3Points(
                startPoint.x, startPoint.y,
                arcMidPoint.x, arcMidPoint.y,
                currentPoint.x, currentPoint.y
              )

              if (arcParams.valid) {
                ctx.beginPath()
                ctx.arc(
                  arcParams.center_x,
                  arcParams.center_y,
                  arcParams.radius,
                  arcParams.start_angle,
                  arcParams.end_angle,
                  false
                )
                ctx.stroke()

                // Draw the three points
                const points = [
                  { x: startPoint.x, y: startPoint.y, label: '1' },
                  { x: arcMidPoint.x, y: arcMidPoint.y, label: '2' },
                  { x: currentPoint.x, y: currentPoint.y, label: '3' },
                ]

                points.forEach((pt, index) => {
                  const size = 4 / zoom
                  ctx.beginPath()
                  ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2)
                  ctx.fillStyle = index === 0 ? '#22c55e' : index === 1 ? '#3b82f6' : '#fbbf24'
                  ctx.fill()

                  // Draw point number
                  ctx.save()
                  ctx.scale(1, -1) // Flip text back
                  ctx.fillStyle = '#ffffff'
                  ctx.font = `${12 / zoom}px sans-serif`
                  ctx.textAlign = 'center'
                  ctx.textBaseline = 'middle'
                  ctx.fillText(pt.label, pt.x, -pt.y - 8 / zoom)
                  ctx.restore()
                })
              }
            } catch (error) {
              console.error('Arc preview calculation failed:', error)
            }
          } else if (!arcMidPoint && currentPoint && startPoint) {
            // Only have start point and cursor, draw line to show first segment
            ctx.setLineDash([5 / zoom, 5 / zoom])
            ctx.beginPath()
            ctx.moveTo(startPoint.x, startPoint.y)
            ctx.lineTo(currentPoint.x, currentPoint.y)
            ctx.stroke()
            ctx.setLineDash([])

            // Draw start point
            ctx.beginPath()
            ctx.arc(startPoint.x, startPoint.y, 4 / zoom, 0, Math.PI * 2)
            ctx.fillStyle = '#22c55e'
            ctx.fill()

            // Label
            ctx.save()
            ctx.scale(1, -1)
            ctx.fillStyle = '#ffffff'
            ctx.font = `${12 / zoom}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('1', startPoint.x, -startPoint.y - 8 / zoom)
            ctx.restore()
          }
          break
        }

        case 'polyline':
        case 'spline': {
          // Draw existing segments
          if (polylinePoints.length > 0) {
            // Draw solid lines between confirmed points
            ctx.strokeStyle = '#fbbf24'
            ctx.lineWidth = 2 / zoom
            ctx.setLineDash([])
            ctx.beginPath()
            ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y)
            for (let i = 1; i < polylinePoints.length; i++) {
              ctx.lineTo(polylinePoints[i].x, polylinePoints[i].y)
            }
            ctx.stroke()

            // Draw dashed preview line to cursor
            if (currentPoint) {
              ctx.strokeStyle = '#fbbf24'
              ctx.lineWidth = 2 / zoom
              ctx.setLineDash([5 / zoom, 5 / zoom])
              ctx.beginPath()
              ctx.moveTo(polylinePoints[polylinePoints.length - 1].x, polylinePoints[polylinePoints.length - 1].y)
              ctx.lineTo(currentPoint.x, currentPoint.y)
              ctx.stroke()
              ctx.setLineDash([])
            }

            // Draw points with numbers
            polylinePoints.forEach((pt, index) => {
              const size = 4 / zoom
              ctx.beginPath()
              ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2)
              ctx.fillStyle = index === 0 ? '#22c55e' : '#3b82f6'
              ctx.fill()

              // Draw point number
              ctx.save()
              ctx.scale(1, -1) // Flip text back to readable orientation
              ctx.fillStyle = '#ffffff'
              ctx.font = `${12 / zoom}px sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText((index + 1).toString(), pt.x, -pt.y - 8 / zoom)
              ctx.restore()
            })

            // Draw cursor point
            if (currentPoint) {
              ctx.beginPath()
              ctx.arc(currentPoint.x, currentPoint.y, 3 / zoom, 0, Math.PI * 2)
              ctx.fillStyle = '#94a3b8'
              ctx.fill()
            }
          }
          break
        }
      }
    }

    // Draw snap points
    if (snapPoints.length > 0 && !isDrawing) {
      snapPoints.forEach((snap, index) => {
        const size = 8 / zoom
        const isClosest = index === 0

        // Different colors for different snap types
        let color = '#fbbf24' // Default yellow
        switch (snap.snapType) {
          case 'endpoint':
            color = '#22c55e' // Green
            break
          case 'midpoint':
            color = '#3b82f6' // Blue
            break
          case 'center':
            color = '#ef4444' // Red
            break
          case 'quadrant':
            color = '#8b5cf6' // Purple
            break
          case 'grid':
            color = '#64748b' // Gray
            break
        }

        ctx.strokeStyle = color
        ctx.fillStyle = isClosest ? color : 'transparent'
        ctx.lineWidth = (isClosest ? 3 : 2) / zoom

        // Draw snap point marker
        if (snap.snapType === 'center') {
          // Draw X for center
          ctx.beginPath()
          ctx.moveTo(snap.point.x - size, snap.point.y - size)
          ctx.lineTo(snap.point.x + size, snap.point.y + size)
          ctx.moveTo(snap.point.x + size, snap.point.y - size)
          ctx.lineTo(snap.point.x - size, snap.point.y + size)
          ctx.stroke()
        } else if (snap.snapType === 'midpoint') {
          // Draw triangle for midpoint
          ctx.beginPath()
          ctx.moveTo(snap.point.x, snap.point.y - size)
          ctx.lineTo(snap.point.x + size, snap.point.y + size)
          ctx.lineTo(snap.point.x - size, snap.point.y + size)
          ctx.closePath()
          ctx.stroke()
          if (isClosest) ctx.fill()
        } else if (snap.snapType === 'quadrant') {
          // Draw diamond for quadrant
          ctx.beginPath()
          ctx.moveTo(snap.point.x, snap.point.y - size)
          ctx.lineTo(snap.point.x + size, snap.point.y)
          ctx.lineTo(snap.point.x, snap.point.y + size)
          ctx.lineTo(snap.point.x - size, snap.point.y)
          ctx.closePath()
          ctx.stroke()
          if (isClosest) ctx.fill()
        } else {
          // Draw square for endpoint and grid
          ctx.beginPath()
          ctx.rect(snap.point.x - size, snap.point.y - size, size * 2, size * 2)
          ctx.stroke()
          if (isClosest) ctx.fill()
        }
      })
    }

    ctx.restore()
  }, [elements, construction, symmetryAxis, isDrawing, startPoint, currentPoint, arcMidPoint, polylinePoints, tool, width, height, gridSize, snapToGrid, zoom, panX, panY, selectedElementIds, snapPoints])

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard events if focus is in input, textarea, or contenteditable element
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable

      // Also ignore if any dialog is open
      const isDialogOpen =
        offsetDialog.isOpen ||
        mirrorDialog.isOpen ||
        linearPatternDialog.isOpen ||
        circularPatternDialog.isOpen

      // Log all key presses for debugging
      console.log('Key pressed:', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        isInputFocused,
        isDialogOpen
      })

      // Delete or Backspace to delete selected elements
      // BUT only if not in input field and no dialog is open
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isInputFocused && !isDialogOpen && selectedElementIds.length > 0) {
          console.log('Deleting', selectedElementIds.length, 'selected elements')
          e.preventDefault()
          deleteSelected()
        }
      }

      // Ctrl+Z to undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        console.log('Undo')
        e.preventDefault()
        undo()
      }

      // Ctrl+Shift+Z or Ctrl+Y to redo
      if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
        console.log('Redo')
        e.preventDefault()
        redo()
      }

      // Escape to cancel drawing (including polyline)
      if (e.key === 'Escape' && isDrawing) {
        console.log('Cancel drawing')
        e.preventDefault()
        cancelDrawing()
      }

      // Enter to finish polyline/spline
      if (e.key === 'Enter' && isDrawing && (tool === 'polyline' || tool === 'spline')) {
        console.log('Finish polyline/spline')
        e.preventDefault()
        finishPolyline()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedElementIds, deleteSelected, undo, redo, isDrawing, tool, cancelDrawing, finishPolyline, offsetDialog, mirrorDialog, linearPatternDialog, circularPatternDialog])

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    console.log('handleMouseDown called, button:', e.button, 'tool:', tool)
    const worldPoint = screenToWorld(e.clientX, e.clientY)

    // Right click is handled in handleContextMenu
    if (e.button === 2) {
      return
    }

    // Middle button or Shift+Left = Pan
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
      return
    }

    // Select tool
    if (tool === 'select') {
      // First check if clicking on a control point of a selected element
      const pointHit = hitTestControlPoints(worldPoint, elements, selectedElementIds, 0.3)
      if (pointHit) {
        // Start dragging control point
        setIsDraggingPoint(true)
        setDraggedPoint({ elementId: pointHit.elementId, pointIndex: pointHit.pointIndex })
        return
      }

      // Otherwise, select element
      const elementId = findElementAtPoint(worldPoint)
      if (elementId) {
        if (e.ctrlKey || e.metaKey) {
          toggleElementSelection(elementId)
        } else {
          clearSelection()
          toggleElementSelection(elementId)
        }
      } else {
        clearSelection()
      }
      return
    }

    // Trim tool
    if (tool === 'trim') {
      const elementId = findElementAtPoint(worldPoint)
      if (elementId) {
        const elementIndex = elements.findIndex(el => el.id === elementId)
        if (elementIndex >= 0) {
          try {
            // Create sketch object for WASM
            const sketch: Sketch = {
              id: crypto.randomUUID(),
              plane: sketchPlane,
              offset: 0.0,
              elements: elements
            }

            const sketchJson = JSON.stringify(sketch)
            const resultJson = engine.trimElement(sketchJson, elementIndex, worldPoint.x, worldPoint.y)
            const resultSketch: Sketch = JSON.parse(resultJson)

            // IMPORTANT: WASM returns elements WITHOUT id field
            // Generate new IDs for all elements from WASM
            const elementsWithIds = resultSketch.elements.map(elem => ({
              ...elem,
              id: elem.id || crypto.randomUUID() // Add ID if missing
            }))

            // Update elements
            setElements(elementsWithIds)
            console.log('Trim successful')
          } catch (error) {
            console.error('Trim failed:', error)
          }
        }
      }
      return
    }

    // Polyline/Spline tools (multi-point drawing)
    if (tool === 'polyline' || tool === 'spline') {
      const snappedPoint = snapPoints.length > 0 ? snapPoints[0].point : worldPoint
      addPolylinePoint(snappedPoint)
      return
    }

    // Standard drawing tools (single click and drag)
    if (tool && tool !== 'select' && tool !== 'trim' && tool !== 'polyline' && tool !== 'spline') {
      // For arc tool: only start drawing if we haven't set arcMidPoint yet
      // If arcMidPoint is already set, we're waiting for the 3rd point (handled in finishDrawing)
      if (tool === 'arc' && arcMidPoint) {
        // Don't call startDrawing - we're setting the 3rd point on mouseUp
        return
      }

      // Use snap point if available
      const snappedPoint = snapPoints.length > 0 ? snapPoints[0].point : worldPoint
      startDrawing(snappedPoint)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPoint = screenToWorld(e.clientX, e.clientY)
    setCursorWorldPoint(worldPoint)

    // Get snap points from WASM
    if (!isPanning && elements.length > 0) {
      try {
        const sketch: Sketch = {
          id: crypto.randomUUID(),
          plane: sketchPlane,
          offset: 0.0,
          elements: elements
        }
        const sketchJson = JSON.stringify(sketch)
        const settingsJson = JSON.stringify({
          enabled: true,
          endpoint: true,
          midpoint: true,
          center: true,
          quadrant: true,
          grid: snapToGrid,
          grid_size: gridSize,
          snap_radius: 0.5 / zoom  // Adjust snap radius based on zoom
        })

        const points = engine.getSnapPoints(sketchJson, worldPoint.x, worldPoint.y, settingsJson)
        setSnapPoints(points.map(p => ({
          point: { x: p.x, y: p.y },
          snapType: p.snap_type as any,
          sourceElement: p.source_element ?? undefined
        })))
      } catch (error) {
        console.error('Get snap points failed:', error)
        setSnapPoints([])
      }
    }

    // Dragging control point
    if (isDraggingPoint && draggedPoint) {
      // Use snap point if available
      const snappedPoint = snapPoints.length > 0 ? snapPoints[0].point : worldPoint

      // Update the element with new point position
      const elementIndex = elements.findIndex(el => el.id === draggedPoint.elementId)
      if (elementIndex >= 0) {
        const updatedElement = updateElementPoint(elements[elementIndex], draggedPoint.pointIndex, snappedPoint)
        const newElements = [...elements]
        newElements[elementIndex] = updatedElement
        setElements(newElements)
      }
      return
    }

    // Update hovered control point in select mode
    if (tool === 'select' && selectedElementIds.length > 0) {
      const pointHit = hitTestControlPoints(worldPoint, elements, selectedElementIds, 0.3)
      if (pointHit) {
        setHoveredControlPoint({ elementId: pointHit.elementId, pointIndex: pointHit.pointIndex })
      } else {
        setHoveredControlPoint(null)
      }
    }

    // Panning
    if (isPanning && panStart) {
      const dx = (e.clientX - panStart.x) / zoom
      const dy = -(e.clientY - panStart.y) / zoom
      setPan(panX + dx, panY + dy)
      setPanStart({ x: e.clientX, y: e.clientY })
      return
    }

    // Drawing
    if (isDrawing) {
      // Use snap point if available
      const snappedPoint = snapPoints.length > 0 ? snapPoints[0].point : worldPoint
      updateDrawing(snappedPoint)
    }
  }

  const handleMouseUp = () => {
    if (isDraggingPoint) {
      setIsDraggingPoint(false)
      setDraggedPoint(null)
      return
    }

    if (isPanning) {
      setIsPanning(false)
      setPanStart(null)
    }

    // Don't finish drawing for polyline/spline - they finish on Enter key
    if (isDrawing && tool !== 'polyline' && tool !== 'spline') {
      finishDrawing()
    }
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    console.log('handleContextMenu called, tool:', tool)

    // For polyline/spline in drawing mode, finish drawing on right click
    if ((tool === 'polyline' || tool === 'spline') && isDrawing && polylinePoints.length > 0) {
      finishPolyline()
      return
    }

    // For all other tools (including mirror, select, etc), show context menu if clicking on an element
    const worldPoint = screenToWorld(e.clientX, e.clientY)
    console.log('Right click at:', worldPoint)
    const elementId = findElementAtPoint(worldPoint)
    console.log('Found element:', elementId)

    if (elementId) {
      // Select element if not already selected
      if (!selectedElementIds.includes(elementId)) {
        clearSelection()
        toggleElementSelection(elementId)
      }
      // Show context menu
      console.log('Showing context menu at:', e.clientX, e.clientY)
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        elementId
      })
    } else {
      // Show tools context menu on empty space
      console.log('Showing tools context menu at:', e.clientX, e.clientY)
      setToolsContextMenu({
        x: e.clientX,
        y: e.clientY
      })
    }
  }

  // Wheel events (using useEffect to set non-passive listener)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom(zoom * delta)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [zoom, setZoom])

  // Element operations using extracted modules
  const handleDuplicate = (elementId: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return
    const duplicated = duplicateElement(element)
    setElements([...elements, duplicated])
  }

  const handleOffset = (elementId: string, distance: number) => {
    const clickPoint = cursorWorldPoint || { x: 0, y: 0 }
    const newElements = SketchOps.offsetElement(elements, elementId, distance, clickPoint.x, clickPoint.y, sketchPlane)
    setElements(newElements)
  }

  const handleMirror = (elementId: string, axis: 'horizontal' | 'vertical' | 'custom') => {
    const newElements = SketchOps.mirrorElement(elements, elementId, axis, symmetryAxis, sketchPlane)
    if (newElements) {
      setElements(newElements)
    } else {
      alert('Ось симметрии не является правильной линией')
    }
  }

  const handleLinearPattern = (elementId: string, count: number, dx: number, dy: number) => {
    const newElements = SketchOps.linearPattern(elements, elementId, count, dx, dy, sketchPlane)
    setElements(newElements)
  }

  const handleCircularPattern = (elementId: string, count: number, centerX: number, centerY: number, angle: number) => {
    const newElements = SketchOps.circularPattern(elements, elementId, count, centerX, centerY, angle, sketchPlane)
    setElements(newElements)
  }

  // Context menu items using extracted module
  const contextMenuCallbacks: ContextMenuCallbacks = {
    onDuplicate: handleDuplicate,
    onOffset: (elementId) => setOffsetDialog({ isOpen: true, elementId }),
    onMirror: (elementId) => setMirrorDialog({ isOpen: true, elementId }),
    onLinearPattern: (elementId) => setLinearPatternDialog({ isOpen: true, elementId }),
    onCircularPattern: (elementId) => setCircularPatternDialog({ isOpen: true, elementId }),
    onToggleConstruction: toggleConstruction,
    onSetSymmetryAxis: setSymmetryAxis,
    onDelete: deleteSelected,
    isConstruction,
    isSymmetryAxis,
  }

  const getMenuItems = (elementId: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return []
    return getContextMenuItems(element, elementId, contextMenuCallbacks)
  }

  // Tools context menu callbacks
  const toolsContextMenuCallbacks: ToolsContextMenuCallbacks = {
    onSelectTool: (toolName: string) => {
      setTool(toolName as any)
      setToolsContextMenu(null)
    },
    onExitSketch: () => {
      exitSketch()
      setToolsContextMenu(null)
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        className={isPanning ? 'cursor-grab' : tool === 'select' ? 'cursor-pointer' : 'cursor-crosshair'}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getMenuItems(contextMenu.elementId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {toolsContextMenu && (
        <ContextMenu
          x={toolsContextMenu.x}
          y={toolsContextMenu.y}
          items={getToolsContextMenuItems(toolsContextMenuCallbacks)}
          onClose={() => setToolsContextMenu(null)}
        />
      )}

      {/* Operation dialogs */}
      <OffsetDialog
        isOpen={offsetDialog.isOpen}
        onClose={() => setOffsetDialog({ isOpen: false, elementId: null })}
        onConfirm={(distance) => {
          if (offsetDialog.elementId) {
            handleOffset(offsetDialog.elementId, distance)
          }
        }}
      />

      <MirrorDialog
        isOpen={mirrorDialog.isOpen}
        onClose={() => setMirrorDialog({ isOpen: false, elementId: null })}
        onConfirm={(axis) => {
          if (mirrorDialog.elementId) {
            handleMirror(mirrorDialog.elementId, axis)
          }
        }}
      />

      <LinearPatternDialog
        isOpen={linearPatternDialog.isOpen}
        onClose={() => setLinearPatternDialog({ isOpen: false, elementId: null })}
        onConfirm={(count, dx, dy) => {
          if (linearPatternDialog.elementId) {
            handleLinearPattern(linearPatternDialog.elementId, count, dx, dy)
          }
        }}
      />

      <CircularPatternDialog
        isOpen={circularPatternDialog.isOpen}
        onClose={() => setCircularPatternDialog({ isOpen: false, elementId: null })}
        onConfirm={(count, centerX, centerY, angle) => {
          if (circularPatternDialog.elementId) {
            handleCircularPattern(circularPatternDialog.elementId, count, centerX, centerY, angle)
          }
        }}
      />
    </>
  )
}
