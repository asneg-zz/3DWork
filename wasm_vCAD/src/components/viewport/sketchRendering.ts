/**
 * Sketch rendering utilities
 * Handles drawing of sketch elements on canvas
 */

import type { SketchElement, Point2D, SketchConstraint } from '@/types/scene'
import type { ControlPoint } from './sketchUtils'

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

/**
 * Нарисовать контрольную точку
 */
export function drawControlPoint(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  zoom: number,
  isHovered: boolean = false
) {
  const size = 6 / zoom

  ctx.save()
  ctx.fillStyle = isHovered ? '#f59e0b' : '#3b82f6'  // Orange if hovered, blue otherwise
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 / zoom
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/**
 * Нарисовать контрольную точку центра (для окружностей и дуг)
 */
export function drawCenterPoint(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  zoom: number,
  isHovered: boolean = false
) {
  const size = 4 / zoom
  const crossSize = 8 / zoom

  ctx.save()
  ctx.strokeStyle = isHovered ? '#f59e0b' : '#3b82f6'
  ctx.lineWidth = 2 / zoom
  ctx.setLineDash([])

  // Крест для центра
  ctx.beginPath()
  ctx.moveTo(point.x - crossSize, point.y)
  ctx.lineTo(point.x + crossSize, point.y)
  ctx.moveTo(point.x, point.y - crossSize)
  ctx.lineTo(point.x, point.y + crossSize)
  ctx.stroke()

  // Кружок в центре
  ctx.fillStyle = isHovered ? '#f59e0b' : '#3b82f6'
  ctx.beginPath()
  ctx.arc(point.x, point.y, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Нарисовать контрольную точку середины линии (треугольник)
 */
export function drawMidpoint(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  zoom: number,
  isHovered: boolean = false
) {
  const size = 6 / zoom

  ctx.save()
  ctx.fillStyle = isHovered ? '#f59e0b' : '#3b82f6'
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2 / zoom
  ctx.setLineDash([])

  // Треугольник
  ctx.beginPath()
  ctx.moveTo(point.x, point.y - size)  // Верхняя точка
  ctx.lineTo(point.x - size, point.y + size)  // Левая нижняя
  ctx.lineTo(point.x + size, point.y + size)  // Правая нижняя
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/**
 * Нарисовать все контрольные точки для элемента
 */
export function drawElementControlPoints(
  ctx: CanvasRenderingContext2D,
  controlPoints: ControlPoint[],
  zoom: number,
  hoveredPoint: { elementId: string; pointIndex: number } | null
) {
  for (const cp of controlPoints) {
    const isHovered = hoveredPoint?.elementId === cp.elementId &&
                     hoveredPoint?.pointIndex === cp.pointIndex

    if (cp.type === 'center') {
      drawCenterPoint(ctx, cp.position, zoom, isHovered)
    } else if (cp.type === 'midpoint') {
      drawMidpoint(ctx, cp.position, zoom, isHovered)
    } else {
      drawControlPoint(ctx, cp.position, zoom, isHovered)
    }
  }
}

// ============================================================================
// Constraint Icons (иконки ограничений)
// ============================================================================

/**
 * Получить иконку для типа ограничения
 */
export function getConstraintIcon(constraint: SketchConstraint): string {
  switch (constraint.type) {
    case 'horizontal':
      return 'H'
    case 'vertical':
      return 'V'
    case 'parallel':
      return '//'
    case 'perpendicular':
      return '⊥'
    case 'coincident':
      return 'C'
    case 'fixed':
      return 'F'
    case 'equal':
      return '='
    case 'tangent':
      return 'T'
    case 'concentric':
      return 'O'
    case 'symmetric':
      return 'S'
    default:
      return '?'
  }
}

/**
 * Нарисовать иконку ограничения
 */
export function drawConstraintIcon(
  ctx: CanvasRenderingContext2D,
  position: Point2D,
  icon: string,
  zoom: number
) {
  const size = 16 / zoom
  const padding = 4 / zoom
  const fontSize = 12 / zoom

  ctx.save()

  // Фон иконки
  ctx.fillStyle = 'rgba(59, 130, 246, 0.9)' // Blue background
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1 / zoom

  ctx.beginPath()
  ctx.rect(position.x - size / 2, position.y - size / 2, size, size)
  ctx.fill()
  ctx.stroke()

  // Текст иконки
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, position.x, position.y)

  ctx.restore()
}

/**
 * Получить позицию для иконки ограничения на элементе
 */
export function getConstraintIconPosition(
  element: SketchElement,
  iconIndex: number,
  zoom: number
): Point2D {
  const offset = 20 / zoom
  const spacing = 18 / zoom

  // Базовая позиция - середина элемента
  let baseX = 0
  let baseY = 0

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        baseX = (element.start.x + element.end.x) / 2
        baseY = (element.start.y + element.end.y) / 2
      }
      break
    case 'circle':
    case 'arc':
      if (element.center) {
        baseX = element.center.x
        baseY = element.center.y
      }
      break
    case 'rectangle':
      if (element.corner && element.width !== undefined && element.height !== undefined) {
        baseX = element.corner.x + element.width / 2
        baseY = element.corner.y + element.height / 2
      }
      break
    default:
      baseX = 0
      baseY = 0
  }

  // Смещение для множественных иконок
  return {
    x: baseX + iconIndex * spacing,
    y: baseY - offset
  }
}

/**
 * Нарисовать все иконки ограничений для элемента
 */
export function drawElementConstraints(
  ctx: CanvasRenderingContext2D,
  element: SketchElement,
  elementIndex: number,
  constraints: SketchConstraint[],
  zoom: number
) {
  // Фильтруем ограничения для этого элемента
  const elementConstraints = constraints.filter(c => {
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

  // Рисуем иконки
  elementConstraints.forEach((constraint, index) => {
    const icon = getConstraintIcon(constraint)
    const position = getConstraintIconPosition(element, index, zoom)
    drawConstraintIcon(ctx, position, icon, zoom)
  })
}
