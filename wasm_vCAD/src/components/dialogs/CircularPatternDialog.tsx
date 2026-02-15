import { useState } from 'react'
import { BaseDialog } from './BaseDialog'

interface CircularPatternDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (count: number, centerX: number, centerY: number, angle: number) => void
}

export function CircularPatternDialog({ isOpen, onClose, onConfirm }: CircularPatternDialogProps) {
  const [count, setCount] = useState('6')
  const [centerX, setCenterX] = useState('0')
  const [centerY, setCenterY] = useState('0')
  const [angle, setAngle] = useState('360')

  const handleConfirm = () => {
    const countVal = parseInt(count)
    const centerXVal = parseFloat(centerX)
    const centerYVal = parseFloat(centerY)
    const angleVal = parseFloat(angle)

    if (!isNaN(countVal) && countVal > 1 && !isNaN(centerXVal) && !isNaN(centerYVal) && !isNaN(angleVal)) {
      onConfirm(countVal, centerXVal, centerYVal, angleVal)
      onClose()
    }
  }

  return (
    <BaseDialog title="Круговой массив" isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2">Количество копий</label>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
            min="2"
            step="1"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-2">Центр X</label>
            <input
              type="number"
              value={centerX}
              onChange={(e) => setCenterX(e.target.value)}
              className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
              step="1"
            />
          </div>
          <div>
            <label className="block text-sm mb-2">Центр Y</label>
            <input
              type="number"
              value={centerY}
              onChange={(e) => setCenterY(e.target.value)}
              className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
              step="1"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm mb-2">Полный угол (градусы)</label>
          <input
            type="number"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
            step="1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirm()
              }
            }}
          />
          <p className="text-xs text-cad-muted mt-1">
            360° создает полный круг
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-cad-border rounded hover:bg-cad-hover"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Применить
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
