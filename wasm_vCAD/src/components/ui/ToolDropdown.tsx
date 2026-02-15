import { useState, useRef, useEffect } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

export interface ToolItem {
  id: string
  icon: LucideIcon
  label: string
}

interface ToolDropdownProps {
  label: string
  icon: LucideIcon
  tools: ToolItem[]
  currentTool: string | null
  onSelectTool: (toolId: string) => void
}

export function ToolDropdown({ label, icon: GroupIcon, tools, currentTool, onSelectTool }: ToolDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Find active tool in this group
  const activeTool = tools.find(t => t.id === currentTool)
  const ActiveIcon = activeTool?.icon || GroupIcon

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          px-3 py-1.5 rounded flex items-center gap-2 transition-colors
          ${activeTool
            ? 'bg-cad-accent text-white'
            : 'bg-cad-hover hover:bg-cad-accent/30'
          }
        `}
        title={activeTool?.label || label}
      >
        <ActiveIcon size={16} />
        <span className="text-sm">{activeTool?.label || label}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-cad-bg border border-cad-border rounded shadow-lg z-50 min-w-[200px]">
          {tools.map((tool) => {
            const Icon = tool.icon
            const isActive = currentTool === tool.id

            return (
              <button
                key={tool.id}
                onClick={() => {
                  onSelectTool(tool.id)
                  setIsOpen(false)
                }}
                className={`
                  w-full px-3 py-2 flex items-center gap-3 transition-colors text-left
                  ${isActive
                    ? 'bg-cad-accent text-white'
                    : 'hover:bg-cad-hover'
                  }
                `}
              >
                <Icon size={16} />
                <span className="text-sm">{tool.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
