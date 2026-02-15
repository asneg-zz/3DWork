import { useState } from 'react'
import { BaseDialog } from './BaseDialog'

interface OffsetDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (distance: number) => void
}

export function OffsetDialog({ isOpen, onClose, onConfirm }: OffsetDialogProps) {
  const [distance, setDistance] = useState('10')

  const handleConfirm = () => {
    const dist = parseFloat(distance)
    if (!isNaN(dist) && dist !== 0) {
      onConfirm(dist)
      onClose()
    }
  }

  return (
    <BaseDialog title="Смещение элемента" isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2">Расстояние смещения</label>
          <input
            type="number"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="w-full px-3 py-2 bg-cad-bg border border-cad-border rounded focus:outline-none focus:border-blue-500"
            step="1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleConfirm()
              }
            }}
          />
          <p className="text-xs text-cad-muted mt-1">
            Положительные значения - наружу, отрицательные - внутрь
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
