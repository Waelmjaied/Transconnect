import { Check, Moon, Monitor, Sun } from 'lucide-react'
import { Layer } from './Shell'
import { useAuth } from '../auth/AuthContext'
import { LANGUAGES, useI18n, type Lang } from '../i18n'
import { useTheme } from '../theme'
import type { ThemeMode } from '../types'

export function PreferencesPanel() {
  const { t, lang, setLang } = useI18n()
  const { mode, setMode } = useTheme()
  const { updatePreferences } = useAuth()
  const pickLang = (code: Lang) => { setLang(code); updatePreferences({ lang: code }) }
  const pickTheme = (next: ThemeMode) => { setMode(next); updatePreferences({ theme: next }) }
  const themes: { id: ThemeMode; icon: typeof Sun }[] = [{ id: 'light', icon: Sun }, { id: 'dark', icon: Moon }, { id: 'system', icon: Monitor }]
  return (
    <div className="prefs">
      <section>
        <h3>{t('prefs.language')}</h3>
        <div className="lang-grid" role="radiogroup" aria-label={t('prefs.language')}>
          {LANGUAGES.map((language) => (
            <button key={language.code} type="button" role="radio" aria-checked={lang === language.code} lang={language.code} dir={language.dir}
              className={`lang-btn ${lang === language.code ? 'on' : ''}`} onClick={() => pickLang(language.code)}>
              <span>{language.name}</span>{lang === language.code && <Check size={17} />}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{t('prefs.theme')}</h3>
        <div className="theme-switch" role="radiogroup" aria-label={t('prefs.theme')}>
          {themes.map(({ id, icon: Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'on' : ''} onClick={() => pickTheme(id)}>
              <Icon size={18} /> {t(`theme.${id}`)}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export function PreferencesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Layer open={open} onClose={onClose} variant="sheet" label={t('prefs.title')}>
      <div className="sheet-head"><h2>{t('prefs.title')}</h2></div>
      <PreferencesPanel />
    </Layer>
  )
}
