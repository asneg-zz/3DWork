/**
 * Extrude dialog
 * Dialog for extruding sketch into 3D body
 */

import { useState } from 'react'
import { BaseDialog } from './BaseDialog'

export interface ExtrudeDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (height: number, heightBackward: number, draftAngle: number) => void
}

export function ExtrudeDialog({
  isOpen,
  onClose,
  onConfirm
}: ExtrudeDialogProps) {
  const [height, setHeight] = useState(1.0)
  const [heightBackward, setHeightBackward] = useState(0.0)
  const [draftAngle, setDraftAngle] = useState(0.0)

  const handleConfirm = () => {
    onConfirm(height, heightBackward, draftAngle)
    onClose()
  }

  const handleReset = () => {
    setHeight(1.0)
    setHeightBackward(0.0)
    setDraftAngle(0.0)
  }

  if (!isOpen) return null

  return (
    <BaseDialog title="Выдавливание" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="text-sm text-cad-text-secondary">
          Настройте параметры выдавливания эскиза
        </div>

        {/* Height (forward) */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-cad-text">
            Высота вперёд
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
              step="0.1"
              className="flex-1 px-3 py-2 bg-cad-surface border border-cad-accent rounded text-cad-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1.0"
            />
            <span className="text-sm text-cad-text-secondary">units</span>
          </div>
        </div>

        {/* Height backward */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-cad-text">
            Высота назад
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={heightBackward}
              onChange={(e) => setHeightBackward(parseFloat(e.target.value) || 0)}
              step="0.1"
              className="flex-1 px-3 py-2 bg-cad-surface border border-cad-accent rounded text-cad-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.0"
            />
            <span className="text-sm text-cad-text-secondary">units</span>
          </div>
          <span className="text-xs text-cad-text-secondary">
            Выдавливание в обратную сторону (оставьте 0 для одностороннего)
          </span>
        </div>

        {/* Draft angle */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-cad-text">
            Угол уклона
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={draftAngle}
              onChange={(e) => setDraftAngle(parseFloat(e.target.value) || 0)}
              step="1"
              min="-45"
              max="45"
              className="flex-1 px-3 py-2 bg-cad-surface border border-cad-accent rounded text-cad-text focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.0"
            />
            <span className="text-sm text-cad-text-secondary">degrees</span>
          </div>
          <span className="text-xs text-cad-text-secondary">
            Угол наклона стенок (0° = вертикальные стенки)
          </span>
        </div>

        {/* Preview info */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded">
          <div className="text-sm text-blue-400">
            <div><strong>Общая высота:</strong> {(height + heightBackward).toFixed(2)} units</div>
            {draftAngle !== 0 && (
              <div className="mt-1 text-xs">
                Конус будет {draftAngle > 0 ? 'расширяться' : 'сужаться'} на {Math.abs(draftAngle)}°
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 bg-cad-surface border border-cad-accent rounded hover:bg-cad-accent/10 text-cad-text"
          >
            Сброс
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-cad-surface border border-cad-accent rounded hover:bg-cad-accent/10 text-cad-text"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={height <= 0}
            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Выдавить
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
