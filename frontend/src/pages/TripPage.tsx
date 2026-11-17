import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Heart, Lock, Share2, Ship, Star, Truck } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Flag } from '../components/Flag'
import { Stars } from '../components/Stars'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useToast } from '../components/Toast'
import { availability } from '../components/TripCard'
import { MAX_PARCEL_KG, MIN_PARCEL_KG, tripImage } from '../data/catalog'
import { getPlace } from '../data/places'
import { useI18n } from '../i18n'
import { api, ApiError } from '../lib/api'
import { fmtDate, formatMoney, formatPrice, round2 } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { Review, Trip } from '../types'

export function TripPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t, city } = useI18n()
  const { user, can } = useAuth()
  const { toast, showToast } = useToast()
  const [weightText, setWeightText] = useState(() => params.get('weight') || '50')
  const [saved, setSaved] = useState(false)
  const { data, error, loading, reload } = useAsync(() => api<{ trip: Trip }>(`/trips/${encodeURIComponent(id)}`), [id])
  const reviews = useAsync(() => api<{ reviews: Review[] }>(`/trips/${encodeURIComponent(id)}/reviews`), [id])

  useEffect(() => {
    if (!user) { setSaved(false); return }
    api<{ tripIds: string[] }>('/favorites').then((res) => setSaved(res.tripIds.includes(id))).catch(() => undefined)
  }, [user, id])

  if (loading && !data) return <div className="screen"><AppHeader title={t('detail.title')} fallback="/results" /><Loading /></div>
  if (error instanceof ApiError && error.status === 404) {
    return <div className="screen"><AppHeader title={t('detail.title')} fallback="/results" /><div className="empty"><h2>{t('detail.notFound')}</h2><p>{t('detail.notFoundText')}</p><Link className="btn-primary" to="/results">{t('detail.back')}</Link></div></div>
  }
  if (error !== undefined || !data) return <div className="screen"><AppHeader title={t('detail.title')} fallback="/results" /><ErrorBox error={error} onRetry={reload} /></div>

  const trip = data.trip
  const origin = getPlace(trip.originId)!
  const destination = getPlace(trip.destinationId)!
  const status = availability(trip)
  const weight = Number(weightText)
  const lo = Math.max(MIN_PARCEL_KG, trip.minKg)
  const hi = Math.min(MAX_PARCEL_KG, trip.availableKg)
  const valid = Number.isFinite(weight) && weight >= lo && weight <= hi
  const total = weight > 0 ? round2(weight * trip.pricePerKg) : 0
  const canBook = !user || can('bookings:create')

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `${city(trip.originId)} → ${city(trip.destinationId)}`, url })
      else { await navigator.clipboard.writeText(url); showToast(t('detail.copied')) }
    } catch { /* partage annulé */ }
  }
  const toggleSaved = async () => {
    if (!user) { showToast(t('auth.loginToSave')); return }
    try {
      await api(`/favorites/${trip.id}`, { method: saved ? 'DELETE' : 'PUT' })
      setSaved(!saved)
    } catch { showToast(t('err.UNKNOWN')) }
  }

  return (
    <div className="screen has-cta">
      <AppHeader title={t('detail.title')} fallback="/results" actions={<>
        <button type="button" className="icon-btn" onClick={share} aria-label={t('detail.share')}><Share2 size={22} /></button>
        <button type="button" className={`icon-btn ${saved ? 'is-saved' : ''}`} onClick={toggleSaved} aria-label={saved ? t('detail.unsave') : t('detail.save')}><Heart size={22} fill={saved ? 'currentColor' : 'none'} /></button>
      </>} />

      <div className="detail-hero">
        <img src={tripImage(trip)} alt={trip.vehicleModel} />
        <span className={`hero-chip badge-${status.tone}`}>{t(status.key)}</span>
      </div>

      <section className="detail-card">
        <div className="route-strip" dir="ltr">
          <div className="route-end"><Flag country={origin.country} size={32} /><strong>{city(trip.originId)}</strong></div>
          <div className="route-mid"><i /><Ship size={24} /><i /></div>
          <div className="route-end"><Flag country={destination.country} size={32} /><strong>{city(trip.destinationId)}</strong></div>
        </div>

        <div className="stat-row" dir="ltr">
          <div><CalendarDays size={22} /><b>{fmtDate(trip.departureAt)}</b><span>{t('detail.date')}</span></div>
          <div><Truck size={22} /><b>{trip.vehicleModel}</b><span>{t('detail.vehicle')}</span></div>
          <div className="gold"><Star size={22} fill="currentColor" /><b>{trip.carrierRating !== null ? trip.carrierRating.toFixed(1) : '—'}</b><span>{t('detail.rating')}</span></div>
        </div>

        <div className="price-row" dir="ltr">
          <div><b>{formatMoney(trip.pricePerKg)} <small>/ KG</small></b><span>{t('detail.pricePerKg')}</span></div>
          <div>
            <b><input className="inline-num" type="number" inputMode="numeric" min={lo} max={hi} value={weightText} onChange={(event) => setWeightText(event.target.value)} aria-label={t('detail.weightInput')} /> <small>KG</small></b>
            <span>{t('detail.weight')}</span>
          </div>
          <div className="total"><b>{formatPrice(total)}</b><span>{t('detail.total')}</span></div>
        </div>
        {weightText && !valid && <p className="field-error">{t('detail.weightRange', { min: lo, max: hi })}</p>}
        <p className="hint-line">{t('parcel.rule')}</p>

        <h2 className="block-title">{t('detail.extra')}</h2>
        <ul className="check-list">{trip.services.map((service) => <li key={service}><CheckCircle2 size={20} /> {t(`service.${service}`)}</li>)}</ul>
        <ul className="terms">
          {trip.carrierName && <li>{t('detail.carrier')}: <bdi>{trip.carrierName}</bdi></li>}
          <li>{t('detail.terms1')}</li><li>{t('detail.terms2')}</li>
        </ul>

        <h2 className="block-title">{t('review.title')}</h2>
        {reviews.data && reviews.data.reviews.length === 0 && <p className="mini-empty">{t('review.none')}</p>}
        <ul className="review-list">
          {reviews.data?.reviews.slice(0, 5).map((review, index) => (
            <li key={index}><div><Stars value={review.rating} size={15} /><strong>{review.author}</strong><small dir="ltr">{fmtDate(review.createdAt)}</small></div>{review.comment && <p>{review.comment}</p>}</li>
          ))}
        </ul>
      </section>
      {toast}

      <div className="cta-bar">
        {!canBook && <p className="cta-note">{t('detail.customersOnly')}</p>}
        <button type="button" className="btn-primary" disabled={!valid || !canBook} onClick={() => navigate(`/booking/${trip.id}?weight=${weight}`)}><Lock size={19} /> {t('detail.book')}</button>
      </div>
    </div>
  )
}
