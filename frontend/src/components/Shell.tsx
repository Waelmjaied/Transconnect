import { useEffect, type ReactNode } from 'react'
import { Box, ChevronLeft, Home, LifeBuoy, LogIn, MapPin, MessageCircle, Package, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n'
import { useNotify } from '../notify/NotifyContext'
import { Logo } from './Logo'

const tabs = [
  { to: '/', key: 'nav.home', icon: Home, end: true },
  { to: '/my-trips', key: 'nav.trips', icon: Package, end: false },
  { to: '/chats', key: 'nav.chats', icon: MessageCircle, end: false },
  { to: '/account', key: 'nav.account', icon: UserRound, end: false },
]
const tabPaths = new Set(tabs.map((tab) => tab.to))

export function Shell() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const { messages } = useNotify()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  const showNav = tabPaths.has(pathname)
  return (
    <div className="stage">
      <div className={`frame ${showNav ? 'has-nav' : ''} ${pathname.startsWith('/admin') ? 'wide' : ''}`}>
        <Outlet />
        {showNav && (
          <nav className="bottom-nav" aria-label={t('nav.main')}>
            {tabs.map(({ to, key, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}>
                <span className="bn-icon"><Icon size={23} strokeWidth={2} />{to === '/chats' && messages > 0 && <b className="dot-badge">{messages > 9 ? '9+' : messages}</b>}</span><span>{t(key)}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

export function useGoBack(fallback = '/') {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => (key === 'default' ? navigate(fallback) : navigate(-1))
}

export function AppHeader({ title, subtitle, actions, back = true, fallback = '/' }: { title: string; subtitle?: string; actions?: ReactNode; back?: boolean; fallback?: string }) {
  const goBack = useGoBack(fallback)
  const { t } = useI18n()
  return (
    <header className="app-header">
      <div className="ah-side">{back && <button type="button" className="icon-btn" onClick={goBack} aria-label={t('common.back')}><ChevronLeft size={26} /></button>}</div>
      <div className="ah-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <div className="ah-side ah-end">{actions}</div>
    </header>
  )
}

export function Layer({ open, onClose, variant, label, children }: { open: boolean; onClose: () => void; variant: 'drawer' | 'sheet'; label: string; children: ReactNode }) {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="layer" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="scrim" aria-label={t('common.close')} onClick={onClose} />
      <div className="layer-frame"><div className={`panel panel-${variant}`}>{children}</div></div>
    </div>
  )
}

export function MenuDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { user, can } = useAuth()
  const links = [
    { to: '/', label: t('nav.home'), icon: Home, show: true },
    { to: '/results', label: t('menu.results'), icon: Search, show: true },
    { to: '/publish', label: t('menu.publish'), icon: Box, show: !user || can('trips:create') || user.role === 'carrier' },
    { to: '/tracking', label: t('menu.tracking'), icon: MapPin, show: can('tracking:read') },
    { to: '/my-trips', label: t('nav.trips'), icon: Package, show: true },
    { to: '/chats', label: t('nav.chats'), icon: MessageCircle, show: true },
    { to: '/support', label: t('support.title'), icon: LifeBuoy, show: Boolean(user) },
    { to: '/admin', label: t('menu.admin'), icon: ShieldCheck, show: can('stats:read') || can('users:read') || can('trips:moderate') || can('tickets:manage') },
    { to: user ? '/account' : '/login', label: user ? t('nav.account') : t('menu.login'), icon: user ? UserRound : LogIn, show: true },
  ]
  return (
    <Layer open={open} onClose={onClose} variant="drawer" label={t('menu.title')}>
      <div className="drawer-head"><Logo /><button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={22} /></button></div>
      <nav className="drawer-links">
        {links.filter((link) => link.show).map(({ to, label, icon: Icon }) => <Link key={to} to={to} onClick={onClose}><Icon size={20} /><span>{label}</span></Link>)}
      </nav>
      <p className="drawer-note">{t('app.tagline')}</p>
    </Layer>
  )
}
