/**
 * Global geometry cache — maps body ID → merged THREE.BufferGeometry.
 * Populated by SceneObjects components as they render, and consumed by
 * boolean operations in the scene store / Toolbar.
 *
 * Features:
 * - LRU eviction when cache exceeds max size
 * - Version tracking for cache invalidation
 * - Hit/miss statistics for debugging
 */

import * as THREE from 'three'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  geometry: THREE.BufferGeometry
  version: number
  lastAccess: number
}

interface CacheStats {
  hits: number
  misses: number
  evictions: number
  size: number
}

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIZE = 100
const DEBUG_CACHE = false

// ─── Cache Implementation ─────────────────────────────────────────────────────

class GeometryCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  }

  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize
  }

  /**
   * Store geometry in cache with optional version
   */
  set(bodyId: string, geo: THREE.BufferGeometry, version: number = 0): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(bodyId)) {
      this.evictOldest()
    }

    this.cache.set(bodyId, {
      geometry: geo,
      version,
      lastAccess: Date.now(),
    })

    this.stats.size = this.cache.size

    if (DEBUG_CACHE) {
      console.log(`[GeometryCache] SET ${bodyId} v${version}, size=${this.cache.size}`)
    }
  }

  /**
   * Get geometry from cache
   * Returns undefined if not found or if version doesn't match (when expectedVersion provided)
   */
  get(bodyId: string, expectedVersion?: number): THREE.BufferGeometry | undefined {
    const entry = this.cache.get(bodyId)

    if (!entry) {
      this.stats.misses++
      if (DEBUG_CACHE) {
        console.log(`[GeometryCache] MISS ${bodyId}`)
      }
      return undefined
    }

    // Version check if expected version is provided
    if (expectedVersion !== undefined && entry.version !== expectedVersion) {
      this.stats.misses++
      if (DEBUG_CACHE) {
        console.log(`[GeometryCache] STALE ${bodyId} (have v${entry.version}, want v${expectedVersion})`)
      }
      return undefined
    }

    // Update access time for LRU
    entry.lastAccess = Date.now()
    this.stats.hits++

    if (DEBUG_CACHE) {
      console.log(`[GeometryCache] HIT ${bodyId}`)
    }

    return entry.geometry
  }

  /**
   * Check if cache has entry for body
   */
  has(bodyId: string): boolean {
    return this.cache.has(bodyId)
  }

  /**
   * Get version of cached geometry
   */
  getVersion(bodyId: string): number | undefined {
    return this.cache.get(bodyId)?.version
  }

  /**
   * Delete entry from cache
   */
  delete(bodyId: string): void {
    const entry = this.cache.get(bodyId)
    if (entry) {
      // Note: We don't dispose geometry here because it may still be in use
      // The caller (component) is responsible for disposal
      this.cache.delete(bodyId)
      this.stats.size = this.cache.size

      if (DEBUG_CACHE) {
        console.log(`[GeometryCache] DELETE ${bodyId}`)
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear()
    this.stats.size = 0

    if (DEBUG_CACHE) {
      console.log('[GeometryCache] CLEAR')
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): Readonly<CacheStats> {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
    }
  }

  /**
   * Get hit rate as percentage
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses
    if (total === 0) return 0
    return (this.stats.hits / total) * 100
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Evict least recently used entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++

      if (DEBUG_CACHE) {
        console.log(`[GeometryCache] EVICT ${oldestKey}`)
      }
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const geometryCache = new GeometryCache()

// ─── Backward Compatibility ───────────────────────────────────────────────────
// These maintain the same API as before for existing code

// Re-export instance methods bound to the instance
export const {
  set: setCacheEntry,
  get: getCacheEntry,
  has: hasCacheEntry,
  delete: deleteCacheEntry,
} = {
  set: geometryCache.set.bind(geometryCache),
  get: geometryCache.get.bind(geometryCache),
  has: geometryCache.has.bind(geometryCache),
  delete: geometryCache.delete.bind(geometryCache),
}
