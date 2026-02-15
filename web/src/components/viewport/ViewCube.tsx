import { useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

const VIEWS = {
  front: { position: [0, 0, 5], up: [0, 1, 0] },
  back: { position: [0, 0, -5], up: [0, 1, 0] },
  top: { position: [0, 5, 0], up: [0, 0, -1] },
  bottom: { position: [0, -5, 0], up: [0, 0, 1] },
  right: { position: [5, 0, 0], up: [0, 1, 0] },
  left: { position: [-5, 0, 0], up: [0, 1, 0] },
  iso: { position: [5, 5, 5], up: [0, 1, 0] },
} as const

type ViewName = keyof typeof VIEWS

export function ViewCube() {
  const { camera, controls } = useThree()

  const setView = (viewName: ViewName) => {
    const view = VIEWS[viewName]
    const pos = new THREE.Vector3(...view.position)
    const up = new THREE.Vector3(...view.up)

    // Get current distance from target
    const target = (controls as any)?.target || new THREE.Vector3(0, 0, 0)
    const currentDistance = camera.position.distanceTo(target)

    // Set new position maintaining distance
    const direction = pos.clone().normalize()
    const newPosition = target.clone().add(direction.multiplyScalar(currentDistance))

    camera.position.copy(newPosition)
    camera.up.copy(up)
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    // Update controls if available
    if (controls) {
      (controls as any).update()
    }
  }

  return (
    <Html
      position={[0, 0, 0]}
      style={{
        position: 'absolute',
        bottom: '60px',
        left: '20px',
        pointerEvents: 'auto',
      }}
      calculatePosition={() => [20, window.innerHeight - 180]}
    >
      <div className="bg-cad-surface/90 border border-cad-border rounded-lg p-2 shadow-lg">
        <div className="grid grid-cols-3 gap-1 text-xs">
          {/* Top row */}
          <div />
          <ViewButton label="Top" onClick={() => setView('top')} />
          <div />

          {/* Middle row */}
          <ViewButton label="Left" onClick={() => setView('left')} />
          <ViewButton label="Front" onClick={() => setView('front')} primary />
          <ViewButton label="Right" onClick={() => setView('right')} />

          {/* Bottom row */}
          <ViewButton label="Back" onClick={() => setView('back')} />
          <ViewButton label="Bot" onClick={() => setView('bottom')} />
          <ViewButton label="Iso" onClick={() => setView('iso')} />
        </div>
      </div>
    </Html>
  )
}

interface ViewButtonProps {
  label: string
  onClick: () => void
  primary?: boolean
}

function ViewButton({ label, onClick, primary }: ViewButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded text-center transition-colors ${
        primary
          ? 'bg-cad-accent text-white hover:bg-cad-accent/80'
          : 'bg-cad-bg hover:bg-cad-border text-cad-text'
      }`}
    >
      {label}
    </button>
  )
}
