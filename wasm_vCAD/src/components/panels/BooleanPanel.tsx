import { Minus, Plus, Merge } from 'lucide-react'
import { useBooleanStore } from '@/stores/booleanStore'
import { useSceneStore } from '@/stores/sceneStore'
import { engine } from '@/wasm/engine'
// ARCHITECTURE: Boolean operations are in WASM (Rust)
// TypeScript only handles UI - no geometric calculations!

export function BooleanPanel() {
  const { active, operation, selectedBodies } = useBooleanStore()
  const { startBoolean, cancel, clearSelection } = useBooleanStore()
  const bodies = useSceneStore((s) => s.scene.bodies)
  const addBody = useSceneStore((s) => s.addBody)
  const removeBody = useSceneStore((s) => s.removeBody)

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

  const handleApply = () => {
    if (selectedBodies.length !== 2) {
      alert('Please select exactly 2 bodies')
      return
    }

    const body1 = bodies.find(b => b.id === selectedBodies[0])
    const body2 = bodies.find(b => b.id === selectedBodies[1])

    if (!body1 || !body2) return

    try {
      // ARCHITECTURE: Call WASM for Boolean operations
      // TypeScript only handles UI and API calls
      let resultId: string

      switch (operation) {
        case 'union':
          resultId = engine.booleanUnion(body1.id, body2.id)
          break
        case 'difference':
          resultId = engine.booleanDifference(body1.id, body2.id)
          break
        case 'intersection':
          resultId = engine.booleanIntersection(body1.id, body2.id)
          break
        default:
          return
      }

      const operationName = operation === 'union' ? 'Union' :
                           operation === 'difference' ? 'Difference' : 'Intersection'

      console.log(`${operationName} operation completed: ${resultId}`)

      // TODO: Get actual result geometry from WASM
      // For now, create placeholder
      addBody({
        id: resultId,
        name: `${operationName}(${body1.name}, ${body2.name})`,
        visible: true,
        features: [
          {
            id: crypto.randomUUID(),
            type: 'primitive',
            name: operationName,
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
          }
        ]
      })

      cancel()
    } catch (error) {
      console.error('Boolean operation failed:', error)
      alert('Boolean operation failed. See console for details.')
    }
  }

  return (
    <div className="p-4 border-b border-cad-border bg-cad-accent/10">
      <h3 className="text-sm font-semibold mb-3 text-cad-accent uppercase tracking-wide">
        Boolean {operation}
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-cad-muted mb-2">
            Select 2 bodies: {selectedBodies.length}/2
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
            disabled={selectedBodies.length !== 2}
            className="flex-1 px-3 py-2 bg-cad-accent text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
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
