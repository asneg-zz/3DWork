import { useSceneStore } from '@/stores/sceneStore'
import { X, Check } from 'lucide-react'

export function Chamfer3DPanel() {
  const chamfer3d = useSceneStore((s) => s.chamfer3d)
  const updateChamfer3DParams = useSceneStore((s) => s.updateChamfer3DParams)
  const applyChamfer3D = useSceneStore((s) => s.applyChamfer3D)
  const deactivateChamfer3D = useSceneStore((s) => s.deactivateChamfer3D)

  if (!chamfer3d.active) return null

  return (
    <div className="p-3 border-t border-cad-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-cad-accent">Chamfer 3D</h3>
        <button
          onClick={deactivateChamfer3D}
          className="p-1 hover:bg-cad-border rounded"
        >
          <X size={14} className="text-cad-muted" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Distance */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-cad-muted w-16">Distance</label>
          <input
            type="number"
            value={chamfer3d.distance}
            min={0.01}
            step={0.1}
            onChange={(e) => updateChamfer3DParams({ distance: parseFloat(e.target.value) || 0.1 })}
            className="flex-1 bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
          />
        </div>

        {/* Selected edges info */}
        <div className="text-xs text-cad-muted">
          Selected edges: {chamfer3d.selectedEdges.length}
        </div>

        {/* Instructions */}
        <div className="text-xs text-cad-muted bg-cad-bg/50 rounded p-2">
          Click on edges to select them for chamfering.
          Use Ctrl+Click for multiple selection.
        </div>

        {/* Apply button */}
        <button
          onClick={applyChamfer3D}
          disabled={chamfer3d.selectedEdges.length === 0}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-sm ${
            chamfer3d.selectedEdges.length === 0
              ? 'bg-cad-border text-cad-muted cursor-not-allowed'
              : 'bg-cad-accent text-white hover:bg-cad-accent/80'
          }`}
        >
          <Check size={14} />
          Apply Chamfer
        </button>
      </div>
    </div>
  )
}
