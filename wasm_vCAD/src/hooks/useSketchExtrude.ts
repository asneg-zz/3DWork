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

        // Now create the extrude feature
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
    } catch (error) {
      console.error('Extrude operation failed:', error)
    } finally {
      // Always exit sketch mode, even if extrude fails
      exitSketch()
    }
  }

  return { extrudeAndExit }
}
