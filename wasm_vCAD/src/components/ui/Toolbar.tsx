import { Box, Circle, CircleDot, Square, MousePointer2, GitBranch, Save, FolderOpen } from 'lucide-react'
import { useSceneStore } from '@/stores/sceneStore'
import { useSketchStore } from '@/stores/sketchStore'
import { useFaceSelectionStore } from '@/stores/faceSelectionStore'
import { useEdgeSelectionStore } from '@/stores/edgeSelectionStore'
import { engine } from '@/wasm/engine'
import type { Body, SketchPlane, FaceCoordSystem } from '@/types/scene'
import { useEffect, useState } from 'react'
import { PlaneSelectDialog } from '@/components/dialogs/PlaneSelectDialog'
import { OpenProjectDialog } from '@/components/dialogs/OpenProjectDialog'
import { saveSceneToFile, loadSceneFromFile } from '@/utils/fileOperations'

export function Toolbar() {
  const addBody = useSceneStore((s) => s.addBody)
  const bodies = useSceneStore((s) => s.scene.bodies)
  const scene = useSceneStore((s) => s.scene)
  const setScene = useSceneStore((s) => s.setScene)
  const startSketch = useSketchStore((s) => s.startSketch)
  const addFeature = useSceneStore((s) => s.addFeature)

  const [showPlaneDialog, setShowPlaneDialog] = useState(false)
  const [pendingBodyId, setPendingBodyId] = useState<string | null>(null)
  const [showOpenProjectDialog, setShowOpenProjectDialog] = useState(false)

  const faceSelectionActive = useFaceSelectionStore((s) => s.active)
  const startFaceSelection = useFaceSelectionStore((s) => s.startFaceSelection)
  const exitFaceSelection = useFaceSelectionStore((s) => s.exitFaceSelection)

  const edgeSelectionActive = useEdgeSelectionStore((s) => s.active)
  const startEdgeSelection = useEdgeSelectionStore((s) => s.startEdgeSelection)
  const exitEdgeSelection = useEdgeSelectionStore((s) => s.exitEdgeSelection)

  // Listen for face selection events
  useEffect(() => {
    const handleFaceSelect = (event: CustomEvent) => {
      const { bodyId, plane, offset, faceCoordSystem } = event.detail as {
        bodyId: string
        plane: SketchPlane
        offset: number
        faceCoordSystem?: FaceCoordSystem | null
      }

      // Find the body
      const body = bodies.find(b => b.id === bodyId)
      if (!body) {
        console.warn('[Toolbar] Body not found:', bodyId)
        return
      }

      // Create new sketch on selected face
      const sketchId = engine.createSketch(plane === 'CUSTOM' ? 'XY' : plane)

      // Start sketch mode with offset and optional FCS for inclined faces
      startSketch(bodyId, sketchId, plane, offset, faceCoordSystem ?? null)

      // Exit face selection mode
      exitFaceSelection()

      if (plane === 'CUSTOM') {
        console.log('[Toolbar] Created sketch on inclined face with FCS')
      } else {
        console.log('[Toolbar] Created sketch on', plane, 'plane at offset', offset.toFixed(3))
      }
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

  const handleSave = async () => {
    await saveSceneToFile(scene)
  }

  const handleOpen = async () => {
    const loaded = await loadSceneFromFile()
    if (loaded) {
      setScene(loaded)
    }
  }

  const handleNewSketch = () => {
    // Create empty body immediately (visible in scene tree)
    const bodyId = crypto.randomUUID()
    const body: Body = {
      id: bodyId,
      name: 'Тело',
      visible: true,
      features: []
    }
    addBody(body)
    setPendingBodyId(bodyId)

    // Ask user which plane to draw on
    setShowPlaneDialog(true)
  }

  const handlePlaneSelected = (plane: SketchPlane) => {
    if (!pendingBodyId) return

    const sketchId = engine.createSketch(plane === 'CUSTOM' ? 'XY' : plane)

    // Add sketch feature to the body
    addFeature(pendingBodyId, {
      id: sketchId,
      type: 'sketch',
      name: `Эскиз (${plane})`,
      sketch: {
        id: sketchId,
        elements: [],
        plane,
        offset: 0,
      }
    })

    // Enter sketch mode
    startSketch(pendingBodyId, sketchId, plane, 0)
    setPendingBodyId(null)
    setShowPlaneDialog(false)
  }

  const handlePlaneDialogClose = () => {
    // If user cancels, remove the empty body
    if (pendingBodyId) {
      useSceneStore.getState().removeBody(pendingBodyId)
      setPendingBodyId(null)
    }
    setShowPlaneDialog(false)
  }

  const handleToggleFaceSelection = () => {
    if (faceSelectionActive) {
      exitFaceSelection()
    } else {
      // Exit edge selection if active
      if (edgeSelectionActive) {
        exitEdgeSelection()
      }
      startFaceSelection()
    }
  }

  const handleToggleEdgeSelection = () => {
    if (edgeSelectionActive) {
      exitEdgeSelection()
    } else {
      // Exit face selection if active
      if (faceSelectionActive) {
        exitFaceSelection()
      }
      startEdgeSelection()
    }
  }

  return (
    <>
    <PlaneSelectDialog
      isOpen={showPlaneDialog}
      onClose={handlePlaneDialogClose}
      onConfirm={handlePlaneSelected}
    />
    <OpenProjectDialog
      isOpen={showOpenProjectDialog}
      onClose={() => setShowOpenProjectDialog(false)}
      onLoad={(scene) => { setScene(scene) }}
    />
    <div className="h-12 bg-cad-surface border-b border-cad-border px-4 flex items-center gap-2">
      {/* File operations */}
      <button
        onClick={handleOpen}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Открыть сцену (Ctrl+O)"
      >
        <FolderOpen size={18} />
        <span className="text-sm">Открыть</span>
      </button>

      <button
        onClick={() => setShowOpenProjectDialog(true)}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Открыть файл из каталога scenes/ проекта"
      >
        <FolderOpen size={18} className="text-cad-accent" />
        <span className="text-sm">Из проекта</span>
      </button>

      <button
        onClick={handleSave}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
        title="Сохранить сцену (Ctrl+S)"
      >
        <Save size={18} />
        <span className="text-sm">Сохранить</span>
      </button>

      <div className="w-px h-6 bg-cad-border mx-1"></div>

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

      <button
        onClick={handleToggleEdgeSelection}
        className={`px-3 py-1.5 rounded flex items-center gap-2 transition-colors ${
          edgeSelectionActive
            ? 'bg-cad-accent text-white'
            : 'bg-cad-hover hover:bg-cad-accent/20'
        }`}
        title="Select Edge (right-click on an edge to create sketch)"
      >
        <GitBranch size={18} />
        <span className="text-sm">Select Edge</span>
      </button>
    </div>
    </>
  )
}
