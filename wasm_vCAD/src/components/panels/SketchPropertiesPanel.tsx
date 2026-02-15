import { useSketchStore } from '@/stores/sketchStore'

export function SketchPropertiesPanel() {
  const { active, elements, selectedElementIds } = useSketchStore()

  if (!active || selectedElementIds.length === 0) return null

  const selectedElements = elements.filter((e) => selectedElementIds.includes(e.id))

  if (selectedElements.length === 0) return null

  return (
    <div className="p-4 border-b border-cad-border">
      <h3 className="text-sm font-semibold mb-3 text-cad-accent">
        Selected Elements ({selectedElements.length})
      </h3>

      <div className="space-y-3">
        {selectedElements.map((element) => (
          <div key={element.id} className="p-2 bg-cad-hover rounded">
            <div className="text-xs font-medium text-cad-muted mb-2">
              {element.type.toUpperCase()}
            </div>

            {element.type === 'line' && element.start && element.end && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-cad-muted">Start:</span>
                  <span>({element.start.x.toFixed(2)}, {element.start.y.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">End:</span>
                  <span>({element.end.x.toFixed(2)}, {element.end.y.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Length:</span>
                  <span>
                    {Math.sqrt(
                      Math.pow(element.end.x - element.start.x, 2) +
                      Math.pow(element.end.y - element.start.y, 2)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {element.type === 'circle' && element.center && element.radius !== undefined && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-cad-muted">Center:</span>
                  <span>({element.center.x.toFixed(2)}, {element.center.y.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Radius:</span>
                  <span>{element.radius.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Diameter:</span>
                  <span>{(element.radius * 2).toFixed(2)}</span>
                </div>
              </div>
            )}

            {element.type === 'rectangle' && element.corner && element.width !== undefined && element.height !== undefined && (
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-cad-muted">Corner:</span>
                  <span>({element.corner.x.toFixed(2)}, {element.corner.y.toFixed(2)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Width:</span>
                  <span>{element.width.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Height:</span>
                  <span>{element.height.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cad-muted">Area:</span>
                  <span>{(element.width * element.height).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
