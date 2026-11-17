import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useI18n } from '../i18n'
import { MAX_PARCEL_KG, MIN_PARCEL_KG, weightPresets } from '../data/catalog'
import { api, errorKey } from '../lib/api'
import { fmtDate, formatMoney, formatPrice, round2 } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { Booking, Trip } from '../types'

export function BookingPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { t, city, arrow } = useI18n()
  const { user, can } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api<{ trip: Trip }>(`/trips/${encodeURIComponent(id)}`), [id])
  const [step, setStep] = useState<1 | 2>(1)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const [done, setDone] = useState<Booking | null>(null)
  const [form, setForm] = useState({ name: user?.name ?? '', phone: user?.phone ?? '', email: user?.email ?? '', weight: params.get('weight') || '', cargo: '' })

  if (loading && !data) return <div className="screen"><AppHeader title={t('booking.title')} fallback={`/trip/${id}`} /><Loading /></div>
  if (error !== undefined || !data) return <div className="screen"><AppHeader title={t('booking.title')} fallback="/results" /><ErrorBox error={error} onRetry={reload} /></div>
  if (!can('bookings:create')) return <div className="screen"><AppHeader title={t('booking.title')} fallback={`/trip/${id}`} /><div className="empty"><p>{t('detail.customersOnly')}</p><Link className="btn-primary" to="/results">{t('detail.back')}</Link></div></div>

  const trip = data.trip
  const cargo = form.cargo || trip.cargo[0]
  const weight = Number(form.weight)
  const total = round2(weight * trip.pricePerKg)
  const lo = Math.max(MIN_PARCEL_KG, trip.minKg)
  const hi = Math.min(MAX_PARCEL_KG, trip.availableKg)
  const validWeight = Number.isFinite(weight) && weight >= lo && weight <= hi
  const canContinue = validWeight && form.name.trim().length >= 2 && form.phone.trim().length >= 8
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const review = (event: FormEvent) => { event.preventDefault(); if (canContinue) { setFailure(undefined); setStep(2) } }

  const confirm = async () => {
    setBusy(true); setFailure(undefined)
    try {
      const res = await api<{ booking: Booking }>('/bookings', { method: 'POST', body: {
        tripId: trip.id, weightKg: weight, cargoType: cargo, contactName: form.name.trim(), contactPhone: form.phone.trim(), ...(form.email.trim() ? { contactEmail: form.email.trim() } : {}),
      } })
      setDone(res.booking)
    } catch (caught) { setFailure(caught) } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="screen center-screen">
        <div className="success-card">
          <span className="success-check"><CheckCircle2 size={34} /></span>
          <h1>{t('booking.successTitle')}</h1>
          <p>{t('booking.successText')}</p>
          <div className="reference-box"><span>{t('booking.reference')}</span><strong dir="ltr">{done.reference}</strong></div>
          <Link to={`/tracking?code=${done.reference}`} className="btn-primary">{t('booking.track')} <ArrowLeft size={18} /></Link>
          <Link to="/my-trips" className="btn-outline">{t('booking.myTrips')}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="screen has-cta">
      <AppHeader title={t('booking.title')} fallback={`/trip/${trip.id}`} />
      <div className="pad">
        <div className="summary-card">
          <div><strong>{city(trip.originId)} {arrow} {city(trip.destinationId)}</strong><span><bdi dir="ltr">{fmtDate(trip.departureAt)}</bdi> · <bdi dir="ltr">{trip.vehicleModel}</bdi></span></div>
          <b dir="ltr">{formatMoney(trip.pricePerKg)} <small>/ KG</small></b>
        </div>

        <ol className="steps">
          <li className={step === 1 ? 'active' : 'done'}><i>{step === 1 ? '1' : '✓'}</i> {t('booking.step1')}</li>
          <li className="steps-line" aria-hidden="true" />
          <li className={step === 2 ? 'active' : ''}><i>2</i> {t('booking.step2')}</li>
        </ol>

        {step === 1 ? (
          <form id="booking-form" className="form-card" onSubmit={review}>
            <label className="field"><span>{t('booking.weight')} <b>*</b></span>
              <div className="input-suffix"><input required type="number" inputMode="numeric" min={lo} max={hi} value={form.weight} onChange={(event) => update('weight', event.target.value)} /><em>KG</em></div>
              <div className="chips presets" aria-label={t('parcel.presets')}>{weightPresets.filter((kg) => kg >= lo && kg <= hi).map((kg) => <button key={kg} type="button" className={`chip ${weight === kg ? 'on' : ''}`} onClick={() => update('weight', String(kg))}>{kg} kg</button>)}</div>
              <small>{t('booking.limits', { max: hi, min: lo })} · {t('parcel.rule')}</small>
              {form.weight && !validWeight && <small className="field-error">{t('detail.weightRange', { min: lo, max: hi })}</small>}
            </label>
            <label className="field"><span>{t('booking.cargoType')} <b>*</b></span>
              <select value={cargo} onChange={(event) => update('cargo', event.target.value)}>{trip.cargo.map((id) => <option key={id} value={id}>{t(`cargo.${id}`)}</option>)}</select>
            </label>
            <label className="field"><span>{t('booking.name')} <b>*</b></span><input required minLength={2} maxLength={70} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder={t('booking.namePlaceholder')} /></label>
            <label className="field"><span>{t('booking.phone')} <b>*</b></span><input required type="tel" dir="ltr" minLength={8} maxLength={20} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+216 00 000 000" /></label>
            <label className="field"><span>{t('booking.email')} <small>({t('common.optional')})</small></span><input type="email" dir="ltr" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="name@example.com" /></label>
            <p className="note"><LockKeyhole size={15} /> {t('booking.privacy')}</p>
          </form>
        ) : (
          <div className="form-card">
            <div className="review-row"><span>{t('booking.name')}</span><strong>{form.name}</strong></div>
            <div className="review-row"><span>{t('booking.phone')}</span><strong dir="ltr">{form.phone}</strong></div>
            <div className="review-row"><span>{t('booking.cargoType')}</span><strong>{t(`cargo.${cargo}`)}</strong></div>
            <div className="review-row"><span>{t('booking.weight')}</span><strong dir="ltr">{weight} KG</strong></div>
            <div className="review-total"><span>{t('booking.estimated')} <small dir="ltr">{formatMoney(trip.pricePerKg)} × {weight} KG</small></span><strong>{formatPrice(total)}</strong></div>
            {failure !== undefined && <p className="field-error" role="alert">{t(errorKey(failure))}</p>}
          </div>
        )}
      </div>

      <div className="cta-bar cta-row">
        {step === 1
          ? <button type="submit" form="booking-form" className="btn-primary" disabled={!canContinue}>{t('booking.continue')} <ArrowLeft size={18} /></button>
          : <>
              <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={busy}><ArrowRight size={18} /> {t('booking.edit')}</button>
              <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>{busy ? t('booking.sending') : t('booking.confirm')} <CheckCircle2 size={18} /></button>
            </>}
      </div>
    </div>
  )
}
