import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Environment } from '@react-three/drei'
import { Suspense } from 'react'
import { useSketchStore } from '@/stores/sketchStore'
import { SceneObjects } from './SceneObjects'
import { SketchScene3D } from './SketchScene3D'
import { SketchDialogs3D } from './SketchDialogs3D'
import { SketchCameraController } from './SketchCameraController'

export function Viewport3D() {
  const sketchActive = useSketchStore((s) => s.active)

  return (
    <div className="w-full h-full bg-cad-bg relative">
      <Canvas
        shadows
        camera={{ position: [5, 5, 5], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          {/* Environment map for PBR reflections */}
          <Environment preset="warehouse" background={false} />

          <ambientLight intensity={0.3} />

          {/* Main key light with shadows */}
          <directionalLight
            position={[8, 14, 6]}
            intensity={1.8}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.1}
            shadow-camera-far={60}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={12}
            shadow-camera-bottom={-12}
            shadow-bias={-0.001}
          />

          {/* Fill light from opposite side */}
          <directionalLight position={[-6, 4, -8]} intensity={0.4} />

          {/* Camera animation controller */}
          <SketchCameraController />

          {/* Scene objects - always visible */}
          <SceneObjects />

          {/* Sketch elements in 3D when sketch mode active */}
          {sketchActive && <SketchScene3D />}

          {/* Grid - only in 3D mode */}
          {!sketchActive && (
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
          )}

          {/* Camera controls - disable rotate/pan in sketch mode */}
          <OrbitControls
            makeDefault
            enableRotate={!sketchActive}
            enablePan={!sketchActive}
            enableZoom={true}
          />

          {/* Gizmo */}
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport labelColor="white" axisHeadScale={1} />
          </GizmoHelper>
        </Suspense>
      </Canvas>

      {/* HTML overlays for sketch context menus and dialogs */}
      {sketchActive && <SketchDialogs3D />}

      {/* Overlay info - only in 3D mode */}
      {!sketchActive && (
        <div className="absolute top-4 left-4 bg-cad-surface/90 border border-cad-border rounded px-3 py-2 text-sm">
          <div className="text-cad-muted">3D Viewport</div>
          <div className="text-xs text-cad-muted mt-1">
            <kbd className="bg-cad-bg px-1 rounded">Mouse Drag</kbd> Rotate
          </div>
          <div className="text-xs text-cad-muted">
            <kbd className="bg-cad-bg px-1 rounded">Scroll</kbd> Zoom
          </div>
        </div>
      )}

      {/* Sketch mode info */}
      {sketchActive && (
        <div className="absolute top-4 left-4 bg-cad-surface/90 border border-cad-border rounded px-3 py-2 text-sm">
          <div className="text-cad-accent">Sketch Mode</div>
          <div className="text-xs text-cad-muted mt-1">
            <kbd className="bg-cad-bg px-1 rounded">Scroll</kbd> Zoom
          </div>
          <div className="text-xs text-cad-muted">
            <kbd className="bg-cad-bg px-1 rounded">Right Click</kbd> Menu
          </div>
          <div className="text-xs text-cad-muted">
            <kbd className="bg-cad-bg px-1 rounded">Escape</kbd> Exit tool
          </div>
        </div>
      )}
    </div>
  )
}
