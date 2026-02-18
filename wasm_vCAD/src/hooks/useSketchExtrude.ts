import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { performCSG, serializeGeometry } from '@/utils/manifoldCSG'
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

      // Get current body geometry from cache (must exist — body must be already extruded)
      const bodyGeo = geometryCache.get(sketchBodyId)
      if (!bodyGeo) {
        useNotificationStore.getState().show(
          'Вырез невозможен: тело не имеет геометрии. Сначала создайте выдавливание.',
          'warning'
        )
        exitSketch()
        return
      }

      // Build cut tool mesh: extrude the sketch profile with specified depth
      const cutToolGeo = generateExtrudeMesh(
        elements,
        plane,
        height,
        heightBackward,
        planeOffset,
        faceCoordSystem ?? null
      )

      // CSG difference: body - cut tool
      const resultGeo = await performCSG(bodyGeo, cutToolGeo, 'difference')
      const { vertices, indices } = serializeGeometry(resultGeo)

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
      }

      addFeature(sketchBodyId, cutFeature)
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
