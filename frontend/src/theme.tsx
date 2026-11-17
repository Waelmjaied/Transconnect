import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeMode } from './types'
import { readStored, writeStored } from './lib/storage'

const KEY = 'transconnect:theme'
type Ctx = { mode: ThemeMode; resolved: 'light' | 'dark'; setMode: (mode: ThemeMode) => void; toggle: () => void }
const ThemeContext = createContext<Ctx | null>(null)
export const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark' || value === 'system'
const systemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => { const saved = readStored(KEY); return isThemeMode(saved) ? saved : 'system' })
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0b1424' : '#eaf2ff')
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => { writeStored(KEY, next); setModeState(next) }, [])
  const value = useMemo(() => ({ mode, resolved, setMode, toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark') }), [mode, resolved, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
