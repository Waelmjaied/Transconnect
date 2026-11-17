import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Clock, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/Shell'
import { cargoIds, serviceIds, vehicleKinds } from '../data/catalog'
import { destinationPlaces, originPlaces } from '../data/places'
import { useI18n } from '../i18n'
import { api, errorKey } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { datetimeInDays } from '../lib/format'
import type { CargoId, ServiceId, Trip, VehicleKind } from '../types'

const initialForm = () => ({
  origin: 'tn-tunis', destination: 'fr-marseille', departure: datetimeInDays(2, '08:00'), arrival: datetimeInDays(3, '12:00'),
  kind: 'van' as VehicleKind, model: '', kg: '', price: '', cargo: [...cargoIds] as CargoId[], services: ['gps', 'proof'] as ServiceId[],
})

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item])

export function PublishPage() {
  const { t, place } = useI18n()
  const { user, can } = useAuth()
  const [form, setForm] = useState(initialForm)
  const [published, setPublished] = useState<Trip | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const market = useAsync(() => api<{ count: number; avg: number | null; min: number | null; max: number | null; suggested: number | null }>(`/insights/price?origin=${form.origin}&destination=${form.destination}`), [form.origin, form.destination])
  const set = <K extends keyof ReturnType<typeof initialForm>>(key: K, value: ReturnType<typeof initialForm>[K]) => setForm((current) => ({ ...current, [key]: value }))

  if (!user) {
    return <div className="screen"><AppHeader title={t('publish.title')} fallback="/" /><div className="pad"><div className="empty"><p>{t('auth.required')}</p><Link className="btn-primary" to="/login" state={{ from: '/publish' }}>{t('auth.login')}</Link></div></div></div>
  }
  if (!can('trips:create')) {
    const pending = user.role === 'carrier' && user.status === 'pending'
    return (
      <div className="screen"><AppHeader title={t('publish.title')} fallback="/" />
        <div className="pad"><div className="empty">
          <span className="empty-icon">{pending ? <Clock size={26} /> : <Truck size={26} />}</span>
          <h2>{pending ? t('publish.pendingTitle') : t('publish.denied')}</h2>
          {pending && <p>{t('publish.pendingText')}</p>}
          {!pending && user.role === 'customer' && <Link className="btn-outline" to="/register">{t('publish.deniedAction')}</Link>}
        </div></div>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setFailure(undefined)
    try {
      const res = await api<{ trip: Trip }>('/trips', { method: 'POST', body: {
        originId: form.origin, destinationId: form.destination, departureAt: form.departure, arrivalAt: form.arrival,
        vehicleModel: form.model.trim(), vehicleKind: form.kind, pricePerKg: Number(form.price), minKg: 1, availableKg: Number(form.kg),
        cargo: form.cargo, services: form.services,
      } })
      setPublished(res.trip)
    } catch (caught) { setFailure(caught) } finally { setBusy(false) }
  }

  if (published) {
    return (
      <div className="screen center-screen">
        <div className="success-card">
          <span className="success-check"><CheckCircle2 size={34} /></span>
          <h1>{t('publish.successTitle')}</h1>
          <p>{t('publish.successText')}</p>
          <Link to="/my-trips" className="btn-primary">{t('nav.trips')} <ArrowLeft size={18} /></Link>
          <button type="button" className="btn-outline" onClick={() => { setPublished(null); setForm(initialForm()) }}>{t('publish.another')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen has-cta">
      <AppHeader title={t('publish.title')} fallback="/" />
      <div className="pad">
        <div className="promo"><span><Truck size={26} /></span><div><strong>{t('publish.promoTitle')}</strong><p>{t('publish.promoText')}</p></div></div>
        <form id="publish-form" className="form-card" onSubmit={submit}>
          <div className="field-pair">
            <label className="field"><span>{t('form.from')} <b>*</b></span><select value={form.origin} onChange={(e) => set('origin', e.target.value)}>{originPlaces.map((p) => <option key={p.id} value={p.id}>{place(p.id)}</option>)}</select></label>
            <label className="field"><span>{t('form.to')} <b>*</b></span><select value={form.destination} onChange={(e) => set('destination', e.target.value)}>{destinationPlaces.map((p) => <option key={p.id} value={p.id}>{place(p.id)}</option>)}</select></label>
          </div>
          <label className="field"><span>{t('publish.departure')} <b>*</b></span><input required type="datetime-local" dir="ltr" min={datetimeInDays(0, '00:00')} value={form.departure} onChange={(e) => set('departure', e.target.value)} /></label>
          <label className="field"><span>{t('publish.arrival')} <b>*</b></span><input required type="datetime-local" dir="ltr" min={form.departure} value={form.arrival} onChange={(e) => set('arrival', e.target.value)} /></label>
          <div className="field"><span>{t('form.vehicle')} <b>*</b></span><div className="chips">{vehicleKinds.map((kind) => <button key={kind} type="button" className={`chip ${form.kind === kind ? 'on' : ''}`} onClick={() => set('kind', kind)}>{t(`vehicle.${kind}`)}</button>)}</div></div>
          <label className="field"><span>{t('publish.model')} <b>*</b></span><input required minLength={2} maxLength={40} dir="ltr" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Renault Master" /></label>
          <div className="field-pair">
            <label className="field"><span>{t('publish.space')} <b>*</b></span><div className="input-suffix"><input required type="number" inputMode="numeric" min="1" max="20000" value={form.kg} onChange={(e) => set('kg', e.target.value)} placeholder="200" /><em>KG</em></div></label>
            <label className="field"><span>{t('publish.price')} <b>*</b></span><div className="input-suffix"><input required type="number" inputMode="decimal" min="0.1" max="50" step="0.05" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="1.10" /><em>€</em></div></label>
          </div>
          {market.data && (market.data.avg !== null
            ? <div className="insight"><span>{t('insight.market', { avg: market.data.avg.toFixed(2), min: market.data.min!.toFixed(2), max: market.data.max!.toFixed(2) })}</span><button type="button" className="pill-btn" onClick={() => set('price', String(market.data!.suggested))}>{t('insight.use', { price: market.data.suggested!.toFixed(2) })}</button></div>
            : <div className="insight"><span>{t('insight.none')}</span></div>)}
          <div className="field"><span>{t('publish.cargo')} <b>*</b></span><div className="chips">{cargoIds.map((id) => <button key={id} type="button" aria-pressed={form.cargo.includes(id)} className={`chip ${form.cargo.includes(id) ? 'on' : ''}`} onClick={() => set('cargo', toggle(form.cargo, id))}>{t(`cargo.${id}`)}</button>)}</div></div>
          <div className="field"><span>{t('publish.services')}</span><div className="chips">{serviceIds.map((id) => <button key={id} type="button" aria-pressed={form.services.includes(id)} className={`chip ${form.services.includes(id) ? 'on' : ''}`} onClick={() => set('services', toggle(form.services, id))}>{t(`service.${id}`)}</button>)}</div></div>
          {failure !== undefined && <p className="field-error" role="alert">{t(errorKey(failure))}</p>}
        </form>
      </div>
      <div className="cta-bar"><button type="submit" form="publish-form" className="btn-primary" disabled={busy || form.cargo.length === 0}>{t('publish.submit')} <ArrowLeft size={18} /></button></div>
    </div>
  )
}
