import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION, ADDITION, INTERSECTION } from 'three-bvh-csg'

export type CSGOperation = 'union' | 'difference' | 'intersection'

const evaluator = new Evaluator()

/**
 * Creates a brush from a Three.js mesh for CSG operations
 */
export function createBrush(mesh: THREE.Mesh): Brush {
  const brush = new Brush(mesh.geometry, mesh.material)
  brush.position.copy(mesh.position)
  brush.rotation.copy(mesh.rotation)
  brush.scale.copy(mesh.scale)
  brush.updateMatrixWorld()
  return brush
}

/**
 * Performs a CSG operation between two brushes
 */
export function performCSG(
  brushA: Brush,
  brushB: Brush,
  operation: CSGOperation
): THREE.Mesh {
  let opConstant
  switch (operation) {
    case 'union':
      opConstant = ADDITION
      break
    case 'difference':
      opConstant = SUBTRACTION
      break
    case 'intersection':
      opConstant = INTERSECTION
      break
  }

  const result = evaluator.evaluate(brushA, brushB, opConstant)
  return result as THREE.Mesh
}

/**
 * Creates standard primitives as brushes
 */
export const createPrimitiveBrush = {
  cube: (width = 1, height = 1, depth = 1, material?: THREE.Material) => {
    const geometry = new THREE.BoxGeometry(width, height, depth)
    return new Brush(geometry, material || new THREE.MeshStandardMaterial())
  },

  cylinder: (radius = 0.5, height = 1, segments = 32, material?: THREE.Material) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
    return new Brush(geometry, material || new THREE.MeshStandardMaterial())
  },

  sphere: (radius = 0.5, segments = 32, material?: THREE.Material) => {
    const geometry = new THREE.SphereGeometry(radius, segments, segments)
    return new Brush(geometry, material || new THREE.MeshStandardMaterial())
  },

  cone: (radius = 0.5, height = 1, segments = 32, material?: THREE.Material) => {
    const geometry = new THREE.ConeGeometry(radius, height, segments)
    return new Brush(geometry, material || new THREE.MeshStandardMaterial())
  },
}

/**
 * Example: Create a cube with a cylindrical hole
 */
export function createCubeWithHole(): THREE.Mesh {
  const cube = createPrimitiveBrush.cube(2, 2, 2)
  const cylinder = createPrimitiveBrush.cylinder(0.5, 3)

  return performCSG(cube, cylinder, 'difference')
}
