import { useSceneStore } from '@/stores/sceneStore'
import { X, Check } from 'lucide-react'

export function Fillet3DPanel() {
  const fillet3d = useSceneStore((s) => s.fillet3d)
  const updateFillet3DParams = useSceneStore((s) => s.updateFillet3DParams)
  const applyFillet3D = useSceneStore((s) => s.applyFillet3D)
  const deactivateFillet3D = useSceneStore((s) => s.deactivateFillet3D)

  if (!fillet3d.active) return null

  return (
    <div className="p-3 border-t border-cad-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cad-accent">Fillet 3D</h3>
        <button
          onClick={deactivateFillet3D}
          className="p-1 hover:bg-cad-border rounded"
        >
          <X size={14} className="text-cad-muted" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Radius */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-cad-muted w-16">Radius</label>
          <input
            type="number"
            value={fillet3d.radius}
            min={0.01}
            step={0.1}
            onChange={(e) => updateFillet3DParams({ radius: parseFloat(e.target.value) || 0.1 })}
            className="flex-1 bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
          />
        </div>

        {/* Segments */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-cad-muted w-16">Segments</label>
          <input
            type="number"
            value={fillet3d.segments}
            min={2}
            max={32}
            step={1}
            onChange={(e) => updateFillet3DParams({ segments: parseInt(e.target.value) || 8 })}
            className="flex-1 bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
          />
        </div>

        {/* Selected edges info */}
        <div className="text-xs text-cad-muted">
          Selected edges: {fillet3d.selectedEdges.length}
        </div>

        {/* Instructions */}
        <div className="text-xs text-cad-muted bg-cad-bg/50 rounded p-2">
          Click on edges to select them for filleting.
          Use Ctrl+Click for multiple selection.
        </div>

        {/* Apply button */}
        <button
          onClick={applyFillet3D}
          disabled={fillet3d.selectedEdges.length === 0}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm ${
            fillet3d.selectedEdges.length === 0
              ? 'bg-cad-border text-cad-muted cursor-not-allowed'
              : 'bg-cad-accent text-white hover:bg-cad-accent/80'
          }`}
        >
          <Check size={14} />
          Apply Fillet
        </button>
      </div>
    </div>
  )
}
