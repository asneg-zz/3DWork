/**
 * Tests for extrudeMesh utilities
 * Tests extractProfiles2D function with various sketch elements
 */

import { describe, it, expect } from 'vitest'
import { extractProfiles2D } from '../extrudeMesh'
import type { SketchElement } from '@/types/scene'

describe('extractProfiles2D', () => {
  describe('single closed shapes', () => {
    it('extracts profile from a rectangle', () => {
      const elements: SketchElement[] = [{
        id: 'rect1',
        type: 'rectangle',
        corner: { x: 0, y: 0 },
        width: 10,
        height: 5,
      }]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1)
      expect(profiles[0]).toHaveLength(4)
      // Check corners (CCW order)
      expect(profiles[0]).toContainEqual([0, 0])
      expect(profiles[0]).toContainEqual([10, 0])
      expect(profiles[0]).toContainEqual([10, 5])
      expect(profiles[0]).toContainEqual([0, 5])
    })

    it('extracts profile from a circle', () => {
      const elements: SketchElement[] = [{
        id: 'circle1',
        type: 'circle',
        center: { x: 5, y: 5 },
        radius: 3,
      }]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1)
      // Circle should have 32 segments by default
      expect(profiles[0].length).toBe(32)

      // All points should be at radius distance from center
      for (const [x, y] of profiles[0]) {
        const dist = Math.sqrt((x - 5) ** 2 + (y - 5) ** 2)
        expect(dist).toBeCloseTo(3, 5)
      }
    })

    it('extracts profile from a closed polyline', () => {
      const elements: SketchElement[] = [{
        id: 'poly1',
        type: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 8 },
          { x: 0, y: 0 }, // Closed
        ],
      }]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1)
      expect(profiles[0]).toHaveLength(3) // Closing point excluded
    })
  })

  describe('chained segments', () => {
    it('chains three lines into a triangle', () => {
      const elements: SketchElement[] = [
        {
          id: 'line1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        {
          id: 'line2',
          type: 'line',
          start: { x: 10, y: 0 },
          end: { x: 5, y: 8 },
        },
        {
          id: 'line3',
          type: 'line',
          start: { x: 5, y: 8 },
          end: { x: 0, y: 0 },
        },
      ]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1)
      // Triangle has 3 vertices (closing point excluded)
      expect(profiles[0].length).toBeGreaterThanOrEqual(3)
    })

    it('chains lines even when segments are reversed', () => {
      const elements: SketchElement[] = [
        {
          id: 'line1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        {
          id: 'line2',
          type: 'line',
          start: { x: 5, y: 8 },  // Reversed!
          end: { x: 10, y: 0 },
        },
        {
          id: 'line3',
          type: 'line',
          start: { x: 0, y: 0 },  // Reversed!
          end: { x: 5, y: 8 },
        },
      ]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1)
      expect(profiles[0].length).toBeGreaterThanOrEqual(3)
    })

    it('handles multiple separate closed shapes', () => {
      const elements: SketchElement[] = [
        // First rectangle
        {
          id: 'rect1',
          type: 'rectangle',
          corner: { x: 0, y: 0 },
          width: 5,
          height: 5,
        },
        // Second rectangle (separate)
        {
          id: 'rect2',
          type: 'rectangle',
          corner: { x: 10, y: 10 },
          width: 3,
          height: 3,
        },
      ]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(2)
    })
  })

  describe('filtering', () => {
    it('ignores dimension elements', () => {
      const elements: SketchElement[] = [
        {
          id: 'rect1',
          type: 'rectangle',
          corner: { x: 0, y: 0 },
          width: 10,
          height: 5,
        },
        {
          id: 'dim1',
          type: 'dimension',
          dimension_type: 'linear',
          value: 10,
        },
      ]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(1) // Only rectangle
    })

    it('ignores single lines (not closed)', () => {
      const elements: SketchElement[] = [{
        id: 'line1',
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      }]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(0)
    })

    it('ignores two lines that don\'t close', () => {
      const elements: SketchElement[] = [
        {
          id: 'line1',
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 0 },
        },
        {
          id: 'line2',
          type: 'line',
          start: { x: 10, y: 0 },
          end: { x: 15, y: 5 },
        },
      ]

      const profiles = extractProfiles2D(elements)

      expect(profiles).toHaveLength(0)
    })
  })

  describe('arc handling', () => {
    it('extracts arc segments', () => {
      const elements: SketchElement[] = [{
        id: 'arc1',
        type: 'arc',
        center: { x: 0, y: 0 },
        radius: 5,
        start_angle: 0,
        end_angle: Math.PI, // Half circle
      }]

      // Arc alone won't form a closed profile
      const arcOnlyProfiles = extractProfiles2D(elements)
      expect(arcOnlyProfiles).toHaveLength(0)

      // Arc + line should form a closed profile
      const elementsWithLine: SketchElement[] = [
        ...elements,
        {
          id: 'line1',
          type: 'line',
          start: { x: -5, y: 0 }, // End of arc
          end: { x: 5, y: 0 },   // Start of arc
        },
      ]

      const profilesWithLine = extractProfiles2D(elementsWithLine)
      expect(profilesWithLine).toHaveLength(1)
    })
  })
})
