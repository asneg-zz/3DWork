import { useEffect } from 'react'
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react'
import { useNotificationStore, type AppNotification } from '@/stores/notificationStore'

const ICONS = {
  info:    <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />,
  error:   <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />,
}

const BORDER = {
  info:    'border-blue-500/40',
  warning: 'border-yellow-500/40',
  error:   'border-red-500/40',
}

/** Auto-dismissing toast item */
function Toast({ item, onDismiss }: { item: AppNotification; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 8000)
    return () => clearTimeout(t)
  }, [item.id, onDismiss])

  return (
    <div
      className={`flex items-start gap-3 bg-cad-surface border ${BORDER[item.type]} rounded-lg px-4 py-3 shadow-xl max-w-sm pointer-events-auto`}
    >
      {ICONS[item.type]}
      <p className="text-sm text-cad-text flex-1 leading-snug">{item.message}</p>
      <button
        onClick={() => onDismiss(item.id)}
        className="text-cad-muted hover:text-cad-text transition-colors shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  )
}

/** Fixed-position container for all active toasts */
export function NotificationToast() {
  const { items, dismiss } = useNotificationStore()

  if (items.length === 0) return null

  return (
    <div className="fixed bottom-8 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  )
}
