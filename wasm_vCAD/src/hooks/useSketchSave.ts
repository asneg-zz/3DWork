import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'

export function useSketchSave() {
  const updateFeature = useSceneStore((s) => s.updateFeature)
  const addFeature = useSceneStore((s) => s.addFeature)

  const sketchBodyId = useSketchStore((s) => s.bodyId)
  const sketchId = useSketchStore((s) => s.sketchId)
  const plane = useSketchStore((s) => s.plane)
  const elements = useSketchStore((s) => s.elements)
  const exitSketch = useSketchStore((s) => s.exitSketch)

  const saveAndExit = () => {
    if (!sketchBodyId || !sketchId) {
      exitSketch()
      return
    }

    // Check if this is a new sketch or editing existing
    const bodies = useSceneStore.getState().scene.bodies
    const body = bodies.find(b => b.id === sketchBodyId)

    if (body) {
      const existingFeature = body.features.find(f => f.id === sketchId)

      if (existingFeature) {
        // Update existing sketch
        updateFeature(sketchBodyId, sketchId, {
          sketch: {
            id: sketchId,
            plane,
            offset: 0.0,
            elements: [...elements],
          }
        })
      } else {
        // Add new sketch feature
        addFeature(sketchBodyId, {
          id: sketchId,
          type: 'sketch',
          name: `Sketch (${plane})`,
          sketch: {
            id: sketchId,
            plane,
            offset: 0.0,
            elements: [...elements],
          }
        })
      }
    }

    exitSketch()
  }

  const cancelAndExit = () => {
    exitSketch()
  }

  return { saveAndExit, cancelAndExit }
}
