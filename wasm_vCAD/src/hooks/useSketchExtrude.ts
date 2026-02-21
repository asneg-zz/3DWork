import * as THREE from 'three'
import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'
import { performCSG, performCSGCut, serializeGeometry, deserializeGeometry } from '@/utils/manifoldCSG'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { geometryCache } from '@/utils/geometryCache'
import { useNotificationStore } from '@/stores/notificationStore'
import type { Feature } from '@/types/scene'

export function useSketchExtrude() {
  const updateFeature = useSceneStore((s) => s.updateFeature)
  const addFeature = useSceneStore((s) => s.addFeature)

  const sketchBodyId = useSketchStore((s) => s.bodyId)
  const sketchId = useSketchStore((s) => s.sketchId)
  const plane = useSketchStore((s) => s.plane)
  const planeOffset = useSketchStore((s) => s.planeOffset)
  const faceCoordSystem = useSketchStore((s) => s.faceCoordSystem)
  const elements = useSketchStore((s) => s.elements)
  const constraints = useSketchStore((s) => s.constraints)
  const constructionIds = useSketchStore((s) => s.constructionIds)
  const exitSketch = useSketchStore((s) => s.exitSketch)

  // Check if this sketch already has an extrude feature
  const canExtrude = () => {
    if (!sketchBodyId || !sketchId) return false

    const bodies = useSceneStore.getState().scene.bodies
    const body = bodies.find(b => b.id === sketchBodyId)
    if (!body) return false

    // Check if any extrude feature already uses this sketch
    const existingExtrude = body.features.find(
      f => f.type === 'extrude' && f.sketch_id === sketchId
    )

    return !existingExtrude
  }

  // Get existing extrude parameters for this sketch (if exists)
  const getExistingExtrudeParams = () => {
    if (!sketchBodyId || !sketchId) return null

    const bodies = useSceneStore.getState().scene.bodies
    const body = bodies.find(b => b.id === sketchBodyId)
    if (!body) return null

    const existingExtrude = body.features.find(
      f => f.type === 'extrude' && f.sketch_id === sketchId
    )

    if (existingExtrude && existingExtrude.extrude_params) {
      return {
        height: existingExtrude.extrude_params.height,
        heightBackward: existingExtrude.extrude_params.height_backward,
        draftAngle: existingExtrude.extrude_params.draft_angle,
        extrudeId: existingExtrude.id
      }
    }

    return null
  }

  const extrudeAndExit = async (height: number, heightBackward: number, draftAngle: number) => {
    if (!sketchBodyId || !sketchId) {
      exitSketch()
      return
    }

    try {
      // First, save the sketch feature
      const bodies = useSceneStore.getState().scene.bodies
      const body = bodies.find(b => b.id === sketchBodyId)

      if (body) {
        const existingSketchFeature = body.features.find(f => f.id === sketchId)

        // Save or update sketch feature
        const sketchFeature = {
          id: sketchId,
          type: 'sketch' as const,
          name: `Sketch (${plane})`,
          sketch: {
            id: sketchId,
            plane,
            offset: planeOffset,
            elements: [...elements],
            construction_ids: constructionIds.length > 0 ? [...constructionIds] : undefined,
            constraints: constraints.length > 0 ? [...constraints] : undefined,
            face_coord_system: faceCoordSystem ?? undefined,
          }
        }

        if (existingSketchFeature) {
          updateFeature(sketchBodyId, sketchId, sketchFeature)
        } else {
          addFeature(sketchBodyId, sketchFeature)
        }

        // Check if this sketch already has an extrude feature
        const existingExtrude = body.features.find(
          f => f.type === 'extrude' && f.sketch_id === sketchId
        )

        // Find the last feature with cached geometry (cut or boss extrude)
        const lastCachedFeature = [...body.features].reverse().find(
          f => (f.type === 'cut' || f.type === 'extrude') && f.cached_mesh_vertices && f.cached_mesh_indices
        )

        if (existingExtrude) {
          // Update existing extrude
          if (existingExtrude.cached_mesh_vertices && existingExtrude.cached_mesh_indices) {
            // Re-edit boss extrude: redo CSG union from base geometry
            let baseGeo: THREE.BufferGeometry | null = null
            if (existingExtrude.base_mesh_vertices && existingExtrude.base_mesh_indices) {
              baseGeo = deserializeGeometry({
                vertices: existingExtrude.base_mesh_vertices,
                indices: existingExtrude.base_mesh_indices,
              })
            } else {
              baseGeo = geometryCache.get(sketchBodyId) ?? null
            }
            if (baseGeo) {
              const extrudeGeo = generateExtrudeMesh(elements, plane, height, heightBackward, planeOffset, faceCoordSystem ?? null, draftAngle)
              const resultGeo = await performCSG(baseGeo, extrudeGeo, 'union')
              const { vertices, indices } = serializeGeometry(resultGeo)
              // Re-read fresh feature state after async CSG to avoid stale spread
              const freshExtrude = useSceneStore.getState().scene.bodies
                .find(b => b.id === sketchBodyId)?.features.find(f => f.id === existingExtrude.id)
              updateFeature(sketchBodyId, existingExtrude.id, {
                ...(freshExtrude ?? existingExtrude),
                name: `Extrude ${height.toFixed(2)}`,
                extrude_params: { height, height_backward: heightBackward, draft_angle: draftAngle },
                cached_mesh_vertices: vertices,
                cached_mesh_indices: indices,
              })
            } else {
              const freshExtrude = useSceneStore.getState().scene.bodies
                .find(b => b.id === sketchBodyId)?.features.find(f => f.id === existingExtrude.id)
              updateFeature(sketchBodyId, existingExtrude.id, {
                ...(freshExtrude ?? existingExtrude),
                name: `Extrude ${height.toFixed(2)}`,
                extrude_params: { height, height_backward: heightBackward, draft_angle: draftAngle },
              })
            }
          } else {
            // Simple extrude update (no cached mesh)
            const freshExtrude = useSceneStore.getState().scene.bodies
              .find(b => b.id === sketchBodyId)?.features.find(f => f.id === existingExtrude.id)
            updateFeature(sketchBodyId, existingExtrude.id, {
              ...(freshExtrude ?? existingExtrude),
              name: `Extrude ${height.toFixed(2)}`,
              extrude_params: { height, height_backward: heightBackward, draft_angle: draftAngle },
            })
          }
        } else if (lastCachedFeature) {
          // Body already has cached geometry (from cuts or previous boss extrudes).
          // Perform CSG union so the new extrude merges with the existing solid.
          const bodyGeo = deserializeGeometry({
            vertices: lastCachedFeature.cached_mesh_vertices!,
            indices: lastCachedFeature.cached_mesh_indices!,
          })
          const { vertices: baseV, indices: baseI } = serializeGeometry(bodyGeo)

          const extrudeGeo = generateExtrudeMesh(elements, plane, height, heightBackward, planeOffset, faceCoordSystem ?? null, draftAngle)
          const resultGeo = await performCSG(bodyGeo, extrudeGeo, 'union')
          const { vertices, indices } = serializeGeometry(resultGeo)

          const extrudeId = engine.extrudeSketch(sketchId, height, heightBackward, draftAngle)
          const extrudeFeature: Feature = {
            id: extrudeId,
            type: 'extrude' as const,
            name: `Extrude ${height.toFixed(2)}`,
            sketch_id: sketchId,
            extrude_params: { height, height_backward: heightBackward, draft_angle: draftAngle },
            cached_mesh_vertices: vertices,
            cached_mesh_indices: indices,
            base_mesh_vertices: baseV,
            base_mesh_indices: baseI,
          }
          addFeature(sketchBodyId, extrudeFeature)
        } else {
          // Simple extrude on body without cached geometry
          const extrudeId = engine.extrudeSketch(sketchId, height, heightBackward, draftAngle)
          const extrudeFeature: Feature = {
            id: extrudeId,
            type: 'extrude' as const,
            name: `Extrude ${height.toFixed(2)}`,
            sketch_id: sketchId,
            extrude_params: { height, height_backward: heightBackward, draft_angle: draftAngle },
          }
          addFeature(sketchBodyId, extrudeFeature)
        }
      }
    } catch (error) {
      console.error('Extrude operation failed:', error)
      useNotificationStore.getState().show(
        'Ошибка выдавливания: ' + (error instanceof Error ? error.message : String(error)),
        'error'
      )
    } finally {
      // Always exit sketch mode, even if extrude fails
      exitSketch()
    }
  }

  const cutAndExit = async (height: number, heightBackward: number, draftAngle: number) => {
    if (!sketchBodyId || !sketchId) {
      exitSketch()
      return
    }

    try {
      const bodies = useSceneStore.getState().scene.bodies
      const body = bodies.find(b => b.id === sketchBodyId)

      if (!body) {
        exitSketch()
        return
      }

      // Save sketch feature first
      const existingSketchFeature = body.features.find(f => f.id === sketchId)
      const sketchFeature = {
        id: sketchId,
        type: 'sketch' as const,
        name: `Sketch (${plane})`,
        sketch: {
          id: sketchId,
          plane,
          offset: planeOffset,
          elements: [...elements],
          construction_ids: constructionIds.length > 0 ? [...constructionIds] : undefined,
          constraints: constraints.length > 0 ? [...constraints] : undefined,
          face_coord_system: faceCoordSystem ?? undefined,
        }
      }

      if (existingSketchFeature) {
        updateFeature(sketchBodyId, sketchId, sketchFeature)
      } else {
        addFeature(sketchBodyId, sketchFeature)
      }

      // Check if a cut already exists for this sketch (only one allowed)
      const existingCut = body.features.find(f => f.type === 'cut' && f.sketch_id === sketchId)

      let bodyGeo
      if (existingCut) {
        // UPDATE existing cut: re-use stored pre-cut geometry to avoid cutting from already-cut mesh.
        if (existingCut.base_mesh_vertices && existingCut.base_mesh_indices) {
          bodyGeo = deserializeGeometry({
            vertices: existingCut.base_mesh_vertices,
            indices: existingCut.base_mesh_indices,
          })
        } else {
          // base_mesh not yet populated (race with useRebuildUncachedCuts) — rebuild by replaying
          // all features that precede this cut in the feature list.
          let rebuiltBase: THREE.BufferGeometry | null = null
          for (const f of body.features) {
            if (f.id === existingCut.id) break
            if (f.type === 'extrude') {
              const sk = body.features.find(bf => bf.id === f.sketch_id)
              if (sk?.type === 'sketch' && sk.sketch) {
                rebuiltBase = generateExtrudeMesh(
                  sk.sketch.elements,
                  sk.sketch.plane,
                  f.extrude_params?.height ?? 1,
                  f.extrude_params?.height_backward ?? 0,
                  sk.sketch.offset ?? 0,
                  sk.sketch.face_coord_system ?? null,
                  f.extrude_params?.draft_angle ?? 0
                )
              }
            } else if (f.type === 'cut' && f.cached_mesh_vertices && f.cached_mesh_indices) {
              rebuiltBase = deserializeGeometry({
                vertices: f.cached_mesh_vertices,
                indices: f.cached_mesh_indices,
              })
            }
          }
          if (!rebuiltBase) {
            useNotificationStore.getState().show(
              'Нет базовой геометрии для обновления выреза.',
              'warning'
            )
            exitSketch()
            return
          }
          bodyGeo = rebuiltBase
        }
      } else {
        // CREATE new cut: need to get or build combined body geometry
        // Check if there are multiple extrudes without cached_mesh - if so, cache is incomplete
        const extrudeFeatures = body.features.filter(f => f.type === 'extrude')
        const uncachedExtrudes = extrudeFeatures.filter(f => !f.cached_mesh_vertices)
        const needsRebuild = uncachedExtrudes.length > 1

        if (needsRebuild) {
          // Multiple extrudes without cached mesh - need to combine all
          let combinedGeo: THREE.BufferGeometry | null = null

          for (const extrudeF of extrudeFeatures) {
            // If this extrude has cached mesh (from prior CSG union), use it
            if (extrudeF.cached_mesh_vertices && extrudeF.cached_mesh_indices) {
              combinedGeo = deserializeGeometry({
                vertices: extrudeF.cached_mesh_vertices,
                indices: extrudeF.cached_mesh_indices,
              })
            } else {
              // No cached mesh - generate from sketch
              const sk = body.features.find(bf => bf.id === extrudeF.sketch_id)
              if (sk?.type === 'sketch' && sk.sketch) {
                const extrudeGeo = generateExtrudeMesh(
                  sk.sketch.elements,
                  sk.sketch.plane,
                  extrudeF.extrude_params?.height ?? 1,
                  extrudeF.extrude_params?.height_backward ?? 0,
                  sk.sketch.offset ?? 0,
                  sk.sketch.face_coord_system ?? null,
                  extrudeF.extrude_params?.draft_angle ?? 0
                )

                if (combinedGeo) {
                  combinedGeo = await performCSG(combinedGeo, extrudeGeo, 'union')
                } else {
                  combinedGeo = extrudeGeo
                }
              }
            }
          }

          bodyGeo = combinedGeo ?? undefined
        } else {
          // Single extrude or all have cached mesh - use geometry cache
          bodyGeo = geometryCache.get(sketchBodyId)
        }

        if (!bodyGeo) {
          useNotificationStore.getState().show(
            'Вырез невозможен: тело не имеет геометрии. Сначала создайте выдавливание.',
            'warning'
          )
          exitSketch()
          return
        }
      }

      // CSG difference using Manifold's native extrude for the cut tool.
      // The cut tool always spans height in +normal and heightBackward in -normal,
      // so it passes through the body in both directions (through-all cut).
      const resultGeo = await performCSGCut(
        bodyGeo,
        elements,
        plane,
        planeOffset,
        faceCoordSystem ?? null,
        height,
        heightBackward,
        draftAngle,
      )
      const { vertices, indices } = serializeGeometry(resultGeo)

      if (existingCut) {
        // Re-read fresh feature state after async CSG to avoid stale spread
        const freshCut = useSceneStore.getState().scene.bodies
          .find(b => b.id === sketchBodyId)?.features.find(f => f.id === existingCut.id)
        // Update existing cut feature (keep stored base_mesh intact)
        updateFeature(sketchBodyId, existingCut.id, {
          ...(freshCut ?? existingCut),
          extrude_params: {
            height,
            height_backward: heightBackward,
            draft_angle: draftAngle,
          },
          cached_mesh_vertices: vertices,
          cached_mesh_indices: indices,
        })
      } else {
        // Serialize base geometry for future re-edits
        const { vertices: baseV, indices: baseI } = serializeGeometry(bodyGeo)

        const cutFeature: Feature = {
          id: crypto.randomUUID(),
          type: 'cut',
          name: `Cut`,
          sketch_id: sketchId,
          extrude_params: {
            height,
            height_backward: heightBackward,
            draft_angle: draftAngle,
          },
          cached_mesh_vertices: vertices,
          cached_mesh_indices: indices,
          base_mesh_vertices: baseV,
          base_mesh_indices: baseI,
        }

        addFeature(sketchBodyId, cutFeature)
      }
    } catch (error) {
      console.error('Cut operation failed:', error)
      useNotificationStore.getState().show(
        'Ошибка вырезания: ' + (error instanceof Error ? error.message : String(error)),
        'error'
      )
    } finally {
      exitSketch()
    }
  }

  return { extrudeAndExit, cutAndExit, canExtrude, getExistingExtrudeParams }
}
