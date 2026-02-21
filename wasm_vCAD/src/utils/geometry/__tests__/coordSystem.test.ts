/**
 * Tests for coordinate system utilities
 */

import { describe, it, expect } from 'vitest'
import {
  getPlaneCoordSystem,
  sketchToWorld3D,
  worldToSketch2D,
  normalizeVec3,
  dotVec3,
  crossVec3,
} from '../coordSystem'

describe('getPlaneCoordSystem', () => {
  describe('XY plane', () => {
    it('returns correct coordinate system for XY plane', () => {
      const cs = getPlaneCoordSystem('XY', 0)

      expect(cs.origin).toEqual([0, 0, 0])
      expect(cs.normal).toEqual([0, 0, 1])
      expect(cs.uAxis).toEqual([1, 0, 0])
      expect(cs.vAxis).toEqual([0, 1, 0])
    })

    it('applies offset along Z axis for XY plane', () => {
      const cs = getPlaneCoordSystem('XY', 5)

      expect(cs.origin).toEqual([0, 0, 5])
      expect(cs.normal).toEqual([0, 0, 1])
    })
  })

  describe('XZ plane', () => {
    it('returns correct coordinate system for XZ plane', () => {
      const cs = getPlaneCoordSystem('XZ', 0)

      expect(cs.origin).toEqual([0, 0, 0])
      expect(cs.normal).toEqual([0, 1, 0])
      expect(cs.uAxis).toEqual([1, 0, 0])
      expect(cs.vAxis).toEqual([0, 0, 1])
    })

    it('applies offset along Y axis for XZ plane', () => {
      const cs = getPlaneCoordSystem('XZ', 3)

      expect(cs.origin).toEqual([0, 3, 0])
    })
  })

  describe('YZ plane', () => {
    it('returns correct coordinate system for YZ plane', () => {
      const cs = getPlaneCoordSystem('YZ', 0)

      expect(cs.origin).toEqual([0, 0, 0])
      expect(cs.normal).toEqual([1, 0, 0])
      expect(cs.uAxis).toEqual([0, 1, 0])
      expect(cs.vAxis).toEqual([0, 0, 1])
    })

    it('applies offset along X axis for YZ plane', () => {
      const cs = getPlaneCoordSystem('YZ', -2)

      expect(cs.origin).toEqual([-2, 0, 0])
    })
  })

  describe('CUSTOM plane', () => {
    it('uses provided face coordinate system', () => {
      const fcs = {
        origin: [1, 2, 3] as [number, number, number],
        normal: [0, 0.707, 0.707] as [number, number, number],
        uAxis: [1, 0, 0] as [number, number, number],
        vAxis: [0, 0.707, -0.707] as [number, number, number],
      }

      const cs = getPlaneCoordSystem('CUSTOM', 0, fcs)

      expect(cs.origin).toEqual([1, 2, 3])
      expect(cs.normal).toEqual([0, 0.707, 0.707])
      expect(cs.uAxis).toEqual([1, 0, 0])
      expect(cs.vAxis).toEqual([0, 0.707, -0.707])
    })

    it('falls back to XY if fcs is not provided', () => {
      const cs = getPlaneCoordSystem('CUSTOM', 5, null)

      expect(cs.normal).toEqual([0, 0, 1])
    })
  })
})

describe('sketchToWorld3D', () => {
  it('converts XY plane sketch coordinates to world', () => {
    const cs = getPlaneCoordSystem('XY', 0)
    const world = sketchToWorld3D(3, 4, cs)

    expect(world).toEqual([3, 4, 0])
  })

  it('converts XZ plane sketch coordinates to world', () => {
    const cs = getPlaneCoordSystem('XZ', 0)
    const world = sketchToWorld3D(3, 4, cs)

    expect(world).toEqual([3, 0, 4])
  })

  it('converts YZ plane sketch coordinates to world', () => {
    const cs = getPlaneCoordSystem('YZ', 0)
    const world = sketchToWorld3D(3, 4, cs)

    expect(world).toEqual([0, 3, 4])
  })

  it('applies offset correctly', () => {
    const cs = getPlaneCoordSystem('XY', 5)
    const world = sketchToWorld3D(3, 4, cs)

    expect(world).toEqual([3, 4, 5])
  })
})

describe('worldToSketch2D', () => {
  it('converts world coordinates to XY plane sketch', () => {
    const cs = getPlaneCoordSystem('XY', 0)
    const sketch = worldToSketch2D(3, 4, 0, cs)

    expect(sketch.x).toBeCloseTo(3, 5)
    expect(sketch.y).toBeCloseTo(4, 5)
  })

  it('converts world coordinates to XZ plane sketch', () => {
    const cs = getPlaneCoordSystem('XZ', 0)
    const sketch = worldToSketch2D(3, 0, 4, cs)

    expect(sketch.x).toBeCloseTo(3, 5)
    expect(sketch.y).toBeCloseTo(4, 5)
  })

  it('is inverse of sketchToWorld3D', () => {
    const cs = getPlaneCoordSystem('XY', 5)
    const original = { x: 7, y: 11 }
    const world = sketchToWorld3D(original.x, original.y, cs)
    const back = worldToSketch2D(world[0], world[1], world[2], cs)

    expect(back.x).toBeCloseTo(original.x, 5)
    expect(back.y).toBeCloseTo(original.y, 5)
  })
})

describe('vector utilities', () => {
  describe('normalizeVec3', () => {
    it('normalizes a vector to unit length', () => {
      const v = normalizeVec3([3, 4, 0])
      const length = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)

      expect(length).toBeCloseTo(1, 5)
      expect(v[0]).toBeCloseTo(0.6, 5)
      expect(v[1]).toBeCloseTo(0.8, 5)
    })

    it('returns default for zero vector', () => {
      const v = normalizeVec3([0, 0, 0])

      expect(v).toEqual([0, 0, 1])
    })
  })

  describe('dotVec3', () => {
    it('computes dot product', () => {
      const result = dotVec3([1, 2, 3], [4, 5, 6])

      expect(result).toBe(1 * 4 + 2 * 5 + 3 * 6) // 32
    })

    it('returns 0 for perpendicular vectors', () => {
      const result = dotVec3([1, 0, 0], [0, 1, 0])

      expect(result).toBe(0)
    })
  })

  describe('crossVec3', () => {
    it('computes cross product', () => {
      const result = crossVec3([1, 0, 0], [0, 1, 0])

      expect(result).toEqual([0, 0, 1])
    })

    it('is anti-commutative', () => {
      const a: [number, number, number] = [1, 2, 3]
      const b: [number, number, number] = [4, 5, 6]
      const ab = crossVec3(a, b)
      const ba = crossVec3(b, a)

      expect(ab[0]).toBeCloseTo(-ba[0], 5)
      expect(ab[1]).toBeCloseTo(-ba[1], 5)
      expect(ab[2]).toBeCloseTo(-ba[2], 5)
    })
  })
})
