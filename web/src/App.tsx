import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Suspense, useRef, useEffect, useState } from 'react'
import { exportSceneToGLB } from './utils/fileOperations'
import { SceneTree } from './components/panels/SceneTree'
import { Toolbar } from './components/ui/Toolbar'
import { PropertyPanel } from './components/panels/PropertyPanel'
import { Fillet3DPanel } from './components/panels/Fillet3DPanel'
import { Chamfer3DPanel } from './components/panels/Chamfer3DPanel'
import { BooleanPanel } from './components/panels/BooleanPanel'
import { SceneObjects } from './components/viewport/SceneObjects'
import { OperationDialog } from './components/dialogs/OperationDialog'
import { SketchToolbar } from './components/ui/SketchToolbar'
import { SketchCanvas } from './components/viewport/SketchCanvas'
import { ViewCube } from './components/viewport/ViewCube'
import { useSceneStore } from './stores/sceneStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

function App() {
  const sketchEdit = useSceneStore((s) => s.sketchEdit)
  const isSketchMode = sketchEdit.active

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  return (
    <div className="flex flex-col h-screen bg-cad-bg">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Scene Tree */}
        <div className="w-56 bg-cad-surface border-r border-cad-border overflow-y-auto">
          <SceneTree />
        </div>

        {/* Center - 3D Viewport or Sketch Canvas */}
        <div className="flex-1 relative">
          {isSketchMode ? (
            <SketchModeView />
          ) : (
            <ThreeDView />
          )}

          {/* Sketch Toolbar */}
          <SketchToolbar />

          {/* Status Bar */}
          <StatusBar />
        </div>

        {/* Right Panel - Properties */}
        <div className="w-64 bg-cad-surface border-l border-cad-border overflow-y-auto">
          <PropertyPanel />
          <BooleanPanel />
          <Fillet3DPanel />
          <Chamfer3DPanel />
        </div>
      </div>

      {/* Dialogs */}
      <OperationDialog />
    </div>
  )
}

function ThreeDView() {
  return (
    <Canvas
      camera={{ position: [5, 5, 5], fov: 50 }}
      gl={{ antialias: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <SceneObjects />
        <SceneExporter />

        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#3a3a4e"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#5a5a6e"
          fadeDistance={30}
          infiniteGrid
        />

        <OrbitControls makeDefault />

        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport labelColor="white" axisHeadScale={1} />
        </GizmoHelper>

        <ViewCube />
      </Suspense>
    </Canvas>
  )
}

// Component to handle GLB export from within the Three.js context
function SceneExporter() {
  const { scene } = useThree()

  useEffect(() => {
    const handleExport = async () => {
      try {
        await exportSceneToGLB(scene, 'model.glb')
      } catch (err) {
        console.error('Export failed:', err)
        alert('Failed to export GLB file')
      }
    }

    window.addEventListener('export-glb', handleExport)
    return () => window.removeEventListener('export-glb', handleExport)
  }, [scene])

  return null
}

function SketchModeView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full bg-cad-bg relative">
      <SketchCanvas width={size.width} height={size.height} />

      {/* Sketch mode indicator */}
      <div className="absolute top-14 left-4 bg-cad-surface/90 border border-cad-border rounded px-3 py-1.5 text-sm text-cad-accent">
        Sketch Mode - Draw elements on the plane
      </div>
    </div>
  )
}

function StatusBar() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const sketchEdit = useSceneStore((s) => s.sketchEdit)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const fillet3d = useSceneStore((s) => s.fillet3d)
  const chamfer3d = useSceneStore((s) => s.chamfer3d)

  let status = `Bodies: ${bodies.length}`

  if (sketchEdit.active) {
    const sketch = useSceneStore.getState().getSketch(sketchEdit.bodyId!, sketchEdit.featureId!)
    const elementCount = sketch?.elements.length || 0
    status = `Sketch Mode | Elements: ${elementCount}`
    if (sketchEdit.tool) {
      status += ` | Tool: ${sketchEdit.tool}`
    }
  } else if (fillet3d.active) {
    status = `Fillet Mode | Edges: ${fillet3d.selectedEdges.length} | Radius: ${fillet3d.radius}`
  } else if (chamfer3d.active) {
    status = `Chamfer Mode | Edges: ${chamfer3d.selectedEdges.length} | Distance: ${chamfer3d.distance}`
  } else if (selectedBodyIds.length > 0) {
    status += ` | Selected: ${selectedBodyIds.length}`
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 h-6 bg-cad-surface border-t border-cad-border px-3 flex items-center text-xs text-cad-muted">
      <span>vCAD Web</span>
      <span className="mx-2">|</span>
      <span>{status}</span>
    </div>
  )
}

export default App
