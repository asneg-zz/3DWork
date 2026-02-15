import {
  Box,
  Cylinder,
  Circle,
  Triangle,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  PenTool,
  ArrowUpFromLine,
  RotateCcw,
  CircleDot,
  SquareSlash,
  Plus,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useSceneStore } from '@/stores/sceneStore'
import type { Body, Feature, Primitive } from '@/types/scene'

export function SceneTree() {
  const bodies = useSceneStore((s) => s.scene.bodies)
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const selectedFeatureId = useSceneStore((s) => s.selectedFeatureId)
  const hiddenBodies = useSceneStore((s) => s.hiddenBodies)
  const selectBody = useSceneStore((s) => s.selectBody)
  const selectFeature = useSceneStore((s) => s.selectFeature)
  const toggleBodyVisibility = useSceneStore((s) => s.toggleBodyVisibility)
  const removeBody = useSceneStore((s) => s.removeBody)
  const removeFeature = useSceneStore((s) => s.removeFeature)
  const addBody = useSceneStore((s) => s.addBody)
  const enterSketchEdit = useSceneStore((s) => s.enterSketchEdit)

  const [expandedBodies, setExpandedBodies] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedBodies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleBodyClick = (e: React.MouseEvent, bodyId: string) => {
    selectBody(bodyId, e.ctrlKey || e.metaKey)
  }

  const handleFeatureClick = (e: React.MouseEvent, bodyId: string, featureId: string) => {
    e.stopPropagation()
    selectBody(bodyId, false)
    selectFeature(featureId)
  }

  const handleFeatureDoubleClick = (bodyId: string, feature: Feature) => {
    // Double-click to edit sketch
    if (feature.type === 'sketch' || feature.type === 'base_extrude' || feature.type === 'base_revolve') {
      enterSketchEdit(bodyId, feature.id)
    }
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-cad-text">Scene Tree</h2>
        <button
          onClick={() => addBody()}
          className="p-1 hover:bg-cad-border rounded"
          title="Add Body"
        >
          <Plus size={14} className="text-cad-muted" />
        </button>
      </div>

      {bodies.length === 0 ? (
        <p className="text-xs text-cad-muted">No bodies in scene</p>
      ) : (
        <div className="space-y-1">
          {bodies.map((body) => (
            <BodyItem
              key={body.id}
              body={body}
              isSelected={selectedBodyIds.includes(body.id)}
              selectedFeatureId={selectedFeatureId}
              isHidden={hiddenBodies.has(body.id)}
              isExpanded={expandedBodies.has(body.id)}
              onToggleExpand={() => toggleExpand(body.id)}
              onClick={(e) => handleBodyClick(e, body.id)}
              onFeatureClick={(e, fId) => handleFeatureClick(e, body.id, fId)}
              onFeatureDoubleClick={(f) => handleFeatureDoubleClick(body.id, f)}
              onToggleVisibility={() => toggleBodyVisibility(body.id)}
              onDelete={() => removeBody(body.id)}
              onDeleteFeature={(fId) => removeFeature(body.id, fId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface BodyItemProps {
  body: Body
  isSelected: boolean
  selectedFeatureId: string | null
  isHidden: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onClick: (e: React.MouseEvent) => void
  onFeatureClick: (e: React.MouseEvent, featureId: string) => void
  onFeatureDoubleClick: (feature: Feature) => void
  onToggleVisibility: () => void
  onDelete: () => void
  onDeleteFeature: (featureId: string) => void
}

function BodyItem({
  body,
  isSelected,
  selectedFeatureId,
  isHidden,
  isExpanded,
  onToggleExpand,
  onClick,
  onFeatureClick,
  onFeatureDoubleClick,
  onToggleVisibility,
  onDelete,
  onDeleteFeature,
}: BodyItemProps) {
  const hasFeatures = body.features.length > 0

  return (
    <div>
      {/* Body row */}
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer text-sm ${
          isSelected
            ? 'bg-cad-accent/20 text-cad-accent'
            : 'hover:bg-cad-border text-cad-text'
        }`}
        onClick={onClick}
      >
        {/* Expand toggle */}
        {hasFeatures ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            className="p-0.5"
          >
            {isExpanded ? (
              <ChevronDown size={12} className="text-cad-muted" />
            ) : (
              <ChevronRight size={12} className="text-cad-muted" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Body icon */}
        <Box size={14} className="text-cad-accent" />

        {/* Name */}
        <span className="flex-1 truncate">{body.name}</span>

        {/* Visibility toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisibility()
          }}
          className="p-1 hover:bg-cad-bg rounded"
        >
          {isHidden ? (
            <EyeOff size={12} className="text-cad-muted" />
          ) : (
            <Eye size={12} className="text-cad-muted" />
          )}
        </button>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 hover:bg-cad-bg rounded opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={12} className="text-cad-muted" />
        </button>
      </div>

      {/* Features list */}
      {isExpanded && hasFeatures && (
        <div className="ml-4 border-l border-cad-border pl-2 mt-1 space-y-0.5">
          {body.features.map((feature) => (
            <FeatureItem
              key={feature.id}
              feature={feature}
              isSelected={selectedFeatureId === feature.id}
              onClick={(e) => onFeatureClick(e, feature.id)}
              onDoubleClick={() => onFeatureDoubleClick(feature)}
              onDelete={() => onDeleteFeature(feature.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FeatureItemProps {
  feature: Feature
  isSelected: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onDelete: () => void
}

function FeatureItem({ feature, isSelected, onClick, onDoubleClick, onDelete }: FeatureItemProps) {
  const Icon = getFeatureIcon(feature)
  const name = getFeatureName(feature)
  const color = getFeatureColor(feature)

  return (
    <div
      className={`group flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs ${
        isSelected
          ? 'bg-cad-accent/20 text-cad-accent'
          : 'hover:bg-cad-border text-cad-text'
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <Icon size={12} style={{ color }} />
      <span className="flex-1 truncate">{name}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-0.5 hover:bg-cad-bg rounded opacity-0 group-hover:opacity-100"
      >
        <Trash2 size={10} className="text-cad-muted" />
      </button>
    </div>
  )
}

function getFeatureIcon(feature: Feature) {
  switch (feature.type) {
    case 'base_primitive':
      return getPrimitiveIcon(feature.primitive)
    case 'base_extrude':
    case 'extrude':
      return ArrowUpFromLine
    case 'base_revolve':
    case 'revolve':
      return RotateCcw
    case 'sketch':
      return PenTool
    case 'fillet_3d':
      return CircleDot
    case 'chamfer_3d':
      return SquareSlash
    case 'boolean_modify':
      return Box
    default:
      return Box
  }
}

function getPrimitiveIcon(primitive: Primitive) {
  switch (primitive.type) {
    case 'cube':
      return Box
    case 'cylinder':
      return Cylinder
    case 'sphere':
      return Circle
    case 'cone':
      return Triangle
    default:
      return Box
  }
}

function getFeatureName(feature: Feature): string {
  switch (feature.type) {
    case 'base_primitive':
      return `Base ${feature.primitive.type}`
    case 'base_extrude':
      return `Base Extrude (h=${feature.height.toFixed(1)})`
    case 'base_revolve':
      return `Base Revolve (${feature.angle}°)`
    case 'sketch':
      return `Sketch ${feature.sketch.plane}`
    case 'extrude':
      return feature.cut
        ? `Cut (h=${feature.height.toFixed(1)})`
        : `Extrude (h=${feature.height.toFixed(1)})`
    case 'revolve':
      return feature.cut
        ? `Cut Revolve (${feature.angle}°)`
        : `Revolve (${feature.angle}°)`
    case 'fillet_3d':
      return `Fillet (r=${feature.radius.toFixed(1)})`
    case 'chamfer_3d':
      return `Chamfer (d=${feature.distance.toFixed(1)})`
    case 'boolean_modify':
      return `Boolean ${feature.op}`
    default:
      return 'Unknown'
  }
}

function getFeatureColor(feature: Feature): string {
  switch (feature.type) {
    case 'sketch':
      return '#f59e0b' // Amber
    case 'base_extrude':
    case 'extrude':
      return feature.type === 'extrude' && feature.cut ? '#ef4444' : '#22c55e' // Red for cut, green for extrude
    case 'base_revolve':
    case 'revolve':
      return feature.type === 'revolve' && feature.cut ? '#ef4444' : '#8b5cf6' // Red for cut, purple for revolve
    case 'fillet_3d':
      return '#3b82f6' // Blue
    case 'chamfer_3d':
      return '#06b6d4' // Cyan
    default:
      return '#6366f1' // Indigo
  }
}
