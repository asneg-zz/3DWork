import {
  Box,
  Cylinder,
  Circle,
  Triangle,
  Trash2,
  Upload,
  Save,
  FileDown,
  Undo2,
  Redo2,
  PenTool,
  ArrowUpFromLine,
  RotateCcw,
  Scissors,
  CircleDot,
  SquareSlash,
  FilePlus,
  Move,
  RotateCw,
  Maximize2,
} from 'lucide-react'
import { useSceneStore, createPrimitiveBody } from '@/stores/sceneStore'
import type { Feature, SketchPlane } from '@/types/scene'
import { defaultTransform, createDefaultSketch } from '@/types/scene'
import { saveSceneToFile, loadSceneFromFile } from '@/utils/fileOperations'

let idCounter = 100

export function Toolbar() {
  const scene = useSceneStore((s) => s.scene)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const selectedFeatureId = useSceneStore((s) => s.selectedFeatureId)
  const sketchEdit = useSceneStore((s) => s.sketchEdit)
  const fillet3d = useSceneStore((s) => s.fillet3d)
  const chamfer3d = useSceneStore((s) => s.chamfer3d)

  const addBody = useSceneStore((s) => s.addBody)
  const removeBody = useSceneStore((s) => s.removeBody)
  const addFeature = useSceneStore((s) => s.addFeature)
  const undo = useSceneStore((s) => s.undo)
  const redo = useSceneStore((s) => s.redo)
  const undoStack = useSceneStore((s) => s.undoStack)
  const redoStack = useSceneStore((s) => s.redoStack)

  const openOperationDialog = useSceneStore((s) => s.openOperationDialog)
  const activateFillet3D = useSceneStore((s) => s.activateFillet3D)
  const activateChamfer3D = useSceneStore((s) => s.activateChamfer3D)
  const enterSketchEdit = useSceneStore((s) => s.enterSketchEdit)
  const setScene = useSceneStore((s) => s.setScene)
  const clearScene = useSceneStore((s) => s.clearScene)
  const transformMode = useSceneStore((s) => s.transformMode)
  const setTransformMode = useSceneStore((s) => s.setTransformMode)

  // File operations
  const handleNewScene = () => {
    if (scene.bodies.length > 0) {
      if (confirm('Create new scene? Unsaved changes will be lost.')) {
        clearScene()
      }
    }
  }

  const handleSaveScene = () => {
    saveSceneToFile(scene, 'scene.vcad')
  }

  const handleLoadScene = async () => {
    try {
      const loadedScene = await loadSceneFromFile()
      setScene(loadedScene)
    } catch (err) {
      console.error('Failed to load scene:', err)
      alert('Failed to load scene file')
    }
  }

  const handleExportGLB = () => {
    // This will be handled by the App component which has access to Three.js scene
    const event = new CustomEvent('export-glb')
    window.dispatchEvent(event)
  }

  // Add primitive as new body
  const handleAddPrimitive = (type: 'cube' | 'cylinder' | 'sphere' | 'cone') => {
    const bodyId = addBody()
    const body = createPrimitiveBody[type]()
    const feature = body.features[0]
    addFeature(bodyId, feature)
  }

  // Create sketch on plane
  const handleCreateSketch = (plane: SketchPlane) => {
    if (selectedBodyIds.length === 0) {
      // Create new body with sketch
      const bodyId = addBody()
      const sketchFeature: Feature = {
        type: 'sketch',
        id: `sketch_${idCounter++}`,
        sketch: createDefaultSketch(plane),
        transform: defaultTransform(),
      }
      addFeature(bodyId, sketchFeature)
      enterSketchEdit(bodyId, sketchFeature.id)
    } else {
      // Add sketch to selected body
      const bodyId = selectedBodyIds[0]
      const sketchFeature: Feature = {
        type: 'sketch',
        id: `sketch_${idCounter++}`,
        sketch: createDefaultSketch(plane),
        transform: defaultTransform(),
      }
      addFeature(bodyId, sketchFeature)
      enterSketchEdit(bodyId, sketchFeature.id)
    }
  }

  // Get selected sketch for operations
  const getSelectedSketch = (): { bodyId: string; sketchId: string } | null => {
    if (selectedBodyIds.length !== 1) return null
    const body = scene.bodies.find((b) => b.id === selectedBodyIds[0])
    if (!body) return null

    // Find sketch feature
    const sketchFeature = body.features.find(
      (f) => f.type === 'sketch' && (selectedFeatureId ? f.id === selectedFeatureId : true)
    )
    if (sketchFeature) {
      return { bodyId: body.id, sketchId: sketchFeature.id }
    }

    // Or base_extrude/base_revolve with sketch
    const baseFeature = body.features.find(
      (f) => (f.type === 'base_extrude' || f.type === 'base_revolve') &&
             (selectedFeatureId ? f.id === selectedFeatureId : true)
    )
    if (baseFeature) {
      return { bodyId: body.id, sketchId: baseFeature.id }
    }

    return null
  }

  const handleExtrude = () => {
    const sketch = getSelectedSketch()
    if (sketch) {
      openOperationDialog('extrude', sketch.sketchId, sketch.bodyId)
    }
  }

  const handleCut = () => {
    const sketch = getSelectedSketch()
    if (sketch) {
      openOperationDialog('cut', sketch.sketchId, sketch.bodyId)
    }
  }

  const handleRevolve = () => {
    const sketch = getSelectedSketch()
    if (sketch) {
      openOperationDialog('revolve', sketch.sketchId, sketch.bodyId)
    }
  }

  const handleFillet = () => {
    if (selectedBodyIds.length === 1) {
      activateFillet3D(selectedBodyIds[0])
    }
  }

  const handleChamfer = () => {
    if (selectedBodyIds.length === 1) {
      activateChamfer3D(selectedBodyIds[0])
    }
  }

  const handleDelete = () => {
    selectedBodyIds.forEach((id) => removeBody(id))
  }

  const hasSelection = selectedBodyIds.length > 0
  const hasSketchSelected = getSelectedSketch() !== null
  const isInSketchMode = sketchEdit.active
  const isInFilletMode = fillet3d.active
  const isInChamferMode = chamfer3d.active

  return (
    <div className="h-12 bg-cad-surface border-b border-cad-border px-4 flex items-center gap-1">
      {/* Logo */}
      <div className="font-bold text-cad-accent mr-4">vCAD</div>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Undo/Redo */}
      <ToolbarButton onClick={undo} title="Undo (Ctrl+Z)" disabled={undoStack.length === 0}>
        <Undo2 size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={redo} title="Redo (Ctrl+Y)" disabled={redoStack.length === 0}>
        <Redo2 size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Transform Mode */}
      <ToolbarButton
        onClick={() => setTransformMode('translate')}
        title="Move (W)"
        active={transformMode === 'translate'}
      >
        <Move size={18} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setTransformMode('rotate')}
        title="Rotate (E)"
        active={transformMode === 'rotate'}
      >
        <RotateCw size={18} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => setTransformMode('scale')}
        title="Scale (R)"
        active={transformMode === 'scale'}
      >
        <Maximize2 size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Primitives */}
      <ToolbarButton onClick={() => handleAddPrimitive('cube')} title="Add Cube">
        <Box size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={() => handleAddPrimitive('cylinder')} title="Add Cylinder">
        <Cylinder size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={() => handleAddPrimitive('sphere')} title="Add Sphere">
        <Circle size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={() => handleAddPrimitive('cone')} title="Add Cone">
        <Triangle size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Sketch */}
      <ToolbarDropdown
        title="Create Sketch"
        icon={<PenTool size={18} />}
        items={[
          { label: 'Sketch XY', onClick: () => handleCreateSketch('XY') },
          { label: 'Sketch XZ', onClick: () => handleCreateSketch('XZ') },
          { label: 'Sketch YZ', onClick: () => handleCreateSketch('YZ') },
        ]}
      />

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Operations */}
      <ToolbarButton
        onClick={handleExtrude}
        title="Extrude"
        disabled={!hasSketchSelected}
        active={false}
      >
        <ArrowUpFromLine size={18} />
      </ToolbarButton>
      <ToolbarButton
        onClick={handleCut}
        title="Cut"
        disabled={!hasSketchSelected}
      >
        <Scissors size={18} />
      </ToolbarButton>
      <ToolbarButton
        onClick={handleRevolve}
        title="Revolve"
        disabled={!hasSketchSelected}
      >
        <RotateCcw size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Fillet/Chamfer */}
      <ToolbarButton
        onClick={handleFillet}
        title="Fillet"
        disabled={!hasSelection}
        active={isInFilletMode}
      >
        <CircleDot size={18} />
      </ToolbarButton>
      <ToolbarButton
        onClick={handleChamfer}
        title="Chamfer"
        disabled={!hasSelection}
        active={isInChamferMode}
      >
        <SquareSlash size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* Delete */}
      <ToolbarButton
        onClick={handleDelete}
        title="Delete Selected"
        disabled={!hasSelection}
      >
        <Trash2 size={18} />
      </ToolbarButton>

      {/* Divider */}
      <div className="w-px h-6 bg-cad-border mx-2" />

      {/* File operations */}
      <ToolbarButton onClick={handleNewScene} title="New Scene">
        <FilePlus size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={handleSaveScene} title="Save Scene (Ctrl+S)">
        <Save size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={handleLoadScene} title="Load Scene (Ctrl+O)">
        <Upload size={18} />
      </ToolbarButton>
      <ToolbarButton onClick={handleExportGLB} title="Export GLB">
        <FileDown size={18} />
      </ToolbarButton>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status */}
      {isInSketchMode && (
        <span className="text-xs text-cad-accent mr-4">Sketch Mode</span>
      )}
      {isInFilletMode && (
        <span className="text-xs text-cad-accent mr-4">Fillet Mode - Select edges</span>
      )}
      {isInChamferMode && (
        <span className="text-xs text-cad-accent mr-4">Chamfer Mode - Select edges</span>
      )}

      {/* Help text */}
      <span className="text-xs text-cad-muted">
        Bodies: {scene.bodies.length}
      </span>
    </div>
  )
}

interface ToolbarButtonProps {
  onClick: () => void
  title: string
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}

function ToolbarButton({ onClick, title, disabled, active, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`p-2 rounded transition-colors ${
        active
          ? 'bg-cad-accent text-white'
          : disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-cad-border cursor-pointer'
      }`}
    >
      {children}
    </button>
  )
}

interface ToolbarDropdownProps {
  title: string
  icon: React.ReactNode
  items: Array<{ label: string; onClick: () => void }>
}

function ToolbarDropdown({ title, icon, items }: ToolbarDropdownProps) {
  return (
    <div className="relative group">
      <button
        title={title}
        className="p-2 rounded hover:bg-cad-border cursor-pointer flex items-center gap-1"
      >
        {icon}
        <span className="text-xs">▼</span>
      </button>
      <div className="absolute top-full left-0 mt-1 bg-cad-surface border border-cad-border rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[120px]">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.onClick}
            className="w-full px-3 py-2 text-sm text-left hover:bg-cad-border text-cad-text"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
