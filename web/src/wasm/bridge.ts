/**
 * vcad bridge — предоставляет TypeScript API для vcad операций.
 *
 * Режимы:
 * 1. Server mode: CSG-операции через Rust backend API (по умолчанию)
 * 2. WASM mode: vcad скомпилированный в WebAssembly (когда будет настроен Emscripten)
 * 3. Mock mode: Babylon.js встроенные примитивы (fallback)
 */

import type { SceneDescription } from "../types/scene";

const API_URL = "http://localhost:3001";

let serverAvailable = false;

export async function initBridge(): Promise<void> {
  // Проверяем доступность сервера
  try {
    const res = await fetch(`${API_URL}/api/health`);
    if (res.ok) {
      serverAvailable = true;
      console.log("vcad server connected");
      return;
    }
  } catch {
    // ignore
  }

  console.warn("vcad server not available, using mock mode");
  serverAvailable = false;
}

export function isServerReady(): boolean {
  return serverAvailable;
}

/**
 * Строит GLB через серверный vcad.
 * Возвращает Uint8Array с GLB данными или null при ошибке.
 */
export async function buildSceneGlb(
  scene: SceneDescription
): Promise<Uint8Array | null> {
  if (!serverAvailable) return null;

  try {
    const res = await fetch(`${API_URL}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scene),
    });

    if (!res.ok) {
      console.warn("Build failed:", res.status);
      return null;
    }

    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (e) {
    console.warn("Build request failed:", e);
    return null;
  }
}

/**
 * Инспекция сцены — объём, площадь, bounding box через серверный vcad.
 */
export async function inspectScene(
  scene: SceneDescription
): Promise<Record<string, unknown> | null> {
  if (!serverAvailable) return null;

  try {
    const res = await fetch(`${API_URL}/api/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scene),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
