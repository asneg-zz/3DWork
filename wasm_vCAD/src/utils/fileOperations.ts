/**
 * fileOperations.ts
 * Save / load scene files (.json) compatible with desktop SceneDescriptionV2.
 *
 * In dev mode (Vite dev server running):
 *   save → POST /api/save-scene  → writes to <project>/scenes/<filename>.json
 *   load → GET  /api/load-scene?file=<name>
 *   list → GET  /api/list-scenes
 *
 * In production (no dev server): falls back to browser blob download / file-picker.
 */

import type { SceneDescription } from '@/types/scene'
import { serializeScene, deserializeScene } from './sceneSerializer'

const FILE_EXTENSION = '.json'
const DEFAULT_FILENAME = 'scene.json'
const FILE_MIME = 'application/json'

// ─── Dev server detection ─────────────────────────────────────────────────────

async function devServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/list-scenes', { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

/**
 * Save scene to <project>/scenes/<filename>.json via dev server,
 * or trigger a browser download as fallback.
 */
export async function saveSceneToFile(
  scene: SceneDescription,
  filename = DEFAULT_FILENAME
): Promise<void> {
  const safe = filename.endsWith(FILE_EXTENSION) ? filename : filename + FILE_EXTENSION
  const data = serializeScene(scene)

  const useServer = await devServerAvailable()

  if (useServer) {
    try {
      const res = await fetch('/api/save-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: safe, data }),
      })
      const json = await res.json() as { ok: boolean; path?: string; error?: string }
      if (!json.ok) throw new Error(json.error ?? 'Save failed')
      console.log('[fileOperations] Saved to', json.path)
      return
    } catch (e) {
      console.warn('[fileOperations] Dev server save failed, falling back to download:', e)
    }
  }

  // Fallback: browser download
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: FILE_MIME })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = safe
  a.click()
  URL.revokeObjectURL(url)
}

// ─── List scenes (dev server only) ───────────────────────────────────────────

export async function listScenesFromServer(): Promise<string[]> {
  try {
    const res = await fetch('/api/list-scenes')
    if (!res.ok) return []
    const json = await res.json() as { files: string[] }
    return json.files ?? []
  } catch {
    return []
  }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

/**
 * Load a scene:
 *  - If a filename is given, fetch it from the dev server.
 *  - Otherwise, open a browser file-picker dialog.
 * Returns null on cancel or parse error.
 */
export async function loadSceneFromFile(filename?: string): Promise<SceneDescription | null> {
  if (filename) {
    // Load specific file from dev server
    try {
      const res = await fetch(`/api/load-scene?file=${encodeURIComponent(filename)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      return deserializeScene(raw)
    } catch (err) {
      console.error('[fileOperations] Failed to load from server:', err)
      alert(`Ошибка загрузки файла: ${(err as Error).message}`)
      return null
    }
  }

  // No filename: use file-picker
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type   = 'file'
    input.accept = FILE_MIME + ',' + FILE_EXTENSION

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }

      const reader = new FileReader()
      reader.onload = () => {
        try {
          const raw   = JSON.parse(reader.result as string)
          const scene = deserializeScene(raw)
          resolve(scene)
        } catch (err) {
          console.error('[fileOperations] Failed to parse scene file:', err)
          alert(`Ошибка загрузки файла: ${(err as Error).message}`)
          resolve(null)
        }
      }
      reader.onerror = () => { console.error('[fileOperations] FileReader error'); resolve(null) }
      reader.readAsText(file)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}
