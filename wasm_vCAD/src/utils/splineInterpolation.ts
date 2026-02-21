/**
 * Catmull-Rom spline interpolation
 * Creates smooth curves that pass through all control points
 */

import type { Point2D } from '@/types/scene'

/**
 * Interpolate a Catmull-Rom spline through the given control points
 * @param points - Control points the spline passes through
 * @param segments - Number of segments between each pair of points
 * @param tension - Tension parameter (0.5 = Catmull-Rom, 0 = straight lines)
 * @returns Array of interpolated points
 */
export function interpolateCatmullRom(
  points: Point2D[],
  segments: number = 16,
  tension: number = 0.5
): Point2D[] {
  if (points.length < 2) return [...points]
  if (points.length === 2) {
    // Just return line segments for 2 points
    const result: Point2D[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      result.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        y: points[0].y + (points[1].y - points[0].y) * t,
      })
    }
    return result
  }

  const result: Point2D[] = []

  // For Catmull-Rom, we need 4 points for each segment
  // We extend the curve by duplicating the first and last points
  const extended = [
    points[0], // duplicate first
    ...points,
    points[points.length - 1], // duplicate last
  ]

  // Iterate through each segment (between original points)
  for (let i = 1; i < extended.length - 2; i++) {
    const p0 = extended[i - 1]
    const p1 = extended[i]
    const p2 = extended[i + 1]
    const p3 = extended[i + 2]

    // Add points along this segment
    for (let j = 0; j < segments; j++) {
      const t = j / segments
      const point = catmullRomPoint(p0, p1, p2, p3, t, tension)
      result.push(point)
    }
  }

  // Add the last point
  result.push(points[points.length - 1])

  return result
}

/**
 * Calculate a single point on a Catmull-Rom spline segment
 */
function catmullRomPoint(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
  tension: number
): Point2D {
  const t2 = t * t
  const t3 = t2 * t

  // Catmull-Rom basis functions
  const s = (1 - tension) / 2

  const b0 = -s * t3 + 2 * s * t2 - s * t
  const b1 = (2 - s) * t3 + (s - 3) * t2 + 1
  const b2 = (s - 2) * t3 + (3 - 2 * s) * t2 + s * t
  const b3 = s * t3 - s * t2

  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y,
  }
}

/**
 * Check if a spline is closed (first point ≈ last point)
 */
export function isSplineClosed(points: Point2D[], tolerance: number = 0.01): boolean {
  if (points.length < 3) return false
  const first = points[0]
  const last = points[points.length - 1]
  const dx = first.x - last.x
  const dy = first.y - last.y
  return Math.sqrt(dx * dx + dy * dy) < tolerance
}

/**
 * Interpolate a closed Catmull-Rom spline
 * For closed splines, we wrap around the points
 */
export function interpolateCatmullRomClosed(
  points: Point2D[],
  segments: number = 16,
  tension: number = 0.5
): Point2D[] {
  if (points.length < 3) return [...points]

  // Remove duplicate closing point if present (first ≈ last)
  // This prevents the loop artifact when start and end coincide
  let workingPoints = points
  const first = points[0]
  const last = points[points.length - 1]
  const dx = first.x - last.x
  const dy = first.y - last.y
  if (Math.sqrt(dx * dx + dy * dy) < 0.01) {
    // Last point is duplicate of first - remove it
    workingPoints = points.slice(0, -1)
  }

  if (workingPoints.length < 3) return [...points]

  const result: Point2D[] = []
  const n = workingPoints.length

  // For each segment
  for (let i = 0; i < n; i++) {
    const p0 = workingPoints[(i - 1 + n) % n]
    const p1 = workingPoints[i]
    const p2 = workingPoints[(i + 1) % n]
    const p3 = workingPoints[(i + 2) % n]

    // Add points along this segment
    for (let j = 0; j < segments; j++) {
      const t = j / segments
      const point = catmullRomPoint(p0, p1, p2, p3, t, tension)
      result.push(point)
    }
  }

  // Close the loop
  result.push(result[0])

  return result
}
