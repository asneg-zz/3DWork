import { MousePointer, Minus, Circle, Square, Move, Check, X, Undo, Redo, Spline, Scissors, CornerUpRight, CopyPlus, FlipHorizontal, GitBranch, Waves } from 'lucide-react'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchSave } from '@/hooks/useSketchSave'

export function SketchToolbar() {
  const { active, tool } = useSketchStore()
  const setTool = useSketchStore((s) => s.setTool)
  const undo = useSketchStore((s) => s.undo)
  const redo = useSketchStore((s) => s.redo)
  const { saveAndExit, cancelAndExit } = useSketchSave()

  if (!active) return null

  const drawTools = [
    { id: 'select', icon: MousePointer, label: 'Select' },
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'arc', icon: Spline, label: 'Arc (3-point)' },
    { id: 'polyline', icon: GitBranch, label: 'Polyline' },
    { id: 'spline', icon: Waves, label: 'Spline' },
  ] as const

  const editTools = [
    { id: 'trim', icon: Scissors, label: 'Trim' },
    { id: 'fillet', icon: CornerUpRight, label: 'Fillet' },
    { id: 'offset', icon: CopyPlus, label: 'Offset' },
    { id: 'mirror', icon: FlipHorizontal, label: 'Mirror' },
  ] as const

  return (
    <div className="absolute top-14 left-56 right-64 h-12 bg-cad-accent/20 border-b border-cad-accent px-4 flex items-center gap-2 z-10">
      <span className="text-sm text-cad-accent font-semibold mr-4">
        Sketch Mode
      </span>

      {/* Draw Tools */}
      <div className="flex gap-1">
        {drawTools.map((t) => {
          const Icon = t.icon
          const isActive = tool === t.id

          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id as any)}
              className={`
                px-3 py-1.5 rounded flex items-center gap-2 transition-colors
                ${isActive
                  ? 'bg-cad-accent text-white'
                  : 'bg-cad-hover hover:bg-cad-accent/30'
                }
              `}
              title={t.label}
            >
              <Icon size={16} />
              <span className="text-sm">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="w-px h-6 bg-cad-border mx-2"></div>

      {/* Edit Tools */}
      <div className="flex gap-1">
        {editTools.map((t) => {
          const Icon = t.icon
          const isActive = tool === t.id

          return (
            <button
              key={t.id}
              onClick={() => setTool(t.id as any)}
              className={`
                px-3 py-1.5 rounded flex items-center gap-2 transition-colors
                ${isActive
                  ? 'bg-cad-accent text-white'
                  : 'bg-cad-hover hover:bg-cad-accent/30'
                }
              `}
              title={t.label}
            >
              <Icon size={16} />
              <span className="text-sm">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="w-px h-6 bg-cad-border mx-2"></div>

      <button
        onClick={undo}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/30 rounded flex items-center gap-2 transition-colors"
        title="Undo (Ctrl+Z)"
      >
        <Undo size={16} />
        <span className="text-sm">Undo</span>
      </button>

      <button
        onClick={redo}
        className="px-3 py-1.5 bg-cad-hover hover:bg-cad-accent/30 rounded flex items-center gap-2 transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo size={16} />
        <span className="text-sm">Redo</span>
      </button>

      <div className="flex-1" />

      <button
        onClick={saveAndExit}
        className="px-3 py-1.5 bg-cad-success text-white rounded flex items-center gap-2 hover:bg-cad-success/80"
      >
        <Check size={16} />
        <span className="text-sm">Finish Sketch</span>
      </button>

      <button
        onClick={cancelAndExit}
        className="px-3 py-1.5 bg-cad-error text-white rounded flex items-center gap-2 hover:bg-cad-error/80"
      >
        <X size={16} />
        <span className="text-sm">Cancel</span>
      </button>
    </div>
  )
}
