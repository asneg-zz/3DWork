/**
 * Tests for WASM normalizers
 */

import { describe, it, expect } from 'vitest'
import {
  snakeToCamel,
  camelToSnake,
  deepSnakeToCamel,
  deepCamelToSnake,
  normalizeConstraint,
  normalizePointRef,
} from '../normalizers'

describe('string converters', () => {
  describe('snakeToCamel', () => {
    it('converts snake_case to camelCase', () => {
      expect(snakeToCamel('start_angle')).toBe('startAngle')
      expect(snakeToCamel('face_coord_system')).toBe('faceCoordSystem')
      expect(snakeToCamel('height_backward')).toBe('heightBackward')
    })

    it('handles already camelCase strings', () => {
      expect(snakeToCamel('startAngle')).toBe('startAngle')
    })

    it('handles single words', () => {
      expect(snakeToCamel('height')).toBe('height')
    })

    it('handles multiple underscores', () => {
      expect(snakeToCamel('some_very_long_name')).toBe('someVeryLongName')
    })
  })

  describe('camelToSnake', () => {
    it('converts camelCase to snake_case', () => {
      expect(camelToSnake('startAngle')).toBe('start_angle')
      expect(camelToSnake('faceCoordSystem')).toBe('face_coord_system')
      expect(camelToSnake('heightBackward')).toBe('height_backward')
    })

    it('handles already snake_case strings', () => {
      expect(camelToSnake('start_angle')).toBe('start_angle')
    })

    it('handles single words', () => {
      expect(camelToSnake('height')).toBe('height')
    })
  })
})

describe('deepSnakeToCamel', () => {
  it('converts simple object keys', () => {
    const input = {
      start_angle: 0,
      end_angle: Math.PI,
    }

    const result = deepSnakeToCamel<{ startAngle: number; endAngle: number }>(input)

    expect(result.startAngle).toBe(0)
    expect(result.endAngle).toBe(Math.PI)
  })

  it('handles nested objects', () => {
    const input = {
      face_coord_system: {
        u_axis: [1, 0, 0],
        v_axis: [0, 1, 0],
      },
    }

    const result = deepSnakeToCamel<any>(input)

    expect(result.faceCoordSystem.uAxis).toEqual([1, 0, 0])
    expect(result.faceCoordSystem.vAxis).toEqual([0, 1, 0])
  })

  it('handles arrays', () => {
    const input = [
      { element_id: '1' },
      { element_id: '2' },
    ]

    const result = deepSnakeToCamel<{ elementId: string }[]>(input)

    expect(result[0].elementId).toBe('1')
    expect(result[1].elementId).toBe('2')
  })

  it('preserves null and undefined', () => {
    expect(deepSnakeToCamel(null)).toBeNull()
    expect(deepSnakeToCamel(undefined)).toBeUndefined()
  })

  it('preserves primitive values', () => {
    expect(deepSnakeToCamel(42)).toBe(42)
    expect(deepSnakeToCamel('hello')).toBe('hello')
    expect(deepSnakeToCamel(true)).toBe(true)
  })
})

describe('deepCamelToSnake', () => {
  it('converts simple object keys', () => {
    const input = {
      startAngle: 0,
      endAngle: Math.PI,
    }

    const result = deepCamelToSnake<{ start_angle: number; end_angle: number }>(input)

    expect(result.start_angle).toBe(0)
    expect(result.end_angle).toBe(Math.PI)
  })

  it('is inverse of deepSnakeToCamel', () => {
    const original = {
      face_coord_system: {
        u_axis: [1, 0, 0],
      },
    }

    const camel = deepSnakeToCamel(original)
    const back = deepCamelToSnake(camel)

    expect(back).toEqual(original)
  })
})

describe('normalizePointRef', () => {
  it('normalizes point reference', () => {
    const raw = {
      element_index: 0,
      point_index: 1,
    }

    const result = normalizePointRef(raw)

    expect(result.element_index).toBe(0)
    expect(result.point_index).toBe(1)
  })
})

describe('normalizeConstraint', () => {
  it('normalizes horizontal constraint', () => {
    const raw = {
      type: 'horizontal',
      element: 0,
    }

    const result = normalizeConstraint(raw)

    expect(result.type).toBe('horizontal')
    expect((result as { element: number }).element).toBe(0)
  })

  it('normalizes parallel constraint', () => {
    const raw = {
      type: 'parallel',
      element1: 0,
      element2: 1,
    }

    const result = normalizeConstraint(raw)

    expect(result.type).toBe('parallel')
    expect((result as { element1: number; element2: number }).element1).toBe(0)
    expect((result as { element1: number; element2: number }).element2).toBe(1)
  })

  it('normalizes coincident constraint', () => {
    const raw = {
      type: 'coincident',
      point1: { element_index: 0, point_index: 0 },
      point2: { element_index: 1, point_index: 1 },
    }

    const result = normalizeConstraint(raw)

    expect(result.type).toBe('coincident')
    const coincident = result as { point1: { element_index: number } }
    expect(coincident.point1.element_index).toBe(0)
  })

  it('normalizes symmetric constraint', () => {
    const raw = {
      type: 'symmetric',
      element1: 0,
      element2: 1,
      axis: 2,
    }

    const result = normalizeConstraint(raw)

    expect(result.type).toBe('symmetric')
    expect((result as { axis: number }).axis).toBe(2)
  })
})
