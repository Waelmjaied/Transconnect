import { useState } from 'react'
import { Bell, Box, Globe, Menu, Moon, Search, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Logo } from '../components/Logo'
import { NotificationsSheet } from '../components/Notifications'
import { PreferencesSheet } from '../components/Preferences'
import { MenuDrawer } from '../components/Shell'
import { SearchForm } from '../components/SearchForm'
import { useToast } from '../components/Toast'
import { defaultSearch } from '../data/catalog'
import { useI18n } from '../i18n'
import { toParams } from '../lib/search'
import { getSearch, saveSearch } from '../lib/storage'
import { useNotify } from '../notify/NotifyContext'
import { useTheme } from '../theme'
import type { SearchFilters } from '../types'

export function HomePage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { resolved, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { user } = useAuth()
  const { notifications } = useNotify()
  const { toast, showToast } = useToast()
  const [initial] = useState(() => getSearch(defaultSearch))
  const search = (values: SearchFilters) => {
    saveSearch(values)
    navigate(`/results?${toParams(values).toString()}`)
  }
  return (
    <div className="screen home">
      <section className="hero">
        <img src="/assets/hero-route.webp" alt="" />
        <div className="hero-top">
          <Logo />
          <div className="hero-icons">
            <button type="button" className="icon-btn" aria-label={t('prefs.title')} onClick={() => setPrefsOpen(true)}><Globe size={23} /></button>
            <button type="button" className="icon-btn" aria-label={t('prefs.toggleTheme')} onClick={toggle}>{resolved === 'dark' ? <Sun size={23} /> : <Moon size={23} />}</button>
            <button type="button" className="icon-btn hero-bell" aria-label={t('notif.title')} onClick={() => (user ? setNotifOpen(true) : showToast(t('auth.required')))}><Bell size={24} />{notifications > 0 && <b className="dot-badge">{notifications > 9 ? '9+' : notifications}</b>}</button>
            <button type="button" className="icon-btn" aria-label={t('menu.title')} onClick={() => setMenuOpen(true)}><Menu size={26} /></button>
          </div>
        </div>
        <div className="hero-copy">
          <h2>{t('hero.title')}</h2>
          <p>{t('hero.subtitle')}</p>
        </div>
      </section>

      <section className="home-sheet">
        <div className="home-tabs" role="tablist" aria-label={t('home.service')}>
          <button type="button" role="tab" aria-selected="true" className="home-tab active"><Search size={21} /> {t('home.tabSearch')}</button>
          <Link to="/publish" role="tab" aria-selected="false" className="home-tab"><Box size={20} /> {t('home.tabPublish')}</Link>
        </div>
        <div className="home-card"><SearchForm initial={initial} onSearch={search} /></div>
      </section>

      <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <PreferencesSheet open={prefsOpen} onClose={() => setPrefsOpen(false)} />
      {toast}
    </div>
  )
}
