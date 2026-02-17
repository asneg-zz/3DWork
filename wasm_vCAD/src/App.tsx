import { useEffect, useState } from 'react'
import { engine } from './wasm/engine'
import { Toolbar } from './components/ui/Toolbar'
import { SketchToolbar } from './components/ui/SketchToolbar'
import { SceneTree } from './components/panels/SceneTree'
import { PropertyPanel } from './components/panels/PropertyPanel'
import { BooleanPanel } from './components/panels/BooleanPanel'
import { SketchPropertiesPanel } from './components/panels/SketchPropertiesPanel'
import { EdgeContextMenu } from './components/ui/EdgeContextMenu'
import { Viewport3D } from './components/viewport/Viewport3D'

function App() {
  const [wasmReady, setWasmReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Initialize WASM engine on mount
    engine.initialize()
      .then(() => {
        setWasmReady(true)
        console.log('Application ready')
      })
      .catch((err) => {
        console.error('Failed to initialize WASM:', err)
        setError(err.message)
      })

    // Disable browser context menu globally (non-passive)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    window.addEventListener('contextmenu', handleContextMenu, { passive: false })
    return () => window.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-cad-bg text-cad-error">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Failed to Initialize</h1>
          <p className="text-cad-muted">{error}</p>
          <p className="text-sm text-cad-muted mt-4">
            Make sure to build WASM module: npm run build:wasm
          </p>
        </div>
      </div>
    )
  }

  if (!wasmReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-cad-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cad-accent mx-auto mb-4"></div>
          <p className="text-cad-muted">Loading vCAD WASM Engine...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-cad-bg text-cad-text">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Sketch Toolbar (only when sketch mode active) */}
      <SketchToolbar />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Scene Tree */}
        <div className="w-56 bg-cad-surface border-r border-cad-border overflow-y-auto">
          <SceneTree />
        </div>

        {/* Center - 3D Viewport (sketch integrated) */}
        <div className="flex-1 relative">
          <Viewport3D />
        </div>

        {/* Right Panel - Properties & Boolean */}
        <div className="w-64 bg-cad-surface border-l border-cad-border overflow-y-auto">
          <SketchPropertiesPanel />
          <BooleanPanel />
          <PropertyPanel />
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-cad-surface border-t border-cad-border px-3 flex items-center text-xs text-cad-muted">
        <span>vCAD WASM</span>
        <span className="mx-2">|</span>
        <span>Ready</span>
      </div>

      {/* Edge Context Menu */}
      <EdgeContextMenu />
    </div>
  )
}

export default App
