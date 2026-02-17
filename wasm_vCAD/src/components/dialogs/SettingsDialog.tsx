/**
 * Settings dialog — mirrors the desktop AppSettings panel.
 * Tabs: Display, Grid, Snap, Viewport
 */

import { useEffect, useRef, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useSettingsStore, UNITS_LABELS, type Units } from '@/stores/settingsStore'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Tab = 'display' | 'grid' | 'snap' | 'viewport'

const TABS: { id: Tab; label: string }[] = [
  { id: 'display',  label: 'Отображение' },
  { id: 'grid',     label: 'Сетка' },
  { id: 'snap',     label: 'Привязки' },
  { id: 'viewport', label: 'Вьюпорт' },
]

// ─── Reusable field components ────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-cad-muted w-44 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function SliderRow({ label, value, min, max, step, onChange, format }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 accent-cad-accent h-1.5"
        />
        <span className="text-xs text-cad-muted w-10 text-right tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
    </Row>
  )
}

function NumberRow({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <Row label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || min)}
        className="w-full bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
      />
    </Row>
  )
}

function ToggleRow({ label, value, onChange }: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Row label={label}>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? 'bg-cad-accent' : 'bg-cad-border'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </Row>
  )
}

function ColorRow({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-7 w-12 cursor-pointer rounded border border-cad-border bg-cad-bg p-0.5"
        />
        <span className="text-xs text-cad-muted font-mono">{value.toUpperCase()}</span>
      </div>
    </Row>
  )
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function DisplayTab() {
  const s = useSettingsStore()

  return (
    <div className="space-y-1">
      <Row label="Единицы измерения">
        <select
          value={s.units}
          onChange={e => s.set({ units: e.target.value as Units })}
          className="w-full bg-cad-bg border border-cad-border rounded px-2 py-1 text-sm text-cad-text"
        >
          {(Object.entries(UNITS_LABELS) as [Units, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </Row>

      <div className="my-3 border-t border-cad-border/50" />
      <p className="text-xs text-cad-muted/70 mb-2">Тела</p>

      <SliderRow
        label="Прозрачность заливки"
        value={s.bodyOpacity}
        min={0} max={0.5} step={0.01}
        onChange={v => s.set({ bodyOpacity: v })}
        format={v => `${Math.round(v * 100)}%`}
      />

      <ColorRow
        label="Цвет тел"
        value={s.bodyColor}
        onChange={v => s.set({ bodyColor: v })}
      />

      <ColorRow
        label="Цвет выделения"
        value={s.selectionColor}
        onChange={v => s.set({ selectionColor: v })}
      />

      <div className="my-3 border-t border-cad-border/50" />
      <p className="text-xs text-cad-muted/70 mb-2">Размеры</p>

      <NumberRow
        label="Знаков после запятой"
        value={s.dimensionPrecision}
        min={0} max={6} step={1}
        onChange={v => s.set({ dimensionPrecision: Math.round(v) })}
      />

      <ToggleRow
        label="Показывать единицы"
        value={s.dimensionShowUnits}
        onChange={v => s.set({ dimensionShowUnits: v })}
      />
    </div>
  )
}

function GridTab() {
  const s = useSettingsStore()

  return (
    <div className="space-y-1">
      <ToggleRow
        label="Показывать сетку"
        value={s.gridVisible}
        onChange={v => s.set({ gridVisible: v })}
      />

      <NumberRow
        label="Размер ячейки"
        value={s.gridSize}
        min={0.01} max={100} step={0.1}
        onChange={v => s.set({ gridSize: v })}
      />

      <SliderRow
        label="Непрозрачность"
        value={s.gridOpacity}
        min={0.05} max={1} step={0.05}
        onChange={v => s.set({ gridOpacity: v })}
        format={v => `${Math.round(v * 100)}%`}
      />
    </div>
  )
}

function SnapTab() {
  const s = useSettingsStore()

  return (
    <div className="space-y-1">
      <ToggleRow
        label="Привязки включены"
        value={s.snapEnabled}
        onChange={v => s.set({ snapEnabled: v })}
      />

      <div className="my-3 border-t border-cad-border/50" />

      <ToggleRow
        label="К сетке"
        value={s.snapToGrid}
        onChange={v => s.set({ snapToGrid: v })}
      />

      <ToggleRow
        label="К концевым точкам"
        value={s.snapEndpoints}
        onChange={v => s.set({ snapEndpoints: v })}
      />

      <ToggleRow
        label="К серединам"
        value={s.snapMidpoints}
        onChange={v => s.set({ snapMidpoints: v })}
      />

      <ToggleRow
        label="К пересечениям"
        value={s.snapIntersections}
        onChange={v => s.set({ snapIntersections: v })}
      />

      <div className="my-3 border-t border-cad-border/50" />

      <NumberRow
        label="Радиус привязки (px)"
        value={s.snapRadius}
        min={1} max={50} step={1}
        onChange={v => s.set({ snapRadius: v })}
      />
    </div>
  )
}

function ViewportTab() {
  const s = useSettingsStore()

  return (
    <div className="space-y-1">
      <p className="text-xs text-cad-muted/70 mb-2">Цвета интерфейса</p>

      <ColorRow
        label="Цвет тел"
        value={s.bodyColor}
        onChange={v => s.set({ bodyColor: v })}
      />

      <ColorRow
        label="Цвет выделения"
        value={s.selectionColor}
        onChange={v => s.set({ selectionColor: v })}
      />

      <div className="my-3 border-t border-cad-border/50" />
      <p className="text-xs text-cad-muted/70 mb-2">Просмотр тел</p>

      <SliderRow
        label="Прозрачность заливки"
        value={s.bodyOpacity}
        min={0} max={0.5} step={0.01}
        onChange={v => s.set({ bodyOpacity: v })}
        format={v => `${Math.round(v * 100)}%`}
      />
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

export function SettingsDialog({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('display')
  const dialogRef = useRef<HTMLDivElement>(null)
  const reset = useSettingsStore(s => s.reset)

  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else e.stopPropagation()            // prevent sketch shortcuts
    }
    const onOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose()
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        className="bg-cad-surface border border-cad-border rounded-lg shadow-xl flex flex-col"
        style={{ width: 520, maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-cad-border shrink-0">
          <h3 className="text-base font-semibold">Настройки</h3>
          <button onClick={onClose} className="text-cad-muted hover:text-cad-text transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-cad-border shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-cad-accent text-cad-accent font-medium'
                  : 'text-cad-muted hover:text-cad-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'display'  && <DisplayTab />}
          {tab === 'grid'     && <GridTab />}
          {tab === 'snap'     && <SnapTab />}
          {tab === 'viewport' && <ViewportTab />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-cad-border shrink-0">
          <button
            onClick={() => { reset(); }}
            className="flex items-center gap-2 text-xs text-cad-muted hover:text-cad-text transition-colors"
          >
            <RotateCcw size={13} />
            Сбросить к умолчаниям
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cad-accent text-white rounded text-sm hover:bg-cad-accent/80 transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
