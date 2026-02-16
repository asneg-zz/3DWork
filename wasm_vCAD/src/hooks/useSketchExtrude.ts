import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'

export function useSketchExtrude() {
  const updateFeature = useSceneStore((s) => s.updateFeature)
  const addFeature = useSceneStore((s) => s.addFeature)

  const sketchBodyId = useSketchStore((s) => s.bodyId)
  const sketchId = useSketchStore((s) => s.sketchId)
  const plane = useSketchStore((s) => s.plane)
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
            offset: 0.0,
            elements: [...elements],
            construction,
            constraints: constraints.length > 0 ? [...constraints] : undefined,
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
          console.log('Updated existing extrude parameters')
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
          console.log('Created new extrude feature')
        }
      }
    } catch (error) {
      console.error('Extrude operation failed:', error)
    } finally {
      // Always exit sketch mode, even if extrude fails
      exitSketch()
    }
  }

  return { extrudeAndExit, canExtrude, getExistingExtrudeParams }
}
