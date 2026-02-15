/**
 * Constraint dialog
 * Dialog for adding geometric constraints to sketch elements
 */

import { useState } from 'react'
import { BaseDialog } from './BaseDialog'
import type { SketchConstraintType } from '@/types/scene'

export interface ConstraintDialogProps {
  isOpen: boolean
  elementId: string | null
  elementType: string | null
  onClose: () => void
  onConfirm: (constraintType: SketchConstraintType) => void
}

export function ConstraintDialog({
  isOpen,
  elementId,
  elementType,
  onClose,
  onConfirm
}: ConstraintDialogProps) {
  const [selectedType, setSelectedType] = useState<SketchConstraintType>('horizontal')

  const handleConfirm = () => {
    onConfirm(selectedType)
    onClose()
  }

  // Constraint options based on element type
  const getAvailableConstraints = (): { type: SketchConstraintType; label: string; description: string }[] => {
    const constraints = []

    if (elementType === 'line') {
      constraints.push(
        { type: 'horizontal' as SketchConstraintType, label: 'Горизонтальная', description: 'Сделать линию горизонтальной (параллельно оси X)' },
        { type: 'vertical' as SketchConstraintType, label: 'Вертикальная', description: 'Сделать линию вертикальной (параллельно оси Y)' },
        { type: 'fixed' as SketchConstraintType, label: 'Зафиксировать', description: 'Зафиксировать элемент (запретить перемещение)' }
      )
    }

    if (elementType === 'circle' || elementType === 'arc') {
      constraints.push(
        { type: 'fixed' as SketchConstraintType, label: 'Зафиксировать', description: 'Зафиксировать элемент (запретить перемещение)' }
      )
    }

    return constraints
  }

  const availableConstraints = getAvailableConstraints()

  if (!isOpen || !elementId) return null

  return (
    <BaseDialog title="Добавить ограничение" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-cad-text-secondary">
          Выберите тип ограничения для элемента
        </div>

        {availableConstraints.length === 0 ? (
          <div className="text-sm text-cad-text-secondary">
            Нет доступных ограничений для этого типа элемента
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {availableConstraints.map((constraint) => (
              <label
                key={constraint.type}
                className="flex items-start gap-2 cursor-pointer hover:bg-cad-accent/10 p-2 rounded"
              >
                <input
                  type="radio"
                  name="constraintType"
                  value={constraint.type}
                  checked={selectedType === constraint.type}
                  onChange={(e) => setSelectedType(e.target.value as SketchConstraintType)}
                  className="mt-1"
                />
                <div className="flex flex-col">
                  <span className="font-medium text-cad-text">{constraint.label}</span>
                  <span className="text-xs text-cad-text-secondary">{constraint.description}</span>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 bg-cad-surface border border-cad-accent rounded hover:bg-cad-accent/10 text-cad-text"
          >
            Отмена
          </button>
          <button
            onClick={handleConfirm}
            disabled={availableConstraints.length === 0}
            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Применить
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
