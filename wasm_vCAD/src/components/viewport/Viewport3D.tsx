import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Suspense } from 'react'
import { SceneObjects } from './SceneObjects'

export function Viewport3D() {
  return (
    <div className="w-full h-full bg-cad-bg">
      <Canvas
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <directionalLight position={[-10, -10, -5]} intensity={0.3} />

          {/* Scene objects */}
          <SceneObjects />

          {/* Grid */}
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

          {/* Camera controls */}
          <OrbitControls makeDefault />

          {/* Gizmo */}
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport labelColor="white" axisHeadScale={1} />
          </GizmoHelper>
        </Suspense>
      </Canvas>

      {/* Overlay info */}
      <div className="absolute top-4 left-4 bg-cad-surface/90 border border-cad-border rounded px-3 py-2 text-sm">
        <div className="text-cad-muted">3D Viewport</div>
        <div className="text-xs text-cad-muted mt-1">
          <kbd className="bg-cad-bg px-1 rounded">Mouse Drag</kbd> Rotate
        </div>
        <div className="text-xs text-cad-muted">
          <kbd className="bg-cad-bg px-1 rounded">Scroll</kbd> Zoom
        </div>
      </div>
    </div>
  )
}
