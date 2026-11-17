import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'

type Counts = { notifications: number; messages: number }
type Ctx = Counts & { refresh: () => void }
const NotifyContext = createContext<Ctx>({ notifications: 0, messages: 0, refresh: () => undefined })
const EMPTY: Counts = { notifications: 0, messages: 0 }

/** Interroge légèrement le serveur (toutes les 30 s, onglet visible) pour les badges cloche et messages. */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth()
  const enabled = Boolean(user) && can('notifications:read')
  const [counts, setCounts] = useState<Counts>(EMPTY)

  const refresh = useCallback(() => {
    if (!enabled) return
    api<Counts>('/notifications/summary').then(setCounts).catch(() => undefined)
  }, [enabled])

  useEffect(() => {
    if (!enabled) { setCounts(EMPTY); return }
    refresh()
    const tick = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [enabled, refresh])

  const value = useMemo(() => ({ ...counts, refresh }), [counts, refresh])
  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>
}

export const useNotify = () => useContext(NotifyContext)
