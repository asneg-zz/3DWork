/**
 * Manifold-3D CSG operations wrapper
 * Provides union, difference, and intersection between THREE.BufferGeometry meshes.
 */

import * as THREE from 'three'
import type { ManifoldToplevel } from 'manifold-3d'
import type { SketchElement, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { extractProfiles2D, getPlaneCoordSystem } from '@/utils/extrudeMesh'

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

// ─── Native Manifold cut (robust alternative) ─────────────────────────────────

/**
 * Build a Manifold solid from 2D sketch profiles using CrossSection.extrude().
 * This is more robust than converting a Three.js mesh because Manifold generates
 * the geometry internally and guarantees a valid 2-manifold result.
 *
 * The profiles are in sketch (u, v) coordinates. The function applies a 4×4
 * column-major transform that maps:
 *   local X → uAxis  (world direction)
 *   local Y → vAxis  (world direction)
 *   local Z → normal (world direction, = extrusion direction)
 *   local origin → (origin − normal × heightBackward)  in world
 */
function buildManifoldFromProfiles(
  mod: ManifoldToplevel,
  profiles2D: [number, number][][],
  origin: [number, number, number],
  normal: [number, number, number],
  uAxis:  [number, number, number],
  vAxis:  [number, number, number],
  height: number,
  heightBackward: number,
  draftAngle: number = 0,
): InstanceType<ManifoldToplevel['Manifold']> {
  const totalHeight = height + heightBackward

  // Build each closed polygon as a CrossSection and union them all
  let crossSection = new mod.CrossSection(profiles2D as [number, number][][])

  // Calculate scale factor for draft angle
  let scaleTop: [number, number] = [1, 1]
  if (draftAngle !== 0) {
    // Calculate average radius of all profiles from centroid
    let cx = 0, cy = 0, count = 0
    for (const profile of profiles2D) {
      for (const [x, y] of profile) {
        cx += x
        cy += y
        count++
      }
    }
    if (count > 0) {
      cx /= count
      cy /= count

      // Calculate average distance from centroid
      let avgRadius = 0
      for (const profile of profiles2D) {
        for (const [x, y] of profile) {
          avgRadius += Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        }
      }
      avgRadius /= count

      if (avgRadius > 0.001) {
        const draftRad = (draftAngle * Math.PI) / 180
        const draftExpansion = Math.tan(draftRad) * totalHeight
        const scaleFactor = (avgRadius + draftExpansion) / avgRadius
        scaleTop = [scaleFactor, scaleFactor]
      }
    }
  }

  // Extrude along local Z from 0 to totalHeight with optional draft scaling
  let solid = crossSection.extrude(totalHeight, 0, 0, scaleTop)

  // Translate backward inside local space so the profile plane is at
  // the correct position in world space. The profile was at z=0 locally;
  // we need it at world offset = origin − normal*heightBackward.
  const tx = origin[0] - normal[0] * heightBackward
  const ty = origin[1] - normal[1] * heightBackward
  const tz = origin[2] - normal[2] * heightBackward

  // Column-major 4×4 matrix mapping local (u, v, Z) → world (x, y, z):
  //   col 0: [uAxis,  0]
  //   col 1: [vAxis,  0]
  //   col 2: [normal, 0]
  //   col 3: [tx, ty, tz, 1]
  const mat: [
    number,number,number,number,
    number,number,number,number,
    number,number,number,number,
    number,number,number,number
  ] = [
    uAxis[0],  uAxis[1],  uAxis[2],  0,
    vAxis[0],  vAxis[1],  vAxis[2],  0,
    normal[0], normal[1], normal[2], 0,
    tx,        ty,        tz,        1,
  ]

  return solid.transform(mat)
}

/**
 * Perform a CSG subtraction (body − cut tool) where the cut tool is built
 * using Manifold's native CrossSection.extrude(). This is more robust than
 * converting a Three.js geometry because it avoids mesh quality issues.
 *
 * @param bodyGeo  The body geometry (Three.js BufferGeometry from the scene).
 * @param elements Sketch elements defining the cut profile.
 * @param plane    Sketch plane identifier.
 * @param offset   Plane offset (the distance along the normal axis).
 * @param fcs      Face coordinate system (for CUSTOM plane; null otherwise).
 * @param height   Extrusion distance in the +normal direction.
 * @param heightBackward Extrusion distance in the −normal direction.
 * @param draftAngle Draft angle in degrees (positive = expands, negative = contracts).
 */
export async function performCSGCut(
  bodyGeo: THREE.BufferGeometry,
  elements: SketchElement[],
  plane: SketchPlane,
  offset: number,
  fcs: FaceCoordSystem | null,
  height: number,
  heightBackward: number,
  draftAngle: number = 0,
): Promise<THREE.BufferGeometry> {
  const mod = await getWasm()

  // ── Body: convert Three.js geometry → Manifold ──
  const meshA = threeToManifoldMesh(mod, bodyGeo)
  const mA = new mod.Manifold(meshA)

  if (mA.status() !== 'NoError') {
    throw new Error(`CSG cut: body mesh is not manifold (status ${mA.status()}). Try reloading the page.`)
  }

  // ── Cut tool: built natively via Manifold CrossSection ──
  const profiles2D = extractProfiles2D(elements)
  if (profiles2D.length === 0) {
    throw new Error('CSG cut: no valid closed profile found in sketch elements')
  }

  const cs = getPlaneCoordSystem(plane, offset, fcs)

  const mB = buildManifoldFromProfiles(
    mod,
    profiles2D,
    cs.origin,
    cs.normal,
    cs.uAxis,
    cs.vAxis,
    height,
    heightBackward,
    draftAngle,
  )

  if (mB.status() !== 'NoError') {
    throw new Error(`CSG cut: cut tool is not manifold (status ${mB.status()})`)
  }

  // ── Subtract ──
  const result = mA.subtract(mB)

  if (result.isEmpty()) {
    throw new Error('CSG cut: result is empty — cut tool may not intersect the body')
  }

  return manifoldMeshToThree(result.getMesh())
}
