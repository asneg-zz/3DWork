/**
 * Hooks for managing Three.js disposable resources
 * Prevents memory leaks from unreleased GPU resources
 */

import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Creates a geometry and automatically disposes it when dependencies change or component unmounts
 */
export function useDisposableGeometry<T extends THREE.BufferGeometry>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const geometryRef = useRef<T | null>(null)

  // Create new geometry when deps change
  const geometry = useMemo(() => {
    // Dispose previous geometry
    if (geometryRef.current) {
      geometryRef.current.dispose()
    }
    const newGeometry = factory()
    geometryRef.current = newGeometry
    return newGeometry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose()
        geometryRef.current = null
      }
    }
  }, [])

  return geometry
}

/**
 * Creates a material and automatically disposes it when dependencies change or component unmounts
 */
export function useDisposableMaterial<T extends THREE.Material>(
  factory: () => T,
  deps: React.DependencyList
): T {
  const materialRef = useRef<T | null>(null)

  const material = useMemo(() => {
    if (materialRef.current) {
      materialRef.current.dispose()
    }
    const newMaterial = factory()
    materialRef.current = newMaterial
    return newMaterial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    return () => {
      if (materialRef.current) {
        materialRef.current.dispose()
        materialRef.current = null
      }
    }
  }, [])

  return material
}

/**
 * Creates an EdgesGeometry from a source geometry with automatic disposal
 */
export function useEdgesGeometry(
  sourceGeometry: THREE.BufferGeometry,
  thresholdAngle: number = 15
): THREE.EdgesGeometry {
  return useDisposableGeometry(
    () => new THREE.EdgesGeometry(sourceGeometry, thresholdAngle),
    [sourceGeometry, thresholdAngle]
  )
}

/**
 * Disposes a Three.js object and all its children recursively
 */
export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    }
    if (child instanceof THREE.Line) {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          (child.material as THREE.Material).dispose()
        }
      }
    }
  })
}
