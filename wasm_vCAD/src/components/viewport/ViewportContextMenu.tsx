import { useEffect, useRef } from 'react'
import { Pencil, Eye, EyeOff, Layers } from 'lucide-react'
import { useViewportContextMenuStore } from '@/stores/viewportContextMenuStore'
import { useSceneStore } from '@/stores/sceneStore'
import { useSettingsStore } from '@/stores/settingsStore'

const OPACITY_PRESETS = [
  { label: '100%', value: 1 },
  { label: '75%',  value: 0.75 },
  { label: '50%',  value: 0.5 },
  { label: '25%',  value: 0.25 },
  { label: '0%',   value: 0 },
]

export function ViewportContextMenu() {
  const { isOpen, x, y, bodyId, faceInfo, close } = useViewportContextMenuStore()
  const menuRef = useRef<HTMLDivElement>(null)

  const bodies = useSceneStore((s) => s.scene.bodies)
  const updateBody = useSceneStore((s) => s.updateBody)
  const bodyOpacity = useSettingsStore((s) => s.bodyOpacity)
  const set = useSettingsStore((s) => s.set)

  const body = bodies.find(b => b.id === bodyId)

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }

    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen, close])

  if (!isOpen || !body) return null

  const handleCreateSketch = () => {
    if (!faceInfo) return
    const event = new CustomEvent('face-selected', { detail: faceInfo })
    window.dispatchEvent(event)
    close()
  }

  const handleToggleVisibility = () => {
    if (!bodyId) return
    updateBody(bodyId, { visible: !body.visible })
    close()
  }

  const handleSetOpacity = (value: number) => {
    set({ bodyOpacity: value })
    close()
  }

  // Clamp menu so it doesn't go off screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 300,
    minWidth: 200,
  }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-cad-surface border border-cad-border rounded-lg shadow-2xl py-1 text-sm"
    >
      {/* Create sketch on face — only if face data is available */}
      <button
        onClick={handleCreateSketch}
        disabled={!faceInfo}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cad-hover disabled:opacity-40 disabled:cursor-default text-cad-text text-left"
      >
        <Pencil size={14} />
        <span>Создать скетч на грани</span>
      </button>

      <div className="h-px bg-cad-border mx-2 my-1" />

      {/* Transparency presets */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1 mb-1.5 text-cad-muted">
          <Layers size={13} />
          <span className="text-xs">Прозрачность</span>
        </div>
        <div className="flex gap-1">
          {OPACITY_PRESETS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => handleSetOpacity(value)}
              className={`flex-1 py-1 rounded text-xs transition-colors ${
                Math.abs(bodyOpacity - value) < 0.01
                  ? 'bg-cad-accent text-white'
                  : 'bg-cad-bg hover:bg-cad-hover text-cad-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-cad-border mx-2 my-1" />

      {/* Visibility toggle */}
      <button
        onClick={handleToggleVisibility}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cad-hover text-cad-text text-left"
      >
        {body.visible
          ? <><EyeOff size={14} /><span>Скрыть тело</span></>
          : <><Eye size={14} /><span>Показать тело</span></>
        }
      </button>
    </div>
  )
}
