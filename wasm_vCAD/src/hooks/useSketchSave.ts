import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'

export function useSketchSave() {
  const updateFeature = useSceneStore((s) => s.updateFeature)
  const addFeature = useSceneStore((s) => s.addFeature)

  const sketchBodyId = useSketchStore((s) => s.bodyId)
  const sketchId = useSketchStore((s) => s.sketchId)
  const plane = useSketchStore((s) => s.plane)
  const planeOffset = useSketchStore((s) => s.planeOffset)
  const elements = useSketchStore((s) => s.elements)
  const construction = useSketchStore((s) => s.construction)
  const constraints = useSketchStore((s) => s.constraints)
  const faceCoordSystem = useSketchStore((s) => s.faceCoordSystem)
  const exitSketch = useSketchStore((s) => s.exitSketch)

  const saveAndExit = () => {
    if (!sketchBodyId || !sketchId) {
      exitSketch()
      return
    }

    const sketchData = {
      id: sketchId,
      plane,
      offset: planeOffset,
      elements: [...elements],
      construction: construction.length > 0 ? [...construction] : undefined,
      constraints: constraints.length > 0 ? [...constraints] : undefined,
      face_coord_system: faceCoordSystem ?? undefined,
    }

    // Check if this is a new sketch or editing existing
    const bodies = useSceneStore.getState().scene.bodies
    const body = bodies.find(b => b.id === sketchBodyId)

    if (body) {
      const existingFeature = body.features.find(f => f.id === sketchId)

      if (existingFeature) {
        updateFeature(sketchBodyId, sketchId, { sketch: sketchData })
      } else {
        addFeature(sketchBodyId, {
          id: sketchId,
          type: 'sketch',
          name: `Sketch (${plane})`,
          sketch: sketchData,
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
