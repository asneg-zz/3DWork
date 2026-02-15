import { useState } from 'react'
import { BaseDialog } from './BaseDialog'

interface LinearPatternDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (count: number, dx: number, dy: number) => void
}

export function LinearPatternDialog({ isOpen, onClose, onConfirm }: LinearPatternDialogProps) {
  const [count, setCount] = useState('3')
  const [dx, setDx] = useState('50')
  const [dy, setDy] = useState('0')

  const handleConfirm = () => {
    const countVal = parseInt(count)
    const dxVal = parseFloat(dx)
    const dyVal = parseFloat(dy)

    if (!isNaN(countVal) && countVal > 1 && !isNaN(dxVal) && !isNaN(dyVal)) {
      onConfirm(countVal, dxVal, dyVal)
      onClose()
    }
  }

  return (
    <BaseDialog title="Линейный массив" isOpen={isOpen} onClose={onClose}>
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
        <div>
          <label className="block text-sm mb-2">Шаг по X</label>
          <input
            type="number"
            value={dx}
            onChange={(e) => setDx(e.target.value)}
            className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
            step="1"
          />
        </div>
        <div>
          <label className="block text-sm mb-2">Шаг по Y</label>
          <input
            type="number"
            value={dy}
            onChange={(e) => setDy(e.target.value)}
            className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
            step="1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirm()
              }
            }}
          />
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
