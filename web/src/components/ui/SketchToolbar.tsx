import {
  MousePointer,
  Minus,
  Square,
  Circle,
  Spline,
  Check,
  X,
  Trash2,
} from 'lucide-react'
import { useSceneStore } from '@/stores/sceneStore'

export function SketchToolbar() {
  const sketchEdit = useSceneStore((s) => s.sketchEdit)
  const setSketchTool = useSceneStore((s) => s.setSketchTool)
  const exitSketchEdit = useSceneStore((s) => s.exitSketchEdit)
  const deleteSketchElement = useSceneStore((s) => s.deleteSketchElement)

  if (!sketchEdit.active) return null

  const tools = [
    { id: null, icon: MousePointer, label: 'Select' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'arc', icon: Spline, label: 'Arc' },
  ]

  const handleDelete = () => {
    if (sketchEdit.selectedElementIndex !== null) {
      deleteSketchElement(sketchEdit.selectedElementIndex)
    }
  }

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-cad-surface border border-cad-border rounded-lg shadow-lg px-2 py-1 flex items-center gap-1 z-10">
      {tools.map((tool) => (
        <button
          key={tool.id || 'select'}
          onClick={() => setSketchTool(tool.id)}
          title={tool.label}
          className={`p-2 rounded transition-colors ${
            sketchEdit.tool === tool.id
              ? 'bg-cad-accent text-white'
              : 'hover:bg-cad-border text-cad-text'
          }`}
        >
          <tool.icon size={18} />
        </button>
      ))}

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-1" />

      {/* Delete */}
      <button
        onClick={handleDelete}
        title="Delete Element"
        disabled={sketchEdit.selectedElementIndex === null}
        className={`p-2 rounded transition-colors ${
          sketchEdit.selectedElementIndex === null
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-cad-border text-cad-text'
        }`}
      >
        <Trash2 size={18} />
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-1" />

      {/* Exit Sketch */}
      <button
        onClick={exitSketchEdit}
        title="Finish Sketch"
        className="p-2 rounded bg-green-600 hover:bg-green-700 text-white"
      >
        <Check size={18} />
      </button>
      <button
        onClick={exitSketchEdit}
        title="Cancel Sketch"
        className="p-2 rounded hover:bg-cad-border text-cad-muted"
      >
        <X size={18} />
      </button>
    </div>
  )
}
