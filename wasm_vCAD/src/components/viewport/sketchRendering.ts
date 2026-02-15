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
  _element: SketchElement,
  _index: number,
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

function drawLine(
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

function drawCircle(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.center && element.radius) {
    ctx.beginPath()
    ctx.arc(element.center.x, element.center.y, element.radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

function drawArc(
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

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  element: SketchElement
) {
  if (element.corner && element.width && element.height) {
    ctx.beginPath()
    ctx.rect(element.corner.x, element.corner.y, element.width, element.height)
    ctx.stroke()
  }
}

function drawPolyline(
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

function drawSpline(
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
  zoom: number,
  elements?: SketchElement[]
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
    case 'dimension':
      drawDimension(ctx, element, zoom, isSelected, elements)
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
function drawCenterPoint(
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
function drawMidpoint(
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

// ============================================================================
// Dimension (размеры)
// ============================================================================

/**
 * Нарисовать размерную линию
 */
export function drawDimension(
  ctx: CanvasRenderingContext2D,
  element: SketchElement,
  zoom: number,
  isSelected: boolean,
  elements?: SketchElement[]
) {
  if (!element.from || !element.to) return

  const dimColor = isSelected ? '#96f6b4' : '#96d4f6'
  const arrowSize = 8 / zoom
  const textOffset = 12 / zoom

  ctx.save()
  ctx.strokeStyle = dimColor
  ctx.fillStyle = dimColor
  ctx.lineWidth = (isSelected ? 2.5 : 2) / zoom
  ctx.setLineDash([])

  // Базовые точки
  const pFrom = element.from
  const pTo = element.to

  const isRadiusOrDiameter = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

  // Вычислить позицию размерной линии
  let dimLineStart: Point2D
  let dimLineEnd: Point2D

  // For radius/diameter, draw directly without offset
  if (isRadiusOrDiameter) {
    dimLineStart = pFrom
    dimLineEnd = pTo
  } else if (element.dimension_line_pos) {
    // Если задана позиция размерной линии, проецируем точки
    const dx = pTo.x - pFrom.x
    const dy = pTo.y - pFrom.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len < 0.0001) {
      ctx.restore()
      return
    }

    // Нормализованное направление базовой линии
    const dirX = dx / len
    const dirY = dy / len

    // Проекция dimension_line_pos на базовую линию
    const t1 = ((pFrom.x - element.dimension_line_pos.x) * dirX +
                (pFrom.y - element.dimension_line_pos.y) * dirY)
    const t2 = ((pTo.x - element.dimension_line_pos.x) * dirX +
                (pTo.y - element.dimension_line_pos.y) * dirY)

    dimLineStart = {
      x: element.dimension_line_pos.x + t1 * dirX,
      y: element.dimension_line_pos.y + t1 * dirY
    }
    dimLineEnd = {
      x: element.dimension_line_pos.x + t2 * dirX,
      y: element.dimension_line_pos.y + t2 * dirY
    }
  } else {
    // Автоматическое смещение размерной линии
    const dx = pTo.x - pFrom.x
    const dy = pTo.y - pFrom.y
    const len = Math.sqrt(dx * dx + dy * dy)

    if (len < 0.0001) {
      ctx.restore()
      return
    }

    // Перпендикулярное направление (вверх от линии)
    const perpX = -dy / len
    const perpY = dx / len
    const offset = 0.5 // offset in world units

    dimLineStart = { x: pFrom.x + perpX * offset, y: pFrom.y + perpY * offset }
    dimLineEnd = { x: pTo.x + perpX * offset, y: pTo.y + perpY * offset }
  }

  // Рисуем выносные линии (extension lines)
  if (!isRadiusOrDiameter) {
    // Linear dimensions - standard extension lines
    ctx.setLineDash([3 / zoom, 3 / zoom])
    ctx.beginPath()
    ctx.moveTo(pFrom.x, pFrom.y)
    ctx.lineTo(dimLineStart.x + (dimLineStart.x - pFrom.x) * 0.1, dimLineStart.y + (dimLineStart.y - pFrom.y) * 0.1)
    ctx.moveTo(pTo.x, pTo.y)
    ctx.lineTo(dimLineEnd.x + (dimLineEnd.x - pTo.x) * 0.1, dimLineEnd.y + (dimLineEnd.y - pTo.y) * 0.1)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (elements && element.target_element !== undefined) {
    // Radius/diameter - extension lines if dimension has been moved
    const targetElement = elements[element.target_element]

    if (targetElement && (targetElement.type === 'circle' || targetElement.type === 'arc')) {
      const center = targetElement.center
      const radius = targetElement.radius

      if (center && radius !== undefined) {
        // Calculate original dimension line positions
        let originalFrom: Point2D
        let originalTo: Point2D

        if (element.dimension_type === 'radius') {
          // Radius: from center to a point on circumference
          const dx = pTo.x - pFrom.x
          const dy = pTo.y - pFrom.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > 0.0001) {
            originalFrom = center
            originalTo = {
              x: center.x + (dx / dist) * radius,
              y: center.y + (dy / dist) * radius
            }
          } else {
            originalFrom = center
            originalTo = { x: center.x + radius, y: center.y }
          }
        } else {
          // Diameter: through center
          const dx = pTo.x - pFrom.x
          const dy = pTo.y - pFrom.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist > 0.0001) {
            originalFrom = {
              x: center.x - (dx / dist) * radius,
              y: center.y - (dy / dist) * radius
            }
            originalTo = {
              x: center.x + (dx / dist) * radius,
              y: center.y + (dy / dist) * radius
            }
          } else {
            originalFrom = { x: center.x - radius, y: center.y }
            originalTo = { x: center.x + radius, y: center.y }
          }
        }

        // Check if dimension has been moved from original position
        const fromMoved = Math.sqrt(
          (pFrom.x - originalFrom.x) ** 2 + (pFrom.y - originalFrom.y) ** 2
        ) > 0.01
        const toMoved = Math.sqrt(
          (pTo.x - originalTo.x) ** 2 + (pTo.y - originalTo.y) ** 2
        ) > 0.01

        // Draw extension lines if moved
        if (fromMoved || toMoved) {
          ctx.setLineDash([3 / zoom, 3 / zoom])
          ctx.beginPath()

          if (fromMoved) {
            ctx.moveTo(originalFrom.x, originalFrom.y)
            ctx.lineTo(pFrom.x, pFrom.y)
          }

          if (toMoved) {
            ctx.moveTo(originalTo.x, originalTo.y)
            ctx.lineTo(pTo.x, pTo.y)
          }

          ctx.stroke()
          ctx.setLineDash([])
        }
      }
    }
  }

  // Рисуем размерную линию
  ctx.beginPath()
  ctx.moveTo(dimLineStart.x, dimLineStart.y)
  ctx.lineTo(dimLineEnd.x, dimLineEnd.y)
  ctx.stroke()

  // Рисуем стрелки
  const dimDx = dimLineEnd.x - dimLineStart.x
  const dimDy = dimLineEnd.y - dimLineStart.y
  const dimLen = Math.sqrt(dimDx * dimDx + dimDy * dimDy)

  if (dimLen > 0.0001) {
    const dimDirX = dimDx / dimLen
    const dimDirY = dimDy / dimLen

    if (element.dimension_type === 'radius') {
      // Radius: only arrow at end
      drawArrow(ctx, dimLineEnd, { x: -dimDirX, y: -dimDirY }, arrowSize)
    } else {
      // Linear and Diameter: arrows at both ends
      drawArrow(ctx, dimLineStart, { x: dimDirX, y: dimDirY }, arrowSize)
      drawArrow(ctx, dimLineEnd, { x: -dimDirX, y: -dimDirY }, arrowSize)
    }
  }

  // Рисуем текст значения
  const value = element.value || 0
  const midX = (dimLineStart.x + dimLineEnd.x) / 2
  const midY = (dimLineStart.y + dimLineEnd.y) / 2

  // Calculate angle of dimension line for text rotation (reuse dimDx, dimDy from above)
  let angle = Math.atan2(dimDy, dimDx)

  // Keep text readable - flip if upside down
  if (angle > Math.PI / 2) {
    angle -= Math.PI
  } else if (angle < -Math.PI / 2) {
    angle += Math.PI
  }

  // Add prefix for radius/diameter
  let displayText = value.toFixed(2)
  if (element.dimension_type === 'radius') {
    displayText = 'R' + displayText
  } else if (element.dimension_type === 'diameter') {
    displayText = 'Ø' + displayText
  }

  ctx.save()
  ctx.translate(midX, midY)
  ctx.rotate(angle)
  ctx.scale(1, -1) // Flip text back to readable
  ctx.fillStyle = dimColor
  ctx.font = `bold ${14 / zoom}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(displayText, 0, -textOffset)
  ctx.restore()

  ctx.restore()
}

/**
 * Нарисовать стрелку для размерной линии
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  point: Point2D,
  direction: Point2D,
  size: number
) {
  const angle = 25 * (Math.PI / 180) // 25 degrees

  const perpX1 = direction.x * Math.cos(angle) - direction.y * Math.sin(angle)
  const perpY1 = direction.x * Math.sin(angle) + direction.y * Math.cos(angle)

  const perpX2 = direction.x * Math.cos(-angle) - direction.y * Math.sin(-angle)
  const perpY2 = direction.x * Math.sin(-angle) + direction.y * Math.cos(-angle)

  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.x + perpX1 * size, point.y + perpY1 * size)
  ctx.moveTo(point.x, point.y)
  ctx.lineTo(point.x + perpX2 * size, point.y + perpY2 * size)
  ctx.stroke()
}
