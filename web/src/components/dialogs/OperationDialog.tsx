import { useSceneStore } from '@/stores/sceneStore'
import { X } from 'lucide-react'

export function OperationDialog() {
  const operationDialog = useSceneStore((s) => s.operationDialog)
  const closeOperationDialog = useSceneStore((s) => s.closeOperationDialog)
  const updateExtrudeParams = useSceneStore((s) => s.updateExtrudeParams)
  const updateRevolveParams = useSceneStore((s) => s.updateRevolveParams)
  const applyOperation = useSceneStore((s) => s.applyOperation)

  if (!operationDialog.open) return null

  const isExtrude = operationDialog.type === 'extrude' || operationDialog.type === 'cut'
  const isRevolve = operationDialog.type === 'revolve' || operationDialog.type === 'cut_revolve'
  const isCut = operationDialog.type === 'cut' || operationDialog.type === 'cut_revolve'

  const title = isCut
    ? isExtrude ? 'Cut Extrude' : 'Cut Revolve'
    : isExtrude ? 'Extrude' : 'Revolve'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-cad-surface border border-cad-border rounded-lg shadow-xl w-80">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cad-border">
          <h3 className="text-sm font-semibold text-cad-text">{title}</h3>
          <button
            onClick={closeOperationDialog}
            className="p-1 hover:bg-cad-border rounded"
          >
            <X size={16} className="text-cad-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {isExtrude && (
            <>
              <NumberInput
                label="Height"
                value={operationDialog.extrudeParams.height}
                onChange={(v) => updateExtrudeParams({ height: v })}
              />
              <NumberInput
                label="Height Backward"
                value={operationDialog.extrudeParams.heightBackward}
                onChange={(v) => updateExtrudeParams({ heightBackward: v })}
              />
              <NumberInput
                label="Draft Angle (°)"
                value={operationDialog.extrudeParams.draftAngle}
                onChange={(v) => updateExtrudeParams({ draftAngle: v })}
              />
            </>
          )}

          {isRevolve && (
            <>
              <NumberInput
                label="Angle (°)"
                value={operationDialog.revolveParams.angle}
                min={1}
                max={360}
                onChange={(v) => updateRevolveParams({ angle: v })}
              />
              <NumberInput
                label="Segments"
                value={operationDialog.revolveParams.segments}
                min={3}
                max={128}
                step={1}
                onChange={(v) => updateRevolveParams({ segments: Math.round(v) })}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-cad-border">
          <button
            onClick={closeOperationDialog}
            className="px-4 py-2 text-sm text-cad-muted hover:bg-cad-border rounded"
          >
            Cancel
          </button>
          <button
            onClick={applyOperation}
            className="px-4 py-2 text-sm bg-cad-accent text-white rounded hover:bg-cad-accent/80"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

interface NumberInputProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
}

function NumberInput({ label, value, min, max, step = 0.1, onChange }: NumberInputProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-cad-muted w-28">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-cad-bg border border-cad-border rounded px-3 py-1.5 text-sm text-cad-text"
      />
    </div>
  )
}
