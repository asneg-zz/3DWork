import { useSceneStore, useSelectedBody, useSelectedFeature } from '@/stores/sceneStore'
import type { Body, Feature, Primitive, Transform } from '@/types/scene'

export function PropertyPanel() {
  const selectedBodyIds = useSceneStore((s) => s.selectedBodyIds)
  const selectedBody = useSelectedBody()
  const selectedFeature = useSelectedFeature()

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold text-cad-text mb-3">Properties</h2>

      {selectedBodyIds.length === 0 ? (
        <p className="text-xs text-cad-muted">Select an object to view properties</p>
      ) : selectedBodyIds.length > 1 ? (
        <p className="text-xs text-cad-muted">{selectedBodyIds.length} bodies selected</p>
      ) : selectedBody ? (
        <div className="space-y-4">
          <BodyProperties body={selectedBody} />
          {selectedFeature && <FeatureProperties feature={selectedFeature} bodyId={selectedBody.id} />}
        </div>
      ) : null}
    </div>
  )
}

interface BodyPropertiesProps {
  body: Body
}

function BodyProperties({ body }: BodyPropertiesProps) {
  const updateFeature = useSceneStore((s) => s.updateFeature)

  // Get base feature for primitive properties
  const baseFeature = body.features[0]
  const primitive = baseFeature?.type === 'base_primitive' ? baseFeature.primitive : null
  const transform = baseFeature?.type === 'base_primitive' ? baseFeature.transform : null

  return (
    <div className="space-y-4">
      {/* Body Name */}
      <div>
        <label className="text-xs text-cad-muted block mb-1">Body</label>
        <div className="text-sm text-cad-text font-medium">{body.name}</div>
      </div>

      {/* Features count */}
      <div>
        <label className="text-xs text-cad-muted block mb-1">Features</label>
        <div className="text-sm text-cad-text">{body.features.length}</div>
      </div>

      {/* Primitive Parameters */}
      {primitive && (
        <div>
          <label className="text-xs text-cad-muted block mb-1">
            {primitive.type.charAt(0).toUpperCase() + primitive.type.slice(1)} Parameters
          </label>
          <PrimitiveEditor
            primitive={primitive}
            onChange={(newPrimitive) => {
              if (baseFeature) {
                updateFeature(body.id, baseFeature.id, {
                  primitive: newPrimitive,
                } as Partial<Feature>)
              }
            }}
          />
        </div>
      )}

      {/* Transform */}
      {transform && (
        <div>
          <label className="text-xs text-cad-muted block mb-1">Position</label>
          <TransformEditor
            transform={transform}
            onChange={(newTransform) => {
              if (baseFeature) {
                updateFeature(body.id, baseFeature.id, {
                  transform: newTransform,
                } as Partial<Feature>)
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

interface FeaturePropertiesProps {
  feature: Feature
  bodyId: string
}

function FeatureProperties({ feature, bodyId }: FeaturePropertiesProps) {
  const updateFeature = useSceneStore((s) => s.updateFeature)

  return (
    <div className="border-t border-cad-border pt-4">
      <label className="text-xs text-cad-muted block mb-2">Selected Feature</label>
      <div className="text-sm text-cad-text font-medium mb-3">
        {getFeatureTypeName(feature.type)}
      </div>

      {/* Feature-specific properties */}
      {(feature.type === 'extrude' || feature.type === 'base_extrude') && (
        <div className="space-y-2">
          <NumberInput
            label="Height"
            value={feature.height}
            onChange={(v) => updateFeature(bodyId, feature.id, { height: v })}
          />
          {feature.type === 'extrude' && (
            <>
              <NumberInput
                label="Height Backward"
                value={feature.height_backward || 0}
                onChange={(v) => updateFeature(bodyId, feature.id, { height_backward: v })}
              />
              <NumberInput
                label="Draft Angle"
                value={feature.draft_angle || 0}
                onChange={(v) => updateFeature(bodyId, feature.id, { draft_angle: v })}
              />
            </>
          )}
        </div>
      )}

      {(feature.type === 'revolve' || feature.type === 'base_revolve') && (
        <div className="space-y-2">
          <NumberInput
            label="Angle"
            value={feature.angle}
            onChange={(v) => updateFeature(bodyId, feature.id, { angle: v })}
          />
          <NumberInput
            label="Segments"
            value={feature.segments}
            step={1}
            onChange={(v) => updateFeature(bodyId, feature.id, { segments: Math.round(v) })}
          />
        </div>
      )}

      {feature.type === 'fillet_3d' && (
        <div className="space-y-2">
          <NumberInput
            label="Radius"
            value={feature.radius}
            onChange={(v) => updateFeature(bodyId, feature.id, { radius: v })}
          />
          <NumberInput
            label="Segments"
            value={feature.segments}
            step={1}
            onChange={(v) => updateFeature(bodyId, feature.id, { segments: Math.round(v) })}
          />
          <div className="text-xs text-cad-muted">
            Edges: {feature.edges.length}
          </div>
        </div>
      )}

      {feature.type === 'chamfer_3d' && (
        <div className="space-y-2">
          <NumberInput
            label="Distance"
            value={feature.distance}
            onChange={(v) => updateFeature(bodyId, feature.id, { distance: v })}
          />
          <div className="text-xs text-cad-muted">
            Edges: {feature.edges.length}
          </div>
        </div>
      )}
    </div>
  )
}

interface PrimitiveEditorProps {
  primitive: Primitive
  onChange: (p: Primitive) => void
}

function PrimitiveEditor({ primitive, onChange }: PrimitiveEditorProps) {
  switch (primitive.type) {
    case 'cube':
      return (
        <div className="space-y-2">
          <NumberInput
            label="Width"
            value={primitive.width}
            onChange={(v) => onChange({ ...primitive, width: v })}
          />
          <NumberInput
            label="Height"
            value={primitive.height}
            onChange={(v) => onChange({ ...primitive, height: v })}
          />
          <NumberInput
            label="Depth"
            value={primitive.depth}
            onChange={(v) => onChange({ ...primitive, depth: v })}
          />
        </div>
      )
    case 'cylinder':
      return (
        <div className="space-y-2">
          <NumberInput
            label="Radius"
            value={primitive.radius}
            onChange={(v) => onChange({ ...primitive, radius: v })}
          />
          <NumberInput
            label="Height"
            value={primitive.height}
            onChange={(v) => onChange({ ...primitive, height: v })}
          />
        </div>
      )
    case 'sphere':
      return (
        <NumberInput
          label="Radius"
          value={primitive.radius}
          onChange={(v) => onChange({ ...primitive, radius: v })}
        />
      )
    case 'cone':
      return (
        <div className="space-y-2">
          <NumberInput
            label="Radius"
            value={primitive.radius}
            onChange={(v) => onChange({ ...primitive, radius: v })}
          />
          <NumberInput
            label="Height"
            value={primitive.height}
            onChange={(v) => onChange({ ...primitive, height: v })}
          />
        </div>
      )
    default:
      return null
  }
}

interface TransformEditorProps {
  transform: Transform
  onChange: (t: Transform) => void
}

function TransformEditor({ transform, onChange }: TransformEditorProps) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <div key={axis} className="flex items-center gap-1">
          <span className="text-xs text-cad-muted">{axis}</span>
          <input
            type="number"
            value={transform.position[i]}
            step={0.1}
            onChange={(e) => {
              const newPos = [...transform.position] as [number, number, number]
              newPos[i] = parseFloat(e.target.value) || 0
              onChange({ ...transform, position: newPos })
            }}
            className="w-full bg-cad-bg border border-cad-border rounded px-1 py-0.5 text-xs text-cad-text"
          />
        </div>
      ))}
    </div>
  )
}

interface NumberInputProps {
  label: string
  value: number
  step?: number
  onChange: (v: number) => void
}

function NumberInput({ label, value, step = 0.1, onChange }: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-cad-muted w-20">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
      />
    </div>
  )
}

function getFeatureTypeName(type: string): string {
  const names: Record<string, string> = {
    base_primitive: 'Base Primitive',
    base_extrude: 'Base Extrude',
    base_revolve: 'Base Revolve',
    sketch: 'Sketch',
    extrude: 'Extrude',
    revolve: 'Revolve',
    fillet_3d: 'Fillet 3D',
    chamfer_3d: 'Chamfer 3D',
    boolean_modify: 'Boolean Modify',
  }
  return names[type] || type
}
