import { create } from 'zustand'

export interface AppNotification {
  id: string
  type: 'info' | 'warning' | 'error'
  message: string
}

interface NotificationState {
  items: AppNotification[]
  show: (message: string, type?: AppNotification['type']) => void
  dismiss: (id: string) => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],

  show: (message, type = 'info') =>
    set((s) => ({
      items: [...s.items, { id: crypto.randomUUID(), type, message }],
    })),

  dismiss: (id) =>
    set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
}))
