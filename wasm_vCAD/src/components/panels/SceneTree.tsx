import { ChevronRight, ChevronDown, Eye, EyeOff, Trash, Edit } from 'lucide-react'
import { useState } from 'react'
import { useSceneStore } from '@/stores/sceneStore'
import { useBooleanStore } from '@/stores/booleanStore'
import { useSketchStore } from '@/stores/sketchStore'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { ExtrudeDialog } from '@/components/dialogs/ExtrudeDialog'
import { useFeatureEdit } from '@/hooks/useFeatureEdit'
import type { Feature } from '@/types/scene'

export function SceneTree() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const selectBody = useSceneStore((s) => s.selectBody)
  const deselectBody = useSceneStore((s) => s.deselectBody)
  const clearSelection = useSceneStore((s) => s.clearSelection)
  const updateBody = useSceneStore((s) => s.updateBody)
  const removeBody = useSceneStore((s) => s.removeBody)
  const removeFeature = useSceneStore((s) => s.removeFeature)
  const removeSketchWithDependents = useSceneStore((s) => s.removeSketchWithDependents)

  const booleanActive = useBooleanStore((s) => s.active)
  const booleanSelectedBodies = useBooleanStore((s) => s.selectedBodies)
  const toggleBooleanSelection = useBooleanStore((s) => s.toggleBodySelection)

  const loadSketch = useSketchStore((s) => s.loadSketch)

  const { editExtrudeFeature, editCutFeature } = useFeatureEdit()

  const [expandedBodyIds, setExpandedBodyIds] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    bodyId: string
    feature: Feature
  } | null>(null)

  const [editDialog, setEditDialog] = useState<{
    bodyId: string
    feature: Feature
  } | null>(null)

  const toggleExpanded = (bodyId: string) => {
    setExpandedBodyIds(prev => {
      const next = new Set(prev)
      if (next.has(bodyId)) {
        next.delete(bodyId)
      } else {
        next.add(bodyId)
      }
      return next
    })
  }

  const handleSelectBody = (bodyId: string, event: React.MouseEvent) => {
    if (booleanActive) {
      toggleBooleanSelection(bodyId)
      return
    }

    if (event.ctrlKey || event.metaKey) {
      if (selectedBodyIds.includes(bodyId)) {
        deselectBody(bodyId)
      } else {
        selectBody(bodyId)
      }
    } else {
      clearSelection()
      selectBody(bodyId)
    }
  }

  const toggleVisibility = (bodyId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const body = bodies.find(b => b.id === bodyId)
    if (body) {
      updateBody(bodyId, { visible: !body.visible })
    }
  }

  const handleDelete = (bodyId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    removeBody(bodyId)
  }

  const handleFeatureContextMenu = (
    e: React.MouseEvent,
    bodyId: string,
    feature: Feature
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, bodyId, feature })
  }

  const handleEditSketch = () => {
    if (!contextMenu) return
    const { bodyId, feature } = contextMenu
    if (feature.type === 'sketch' && feature.sketch) {
      // Migrate legacy construction array (boolean[]) to construction_ids (string[])
      let constructionIds: string[] = []
      if (feature.sketch.construction_ids) {
        constructionIds = feature.sketch.construction_ids
      } else if (feature.sketch.construction) {
        // Convert old format: boolean[] at indices -> element IDs
        constructionIds = feature.sketch.elements
          .filter((_, i) => feature.sketch!.construction![i])
          .map(el => el.id)
      }

      loadSketch(
        bodyId,
        feature.id,
        feature.sketch.plane,
        feature.sketch.elements,
        feature.sketch.offset ?? 0,
        feature.sketch.face_coord_system ?? null,
        constructionIds,
        feature.sketch.constraints ?? [],
      )
    }
    setContextMenu(null)
  }

  const handleOpenEditDialog = () => {
    if (!contextMenu) return
    const { bodyId, feature } = contextMenu
    setEditDialog({ bodyId, feature })
    setContextMenu(null)
  }

  const handleDeleteFeature = () => {
    if (!contextMenu) return
    const { bodyId, feature } = contextMenu

    if (feature.type === 'sketch') {
      // Cascade: remove sketch + all dependent operations (extrude, cut, etc.)
      removeSketchWithDependents(bodyId, feature.id)
    } else {
      removeFeature(bodyId, feature.id)
    }
    setContextMenu(null)
  }

  const isEditableFeature = (feature: Feature) =>
    feature.type === 'extrude' || feature.type === 'cut'

  const editDialogIsCut = editDialog?.feature.type === 'cut'
  const editDialogInitialParams = editDialog?.feature.extrude_params

  // ─── Feature row renderer ──────────────────────────────────────────────────

  const featureRow = (bodyId: string, feature: Feature, isChild = false) => (
    <div
      key={feature.id}
      className={`
        px-2 py-1 text-xs text-cad-muted hover:bg-cad-hover rounded cursor-pointer
        ${isChild ? 'ml-4 border-l border-cad-border/40 pl-3' : ''}
      `}
      onContextMenu={(e) => handleFeatureContextMenu(e, bodyId, feature)}
    >
      {feature.name}
      <span className="ml-1 opacity-50">({feature.type})</span>
    </div>
  )

  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold mb-3 text-cad-muted uppercase tracking-wide">
        Scene Tree
      </h3>

      {bodies.length === 0 && (
        <p className="text-sm text-cad-muted italic">No objects in scene</p>
      )}

      <div className="space-y-1">
        {bodies.map(body => {
          const isExpanded = expandedBodyIds.has(body.id)
          const isSelected = booleanActive
            ? booleanSelectedBodies.includes(body.id)
            : selectedBodyIds.includes(body.id)

          // IDs of features that are children of a sketch (shown nested, not at root)
          const sketchIds = new Set(body.features.filter(f => f.type === 'sketch').map(f => f.id))
          const childFeatureIds = new Set(
            body.features
              .filter(f => f.sketch_id && sketchIds.has(f.sketch_id))
              .map(f => f.id)
          )

          // Root-level features: sketches, primitives, booleans, fillets, chamfers,
          // plus any orphaned operations whose parent sketch was already deleted.
          const rootFeatures = body.features.filter(f => !childFeatureIds.has(f.id))

          return (
            <div key={body.id}>
              {/* Body header row */}
              <div
                className={`
                  flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer
                  ${isSelected ? 'bg-cad-accent/30 text-cad-accent' : 'hover:bg-cad-hover'}
                `}
                onClick={(e) => handleSelectBody(body.id, e)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpanded(body.id) }}
                  className="p-0.5 hover:bg-cad-hover rounded"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <span className="flex-1 text-sm truncate">{body.name}</span>

                <button
                  onClick={(e) => toggleVisibility(body.id, e)}
                  className="p-1 hover:bg-cad-hover rounded opacity-70 hover:opacity-100"
                  title={body.visible ? 'Hide' : 'Show'}
                >
                  {body.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>

                <button
                  onClick={(e) => handleDelete(body.id, e)}
                  className="p-1 hover:bg-red-500/20 rounded opacity-70 hover:opacity-100"
                  title="Delete"
                >
                  <Trash size={14} />
                </button>
              </div>

              {/* Feature list */}
              {isExpanded && (
                <div className="ml-6 mt-1 space-y-0.5">
                  {rootFeatures.map(feature => {
                    if (feature.type === 'sketch') {
                      // Sketch with its child operations nested below
                      const children = body.features.filter(f => f.sketch_id === feature.id)
                      return (
                        <div key={feature.id}>
                          {featureRow(body.id, feature)}
                          {children.map(child => featureRow(body.id, child, true))}
                        </div>
                      )
                    }
                    return featureRow(body.id, feature)
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Редактировать',
              icon: <Edit size={16} />,
              onClick: handleOpenEditDialog,
              disabled: !isEditableFeature(contextMenu.feature),
            },
            {
              label: 'Edit Sketch',
              icon: <Edit size={16} />,
              onClick: handleEditSketch,
              disabled: contextMenu.feature.type !== 'sketch',
            },
            {
              label: 'Delete',
              icon: <Trash size={16} />,
              onClick: handleDeleteFeature,
              danger: true,
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {editDialog && (
        <ExtrudeDialog
          isOpen={true}
          onClose={() => setEditDialog(null)}
          initialIsCut={editDialogIsCut}
          initialHeight={editDialogInitialParams?.height}
          initialHeightBackward={editDialogInitialParams?.height_backward}
          initialDraftAngle={editDialogInitialParams?.draft_angle}
          onConfirm={(height, heightBackward, draftAngle, isCut) => {
            const { bodyId, feature } = editDialog
            if (isCut || feature.type === 'cut') {
              editCutFeature(bodyId, feature.id, height, heightBackward, draftAngle)
            } else {
              editExtrudeFeature(bodyId, feature.id, height, heightBackward, draftAngle)
            }
            setEditDialog(null)
          }}
        />
      )}
    </div>
  )
}
