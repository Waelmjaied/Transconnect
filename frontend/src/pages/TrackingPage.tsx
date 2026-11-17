import { useEffect, useState, type FormEvent } from 'react'
import { Bell, Check, Search, ShieldCheck, Ship, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { LiveMap, type LivePoint } from '../components/LiveMap'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useToast } from '../components/Toast'
import { fractionOf, pointAlong, routeFor, routeLengthKm, type LatLng } from '../data/geo'
import { useI18n } from '../i18n'
import { api, ApiError } from '../lib/api'
import { arrivalMs, departureMs, fmtDateTime, hoursUntilArrival } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { Booking, BookingStatus, TrackingEvent } from '../types'

type GpsPoint = { lat: number; lng: number; speed: number | null; heading: number | null; at: string }
const minutesSince = (sqliteUtc: string) => (Date.now() - new Date(`${sqliteUtc.replace(' ', 'T')}Z`).getTime()) / 60000

const flow: BookingStatus[] = ['pending', 'confirmed', 'picked_up', 'in_transit', 'arrived', 'delivered']

export function TrackingPage() {
  const { t, city, duration } = useI18n()
  const [params, setParams] = useSearchParams()
  const code = (params.get('code') ?? '').trim().toUpperCase()
  const [input, setInput] = useState(code)
  const [formOpen, setFormOpen] = useState(false)
  const { toast, showToast } = useToast()

  // Sans numéro : on ouvre automatiquement la dernière expédition de l'utilisateur, s'il en a une.
  const list = useAsync(async () => (code ? null : (await api<{ bookings: Booking[] }>('/bookings')).bookings[0] ?? null), [code])
  const effective = code || list.data?.reference || ''
  const track = useAsync(() => (effective ? api<{ booking: Booking; events: TrackingEvent[]; position: GpsPoint | null; trail: GpsPoint[] }>(`/tracking/${encodeURIComponent(effective)}`) : Promise.resolve(null)), [effective])

  // Pendant le transport, on rafraîchit la position toutes les 15 s (onglet visible uniquement).
  const liveStatus = track.data?.booking.status
  useEffect(() => {
    if (!liveStatus || !['picked_up', 'in_transit', 'arrived'].includes(liveStatus)) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') track.reload() }, 15_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus, track.reload])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = input.trim().toUpperCase()
    if (next) setParams({ code: next }, { replace: true })
    setFormOpen(false)
  }

  const codeForm = (
    <form className="track-form" onSubmit={submit}>
      <label htmlFor="trackingCode" className="sr-only">{t('tracking.ref')}</label>
      <input id="trackingCode" dir="ltr" value={input} onChange={(event) => setInput(event.target.value)} placeholder="TCX-2026-000000" required />
      <button type="submit" className="btn-primary"><Search size={18} /> {t('tracking.go')}</button>
    </form>
  )
  const header = <AppHeader title={t('tracking.title')} fallback="/my-trips" actions={<button type="button" className="icon-btn" aria-label={t('notif.title')} onClick={() => showToast(t('tracking.alerts'))}><Bell size={23} /></button>} />

  if (!effective) {
    if (!code && list.loading) return <div className="screen">{header}<Loading /></div>
    if (!code && list.error !== undefined) return <div className="screen">{header}<ErrorBox error={list.error} onRetry={list.reload} /></div>
    return <div className="screen">{header}<div className="pad"><div className="empty"><span className="empty-icon"><Search size={26} /></span><h2>{t('tracking.empty')}</h2><p>{t('tracking.emptyText')}</p>{codeForm}</div></div>{toast}</div>
  }
  if (track.loading && !track.data) return <div className="screen">{header}<Loading /></div>
  if (track.error instanceof ApiError && track.error.status === 404) {
    return <div className="screen">{header}<div className="pad"><div className="empty"><span className="empty-icon"><X size={26} /></span><h2>{t('tracking.notFound')}</h2><p>{t('tracking.notFoundText')}</p>{codeForm}</div></div></div>
  }
  if (track.error !== undefined || !track.data) return <div className="screen">{header}<ErrorBox error={track.error ?? list.error} onRetry={track.reload} /></div>

  const { booking, events, position, trail } = track.data
  const route = routeFor(booking.trip.originId, booking.trip.destinationId)
  const inTransit = ['picked_up', 'in_transit', 'arrived'].includes(booking.status)
  const fresh = position !== null && minutesSince(position.at) < 15
  // Sans GPS récent, on estime la position d'après l'horaire (départ → arrivée) le long de l'itinéraire.
  let mapPoint: LivePoint | null = null
  if (fresh && position) mapPoint = { lat: position.lat, lng: position.lng, heading: position.heading, live: true }
  else if (inTransit) {
    const span = arrivalMs(booking.trip) - departureMs(booking.trip)
    const f = booking.status === 'arrived' ? 1 : span > 0 ? (Date.now() - departureMs(booking.trip)) / span : 0
    const estimated = pointAlong(route, f)
    if (estimated) mapPoint = { lat: estimated[0], lng: estimated[1], live: false }
  }
  const remainingKm = mapPoint && route.length > 1 ? Math.max(0, Math.round((1 - fractionOf(route, [mapPoint.lat, mapPoint.lng])) * routeLengthKm(route))) : null
  const speedKmh = fresh && position?.speed != null ? Math.round(position.speed * 3.6) : null
  const trailPoints: LatLng[] = fresh ? trail.map((p) => [p.lat, p.lng]) : []
  const failed = booking.status === 'cancelled' || booking.status === 'rejected'
  const currentIndex = flow.indexOf(booking.status)
  const when = (status: BookingStatus) => { const event = events.find((e) => e.status === status); return event ? fmtDateTime(event.createdAt) : '' }
  const steps = flow.map((status, index) => ({
    status,
    title: t(`status.${status}`, { origin: city(booking.trip.originId), destination: city(booking.trip.destinationId) }),
    state: failed ? (index === 0 ? 'done' : 'pending') : index < currentIndex || booking.status === 'delivered' ? 'done' : index === currentIndex ? 'current' : 'pending',
    when: status === 'arrived' && currentIndex < 4 && !failed ? `${fmtDateTime(booking.trip.arrivalAt)} ${t('tracking.expected')}` : when(status),
  }))
  const notes = events.filter((e) => e.message)
  const hoursLeft = hoursUntilArrival(booking.trip)
  const showEta = (booking.status === 'in_transit' || booking.status === 'picked_up') && hoursLeft > 0

  return (
    <div className="screen">
      {header}
      <div className="map-stage">
        <LiveMap originId={booking.trip.originId} destinationId={booking.trip.destinationId} position={mapPoint} trail={trailPoints} />
        {inTransit && (
          <div className="map-info">
            <b className={mapPoint?.live ? 'live' : ''}>{mapPoint?.live ? t('gps.live') : t('gps.estimated')}</b>
            {fresh && position && <small>{minutesSince(position.at) < 1 ? t('gps.justNow') : t('gps.minAgo', { n: Math.round(minutesSince(position.at)) })}</small>}
            {speedKmh !== null && <small>{t('gps.speed')}: <bdi dir="ltr">{speedKmh} km/h</bdi></small>}
            {remainingKm !== null && <small>{t('gps.remaining')}: <bdi dir="ltr">{remainingKm} km</bdi></small>}
          </div>
        )}
        <div className="map-panels">
          <div className={`status-card ${failed ? 'is-failed' : ''}`}>
            <span className="status-check">{failed ? <X size={16} strokeWidth={3} /> : <Check size={16} strokeWidth={3} />}</span>
            <div><strong>{t(`head.${booking.status}`)}</strong><p>{showEta ? t('tracking.eta', { time: duration(hoursLeft) }) : <bdi dir="ltr">{booking.reference}</bdi>}</p></div>
          </div>
          <ol className="timeline">
            {(failed ? steps.slice(0, 1).concat([{ status: booking.status, title: t(`status.${booking.status}`), state: 'current', when: when(booking.status) }]) : steps).map((step) => (
              <li key={step.status} className={step.state}>
                <span className="tl-marker">{step.state === 'done' ? <Check size={14} strokeWidth={3.2} /> : step.state === 'current' ? <Ship size={14} /> : null}</span>
                <div><strong>{step.title}</strong>{step.when && <span><bdi dir="ltr">{step.when}</bdi></span>}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <section className="track-foot">
        <div className="track-ref">
          <span>{t('tracking.ref')}</span><b dir="ltr">{booking.reference}</b>
          <button type="button" className="link-btn" onClick={() => { setInput(booking.reference); setFormOpen((open) => !open) }}>{t('tracking.change')}</button>
        </div>
        {booking.deliveryPin && <div className="pin-box"><span>{t('pin.title')}</span><b dir="ltr">{booking.deliveryPin}</b><small>{t('pin.hint')}</small></div>}
        {formOpen && codeForm}
        {notes.length > 0 && <ul className="terms">{notes.map((e) => <li key={`${e.createdAt}-${e.message}`}><bdi dir="ltr">{fmtDateTime(e.createdAt)}</bdi> — {t(`event.${e.message}`) === `event.${e.message}` ? e.message : t(`event.${e.message}`)}</li>)}</ul>}
        <p className="note"><ShieldCheck size={15} /> {t('gps.privacy')}</p>
      </section>
      {toast}
    </div>
  )
}
