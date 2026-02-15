import { useSceneStore } from '@/stores/sceneStore'
import { Plus, Minus, Combine } from 'lucide-react'
import type { BooleanOp, Feature } from '@/types/scene'

let booleanIdCounter = 1

export function BooleanPanel() {
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const bodies = useSceneStore((s) => s.scene.bodies)
  const addFeature = useSceneStore((s) => s.addFeature)
  const removeBody = useSceneStore((s) => s.removeBody)

  const canDoBoolean = selectedBodyIds.length === 2

  const handleBoolean = (op: BooleanOp) => {
    if (selectedBodyIds.length !== 2) return

    const [targetId, toolId] = selectedBodyIds
    const targetBody = bodies.find((b) => b.id === targetId)
    const toolBody = bodies.find((b) => b.id === toolId)

    if (!targetBody || !toolBody) return

    // Add boolean modify feature to target body
    const booleanFeature: Feature = {
      type: 'boolean_modify',
      id: `boolean_${booleanIdCounter++}`,
      op,
      tool_body_id: toolId,
    }

    addFeature(targetId, booleanFeature)

    // Remove tool body after boolean operation
    removeBody(toolId)
  }

  if (!canDoBoolean) {
    return (
      <div className="p-3 border-t border-cad-border">
        <h3 className="text-sm font-semibold text-cad-muted mb-2">Boolean Operations</h3>
        <p className="text-xs text-cad-muted">
          Select exactly 2 bodies to perform boolean operations
        </p>
      </div>
    )
  }

  const body1 = bodies.find((b) => b.id === selectedBodyIds[0])
  const body2 = bodies.find((b) => b.id === selectedBodyIds[1])

  return (
    <div className="p-3 border-t border-cad-border">
      <h3 className="text-sm font-semibold text-cad-text mb-3">Boolean Operations</h3>

      <div className="text-xs text-cad-muted mb-3">
        <div>Target: <span className="text-cad-text">{body1?.name}</span></div>
        <div>Tool: <span className="text-cad-text">{body2?.name}</span></div>
      </div>

      <div className="flex gap-2">
        <BooleanButton
          icon={<Plus size={16} />}
          label="Union"
          onClick={() => handleBoolean('union')}
        />
        <BooleanButton
          icon={<Minus size={16} />}
          label="Difference"
          onClick={() => handleBoolean('difference')}
        />
        <BooleanButton
          icon={<Combine size={16} />}
          label="Intersect"
          onClick={() => handleBoolean('intersection')}
        />
      </div>

      <p className="text-xs text-cad-muted mt-3">
        The tool body will be merged into the target body.
      </p>
    </div>
  )
}

interface BooleanButtonProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function BooleanButton({ icon, label, onClick }: BooleanButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 p-2 bg-cad-bg hover:bg-cad-border rounded transition-colors"
      title={label}
    >
      {icon}
      <span className="text-xs text-cad-text">{label}</span>
    </button>
  )
}
