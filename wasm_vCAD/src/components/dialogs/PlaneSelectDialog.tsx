import { BaseDialog } from './BaseDialog'
import type { SketchPlane } from '@/types/scene'

interface PlaneSelectDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (plane: SketchPlane) => void
}

const PLANES: { id: SketchPlane; label: string; desc: string; icon: React.ReactNode }[] = [
  {
    id: 'XY',
    label: 'XY',
    desc: 'Горизонтальная (сверху)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* XY plane — вид сверху, горизонтальный квадрат */}
        <rect x="8" y="14" width="32" height="20" rx="1" fill="#7a9fc0" fillOpacity="0.25" stroke="#7a9fc0" strokeWidth="1.5"/>
        <line x1="8" y1="24" x2="40" y2="24" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        <line x1="24" y1="14" x2="24" y2="34" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        {/* X axis */}
        <line x1="8" y1="38" x2="26" y2="38" stroke="#ef4444" strokeWidth="2"/>
        <polygon points="26,35 30,38 26,41" fill="#ef4444"/>
        <text x="32" y="42" fontSize="9" fill="#ef4444" fontFamily="monospace">X</text>
        {/* Y axis */}
        <line x1="4" y1="34" x2="4" y2="14" stroke="#22c55e" strokeWidth="2"/>
        <polygon points="1,14 4,10 7,14" fill="#22c55e"/>
        <text x="6" y="11" fontSize="9" fill="#22c55e" fontFamily="monospace">Y</text>
      </svg>
    ),
  },
  {
    id: 'XZ',
    label: 'XZ',
    desc: 'Фронтальная (спереди)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* XZ plane — фронтальный вертикальный прямоугольник */}
        <rect x="8" y="8" width="32" height="26" rx="1" fill="#7a9fc0" fillOpacity="0.25" stroke="#7a9fc0" strokeWidth="1.5"/>
        <line x1="8" y1="21" x2="40" y2="21" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        <line x1="24" y1="8" x2="24" y2="34" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        {/* X axis */}
        <line x1="8" y1="40" x2="26" y2="40" stroke="#ef4444" strokeWidth="2"/>
        <polygon points="26,37 30,40 26,43" fill="#ef4444"/>
        <text x="32" y="44" fontSize="9" fill="#ef4444" fontFamily="monospace">X</text>
        {/* Z axis */}
        <line x1="4" y1="34" x2="4" y2="14" stroke="#3b82f6" strokeWidth="2"/>
        <polygon points="1,14 4,10 7,14" fill="#3b82f6"/>
        <text x="6" y="11" fontSize="9" fill="#3b82f6" fontFamily="monospace">Z</text>
      </svg>
    ),
  },
  {
    id: 'YZ',
    label: 'YZ',
    desc: 'Боковая (сбоку)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* YZ plane — боковой вертикальный прямоугольник */}
        <rect x="10" y="8" width="26" height="26" rx="1" fill="#7a9fc0" fillOpacity="0.25" stroke="#7a9fc0" strokeWidth="1.5"/>
        <line x1="10" y1="21" x2="36" y2="21" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        <line x1="23" y1="8" x2="23" y2="34" stroke="#7a9fc0" strokeWidth="0.75" strokeDasharray="3 3"/>
        {/* Y axis */}
        <line x1="8" y1="40" x2="26" y2="40" stroke="#22c55e" strokeWidth="2"/>
        <polygon points="26,37 30,40 26,43" fill="#22c55e"/>
        <text x="32" y="44" fontSize="9" fill="#22c55e" fontFamily="monospace">Y</text>
        {/* Z axis */}
        <line x1="4" y1="34" x2="4" y2="14" stroke="#3b82f6" strokeWidth="2"/>
        <polygon points="1,14 4,10 7,14" fill="#3b82f6"/>
        <text x="6" y="11" fontSize="9" fill="#3b82f6" fontFamily="monospace">Z</text>
      </svg>
    ),
  },
]

export function PlaneSelectDialog({ isOpen, onClose, onConfirm }: PlaneSelectDialogProps) {
  return (
    <BaseDialog title="Выберите плоскость эскиза" isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-cad-muted">На какой плоскости начать рисование?</p>

        <div className="flex gap-3">
          {PLANES.map((plane) => (
            <button
              key={plane.id}
              onClick={() => onConfirm(plane.id)}
              className="flex-1 flex flex-col items-center gap-2 p-3 rounded-lg border border-cad-border hover:border-blue-500 hover:bg-blue-500/10 transition-colors group"
              autoFocus={plane.id === 'XY'}
            >
              <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                {plane.icon}
              </div>
              <span className="text-base font-bold text-cad-text">{plane.label}</span>
              <span className="text-xs text-cad-muted text-center leading-tight">{plane.desc}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-cad-border rounded hover:bg-cad-hover"
          >
            Отмена
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
