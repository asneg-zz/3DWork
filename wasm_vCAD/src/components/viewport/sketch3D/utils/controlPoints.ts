/**
 * Control point types and extraction for sketch elements
 */

import type { Point2D, SketchElement } from '@/types/scene'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ControlPoint {
  elementId: string
  pointIndex: number
  position: Point2D
  type: 'start' | 'end' | 'center' | 'corner' | 'point' | 'radius' | 'midpoint'
}

export interface ControlPointHit {
  elementId: string
  pointIndex: number
  position: Point2D
  distance: number
}

// ─── Control Point Extraction ────────────────────────────────────────────────

/**
 * Get all control points for a sketch element
 */
export function getElementControlPoints(element: SketchElement): ControlPoint[] {
  const points: ControlPoint[] = []

  switch (element.type) {
    case 'line':
      if (element.start && element.end) {
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.start,
          type: 'start'
        })
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: element.end,
          type: 'end'
        })
        // Midpoint for moving the entire line
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: {
            x: (element.start.x + element.end.x) / 2,
            y: (element.start.y + element.end.y) / 2
          },
          type: 'midpoint'
        })
      }
      break

    case 'circle':
      if (element.center && element.radius !== undefined) {
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.center,
          type: 'center'
        })
        // Point on circle for radius adjustment
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: { x: element.center.x + element.radius, y: element.center.y },
          type: 'radius'
        })
      }
      break

    case 'arc':
      if (element.center && element.radius !== undefined &&
          element.start_angle !== undefined && element.end_angle !== undefined) {
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.center,
          type: 'center'
        })
        // Start point
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: {
            x: element.center.x + element.radius * Math.cos(element.start_angle),
            y: element.center.y + element.radius * Math.sin(element.start_angle)
          },
          type: 'start'
        })
        // End point
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: {
            x: element.center.x + element.radius * Math.cos(element.end_angle),
            y: element.center.y + element.radius * Math.sin(element.end_angle)
          },
          type: 'end'
        })
      }
      break

    case 'rectangle':
      if (element.corner && element.width !== undefined && element.height !== undefined) {
        points.push({
          elementId: element.id,
          pointIndex: 0,
          position: element.corner,
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 1,
          position: { x: element.corner.x + element.width, y: element.corner.y },
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 2,
          position: { x: element.corner.x + element.width, y: element.corner.y + element.height },
          type: 'corner'
        })
        points.push({
          elementId: element.id,
          pointIndex: 3,
          position: { x: element.corner.x, y: element.corner.y + element.height },
          type: 'corner'
        })
      }
      break

    case 'polyline':
    case 'spline':
      if (element.points) {
        element.points.forEach((pt, i) => {
          points.push({
            elementId: element.id,
            pointIndex: i,
            position: pt,
            type: 'point'
          })
        })
      }
      break

    case 'dimension':
      if (element.from && element.to) {
        const isRadiusOrDiameter = element.dimension_type === 'radius' || element.dimension_type === 'diameter'

        if (isRadiusOrDiameter) {
          // For radius/diameter: only midpoint to move the entire dimension
          points.push({
            elementId: element.id,
            pointIndex: 2,
            position: {
              x: (element.from.x + element.to.x) / 2,
              y: (element.from.y + element.to.y) / 2
            },
            type: 'midpoint'
          })
        } else {
          // For linear dimensions: start, end, and dimension line position
          points.push({
            elementId: element.id,
            pointIndex: 0,
            position: element.from,
            type: 'start'
          })
          points.push({
            elementId: element.id,
            pointIndex: 1,
            position: element.to,
            type: 'end'
          })

          // Dimension line position control point
          let dimLinePos = element.dimension_line_pos
          if (!dimLinePos) {
            const dx = element.to.x - element.from.x
            const dy = element.to.y - element.from.y
            const len = Math.sqrt(dx * dx + dy * dy)
            const perpX = len > 0.0001 ? -dy / len : 0
            const perpY = len > 0.0001 ? dx / len : 1
            const offset = 0.5
            const midX = (element.from.x + element.to.x) / 2
            const midY = (element.from.y + element.to.y) / 2
            dimLinePos = {
              x: midX + perpX * offset,
              y: midY + perpY * offset
            }
          }

          points.push({
            elementId: element.id,
            pointIndex: 2,
            position: dimLinePos,
            type: 'center'
          })
        }
      }
      break
  }

  return points
}
