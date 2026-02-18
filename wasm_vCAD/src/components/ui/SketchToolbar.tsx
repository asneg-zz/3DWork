import { MousePointer, Minus, Circle, Square, Check, X, Undo, Redo, Spline, Scissors, CornerUpRight, CopyPlus, FlipHorizontal, GitBranch, Waves, Pencil, Ruler, Box } from 'lucide-react'
import { useState } from 'react'
import { useSketchStore } from '@/stores/sketchStore'
import { useSketchSave } from '@/hooks/useSketchSave'
import { useSketchExtrude } from '@/hooks/useSketchExtrude'
import { ToolDropdown } from './ToolDropdown'
import { ExtrudeDialog } from '@/components/dialogs/ExtrudeDialog'

export function SketchToolbar() {
  const { active, tool, elements } = useSketchStore()
  const setTool = useSketchStore((s) => s.setTool)
  const undo = useSketchStore((s) => s.undo)
  const redo = useSketchStore((s) => s.redo)
  const { saveAndExit, cancelAndExit } = useSketchSave()
  const { extrudeAndExit, cutAndExit, getExistingExtrudeParams } = useSketchExtrude()

  const [extrudeDialogOpen, setExtrudeDialogOpen] = useState(false)
  const [extrudeParams, setExtrudeParams] = useState<{
    height: number
    heightBackward: number
    draftAngle: number
  } | null>(null)

  const handleOpenExtrudeDialog = () => {
    // Load existing parameters if extrude already exists
    const existing = getExistingExtrudeParams()
    if (existing) {
      setExtrudeParams({
        height: existing.height,
        heightBackward: existing.heightBackward,
        draftAngle: existing.draftAngle
      })
    } else {
      setExtrudeParams(null)
    }
    setExtrudeDialogOpen(true)
  }

  if (!active) return null

  const hasElements = elements.length > 0

  const drawTools = [
    { id: 'line', icon: Minus, label: 'Line' },
    { id: 'circle', icon: Circle, label: 'Circle' },
    { id: 'rectangle', icon: Square, label: 'Rectangle' },
    { id: 'arc', icon: Spline, label: 'Arc (3-point)' },
    { id: 'polyline', icon: GitBranch, label: 'Polyline' },
    { id: 'spline', icon: Waves, label: 'Spline' },
  ]

  const modifyTools = [
    { id: 'trim', icon: Scissors, label: 'Trim' },
    { id: 'fillet', icon: CornerUpRight, label: 'Fillet' },
    { id: 'offset', icon: CopyPlus, label: 'Offset' },
    { id: 'mirror', icon: FlipHorizontal, label: 'Mirror' },
  ]

  const dimensionTools = [
    { id: 'dimension', icon: Ruler, label: 'Linear Dimension' },
  ]

  return (
    <div className="absolute top-14 left-56 right-64 h-12 bg-cad-accent/20 border-b border-cad-accent px-4 flex items-center gap-2 z-10">
      <span className="text-sm text-cad-accent font-semibold mr-2">
        Sketch Mode
      </span>

      {/* Select Tool - always visible */}
      <button
        onClick={() => setTool('select')}
        className={`
          px-3 py-1.5 rounded flex items-center gap-2 transition-colors
          ${tool === 'select'
            ? 'bg-cad-accent text-white'
            : 'bg-cad-hover hover:bg-cad-accent/30'
          }
        `}
        title="Select"
      >
        <MousePointer size={16} />
        <span className="text-sm">Select</span>
      </button>

      <div className="w-px h-6 bg-cad-border mx-2"></div>

      {/* Draw Tools Dropdown */}
      <ToolDropdown
        label="Draw"
        icon={Pencil}
        tools={drawTools}
        currentTool={tool}
        onSelectTool={(id) => setTool(id as any)}
      />

      {/* Modify Tools Dropdown */}
      <ToolDropdown
        label="Modify"
        icon={Scissors}
        tools={modifyTools}
        currentTool={tool}
        onSelectTool={(id) => setTool(id as any)}
      />

      {/* Dimension Tools Dropdown */}
      <ToolDropdown
        label="Dimension"
        icon={Ruler}
        tools={dimensionTools}
        currentTool={tool}
        onSelectTool={(id) => setTool(id as any)}
      />

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
        onClick={handleOpenExtrudeDialog}
        disabled={!hasElements}
        className="px-3 py-1.5 bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Extrude sketch to 3D"
      >
        <Box size={16} />
        <span className="text-sm">Extrude</span>
      </button>

      <div className="w-px h-6 bg-cad-border mx-2"></div>

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

      <ExtrudeDialog
        isOpen={extrudeDialogOpen}
        onClose={() => setExtrudeDialogOpen(false)}
        onConfirm={(height, heightBackward, draftAngle, isCut) => {
          if (isCut) {
            cutAndExit(height, heightBackward, draftAngle)
          } else {
            extrudeAndExit(height, heightBackward, draftAngle)
          }
          setExtrudeDialogOpen(false)
        }}
        initialHeight={extrudeParams?.height}
        initialHeightBackward={extrudeParams?.heightBackward}
        initialDraftAngle={extrudeParams?.draftAngle}
      />
    </div>
  )
}
