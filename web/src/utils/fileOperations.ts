import type { SceneDescriptionV2 } from '@/types/scene'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

/**
 * Save scene to JSON file
 */
export function saveSceneToFile(scene: SceneDescriptionV2, filename = 'scene.vcad') {
  const json = JSON.stringify(scene, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Load scene from JSON file
 */
export function loadSceneFromFile(): Promise<SceneDescriptionV2> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.vcad,.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) {
        reject(new Error('No file selected'))
        return
      }

      try {
        const text = await file.text()
        const scene = JSON.parse(text) as SceneDescriptionV2

        // Validate basic structure
        if (!scene.version || !Array.isArray(scene.bodies)) {
          throw new Error('Invalid scene file format')
        }

        resolve(scene)
      } catch (err) {
        reject(err)
      }
    }

    input.click()
  })
}

/**
 * Export Three.js scene to GLB file
 */
export function exportSceneToGLB(threeScene: THREE.Scene, filename = 'model.glb'): Promise<void> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()

    // Clone scene and prepare for export
    const exportScene = new THREE.Scene()

    threeScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const clone = object.clone()
        // Ensure geometry is properly set up
        clone.geometry = object.geometry.clone()
        if (object.material instanceof THREE.Material) {
          clone.material = object.material.clone()
        }
        exportScene.add(clone)
      }
    })

    exporter.parse(
      exportScene,
      (result) => {
        const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        resolve()
      },
      (error) => {
        reject(error)
      },
      { binary: true }
    )
  })
}

/**
 * Export single mesh to GLB
 */
export function exportMeshToGLB(mesh: THREE.Mesh, filename = 'model.glb'): Promise<void> {
  const scene = new THREE.Scene()
  scene.add(mesh.clone())
  return exportSceneToGLB(scene, filename)
}

/**
 * Create download for any blob
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
