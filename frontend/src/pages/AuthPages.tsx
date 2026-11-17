import { useState, type FormEvent } from 'react'
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { Package, Truck } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Logo } from '../components/Logo'
import { AppHeader } from '../components/Shell'
import { useI18n } from '../i18n'
import { errorKey } from '../lib/api'

const useReturnTo = () => {
  const state = useLocation().state as { from?: string } | null
  return state?.from && state.from.startsWith('/') && !state.from.startsWith('//') ? state.from : '/'
}

export function LoginPage() {
  const { t } = useI18n()
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const from = useReturnTo()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={from} replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined)
    try { await login(form.email, form.password); navigate(from, { replace: true }) } catch (caught) { setError(caught) } finally { setBusy(false) }
  }
  return (
    <div className="screen">
      <AppHeader title={t('auth.login')} fallback="/" />
      <div className="pad">
        <div className="auth-logo"><Logo /></div>
        <h2 className="auth-title">{t('auth.loginTitle')}</h2>
        <form className="form-card" onSubmit={submit}>
          <label className="field"><span>{t('auth.email')}</span><input required type="email" dir="ltr" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field"><span>{t('auth.password')}</span><input required type="password" dir="ltr" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          {error !== undefined && <p className="field-error" role="alert">{t(errorKey(error))}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>{t('auth.login')}</button>
        </form>
        <p className="auth-switch">{t('auth.noAccount')} <Link to="/register" state={{ from }}>{t('auth.register')}</Link></p>
      </div>
    </div>
  )
}

export function RegisterPage() {
  const { t } = useI18n()
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const from = useReturnTo()
  const [role, setRole] = useState<'customer' | 'carrier'>('customer')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={from} replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined)
    try { await register({ ...form, role }); navigate(role === 'carrier' ? '/my-trips' : from, { replace: true }) } catch (caught) { setError(caught) } finally { setBusy(false) }
  }
  const roles: { id: 'customer' | 'carrier'; icon: typeof Package }[] = [{ id: 'customer', icon: Package }, { id: 'carrier', icon: Truck }]
  return (
    <div className="screen">
      <AppHeader title={t('auth.register')} fallback="/" />
      <div className="pad">
        <h2 className="auth-title">{t('auth.registerTitle')}</h2>
        <form className="form-card" onSubmit={submit}>
          <div className="field"><span>{t('auth.iAm')}</span>
            <div className="role-pick" role="radiogroup">
              {roles.map(({ id, icon: Icon }) => (
                <button key={id} type="button" role="radio" aria-checked={role === id} className={role === id ? 'on' : ''} onClick={() => setRole(id)}>
                  <Icon size={22} /><strong>{t(id === 'customer' ? 'auth.roleCustomer' : 'auth.roleCarrier')}</strong><small>{t(id === 'customer' ? 'auth.roleCustomerDesc' : 'auth.roleCarrierDesc')}</small>
                </button>
              ))}
            </div>
          </div>
          {role === 'carrier' && <p className="note">{t('auth.carrierNotice')}</p>}
          <label className="field"><span>{t('auth.name')}</span><input required minLength={2} maxLength={70} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>{t('auth.email')}</span><input required type="email" dir="ltr" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="field"><span>{t('auth.phone')}</span><input required type="tel" dir="ltr" minLength={8} maxLength={20} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+216 00 000 000" /></label>
          <label className="field"><span>{t('auth.password')}</span><input required type="password" dir="ltr" minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small>{t('auth.passwordHint')}</small></label>
          {error !== undefined && <p className="field-error" role="alert">{t(errorKey(error))}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>{t('auth.register')}</button>
        </form>
        <p className="auth-switch">{t('auth.haveAccount')} <Link to="/login" state={{ from }}>{t('auth.login')}</Link></p>
      </div>
    </div>
  )
}
