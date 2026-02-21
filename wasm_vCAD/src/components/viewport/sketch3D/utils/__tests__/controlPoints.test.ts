/**
 * Tests for control point utilities
 */

import { describe, it, expect } from 'vitest'
import { getElementControlPoints } from '../controlPoints'
import type { SketchElement } from '@/types/scene'

describe('getElementControlPoints', () => {
  describe('line element', () => {
    it('returns start, end, and midpoint for a line', () => {
      const line: SketchElement = {
        id: 'line1',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      }

      const points = getElementControlPoints(line)

      expect(points).toHaveLength(3)
      expect(points[0]).toMatchObject({
        elementId: 'line1',
        pointIndex: 0,
        position: { x: 0, y: 0 },
        type: 'start',
      })
      expect(points[1]).toMatchObject({
        elementId: 'line1',
        pointIndex: 1,
        position: { x: 10, y: 0 },
        type: 'end',
      })
      expect(points[2]).toMatchObject({
        elementId: 'line1',
        pointIndex: 2,
        position: { x: 5, y: 0 },
        type: 'midpoint',
      })
    })

    it('returns empty array for line without start/end', () => {
      const line: SketchElement = {
        id: 'line1',
        type: 'line',
      }

      const points = getElementControlPoints(line)
      expect(points).toHaveLength(0)
    })
  })

  describe('circle element', () => {
    it('returns center and radius point for a circle', () => {
      const circle: SketchElement = {
        id: 'circle1',
        type: 'circle',
        center: { x: 5, y: 5 },
        radius: 3,
      }

      const points = getElementControlPoints(circle)

      expect(points).toHaveLength(2)
      expect(points[0]).toMatchObject({
        elementId: 'circle1',
        pointIndex: 0,
        position: { x: 5, y: 5 },
        type: 'center',
      })
      expect(points[1]).toMatchObject({
        elementId: 'circle1',
        pointIndex: 1,
        position: { x: 8, y: 5 }, // center.x + radius
        type: 'radius',
      })
    })
  })

  describe('arc element', () => {
    it('returns center, start and end points for an arc', () => {
      const arc: SketchElement = {
        id: 'arc1',
        type: 'arc',
        center: { x: 0, y: 0 },
        radius: 5,
        start_angle: 0,
        end_angle: Math.PI / 2,
      }

      const points = getElementControlPoints(arc)

      expect(points).toHaveLength(3)
      expect(points[0]).toMatchObject({
        type: 'center',
        position: { x: 0, y: 0 },
      })
      expect(points[1].type).toBe('start')
      expect(points[1].position.x).toBeCloseTo(5, 5) // cos(0) * 5
      expect(points[1].position.y).toBeCloseTo(0, 5) // sin(0) * 5
      expect(points[2].type).toBe('end')
      expect(points[2].position.x).toBeCloseTo(0, 5) // cos(PI/2) * 5
      expect(points[2].position.y).toBeCloseTo(5, 5) // sin(PI/2) * 5
    })
  })

  describe('rectangle element', () => {
    it('returns 4 corners for a rectangle', () => {
      const rect: SketchElement = {
        id: 'rect1',
        type: 'rectangle',
        corner: { x: 0, y: 0 },
        width: 10,
        height: 5,
      }

      const points = getElementControlPoints(rect)

      expect(points).toHaveLength(4)
      expect(points.map(p => p.position)).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
        { x: 0, y: 5 },
      ])
      points.forEach(p => expect(p.type).toBe('corner'))
    })
  })

  describe('polyline element', () => {
    it('returns all points for a polyline', () => {
      const polyline: SketchElement = {
        id: 'poly1',
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 3 },
          { x: 10, y: 0 },
        ],
      }

      const points = getElementControlPoints(polyline)

      expect(points).toHaveLength(3)
      expect(points.map(p => p.position)).toEqual([
        { x: 0, y: 0 },
        { x: 5, y: 3 },
        { x: 10, y: 0 },
      ])
      points.forEach((p, i) => {
        expect(p.pointIndex).toBe(i)
        expect(p.type).toBe('point')
      })
    })
  })

  describe('spline element', () => {
    it('returns all control points for a spline', () => {
      const spline: SketchElement = {
        id: 'spline1',
        type: 'spline',
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 3 },
          { x: 5, y: 1 },
          { x: 8, y: 4 },
        ],
      }

      const points = getElementControlPoints(spline)

      expect(points).toHaveLength(4)
      points.forEach((p, i) => {
        expect(p.pointIndex).toBe(i)
        expect(p.type).toBe('point')
      })
    })
  })

  describe('dimension element', () => {
    it('returns midpoint for radius dimension', () => {
      const dim: SketchElement = {
        id: 'dim1',
        type: 'dimension',
        dimension_type: 'radius',
        from: { x: 0, y: 0 },
        to: { x: 5, y: 0 },
      }

      const points = getElementControlPoints(dim)

      expect(points).toHaveLength(1)
      expect(points[0]).toMatchObject({
        pointIndex: 2,
        position: { x: 2.5, y: 0 },
        type: 'midpoint',
      })
    })

    it('returns start, end, and dimension line position for linear dimension', () => {
      const dim: SketchElement = {
        id: 'dim1',
        type: 'dimension',
        dimension_type: 'linear',
        from: { x: 0, y: 0 },
        to: { x: 10, y: 0 },
      }

      const points = getElementControlPoints(dim)

      expect(points).toHaveLength(3)
      expect(points[0].type).toBe('start')
      expect(points[1].type).toBe('end')
      expect(points[2].type).toBe('center') // dimension line position
    })

    it('uses custom dimension_line_pos when provided', () => {
      const dim: SketchElement = {
        id: 'dim1',
        type: 'dimension',
        dimension_type: 'linear',
        from: { x: 0, y: 0 },
        to: { x: 10, y: 0 },
        dimension_line_pos: { x: 5, y: 2 },
      }

      const points = getElementControlPoints(dim)

      expect(points[2].position).toEqual({ x: 5, y: 2 })
    })
  })
})
