import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, getToken, setAuthFailureHandler, setToken } from '../lib/api'
import { isLang, useI18n } from '../i18n'
import { isThemeMode, useTheme } from '../theme'
import type { User } from '../types'

type Session = { token: string; user: User }
type RegisterInput = { name: string; email: string; password: string; phone: string; role: 'customer' | 'carrier' }
type Ctx = {
  user: User | null; loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => void
  can: (permission: string) => boolean
  updatePreferences: (patch: { lang?: string; theme?: string }) => void
}
const AuthContext = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, setLang } = useI18n()
  const { setMode } = useTheme()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  const adopt = useCallback((next: User) => {
    setUser(next)
    // Les préférences enregistrées sur le compte suivent l'utilisateur d'un appareil à l'autre.
    if (isLang(next.lang)) setLang(next.lang)
    if (isThemeMode(next.theme)) setMode(next.theme)
  }, [setLang, setMode])

  const logout = useCallback(() => { setToken(null); setUser(null) }, [])

  useEffect(() => {
    setAuthFailureHandler(logout)
    if (!getToken()) return
    api<{ user: User }>('/auth/me').then(({ user: me }) => adopt(me)).catch(() => logout()).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async (path: string, body: unknown) => {
    const session = await api<Session>(path, { method: 'POST', body })
    setToken(session.token)
    adopt(session.user)
    return session.user
  }, [adopt])

  const value = useMemo<Ctx>(() => ({
    user, loading,
    login: (email, password) => start('/auth/login', { email, password }),
    register: (input) => start('/auth/register', { ...input, lang }),
    logout,
    can: (permission) => Boolean(user?.permissions.includes(permission)),
    updatePreferences: (patch) => { if (user) api('/auth/me', { method: 'PATCH', body: patch }).catch(() => undefined) },
  }), [user, loading, start, logout, lang])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

/** Redirige vers /login si non connecté. Le contrôle fin des droits reste fait par le serveur ; ici on évite seulement d'afficher des écrans inutilisables. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { t } = useI18n()
  if (loading) return <div className="screen center-screen"><p className="muted-text">{t('common.loading')}</p></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
