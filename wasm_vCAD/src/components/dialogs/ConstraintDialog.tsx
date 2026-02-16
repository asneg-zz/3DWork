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
  // For two-element constraints
  secondElementId?: string | null
  needsSecondElement?: boolean
  onNeedSecondElement?: (constraintType: SketchConstraintType) => void
}

export function ConstraintDialog({
  isOpen,
  elementId,
  elementType,
  onClose,
  onConfirm,
  secondElementId,
  needsSecondElement = false,
  onNeedSecondElement
}: ConstraintDialogProps) {
  const [selectedType, setSelectedType] = useState<SketchConstraintType>('horizontal')

  const handleConfirm = () => {
    // Если выбранное ограничение требует второй элемент и он не выбран
    const requiresSecondElement = ['parallel', 'perpendicular', 'equal', 'tangent', 'concentric'].includes(selectedType)
    const requiresSymmetric = selectedType === 'symmetric'

    if ((requiresSecondElement || requiresSymmetric) && !secondElementId && onNeedSecondElement) {
      // Сообщаем родителю что нужен второй элемент
      onNeedSecondElement(selectedType)
      return
    }

    onConfirm(selectedType)
    onClose()
  }

  // Constraint options based on element type
  const getAvailableConstraints = (): { type: SketchConstraintType; label: string; description: string; needsSecond?: boolean }[] => {
    const constraints = []

    // Single-element constraints
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

    // Two-element constraints - available for all element types
    constraints.push(
      { type: 'parallel' as SketchConstraintType, label: 'Параллельность', description: 'Сделать два элемента параллельными', needsSecond: true },
      { type: 'perpendicular' as SketchConstraintType, label: 'Перпендикулярность', description: 'Сделать два элемента перпендикулярными', needsSecond: true },
      { type: 'equal' as SketchConstraintType, label: 'Равенство', description: 'Сделать два элемента равными (длины/радиусы)', needsSecond: true },
      { type: 'tangent' as SketchConstraintType, label: 'Касательность', description: 'Сделать элементы касательными друг к другу', needsSecond: true },
      { type: 'concentric' as SketchConstraintType, label: 'Концентричность', description: 'Сделать окружности/дуги концентричными', needsSecond: true },
      { type: 'symmetric' as SketchConstraintType, label: 'Симметрия', description: 'Сделать два элемента симметричными относительно оси', needsSecond: true }
    )

    return constraints
  }

  const availableConstraints = getAvailableConstraints()

  if (!isOpen || !elementId) return null

  // Check if selected constraint needs second element
  const selectedConstraint = availableConstraints.find(c => c.type === selectedType)
  const showSecondElementHint = selectedConstraint?.needsSecond && !secondElementId

  return (
    <BaseDialog title="Добавить ограничение" isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {needsSecondElement && !secondElementId ? (
          <div className="text-sm text-amber-400 bg-amber-400/10 p-2 rounded border border-amber-400/30">
            📍 Выберите второй элемент для ограничения
          </div>
        ) : (
          <div className="text-sm text-cad-text-secondary">
            Выберите тип ограничения для элемента
          </div>
        )}

        {secondElementId && (
          <div className="text-sm text-green-400 bg-green-400/10 p-2 rounded border border-green-400/30">
            ✓ Второй элемент выбран
          </div>
        )}

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
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-cad-text">{constraint.label}</span>
                    {constraint.needsSecond && (
                      <span className="text-xs text-cad-text-secondary bg-cad-accent/20 px-1.5 py-0.5 rounded">
                        2 элемента
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-cad-text-secondary">{constraint.description}</span>
                </div>
              </label>
            ))}
          </div>
        )}

        {showSecondElementHint && (
          <div className="text-xs text-cad-text-secondary italic">
            💡 После применения нужно будет выбрать второй элемент
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
            {showSecondElementHint ? 'Выбрать второй элемент' : 'Применить'}
          </button>
        </div>
      </div>
    </BaseDialog>
  )
}
