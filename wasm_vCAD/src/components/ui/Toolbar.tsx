import { Box, Circle, CircleDot, Square } from 'lucide-react'
import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { engine } from '@/wasm/engine'
import type { Body, Feature } from '@/types/scene'

export function Toolbar() {
  const addBody = useSceneStore((s) => s.addBody)
  const startSketch = useSketchStore((s) => s.startSketch)

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
    </div>
  )
}
