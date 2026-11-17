import { useEffect, useState } from 'react'
import { Box, ChevronLeft, Download, FileDown, LifeBuoy, LogIn, LogOut, MapPin, Package, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PreferencesPanel } from '../components/Preferences'
import { AppHeader } from '../components/Shell'
import { useI18n } from '../i18n'
import { api, downloadFile, errorKey } from '../lib/api'

export function AccountPage() {
  const { t } = useI18n()
  const { user, can, logout } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [failure, setFailure] = useState<unknown>()
  const removeAccount = async () => {
    try { await api('/auth/me', { method: 'DELETE', body: { password } }); logout() } catch (caught) { setFailure(caught) }
  }
  const [installEvent, setInstallEvent] = useState<{ prompt: () => Promise<void> } | null>(null)
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as unknown as { prompt: () => Promise<void> }) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])
  return (
    <div className="screen">
      <AppHeader title={t('account.title')} back={false} />
      <div className="pad">
        {user ? (
          <>
            <div className="profile-card">
              <span className="avatar" aria-hidden="true">{[...user.name][0]?.toUpperCase()}</span>
              <div><strong>{user.name}</strong><p dir="ltr">{user.email}</p>
                <p><span className={`role-tag role-${user.role}`}>{t(`role.${user.role}`)}</span> {user.status !== 'active' && <span className={`role-tag st-${user.status}`}>{t(`userStatus.${user.status}`)}</span>}</p></div>
            </div>
            <nav className="menu-list">
              <Link to="/my-trips"><Package size={20} /><span>{t('account.myTrips')}</span><ChevronLeft size={18} /></Link>
              {can('trips:create') && <Link to="/publish"><Box size={20} /><span>{t('menu.publish')}</span><ChevronLeft size={18} /></Link>}
              {can('tracking:read') && <Link to="/tracking"><MapPin size={20} /><span>{t('menu.tracking')}</span><ChevronLeft size={18} /></Link>}
              {can('tickets:create') || can('tickets:manage') ? <Link to="/support"><LifeBuoy size={20} /><span>{t('support.title')}</span><ChevronLeft size={18} /></Link> : null}
              {(can('stats:read') || can('users:read') || can('trips:moderate') || can('tickets:manage')) && <Link to="/admin"><ShieldCheck size={20} /><span>{t('account.admin')}</span><ChevronLeft size={18} /></Link>}
            </nav>
          </>
        ) : (
          <div className="empty">
            <span className="empty-icon"><LogIn size={26} /></span>
            <h2>{t('account.guestTitle')}</h2><p>{t('account.guestText')}</p>
            <Link to="/login" className="btn-primary"><LogIn size={18} /> {t('auth.login')}</Link>
            <Link to="/register" className="btn-outline"><UserPlus size={18} /> {t('auth.register')}</Link>
          </div>
        )}
        {installEvent && <button type="button" className="install-card" onClick={() => installEvent.prompt().then(() => setInstallEvent(null))}><Download size={22} /><div><strong>{t('pwa.install')}</strong><small>{t('pwa.installText')}</small></div></button>}
        <section className="pref-card"><PreferencesPanel /></section>
        {user && (
          <section className="pref-card privacy">
            <h3>{t('privacy.title')}</h3>
            <button type="button" className="btn-outline" onClick={() => downloadFile('/auth/me/export', 'transconnect-my-data.json').catch((e) => setFailure(e))}><FileDown size={18} /> {t('privacy.export')}</button>
            {!deleting ? <button type="button" className="btn-outline danger-outline" onClick={() => setDeleting(true)}><Trash2 size={18} /> {t('privacy.delete')}</button> : (
              <div className="delete-box">
                <p>{t('privacy.deleteText')}</p>
                <input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('privacy.confirmPassword')} aria-label={t('privacy.confirmPassword')} />
                <button type="button" className="btn-outline danger-outline" disabled={!password} onClick={removeAccount}>{t('privacy.deleteConfirm')}</button>
              </div>
            )}
            {failure !== undefined && <p className="field-error" role="alert">{t(errorKey(failure))}</p>}
          </section>
        )}
        {user && <button type="button" className="btn-outline" onClick={logout}><LogOut size={18} /> {t('account.logout')}</button>}
      </div>
    </div>
  )
}
