/**
 * Sketch tools context menu
 * Context menu shown when right-clicking on empty space in sketch
 */

import {
  MousePointer2,
  Minus,
  Circle,
  CircleDot,
  Square,
  Pencil,
  SplineIcon,
  Scissors,
  RectangleHorizontal,
  Move,
  Ruler,
  CheckCircle
} from 'lucide-react'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'

export interface ToolsContextMenuCallbacks {
  onSelectTool: (tool: string) => void
  onExitSketch: () => void
}

export function getToolsContextMenuItems(
  callbacks: ToolsContextMenuCallbacks
): ContextMenuItem[] {
  return [
    // Header
    {
      label: 'Инструменты скетча',
      onClick: () => {},
      disabled: true,
    },
    { label: '', onClick: () => {}, separator: true },

    // Selection tool
    {
      label: 'Выбор',
      icon: <MousePointer2 size={16} />,
      onClick: () => callbacks.onSelectTool('select'),
    },

    { label: '', onClick: () => {}, separator: true },

    // Drawing tools
    {
      label: 'Линия',
      icon: <Minus size={16} />,
      onClick: () => callbacks.onSelectTool('line'),
    },
    {
      label: 'Окружность',
      icon: <Circle size={16} />,
      onClick: () => callbacks.onSelectTool('circle'),
    },
    {
      label: 'Дуга',
      icon: <CircleDot size={16} />,
      onClick: () => callbacks.onSelectTool('arc'),
    },
    {
      label: 'Прямоугольник',
      icon: <Square size={16} />,
      onClick: () => callbacks.onSelectTool('rectangle'),
    },
    {
      label: 'Полилиния',
      icon: <Pencil size={16} />,
      onClick: () => callbacks.onSelectTool('polyline'),
    },
    {
      label: 'Сплайн',
      icon: <SplineIcon size={16} />,
      onClick: () => callbacks.onSelectTool('spline'),
    },

    { label: '', onClick: () => {}, separator: true },

    // Modification tools
    {
      label: 'Обрезка',
      icon: <Scissors size={16} />,
      onClick: () => callbacks.onSelectTool('trim'),
    },
    {
      label: 'Скругление',
      icon: <RectangleHorizontal size={16} />,
      onClick: () => callbacks.onSelectTool('fillet'),
    },
    {
      label: 'Смещение',
      icon: <Move size={16} />,
      onClick: () => callbacks.onSelectTool('offset'),
    },
    {
      label: 'Размер',
      icon: <Ruler size={16} />,
      onClick: () => callbacks.onSelectTool('dimension'),
    },

    { label: '', onClick: () => {}, separator: true },

    // Exit sketch
    {
      label: 'Готово',
      icon: <CheckCircle size={16} />,
      onClick: () => callbacks.onExitSketch(),
    },
  ]
}
