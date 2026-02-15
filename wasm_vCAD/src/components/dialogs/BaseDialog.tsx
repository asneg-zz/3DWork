import { useEffect, useRef } from 'react'

export interface BaseDialogProps {
  title: string
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function BaseDialog({ title, isOpen, onClose, children }: BaseDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Stop propagation of keyboard events from dialog to prevent canvas shortcuts
    const stopKeyboardPropagation = (e: KeyboardEvent) => {
      // Allow Escape to close the dialog
      if (e.key !== 'Escape') {
        e.stopPropagation()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.addEventListener('mousedown', handleClickOutside)

      // Add listener to dialog to stop keyboard event propagation
      if (dialogRef.current) {
        dialogRef.current.addEventListener('keydown', stopKeyboardPropagation)
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)

      if (dialogRef.current) {
        dialogRef.current.removeEventListener('keydown', stopKeyboardPropagation)
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        className="bg-cad-surface border border-cad-border rounded-lg shadow-xl min-w-[320px] max-w-md"
      >
        <div className="px-4 py-3 border-b border-cad-border">
          <h3 className="text-lg font-medium">{title}</h3>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
