import { useState } from 'react'
import { BaseDialog } from './BaseDialog'
import { useSketchStore } from '@/stores/sketchStore'

interface MirrorDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (axis: 'horizontal' | 'vertical' | 'custom', customAxis?: { startX: number, startY: number, endX: number, endY: number }) => void
}

export function MirrorDialog({ isOpen, onClose, onConfirm }: MirrorDialogProps) {
  const symmetryAxisId = useSketchStore((s) => s.symmetryAxisId)
  const hasSymmetryAxis = symmetryAxisId !== null

  const [axis, setAxis] = useState<'horizontal' | 'vertical' | 'custom'>('horizontal')

  const handleConfirm = () => {
    onConfirm(axis)
    onClose()
  }

  return (
    <BaseDialog title="Зеркалирование элемента" isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2">Ось зеркалирования</label>
          <div className="space-y-2">
            {hasSymmetryAxis && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="axis"
                  value="custom"
                  checked={axis === 'custom'}
                  onChange={(e) => setAxis(e.target.value as 'custom')}
                  className="w-4 h-4"
                />
                <span>Использовать ось зеркала (фиолетовая линия)</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="axis"
                value="horizontal"
                checked={axis === 'horizontal'}
                onChange={(e) => setAxis(e.target.value as 'horizontal')}
                className="w-4 h-4"
              />
              <span>Горизонтальная (ось X)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="axis"
                value="vertical"
                checked={axis === 'vertical'}
                onChange={(e) => setAxis(e.target.value as 'vertical')}
                className="w-4 h-4"
              />
              <span>Вертикальная (ось Y)</span>
            </label>
          </div>
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
