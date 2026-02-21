import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  separator?: boolean
  danger?: boolean  // Red color for dangerous actions
  header?: boolean  // Section header (not clickable, but styled differently from disabled)
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed bg-cad-surface border border-cad-border rounded shadow-lg py-1 z-50 min-w-[180px]"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={index} className="h-px bg-cad-border my-1" />
        }

        // Section header - styled as label, not clickable
        if (item.header) {
          return (
            <div
              key={index}
              className="w-full px-3 py-1.5 text-xs text-cad-accent font-semibold flex items-center gap-2 uppercase tracking-wide"
            >
              {item.icon && <span className="w-4 h-4 opacity-70">{item.icon}</span>}
              <span>{item.label}</span>
            </div>
          )
        }

        return (
          <button
            key={index}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled}
            className={`
              w-full px-3 py-2 text-sm text-left flex items-center gap-2
              ${item.disabled
                ? 'text-cad-muted cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/10 cursor-pointer'
                  : 'hover:bg-cad-hover cursor-pointer'
              }
            `}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
