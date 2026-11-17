import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ar } from './ar'
import { cs } from './cs'
import { de } from './de'
import { en, type Dict } from './en'
import { fr } from './fr'
import { it } from './it'
import { getPlace } from '../data/places'
import { readStored, writeStored } from '../lib/storage'

export type Lang = 'ar' | 'en' | 'fr' | 'de' | 'it' | 'cs'
export const LANGUAGES: { code: Lang; name: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'cs', name: 'Čeština', dir: 'ltr' },
]
const dictionaries: Record<Lang, Dict> = { ar, en, fr, de, it, cs }
const KEY = 'transconnect:lang'
export const isLang = (value: unknown): value is Lang => LANGUAGES.some((language) => language.code === value)

type Params = Record<string, string | number>
type I18n = {
  lang: Lang; dir: 'rtl' | 'ltr'; setLang: (lang: Lang) => void
  t: (key: string, params?: Params) => string
  city: (placeId: string) => string
  /** « France - Marseille » pour l'étranger, « Tunis » pour la Tunisie, « Toutes destinations » pour all */
  place: (placeId: string) => string
  duration: (hours: number) => string
  arrow: string
}
const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => { const saved = readStored(KEY); return isLang(saved) ? saved : 'ar' })
  const dir = LANGUAGES.find((language) => language.code === lang)!.dir

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    document.title = `TransConnect | ${dictionaries[lang]['hero.title']}`
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => { writeStored(KEY, next); setLangState(next) }, [])

  const value = useMemo<I18n>(() => {
    const dict = dictionaries[lang] as Record<string, string>
    const t = (key: string, params?: Params) => {
      const text = dict[key] ?? (en as Record<string, string>)[key] ?? key
      return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text
    }
    const city = (id: string) => t(`place.${id}`)
    const place = (id: string) => {
      const found = getPlace(id)
      if (!found) return t('form.allDestinations')
      return found.country === 'tn' ? city(id) : `${t(`country.${found.country}`)} - ${city(id)}`
    }
    const duration = (hours: number) => {
      const total = Math.max(0, Math.round(hours))
      const d = Math.floor(total / 24)
      const h = total % 24
      return d && h ? t('time.dh', { d, h }) : d ? t('time.d', { d }) : t('time.h', { h })
    }
    return { lang, dir, setLang, t, city, place, duration, arrow: dir === 'rtl' ? '←' : '→' }
  }, [lang, dir, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
