import { useSceneStore } from '@/stores/sceneStore'

export function PropertyPanel() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)

  const selectedBodies = bodies.filter(b => selectedBodyIds.includes(b.id))

  if (selectedBodies.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-3 text-cad-muted uppercase tracking-wide">
          Properties
        </h3>
        <p className="text-sm text-cad-muted italic">No selection</p>
      </div>
    )
  }

  if (selectedBodies.length === 1) {
    const body = selectedBodies[0]

    return (
      <div className="p-4">
        <h3 className="text-sm font-semibold mb-3 text-cad-muted uppercase tracking-wide">
          Properties
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-cad-muted mb-1">Name</label>
            <input
              type="text"
              value={body.name}
              className="w-full px-2 py-1 bg-cad-bg border border-cad-border rounded text-sm"
              readOnly
            />
          </div>

          <div>
            <label className="block text-xs text-cad-muted mb-1">ID</label>
            <input
              type="text"
              value={body.id}
              className="w-full px-2 py-1 bg-cad-bg border border-cad-border rounded text-xs font-mono text-cad-muted"
              readOnly
            />
          </div>

          <div>
            <label className="block text-xs text-cad-muted mb-1">Features</label>
            <div className="text-sm">{body.features.length}</div>
          </div>

          {body.features.length > 0 && (
            <div>
              <label className="block text-xs text-cad-muted mb-2">Feature List</label>
              <div className="space-y-1">
                {body.features.map(feature => (
                  <div
                    key={feature.id}
                    className="px-2 py-1 bg-cad-bg rounded text-xs"
                  >
                    <div className="font-semibold">{feature.name}</div>
                    <div className="text-cad-muted">{feature.type}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3 text-cad-muted uppercase tracking-wide">
        Properties
      </h3>
      <p className="text-sm text-cad-muted">
        {selectedBodies.length} objects selected
      </p>
    </div>
  )
}
