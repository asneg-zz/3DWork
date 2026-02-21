import * as THREE from 'three'
import { useSceneStore } from '@/stores/sceneStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { generateExtrudeMesh } from '@/utils/extrudeMesh'
import { performCSG, serializeGeometry, deserializeGeometry } from '@/utils/manifoldCSG'
import type { Body } from '@/types/scene'

/**
 * Returns the body's base geometry (before any cut operations) by re-deriving it
 * from the feature list. Falls back to the stored base_mesh on the cut feature.
 */
function getBaseGeometry(body: Body, cutFeatureId: string): THREE.BufferGeometry | null {
  const cutIdx = body.features.findIndex(f => f.id === cutFeatureId)
  if (cutIdx < 0) return null

  // Walk backwards from the cut feature to find the last geometry-producing feature
  for (let i = cutIdx - 1; i >= 0; i--) {
    const f = body.features[i]

    if (f.type === 'extrude' && f.extrude_params) {
      const sketchF = body.features.find(sf => sf.id === f.sketch_id)
      if (sketchF?.sketch) {
        const ep = f.extrude_params
        return generateExtrudeMesh(
          sketchF.sketch.elements,
          sketchF.sketch.plane,
          ep.height,
          ep.height_backward,
          sketchF.sketch.offset ?? 0,
          sketchF.sketch.face_coord_system ?? null,
          ep.draft_angle ?? 0
        )
      }
    }

    if ((f.type === 'boolean' || f.type === 'cut') &&
        f.cached_mesh_vertices && f.cached_mesh_indices) {
      return deserializeGeometry({
        vertices: f.cached_mesh_vertices,
        indices: f.cached_mesh_indices,
      })
    }
  }

  // Fallback: stored pre-cut geometry on the cut feature itself
  const cutF = body.features[cutIdx]
  if (cutF.base_mesh_vertices && cutF.base_mesh_indices) {
    return deserializeGeometry({
      vertices: cutF.base_mesh_vertices,
      indices: cutF.base_mesh_indices,
    })
  }

  return null
}

export function useFeatureEdit() {
  const updateFeature = useSceneStore((s) => s.updateFeature)

  /** Update extrude parameters — renderer recomputes mesh automatically */
  const editExtrudeFeature = (
    bodyId: string,
    featureId: string,
    height: number,
    heightBackward: number,
    draftAngle: number
  ) => {
    updateFeature(bodyId, featureId, {
      name: `Extrude ${height.toFixed(2)}`,
      extrude_params: {
        height,
        height_backward: heightBackward,
        draft_angle: draftAngle,
      },
    })
  }

  /** Update cut parameters — recomputes CSG using stored/derived base geometry */
  const editCutFeature = async (
    bodyId: string,
    featureId: string,
    height: number,
    heightBackward: number,
    draftAngle: number
  ) => {
    const body = useSceneStore.getState().scene.bodies.find(b => b.id === bodyId)
    const cutFeature = body?.features.find(f => f.id === featureId)
    if (!body || !cutFeature) return

    const sketchFeature = body.features.find(f => f.id === cutFeature.sketch_id)
    if (!sketchFeature?.sketch) {
      useNotificationStore.getState().show('Скетч для выреза не найден.', 'warning')
      return
    }

    const baseGeo = getBaseGeometry(body, featureId)
    if (!baseGeo) {
      useNotificationStore.getState().show(
        'Не удалось получить базовую геометрию для обновления выреза.',
        'warning'
      )
      return
    }

    try {
      const cutToolGeo = generateExtrudeMesh(
        sketchFeature.sketch.elements,
        sketchFeature.sketch.plane,
        height,
        heightBackward,
        sketchFeature.sketch.offset ?? 0,
        sketchFeature.sketch.face_coord_system ?? null,
        draftAngle
      )

      const resultGeo = await performCSG(baseGeo, cutToolGeo, 'difference')
      const { vertices, indices } = serializeGeometry(resultGeo)

      updateFeature(bodyId, featureId, {
        extrude_params: {
          height,
          height_backward: heightBackward,
          draft_angle: draftAngle,
        },
        cached_mesh_vertices: vertices,
        cached_mesh_indices: indices,
      })
    } catch (error) {
      useNotificationStore.getState().show(
        'Ошибка обновления выреза: ' + (error instanceof Error ? error.message : String(error)),
        'error'
      )
    }
  }

  return { editExtrudeFeature, editCutFeature }
}
