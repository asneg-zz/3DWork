/**
 * Application settings store — persisted to localStorage.
 * Mirrors the desktop AppSettings structure from crates/gui/src/state/settings.rs
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Units = 'mm' | 'cm' | 'm' | 'in'

export const UNITS_LABELS: Record<Units, string> = {
  mm: 'Миллиметры (mm)',
  cm: 'Сантиметры (cm)',
  m:  'Метры (m)',
  in: 'Дюймы (in)',
}

interface SettingsState {
  // ── Display ─────────────────────────────────────────
  units: Units
  /** Ghost fill opacity for body rendering (0 = invisible fill, 1 = solid) */
  bodyOpacity: number

  // ── Grid ────────────────────────────────────────────
  gridVisible: boolean
  gridSize: number
  gridOpacity: number

  // ── Snap ────────────────────────────────────────────
  snapEnabled: boolean
  snapToGrid: boolean
  snapEndpoints: boolean
  snapMidpoints: boolean
  snapIntersections: boolean
  snapRadius: number

  // ── Viewport ────────────────────────────────────────
  /** Hex color for selected body edges */
  selectionColor: string
  /** Hex color for default body edges */
  bodyColor: string

  // ── Dimension ───────────────────────────────────────
  dimensionPrecision: number
  dimensionShowUnits: boolean

  // ── Actions ─────────────────────────────────────────
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset'>>) => void
  reset: () => void
}

const DEFAULTS = {
  units: 'mm' as Units,
  bodyOpacity: 0.08,

  gridVisible: true,
  gridSize: 1.0,
  gridOpacity: 0.6,

  snapEnabled: true,
  snapToGrid: true,
  snapEndpoints: true,
  snapMidpoints: true,
  snapIntersections: true,
  snapRadius: 10,

  selectionColor: '#4cb2e5',
  bodyColor: '#7a9fc0',

  dimensionPrecision: 2,
  dimensionShowUnits: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      set: (patch) => set((s) => ({ ...s, ...patch })),
      reset: () => set((s) => ({ ...s, ...DEFAULTS })),
    }),
    {
      name: 'vcad-settings',
    }
  )
)
