/**
 * SnapSettingsMenu - Dropdown menu for snap settings in sketch mode
 * Allows toggling different snap point types
 */

import { useState, useRef, useEffect } from 'react'
import { Magnet, ChevronDown, ChevronUp, Grid, CircleDot, Crosshair } from 'lucide-react'
import { useSketchStore } from '@/stores/sketchStore'
import { useSettingsStore } from '@/stores/settingsStore'

export function SnapSettingsMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])
  const snapSettings = useSketchStore((s) => s.snapSettings)
  const setSnapSetting = useSketchStore((s) => s.setSnapSetting)
  const toggleSnapEnabled = useSketchStore((s) => s.toggleSnapEnabled)

  // Grid snap is stored in settingsStore (persisted)
  const snapToGrid = useSettingsStore((s) => s.snapToGrid)
  const setSettings = useSettingsStore((s) => s.set)

  const snapTypes = [
    { key: 'endpoint' as const, label: 'Конечные точки', icon: Crosshair },
    { key: 'midpoint' as const, label: 'Середины', icon: CircleDot },
    { key: 'center' as const, label: 'Центры', icon: CircleDot },
    { key: 'quadrant' as const, label: 'Квадранты', icon: CircleDot },
  ]

  return (
    <div className="relative" ref={menuRef}>
      {/* Main button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          snapSettings.enabled
            ? 'bg-cad-accent/20 text-cad-accent border border-cad-accent/50'
            : 'bg-cad-bg text-cad-muted border border-cad-border hover:border-cad-accent/50'
        }`}
        title="Настройки привязок"
      >
        <Magnet size={14} />
        <span>Привязки</span>
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-cad-surface border border-cad-border rounded shadow-lg z-50 min-w-[180px]">
          {/* Master toggle */}
          <label className="flex items-center gap-2 px-3 py-2 hover:bg-cad-hover cursor-pointer border-b border-cad-border">
            <input
              type="checkbox"
              checked={snapSettings.enabled}
              onChange={toggleSnapEnabled}
              className="w-3.5 h-3.5 accent-cad-accent"
            />
            <Magnet size={14} className={snapSettings.enabled ? 'text-cad-accent' : 'text-cad-muted'} />
            <span className="text-xs font-medium">Включить привязки</span>
          </label>

          {/* Individual snap types */}
          <div className={snapSettings.enabled ? '' : 'opacity-50 pointer-events-none'}>
            {snapTypes.map(({ key, label, icon: Icon }) => (
              <label
                key={key}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-cad-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={snapSettings[key]}
                  onChange={(e) => setSnapSetting(key, e.target.checked)}
                  className="w-3.5 h-3.5 accent-cad-accent"
                />
                <Icon size={14} className="text-cad-muted" />
                <span className="text-xs">{label}</span>
              </label>
            ))}
            {/* Grid snap - stored in settingsStore */}
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-cad-hover cursor-pointer">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSettings({ snapToGrid: e.target.checked })}
                className="w-3.5 h-3.5 accent-cad-accent"
              />
              <Grid size={14} className="text-cad-muted" />
              <span className="text-xs">Сетка</span>
            </label>
          </div>

          {/* Snap radius setting */}
          <div className={`px-3 py-2 border-t border-cad-border ${snapSettings.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-cad-muted">Радиус захвата</span>
              <span className="text-cad-text">{snapSettings.snapRadius.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2"
              step="0.1"
              value={snapSettings.snapRadius}
              onChange={(e) => setSnapSetting('snapRadius', parseFloat(e.target.value))}
              className="w-full h-1 accent-cad-accent"
            />
          </div>
        </div>
      )}
    </div>
  )
}
