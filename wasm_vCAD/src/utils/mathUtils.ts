/**
 * Математические утилиты для 2D геометрии
 * Централизует общие математические операции для устранения дублирования кода
 */

import type { Point2D } from '@/types/scene'

/**
 * Вычислить расстояние между двумя точками
 */
export function distance2D(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Нормализовать вектор и вернуть его длину
 * Если длина < 0.0001, возвращает нулевой вектор
 */
export function normalize2D(dx: number, dy: number): {
  x: number
  y: number
  length: number
} {
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length < 0.0001) {
    return { x: 0, y: 0, length: 0 }
  }
  return { x: dx / length, y: dy / length, length }
}

/**
 * Вычислить середину между двумя точками
 */
export function midpoint2D(a: Point2D, b: Point2D): Point2D {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  }
}

/**
 * Переместить точку на dx, dy
 */
export function translatePoint(point: Point2D, dx: number, dy: number): Point2D {
  return { x: point.x + dx, y: point.y + dy }
}
