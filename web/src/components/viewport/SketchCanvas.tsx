import { useRef, useCallback, useEffect, useState } from 'react'
import { useSceneStore } from '@/stores/sceneStore'
import type { Point2D, SketchElement } from '@/types/scene'

interface SketchCanvasProps {
  width: number
  height: number
}

export function SketchCanvas({ width, height }: SketchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startPoint, setStartPoint] = useState<Point2D | null>(null)
  const [previewPoint, setPreviewPoint] = useState<Point2D | null>(null)

  const sketchEdit = useSceneStore((s) => s.sketchEdit)
  const getSketch = useSceneStore((s) => s.getSketch)
  const addSketchElement = useSceneStore((s) => s.addSketchElement)
  const selectSketchElement = useSceneStore((s) => s.selectSketchElement)

  const sketch = sketchEdit.bodyId && sketchEdit.featureId
    ? getSketch(sketchEdit.bodyId, sketchEdit.featureId)
    : null

  // Convert screen coords to sketch coords
  const screenToSketch = useCallback((x: number, y: number): Point2D => {
    const scale = 50 // pixels per unit
    const centerX = width / 2
    const centerY = height / 2
    return {
      x: (x - centerX) / scale,
      y: -(y - centerY) / scale, // Flip Y
    }
  }, [width, height])

  // Convert sketch coords to screen coords
  const sketchToScreen = useCallback((p: Point2D): { x: number; y: number } => {
    const scale = 50
    const centerX = width / 2
    const centerY = height / 2
    return {
      x: centerX + p.x * scale,
      y: centerY - p.y * scale, // Flip Y
    }
  }, [width, height])

  // Snap to grid
  const snapToGrid = useCallback((p: Point2D): Point2D => {
    if (!sketchEdit.snapSettings.grid) return p
    const gridSize = sketchEdit.snapSettings.gridSize
    return {
      x: Math.round(p.x / gridSize) * gridSize,
      y: Math.round(p.y / gridSize) * gridSize,
    }
  }, [sketchEdit.snapSettings])

  // Draw the sketch
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    // Draw grid
    drawGrid(ctx, width, height)

    // Draw sketch elements
    if (sketch) {
      sketch.elements.forEach((element, index) => {
        const isSelected = sketchEdit.selectedElementIndex === index
        drawElement(ctx, element, sketchToScreen, isSelected)
      })
    }

    // Draw preview
    if (startPoint && previewPoint && sketchEdit.tool) {
      ctx.save()
      ctx.strokeStyle = '#7c3aed'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])

      const start = sketchToScreen(startPoint)
      const end = sketchToScreen(previewPoint)

      switch (sketchEdit.tool) {
        case 'line':
          ctx.beginPath()
          ctx.moveTo(start.x, start.y)
          ctx.lineTo(end.x, end.y)
          ctx.stroke()
          break
        case 'rectangle':
          ctx.strokeRect(
            Math.min(start.x, end.x),
            Math.min(start.y, end.y),
            Math.abs(end.x - start.x),
            Math.abs(end.y - start.y)
          )
          break
        case 'circle':
          const radius = Math.sqrt(
            Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
          )
          ctx.beginPath()
          ctx.arc(start.x, start.y, radius, 0, Math.PI * 2)
          ctx.stroke()
          break
      }

      ctx.restore()
    }
  }, [width, height, sketch, sketchEdit, startPoint, previewPoint, sketchToScreen])

  // Redraw on changes
  useEffect(() => {
    draw()
  }, [draw])

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const sketchPoint = snapToGrid(screenToSketch(x, y))

    if (sketchEdit.tool) {
      setIsDragging(true)
      setStartPoint(sketchPoint)
      setPreviewPoint(sketchPoint)
    } else {
      // Selection mode - find element under cursor
      if (sketch) {
        const clickedIndex = findElementAt(sketch.elements, sketchPoint, 0.2)
        selectSketchElement(clickedIndex)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const sketchPoint = snapToGrid(screenToSketch(x, y))

    if (isDragging && startPoint) {
      setPreviewPoint(sketchPoint)
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || !startPoint || !previewPoint) {
      setIsDragging(false)
      return
    }

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const endPoint = snapToGrid(screenToSketch(x, y))

    // Create element based on tool
    let element: SketchElement | null = null

    switch (sketchEdit.tool) {
      case 'line':
        if (distance(startPoint, endPoint) > 0.1) {
          element = { type: 'line', start: startPoint, end: endPoint }
        }
        break
      case 'rectangle':
        const w = Math.abs(endPoint.x - startPoint.x)
        const h = Math.abs(endPoint.y - startPoint.y)
        if (w > 0.1 && h > 0.1) {
          element = {
            type: 'rectangle',
            corner: {
              x: Math.min(startPoint.x, endPoint.x),
              y: Math.min(startPoint.y, endPoint.y),
            },
            width: w,
            height: h,
          }
        }
        break
      case 'circle':
        const radius = distance(startPoint, endPoint)
        if (radius > 0.1) {
          element = { type: 'circle', center: startPoint, radius }
        }
        break
    }

    if (element) {
      addSketchElement(element)
    }

    setIsDragging(false)
    setStartPoint(null)
    setPreviewPoint(null)
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 z-5"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false)
        setStartPoint(null)
        setPreviewPoint(null)
      }}
    />
  )
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const scale = 50
  const centerX = width / 2
  const centerY = height / 2

  ctx.save()
  ctx.strokeStyle = '#3a3a4e'
  ctx.lineWidth = 0.5

  // Vertical lines
  for (let x = centerX % scale; x < width; x += scale) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = centerY % scale; y < height; y += scale) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Axes
  ctx.strokeStyle = '#5a5a6e'
  ctx.lineWidth = 1

  // X axis
  ctx.beginPath()
  ctx.moveTo(0, centerY)
  ctx.lineTo(width, centerY)
  ctx.stroke()

  // Y axis
  ctx.beginPath()
  ctx.moveTo(centerX, 0)
  ctx.lineTo(centerX, height)
  ctx.stroke()

  ctx.restore()
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: SketchElement,
  toScreen: (p: Point2D) => { x: number; y: number },
  isSelected: boolean
) {
  ctx.save()
  ctx.strokeStyle = isSelected ? '#fbbf24' : '#e4e4ef'
  ctx.lineWidth = isSelected ? 2 : 1

  switch (element.type) {
    case 'line': {
      const start = toScreen(element.start)
      const end = toScreen(element.end)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      break
    }
    case 'rectangle': {
      const corner = toScreen(element.corner)
      const scale = 50
      ctx.strokeRect(
        corner.x,
        corner.y - element.height * scale,
        element.width * scale,
        element.height * scale
      )
      break
    }
    case 'circle': {
      const center = toScreen(element.center)
      const scale = 50
      ctx.beginPath()
      ctx.arc(center.x, center.y, element.radius * scale, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'arc': {
      const center = toScreen(element.center)
      const scale = 50
      ctx.beginPath()
      ctx.arc(
        center.x,
        center.y,
        element.radius * scale,
        -element.end_angle,
        -element.start_angle
      )
      ctx.stroke()
      break
    }
  }

  ctx.restore()
}

function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2))
}

function findElementAt(elements: SketchElement[], point: Point2D, tolerance: number): number | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i]
    if (isPointOnElement(element, point, tolerance)) {
      return i
    }
  }
  return null
}

function isPointOnElement(element: SketchElement, point: Point2D, tolerance: number): boolean {
  switch (element.type) {
    case 'line': {
      const d = distanceToLine(point, element.start, element.end)
      return d < tolerance
    }
    case 'rectangle': {
      const { corner, width, height } = element
      const right = corner.x + width
      const top = corner.y + height
      // Check if near any edge
      const nearLeft = Math.abs(point.x - corner.x) < tolerance && point.y >= corner.y && point.y <= top
      const nearRight = Math.abs(point.x - right) < tolerance && point.y >= corner.y && point.y <= top
      const nearBottom = Math.abs(point.y - corner.y) < tolerance && point.x >= corner.x && point.x <= right
      const nearTop = Math.abs(point.y - top) < tolerance && point.x >= corner.x && point.x <= right
      return nearLeft || nearRight || nearBottom || nearTop
    }
    case 'circle': {
      const dist = distance(point, element.center)
      return Math.abs(dist - element.radius) < tolerance
    }
    default:
      return false
  }
}

function distanceToLine(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  const A = point.x - lineStart.x
  const B = point.y - lineStart.y
  const C = lineEnd.x - lineStart.x
  const D = lineEnd.y - lineStart.y

  const dot = A * C + B * D
  const lenSq = C * C + D * D
  let param = -1

  if (lenSq !== 0) {
    param = dot / lenSq
  }

  let xx, yy

  if (param < 0) {
    xx = lineStart.x
    yy = lineStart.y
  } else if (param > 1) {
    xx = lineEnd.x
    yy = lineEnd.y
  } else {
    xx = lineStart.x + param * C
    yy = lineStart.y + param * D
  }

  return distance(point, { x: xx, y: yy })
}
