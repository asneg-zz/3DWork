/**
 * Sketch context menu
 * Context menu items and actions for sketch elements
 */

import { Trash2, Copy, Move, CornerUpRight, Repeat, RotateCw, Ruler, FlipHorizontal2, Lock, Link } from 'lucide-react'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'
import type { SketchElement } from '@/types/scene'

export interface ContextMenuCallbacks {
  onDuplicate: (elementId: string) => void
  onOffset: (elementId: string) => void
  onMirror: (elementId: string) => void
  onLinearPattern: (elementId: string) => void
  onCircularPattern: (elementId: string) => void
  onToggleConstruction: (elementId: string) => void
  onSetSymmetryAxis: (elementId: string) => void
  onDelete: () => void
  isConstruction: (elementId: string) => boolean
  isSymmetryAxis: (elementId: string) => boolean
  onAddConstraint: (constraintType: string, elementId: string) => void
  hasConstraint: (constraintType: string, elementId: string) => boolean
  onOpenConstraintDialog?: (elementId: string) => void
  onJoinContour?: () => void
  canJoinContour?: () => boolean
}

export function getContextMenuItems(
  element: SketchElement,
  elementId: string,
  callbacks: ContextMenuCallbacks
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    // Header - element type
    {
      label: `${element.type.charAt(0).toUpperCase() + element.type.slice(1)}`,
      onClick: () => {},
      header: true,
    },
    { label: '', onClick: () => {}, separator: true },

    // Copy/Duplicate
    {
      label: 'Дублировать',
      icon: <Copy size={16} />,
      onClick: () => callbacks.onDuplicate(elementId),
    },

    { label: '', onClick: () => {}, separator: true },

    // Sketch Operations
    {
      label: 'Смещение',
      icon: <Move size={16} />,
      onClick: () => callbacks.onOffset(elementId),
    },
    {
      label: 'Зеркало',
      icon: <CornerUpRight size={16} />,
      onClick: () => callbacks.onMirror(elementId),
    },

    // Join contour (only if callback provided and can join)
    ...(callbacks.onJoinContour && callbacks.canJoinContour?.() ? [
      { label: '', onClick: () => {}, separator: true },
      {
        label: 'Объединить контур',
        icon: <Link size={16} />,
        onClick: () => callbacks.onJoinContour!(),
      },
    ] : []),

    { label: '', onClick: () => {}, separator: true },

    // Pattern
    {
      label: 'Линейный массив',
      icon: <Repeat size={16} />,
      onClick: () => callbacks.onLinearPattern(elementId),
    },
    {
      label: 'Круговой массив',
      icon: <RotateCw size={16} />,
      onClick: () => callbacks.onCircularPattern(elementId),
    },

    { label: '', onClick: () => {}, separator: true },

    // Construction geometry toggle
    {
      label: callbacks.isConstruction(elementId) ? 'Обычная геометрия' : 'Вспомогательная',
      icon: <Ruler size={16} />,
      onClick: () => callbacks.onToggleConstruction(elementId),
    },

    // Mirror axis (only for lines)
    ...(element.type === 'line' ? [{
      label: callbacks.isSymmetryAxis(elementId) ? 'Снять ось зеркала' : 'Установить ось зеркала',
      icon: <FlipHorizontal2 size={16} />,
      onClick: () => callbacks.onSetSymmetryAxis(elementId),
    }] : []),

    { label: '', onClick: () => {}, separator: true },

    // Constraints - open dialog
    ...(callbacks.onOpenConstraintDialog ? [{
      label: 'Ограничения...',
      icon: <Lock size={16} />,
      onClick: () => callbacks.onOpenConstraintDialog!(elementId),
    }] : []),

    // Quick access to common single-element constraints
    ...(element.type === 'line' ? [
      {
        label: callbacks.hasConstraint('horizontal', elementId) ? '✓ Горизонтальная' : 'Горизонтальная',
        onClick: () => callbacks.onAddConstraint('horizontal', elementId),
      },
      {
        label: callbacks.hasConstraint('vertical', elementId) ? '✓ Вертикальная' : 'Вертикальная',
        onClick: () => callbacks.onAddConstraint('vertical', elementId),
      },
    ] : []),

    // All elements can be fixed
    {
      label: callbacks.hasConstraint('fixed', elementId) ? '✓ Зафиксировать' : 'Зафиксировать',
      onClick: () => callbacks.onAddConstraint('fixed', elementId),
    },

    { label: '', onClick: () => {}, separator: true },

    // Delete
    {
      label: 'Удалить',
      icon: <Trash2 size={16} />,
      onClick: () => callbacks.onDelete(),
      danger: true,
    },
  ]

  return items
}
