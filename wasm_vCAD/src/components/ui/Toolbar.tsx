import { Box, Circle, CircleDot, Square, MousePointer2 } from 'lucide-react'
import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { engine } from '@/wasm/engine'
import type { Body } from '@/types/scene'
import { useEffect } from 'react'

export function Toolbar() {
  const addBody = useSceneStore((s) => s.addBody)
  const bodies = useSceneStore((s) => s.scene.bodies)
  const startSketch = useSketchStore((s) => s.startSketch)

  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const startFaceSelection = useFaceSelectionStore((s) => s.startFaceSelection)
  const exitFaceSelection = useFaceSelectionStore((s) => s.exitFaceSelection)

  // Listen for face selection events
  useEffect(() => {
    const handleFaceSelect = (event: CustomEvent) => {
      const { bodyId, plane, offset } = event.detail

      // Find the body
      const body = bodies.find(b => b.id === bodyId)
      if (!body) return

      // Create new sketch on selected face
      const sketchId = engine.createSketch(plane)

      // Start sketch mode with offset
      startSketch(bodyId, sketchId, plane, offset)

      // Exit face selection mode
      exitFaceSelection()
    }

    window.addEventListener('face-selected' as any, handleFaceSelect as EventListener)
    return () => {
      window.removeEventListener('face-selected' as any, handleFaceSelect as EventListener)
    }
  }, [bodies, startSketch, exitFaceSelection])

  const handleCreateCube = () => {
    const bodyId = crypto.randomUUID()
    const featureId = engine.createCube(1, 1, 1)

    const body: Body = {
      id: bodyId,
      name: 'Cube',
      visible: true,
      features: [{
        id: featureId,
        type: 'primitive',
        name: 'Cube',
        primitive: {
          type: 'cube',
          width: 1,
          height: 1,
          depth: 1
        },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }]
    }

    addBody(body)
  }

  const handleCreateCylinder = () => {
    const bodyId = crypto.randomUUID()
    const featureId = engine.createCylinder(0.5, 1)

    const body: Body = {
      id: bodyId,
      name: 'Cylinder',
      visible: true,
      features: [{
        id: featureId,
        type: 'primitive',
        name: 'Cylinder',
        primitive: {
          type: 'cylinder',
          radius: 0.5,
          height: 1
        },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }]
    }

    addBody(body)
  }

  const handleCreateSphere = () => {
    const bodyId = crypto.randomUUID()
    const featureId = engine.createSphere(0.5)

    const body: Body = {
      id: bodyId,
      name: 'Sphere',
      visible: true,
      features: [{
        id: featureId,
        type: 'primitive',
        name: 'Sphere',
        primitive: {
          type: 'sphere',
          radius: 0.5
        },
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        }
      }]
    }

    addBody(body)
  }

  const handleNewSketch = () => {
    // Create a new body for the sketch
    const bodyId = crypto.randomUUID()
    const sketchId = engine.createSketch('XY')

    const body: Body = {
      id: bodyId,
      name: 'Sketch',
      visible: true,
      features: []
    }

    addBody(body)

    // Start sketch mode immediately
    startSketch(bodyId, sketchId, 'XY')
  }

  const handleToggleFaceSelection = () => {
    if (faceSelectionActive) {
      exitFaceSelection()
    } else {
      startFaceSelection()
    }
  }

  return (
    <div className="h-12 bg-cad-surface border-b border-cad-border px-4 flex items-center gap-2">
      <button
        onClick={handleCreateCube}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Create Cube"
      >
        <Box size={18} />
        <span className="text-sm">Cube</span>
      </button>

      <button
        onClick={handleCreateCylinder}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Create Cylinder"
      >
        <Circle size={18} />
        <span className="text-sm">Cylinder</span>
      </button>

      <button
        onClick={handleCreateSphere}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Create Sphere"
      >
        <CircleDot size={18} />
        <span className="text-sm">Sphere</span>
      </button>

      <div className="w-px h-6 bg-cad-border mx-2"></div>

      <button
        onClick={handleNewSketch}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="New Sketch"
      >
        <Square size={18} />
        <span className="text-sm">Sketch</span>
      </button>

      <button
        onClick={handleToggleFaceSelection}
        className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
          faceSelectionActive
            ? 'bg-cad-accent text-white'
            : 'bg-cad-hover hover:bg-cad-accent/20'
        }`}
        title="Select Face (click on a face to create sketch)"
      >
        <MousePointer2 size={18} />
        <span className="text-sm">Select Face</span>
      </button>
    </div>
  )
}
