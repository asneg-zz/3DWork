import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { performCSG, serializeGeometry, deserializeGeometry } from '@/utils/manifoldCSG'
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
  const construction = useSketchStore((s) => s.construction)
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

  const extrudeAndExit = (height: number, heightBackward: number, draftAngle: number) => {
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
            construction,
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

        if (existingExtrude) {
          // Update existing extrude parameters
          const updatedExtrudeFeature = {
            ...existingExtrude,
            name: `Extrude ${height.toFixed(2)}`,
            extrude_params: {
              height,
              height_backward: heightBackward,
              draft_angle: draftAngle
            }
          }
          updateFeature(sketchBodyId, existingExtrude.id, updatedExtrudeFeature)
        } else {
          // Create new extrude feature
          const extrudeId = engine.extrudeSketch(sketchId, height, heightBackward, draftAngle)

          const extrudeFeature = {
            id: extrudeId,
            type: 'extrude' as const,
            name: `Extrude ${height.toFixed(2)}`,
            sketch_id: sketchId,
            extrude_params: {
              height,
              height_backward: heightBackward,
              draft_angle: draftAngle
            }
          }

          addFeature(sketchBodyId, extrudeFeature)
        }
      }
    } catch (error) {
      console.error('Extrude operation failed:', error)
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
          construction,
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
        // UPDATE existing cut: re-use stored pre-cut geometry to avoid cutting from already-cut mesh
        if (!existingCut.base_mesh_vertices || !existingCut.base_mesh_indices) {
          useNotificationStore.getState().show(
            'Нет базовой геометрии для обновления выреза.',
            'warning'
          )
          exitSketch()
          return
        }
        bodyGeo = deserializeGeometry({
          vertices: existingCut.base_mesh_vertices,
          indices: existingCut.base_mesh_indices,
        })
      } else {
        // CREATE new cut: body must have geometry in cache
        bodyGeo = geometryCache.get(sketchBodyId)
        if (!bodyGeo) {
          useNotificationStore.getState().show(
            'Вырез невозможен: тело не имеет геометрии. Сначала создайте выдавливание.',
            'warning'
          )
          exitSketch()
          return
        }
      }

      // Determine cut tool direction.
      // The plane's positive normal points outward from the sketch face.
      // To cut INTO the body we must go in the OPPOSITE direction.
      //
      // If the face outward normal aligns with the plane's positive normal
      // (e.g. top face of a box: face normal = +Z = XY plane normal),
      // the cut must travel in −normal, so we swap height↔heightBackward:
      //   bottom = planeOffset − height * normal  (into body)
      //   top    = planeOffset + heightBackward * normal  (above face, if any)
      //
      // If the face normal is opposite (e.g. bottom face: face normal = −Z),
      // the cut already travels in +normal into the body — keep values as-is.
      let toolHeight = height
      let toolHeightBackward = heightBackward

      if (faceCoordSystem) {
        const fn = faceCoordSystem.normal  // world-space outward face normal
        // Dot product with the plane's canonical positive normal
        let dot = 0
        if (plane === 'XY') dot = fn[2]       // plane normal = [0,0,1]
        else if (plane === 'XZ') dot = fn[1]  // plane normal = [0,1,0]
        else if (plane === 'YZ') dot = fn[0]  // plane normal = [1,0,0]

        if (dot > 0) {
          // Face normal same direction as plane normal → swap to cut downward
          toolHeight = heightBackward
          toolHeightBackward = height
        }
        // dot < 0: face normal opposite → +normal goes into body, keep as-is
      }

      // Build cut tool mesh
      const cutToolGeo = generateExtrudeMesh(
        elements,
        plane,
        toolHeight,
        toolHeightBackward,
        planeOffset,
        faceCoordSystem ?? null
      )

      // CSG difference: body - cut tool
      const resultGeo = await performCSG(bodyGeo, cutToolGeo, 'difference')
      const { vertices, indices } = serializeGeometry(resultGeo)

      if (existingCut) {
        // Update existing cut feature (keep stored base_mesh intact)
        updateFeature(sketchBodyId, existingCut.id, {
          ...existingCut,
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
