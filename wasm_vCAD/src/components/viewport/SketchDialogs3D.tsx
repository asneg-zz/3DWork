/**
 * SketchDialogs3D - HTML overlays for sketch editing in 3D viewport
 * Renders context menus and dialogs outside the Three.js Canvas.
 * Reads state from sketchUIStore and calls handlers stored by SketchScene3D.
 */

import { useSketchStore } from '@/stores/sketchStore'
import { useSketchUIStore } from '@/stores/sketchUIStore'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { OffsetDialog } from '@/components/dialogs/OffsetDialog'
import { MirrorDialog } from '@/components/dialogs/MirrorDialog'
import { LinearPatternDialog } from '@/components/dialogs/LinearPatternDialog'
import { CircularPatternDialog } from '@/components/dialogs/CircularPatternDialog'
import { ConstraintDialog } from '@/components/dialogs/ConstraintDialog'
import { getContextMenuItems, type ContextMenuCallbacks } from './sketchContextMenu'
import { getToolsContextMenuItems, type ToolsContextMenuCallbacks } from './sketchToolsContextMenu'
import { joinConnectedElements } from './sketchUtils'

export function SketchDialogs3D() {
  const elements = useSketchStore(s => s.elements)
  const selectedElementIds = useSketchStore(s => s.selectedElementIds)

  const {
    contextMenu,
    toolsContextMenu,
    offsetDialog,
    mirrorDialog,
    linearPatternDialog,
    circularPatternDialog,
    constraintDialog,
    setContextMenu,
    setToolsContextMenu,
    setOffsetDialog,
    setMirrorDialog,
    setLinearPatternDialog,
    setCircularPatternDialog,
    setConstraintDialog,
  } = useSketchUIStore()

  // Get handlers stored by SketchScene3D
  const getHandler = (name: string) => (useSketchUIStore.getState() as any)[name]

  const contextMenuCallbacks: ContextMenuCallbacks = {
    onDuplicate: (elementId) => getHandler('_handleDuplicate')?.(elementId),
    onOffset: (elementId) => setOffsetDialog({ isOpen: true, elementId }),
    onMirror: (elementId) => setMirrorDialog({ isOpen: true, elementId }),
    onLinearPattern: (elementId) => setLinearPatternDialog({ isOpen: true, elementId }),
    onCircularPattern: (elementId) => setCircularPatternDialog({ isOpen: true, elementId }),
    onToggleConstruction: (elementId) => getHandler('_toggleConstruction')?.(elementId),
    onSetSymmetryAxis: (elementId) => getHandler('_setSymmetryAxis')?.(elementId),
    onDelete: () => getHandler('_deleteSelected')?.(),
    isConstruction: (elementId) => getHandler('_isConstruction')?.(elementId) ?? false,
    isSymmetryAxis: (elementId) => getHandler('_isSymmetryAxis')?.(elementId) ?? false,
    onAddConstraint: (constraintType, elementId) => getHandler('_handleAddConstraint')?.(constraintType, elementId),
    hasConstraint: (constraintType, elementId) => getHandler('_hasConstraint')?.(constraintType, elementId) ?? false,
    onOpenConstraintDialog: (elementId) => {
      const element = elements.find(el => el.id === elementId)
      if (element) {
        let secondElementId = null
        if (selectedElementIds.length === 2) {
          secondElementId = selectedElementIds.find(id => id !== elementId) || null
        }
        setConstraintDialog({
          isOpen: true,
          elementId,
          elementType: element.type,
          secondElementId,
          needsSecondElement: false,
        })
      }
    },
    onJoinContour: () => {
      // Get selected elements
      const selectedElements = elements.filter(el => selectedElementIds.includes(el.id!))
      if (selectedElements.length < 2) return

      // Join connected elements
      const joinedElements = joinConnectedElements(selectedElements)

      // If joining resulted in fewer elements, update the store
      if (joinedElements.length < selectedElements.length) {
        // Get IDs of elements that were not selected
        const unselectedElements = elements.filter(el => !selectedElementIds.includes(el.id!))
        // Combine with joined elements
        const newElements = [...unselectedElements, ...joinedElements]
        useSketchStore.getState().setElements(newElements)
        useSketchStore.getState().clearSelection()
      }
      setContextMenu(null)
    },
    canJoinContour: () => {
      // Can join if 2+ joinable elements are selected
      const selectedElements = elements.filter(el => selectedElementIds.includes(el.id!))
      const joinableTypes = ['line', 'arc', 'polyline', 'spline']
      const joinableCount = selectedElements.filter(el => joinableTypes.includes(el.type)).length
      return joinableCount >= 2
    },
  }

  const getMenuItems = (elementId: string) => {
    const element = elements.find(el => el.id === elementId)
    if (!element) return []
    return getContextMenuItems(element, elementId, contextMenuCallbacks)
  }

  const toolsContextMenuCallbacks: ToolsContextMenuCallbacks = {
    onSelectTool: (toolName: string) => {
      getHandler('_setTool')?.(toolName)
      setToolsContextMenu(null)
    },
    onExitSketch: () => {
      getHandler('_exitSketch')?.()
      setToolsContextMenu(null)
    },
  }

  return (
    <>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getMenuItems(contextMenu.elementId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {toolsContextMenu && (
        <ContextMenu
          x={toolsContextMenu.x}
          y={toolsContextMenu.y}
          items={getToolsContextMenuItems(toolsContextMenuCallbacks)}
          onClose={() => setToolsContextMenu(null)}
        />
      )}

      <OffsetDialog
        isOpen={offsetDialog.isOpen}
        onClose={() => setOffsetDialog({ isOpen: false, elementId: null })}
        onConfirm={(distance) => {
          if (offsetDialog.elementId) {
            getHandler('_handleOffset')?.(offsetDialog.elementId, distance)
          }
        }}
      />

      <MirrorDialog
        isOpen={mirrorDialog.isOpen}
        onClose={() => setMirrorDialog({ isOpen: false, elementId: null })}
        onConfirm={(axis) => {
          if (mirrorDialog.elementId) {
            getHandler('_handleMirror')?.(mirrorDialog.elementId, axis)
          }
        }}
      />

      <LinearPatternDialog
        isOpen={linearPatternDialog.isOpen}
        onClose={() => setLinearPatternDialog({ isOpen: false, elementId: null })}
        onConfirm={(count, dx, dy) => {
          if (linearPatternDialog.elementId) {
            getHandler('_handleLinearPattern')?.(linearPatternDialog.elementId, count, dx, dy)
          }
        }}
      />

      <CircularPatternDialog
        isOpen={circularPatternDialog.isOpen}
        onClose={() => setCircularPatternDialog({ isOpen: false, elementId: null })}
        onConfirm={(count, centerX, centerY, angle) => {
          if (circularPatternDialog.elementId) {
            getHandler('_handleCircularPattern')?.(circularPatternDialog.elementId, count, centerX, centerY, angle)
          }
        }}
      />

      <ConstraintDialog
        isOpen={constraintDialog.isOpen}
        elementId={constraintDialog.elementId}
        elementType={constraintDialog.elementType}
        secondElementId={constraintDialog.secondElementId}
        needsSecondElement={constraintDialog.needsSecondElement}
        hasConstraint={(constraintType, elementId) =>
          getHandler('_hasConstraint')?.(constraintType, elementId) ?? false
        }
        onStartCoincidentSelection={() => {
          getHandler('_setSelectingCoincidentPoints')?.(true)
          getHandler('_setCoincidentPoint1')?.(null)
        }}
        onClose={() => setConstraintDialog({
          isOpen: false,
          elementId: null,
          elementType: null,
          secondElementId: null,
          needsSecondElement: false,
        })}
        onConfirm={(constraintType) => {
          if (constraintDialog.elementId) {
            if (constraintDialog.secondElementId) {
              getHandler('_handleAddConstraint')?.(constraintType, constraintDialog.elementId, constraintDialog.secondElementId)
              setConstraintDialog({
                isOpen: false,
                elementId: null,
                elementType: null,
                secondElementId: null,
                needsSecondElement: false,
              })
            } else {
              const requiresSecond = ['parallel', 'perpendicular', 'equal', 'tangent', 'concentric', 'symmetric'].includes(constraintType)
              if (!requiresSecond) {
                getHandler('_handleAddConstraint')?.(constraintType, constraintDialog.elementId)
                setConstraintDialog({
                  isOpen: false,
                  elementId: null,
                  elementType: null,
                  secondElementId: null,
                  needsSecondElement: false,
                })
              }
            }
          }
        }}
        onNeedSecondElement={(constraintType) => {
          setConstraintDialog({
            ...constraintDialog,
            isOpen: false,
            needsSecondElement: true,
            pendingConstraintType: constraintType,
          })
        }}
      />
    </>
  )
}
