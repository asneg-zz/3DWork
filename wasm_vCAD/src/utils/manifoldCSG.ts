/**
 * Manifold-3D CSG operations wrapper
 * Provides union, difference, and intersection between THREE.BufferGeometry meshes.
 */

import * as THREE from 'three'
import type { ManifoldToplevel } from 'manifold-3d'

export type BooleanOp = 'union' | 'difference' | 'intersection'

// ─── Module singleton ─────────────────────────────────────────────────────────

let wasm: ManifoldToplevel | null = null
let initPromise: Promise<ManifoldToplevel> | null = null

async function getWasm(): Promise<ManifoldToplevel> {
  if (wasm) return wasm
  if (initPromise) return initPromise

  initPromise = (async () => {
    const Module = (await import('manifold-3d')).default
    const mod = await Module()
    mod.setup()
    wasm = mod
    return mod
  })()

  return initPromise
}

/** Eagerly initialize manifold-3d so the first CSG call is not delayed. */
export function preloadManifold(): void {
  getWasm().catch(console.error)
}

// ─── Vertex merging ───────────────────────────────────────────────────────────

/**
 * Merge duplicate vertices in a BufferGeometry (required for watertight input).
 * Works on position data only; normals and UVs are discarded (recomputed later).
 */
function mergeVertices(geo: THREE.BufferGeometry, tol = 1e-5): THREE.BufferGeometry {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
  const indexAttr = geo.index

  const invTol = 1 / tol
  const newPositions: number[] = []
  const remap: number[] = []
  const lookup = new Map<string, number>()

  const key = (x: number, y: number, z: number) =>
    `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(z * invTol)}`

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i)
    const y = posAttr.getY(i)
    const z = posAttr.getZ(i)
    const k = key(x, y, z)
    if (lookup.has(k)) {
      remap.push(lookup.get(k)!)
    } else {
      const idx = newPositions.length / 3
      lookup.set(k, idx)
      newPositions.push(x, y, z)
      remap.push(idx)
    }
  }

  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3))

  const srcIndices = indexAttr
    ? Array.from({ length: indexAttr.count }, (_, i) => indexAttr.getX(i))
    : Array.from({ length: posAttr.count }, (_, i) => i)

  out.setIndex(srcIndices.map(i => remap[i]))
  return out
}

// ─── Conversion: THREE.BufferGeometry ↔ Manifold Mesh ─────────────────────────

function threeToManifoldMesh(mod: ManifoldToplevel, geo: THREE.BufferGeometry): InstanceType<typeof mod.Mesh> {
  const merged = mergeVertices(geo)
  const posAttr = merged.getAttribute('position') as THREE.BufferAttribute
  const idxAttr = merged.index!

  const numVerts = posAttr.count
  const vertProperties = new Float32Array(numVerts * 3)
  for (let i = 0; i < numVerts; i++) {
    vertProperties[i * 3]     = posAttr.getX(i)
    vertProperties[i * 3 + 1] = posAttr.getY(i)
    vertProperties[i * 3 + 2] = posAttr.getZ(i)
  }

  const triVerts = new Uint32Array(idxAttr.count)
  for (let i = 0; i < idxAttr.count; i++) {
    triVerts[i] = idxAttr.getX(i)
  }

  return new mod.Mesh({ numProp: 3, vertProperties, triVerts })
}

function manifoldMeshToThree(mesh: InstanceType<ManifoldToplevel['Mesh']>): THREE.BufferGeometry {
  const { vertProperties, triVerts, numProp } = mesh
  const numVerts = vertProperties.length / numProp

  const positions = new Float32Array(numVerts * 3)
  for (let i = 0; i < numVerts; i++) {
    positions[i * 3]     = vertProperties[i * numProp]
    positions[i * 3 + 1] = vertProperties[i * numProp + 1]
    positions[i * 3 + 2] = vertProperties[i * numProp + 2]
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(triVerts), 1))
  geo.computeVertexNormals()
  return geo
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Perform a CSG boolean operation between two Three.js geometries.
 * Returns a new BufferGeometry with smoothed normals.
 *
 * Both geometries must represent valid solids (watertight); primitives from
 * the WASM engine and extruded sketches generally satisfy this.
 */
export async function performCSG(
  geoA: THREE.BufferGeometry,
  geoB: THREE.BufferGeometry,
  operation: BooleanOp
): Promise<THREE.BufferGeometry> {
  const mod = await getWasm()

  const meshA = threeToManifoldMesh(mod, geoA)
  const meshB = threeToManifoldMesh(mod, geoB)

  const mA = new mod.Manifold(meshA)
  const mB = new mod.Manifold(meshB)

  let result: InstanceType<ManifoldToplevel['Manifold']>
  switch (operation) {
    case 'union':        result = mA.add(mB);       break
    case 'difference':   result = mA.subtract(mB);  break
    case 'intersection': result = mA.intersect(mB); break
  }

  if (result.isEmpty()) {
    throw new Error(`CSG ${operation}: result is empty`)
  }

  return manifoldMeshToThree(result.getMesh())
}

/**
 * Serialize a THREE.BufferGeometry to plain arrays suitable for JSON storage.
 */
export function serializeGeometry(geo: THREE.BufferGeometry): {
  vertices: number[]
  indices: number[]
} {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const idx = geo.index!
  return {
    vertices: Array.from(pos.array),
    indices:  Array.from(idx.array),
  }
}

/**
 * Restore a THREE.BufferGeometry from serialized arrays.
 */
export function deserializeGeometry(data: { vertices: number[]; indices: number[] }): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.vertices), 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1))
  geo.computeVertexNormals()
  return geo
}
