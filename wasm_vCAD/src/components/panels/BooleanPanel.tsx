import { Minus, Plus, Merge } from 'lucide-react'
import { useState } from 'react'
import { useBooleanStore } from '@/stores/booleanStore'
import { useSceneStore } from '@/stores/sceneStore'

export function BooleanPanel() {
  const { active, operation, selectedBodies } = useBooleanStore()
  const { startBoolean, cancel } = useBooleanStore()
  const bodies = useSceneStore((s) => s.scene.bodies)
  const performBoolean = useSceneStore((s) => s.performBoolean)
  const [pending, setPending] = useState(false)

  if (!active) {
    return (
      <div className="p-4 border-b border-cad-border">
        <h3 className="text-sm font-semibold mb-3 text-cad-muted uppercase tracking-wide">
          Boolean Operations
        </h3>

        <div className="space-y-2">
          <button
            onClick={() => startBoolean('union')}
            className="w-full px-3 py-2 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            <span className="text-sm">Union</span>
          </button>

          <button
            onClick={() => startBoolean('difference')}
            className="w-full px-3 py-2 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
          >
            <Minus size={16} />
            <span className="text-sm">Difference</span>
          </button>

          <button
            onClick={() => startBoolean('intersection')}
            className="w-full px-3 py-2 bg-cad-hover hover:bg-cad-accent/20 rounded flex items-center gap-2 transition-colors"
          >
            <Merge size={16} />
            <span className="text-sm">Intersection</span>
          </button>
        </div>
      </div>
    )
  }

  const handleApply = async () => {
    if (selectedBodies.length !== 2 || !operation) return
    setPending(true)
    try {
      await performBoolean(selectedBodies[0], selectedBodies[1], operation)
      cancel()
    } catch (err) {
      console.error('Boolean operation failed:', err)
      alert(`Boolean ${operation} failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="p-4 border-b border-cad-border bg-cad-accent/10">
      <h3 className="text-sm font-semibold mb-3 text-cad-accent uppercase tracking-wide">
        Boolean {operation}
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-cad-muted mb-1">
            Select 2 bodies: {selectedBodies.length}/2
          </p>
          <p className="text-xs text-cad-muted/60 mb-2">
            Click on bodies in viewport or scene tree
          </p>
          <div className="text-xs text-cad-muted space-y-1">
            {selectedBodies.map((id, index) => {
              const body = bodies.find(b => b.id === id)
              return (
                <div key={id}>
                  Body {index + 1}: {body?.name || 'Unknown'}
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApply}
            disabled={selectedBodies.length !== 2 || pending}
            className="flex-1 px-3 py-2 bg-cad-accent text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? '...' : 'Apply'}
          </button>

          <button
            onClick={cancel}
            className="flex-1 px-3 py-2 bg-cad-hover rounded"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
