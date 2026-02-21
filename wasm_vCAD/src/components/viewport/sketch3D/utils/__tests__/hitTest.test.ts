/**
 * Tests for hit testing utilities
 */

import { describe, it, expect, vi } from 'vitest'
import { hitTestControlPoints } from '../hitTest'
import type { SketchElement } from '@/types/scene'

// Mock WASM engine for findElementAtPoint
vi.mock('@/wasm/engine', () => ({
  engine: {
    findElementAtPoint: vi.fn(() => -1),
  },
}))

describe('hitTestControlPoints', () => {
  const line: SketchElement = {
    id: 'line1',
    type: 'line',
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
  }

  const circle: SketchElement = {
    id: 'circle1',
    type: 'circle',
    center: { x: 20, y: 20 },
    radius: 5,
  }

  it('returns null when no elements are selected', () => {
    const elements = [line, circle]
    const result = hitTestControlPoints(
      { x: 0, y: 0 },
      elements,
      [], // No selected elements
      1.0
    )

    expect(result).toBeNull()
  })

  it('finds control point on selected line', () => {
    const elements = [line]
    const result = hitTestControlPoints(
      { x: 0.1, y: 0.1 }, // Near start point
      elements,
      ['line1'],
      0.5
    )

    expect(result).not.toBeNull()
    expect(result?.elementId).toBe('line1')
    expect(result?.pointIndex).toBe(0) // Start point
  })

  it('finds closest control point when multiple are in range', () => {
    const elements = [line]
    const result = hitTestControlPoints(
      { x: 0.1, y: 0 }, // Near start point (0,0)
      elements,
      ['line1'],
      0.5
    )

    expect(result?.pointIndex).toBe(0) // Should be start, not midpoint
  })

  it('returns null when cursor is too far from control points', () => {
    const elements = [line]
    const result = hitTestControlPoints(
      { x: 100, y: 100 }, // Far away
      elements,
      ['line1'],
      0.5
    )

    expect(result).toBeNull()
  })

  it('only checks selected elements', () => {
    const elements = [line, circle]
    const result = hitTestControlPoints(
      { x: 20, y: 20 }, // At circle center
      elements,
      ['line1'], // Only line is selected
      0.5
    )

    // Should not find circle center because circle is not selected
    expect(result).toBeNull()
  })

  it('finds control point on circle', () => {
    const elements = [circle]
    const result = hitTestControlPoints(
      { x: 20.1, y: 20.1 }, // Near center
      elements,
      ['circle1'],
      0.5
    )

    expect(result).not.toBeNull()
    expect(result?.elementId).toBe('circle1')
    expect(result?.pointIndex).toBe(0) // Center point
  })

  it('finds radius point on circle', () => {
    const elements = [circle]
    const result = hitTestControlPoints(
      { x: 25, y: 20 }, // At radius point (center.x + radius)
      elements,
      ['circle1'],
      0.5
    )

    expect(result).not.toBeNull()
    expect(result?.pointIndex).toBe(1) // Radius point
  })

  it('returns distance in the result', () => {
    const elements = [line]
    const result = hitTestControlPoints(
      { x: 0.3, y: 0.4 }, // Distance 0.5 from origin
      elements,
      ['line1'],
      1.0
    )

    expect(result).not.toBeNull()
    expect(result?.distance).toBeCloseTo(0.5, 5)
  })

  it('handles polyline with multiple points', () => {
    const polyline: SketchElement = {
      id: 'poly1',
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 0 },
      ],
    }

    const result = hitTestControlPoints(
      { x: 5.1, y: 5.1 }, // Near middle point
      [polyline],
      ['poly1'],
      0.5
    )

    expect(result).not.toBeNull()
    expect(result?.pointIndex).toBe(1) // Middle point
  })
})
