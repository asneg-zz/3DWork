/**
 * Global geometry cache — maps body ID → merged THREE.BufferGeometry.
 * Populated by SceneObjects components as they render, and consumed by
 * boolean operations in the scene store / Toolbar.
 */

import * as THREE from 'three'

const cache = new Map<string, THREE.BufferGeometry>()

export const geometryCache = {
  set(bodyId: string, geo: THREE.BufferGeometry): void {
    cache.set(bodyId, geo)
  },

  get(bodyId: string): THREE.BufferGeometry | undefined {
    return cache.get(bodyId)
  },

  delete(bodyId: string): void {
    cache.delete(bodyId)
  },

  has(bodyId: string): boolean {
    return cache.has(bodyId)
  },
}
