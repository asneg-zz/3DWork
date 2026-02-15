/**
 * Sketch rendering utilities
 * Handles drawing of sketch elements on canvas
 */

import type { SketchElement } from '@/types/scene'

export interface RenderStyle {
  strokeColor: string
  lineWidth: number
  isDashed: boolean
}

export function getRenderStyle(
  element: SketchElement,
  index: number,
  isSelected: boolean,
  isConstruction: boolean,
  isSymmetryAxis: boolean,
  zoom: number
): RenderStyle {
  let strokeColor = '#e0e0e0'  // Default: white

  if (isSelected) {
    strokeColor = '#4ade80'  // Selected: green
  } else if (isSymmetryAxis) {
    strokeColor = '#8b5cf6'  // Symmetry axis: purple
  } else if (isConstruction) {
    strokeColor = '#fbbf24'  // Construction: yellow/orange
  }

  return {
    strokeColor,
    lineWidth: (isSelected ? 3 : 2) / zoom,
    isDashed: isConstruction || isSymmetryAxis
  }
}

export function applyRenderStyle(ctx: CanvasRenderingContext2D, style: RenderStyle, zoom: number) {
  ctx.strokeStyle = style.strokeColor
  ctx.lineWidth = style.lineWidth

  if (style.isDashed) {
    ctx.setLineDash([5 / zoom, 5 / zoom])
  } else {
    ctx.setLineDash([])
  }
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.start && element.end) {
    ctx.beginPath()
    ctx.moveTo(element.start.x, element.start.y)
    ctx.lineTo(element.end.x, element.end.y)
    ctx.stroke()
  }
}

export function drawCircle(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.center && element.radius) {
    ctx.beginPath()
    ctx.arc(element.center.x, element.center.y, element.radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

export function drawArc(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.center && element.radius && element.start_angle !== undefined && element.end_angle !== undefined) {
    ctx.beginPath()
    ctx.arc(
      element.center.x,
      element.center.y,
      element.radius,
      element.start_angle,
      element.end_angle
    )
    ctx.stroke()
  }
}

export function drawRectangle(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.corner && element.width && element.height) {
    ctx.beginPath()
    ctx.rect(element.corner.x, element.corner.y, element.width, element.height)
    ctx.stroke()
  }
}

export function drawPolyline(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.points && element.points.length > 1) {
    ctx.beginPath()
    ctx.moveTo(element.points[0].x, element.points[0].y)
    for (let i = 1; i < element.points.length; i++) {
      ctx.lineTo(element.points[i].x, element.points[i].y)
    }
    ctx.stroke()
  }
}

export function drawSpline(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.points && element.points.length > 1) {
    ctx.beginPath()
    ctx.moveTo(element.points[0].x, element.points[0].y)

    // Simple Catmull-Rom spline approximation
    for (let i = 0; i < element.points.length - 1; i++) {
      const p0 = element.points[Math.max(0, i - 1)]
      const p1 = element.points[i]
      const p2 = element.points[i + 1]
      const p3 = element.points[Math.min(element.points.length - 1, i + 2)]

      for (let t = 0; t <= 1; t += 0.1) {
        const t2 = t * t
        const t3 = t2 * t

        const x = 0.5 * (
          2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        )

        const y = 0.5 * (
          2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        )

        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: SketchElement,
  index: number,
  selectedElementIds: string[],
  construction: boolean[],
  symmetryAxis: number | null,
  zoom: number
) {
  const isSelected = selectedElementIds.includes(element.id)
  const isConstruction = construction[index] || false
  const isSymmetryAxis = symmetryAxis === index

  const style = getRenderStyle(element, index, isSelected, isConstruction, isSymmetryAxis, zoom)
  applyRenderStyle(ctx, style, zoom)

  switch (element.type) {
    case 'line':
      drawLine(ctx, element)
      break
    case 'circle':
      drawCircle(ctx, element)
      break
    case 'arc':
      drawArc(ctx, element)
      break
    case 'rectangle':
      drawRectangle(ctx, element)
      break
    case 'polyline':
      drawPolyline(ctx, element)
      break
    case 'spline':
      drawSpline(ctx, element)
      break
  }
}
