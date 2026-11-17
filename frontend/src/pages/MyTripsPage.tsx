import { useEffect, useState } from 'react'
import { ArrowLeft, Box, CalendarDays, Clock, Heart, MapPin, Package, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/Shell'
import { ReviewForm } from '../components/ReviewForm'
import { ShareLocation } from '../components/ShareLocation'
import { ErrorBox, Loading } from '../components/State'
import { useToast } from '../components/Toast'
import { useI18n } from '../i18n'
import { api, errorKey } from '../lib/api'
import { fmtDate, formatMoney, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { useNotify } from '../notify/NotifyContext'
import type { Booking, BookingStatus, Trip } from '../types'

export function MyTripsPage() {
  const { t, city, arrow } = useI18n()
  const { user, can } = useAuth()
  const { toast, showToast } = useToast()
  const { refresh } = useNotify()
  const [pinFor, setPinFor] = useState<string | null>(null)
  const [pinValue, setPinValue] = useState('')
  const isCarrier = can('trips:manage')
  const bookings = useAsync(() => (user ? api<{ bookings: Booking[] }>('/bookings') : Promise.resolve({ bookings: [] })), [user?.id])
  const mine = useAsync(() => (isCarrier ? api<{ trips: Trip[] }>('/trips/mine') : Promise.resolve({ trips: [] })), [user?.id, isCarrier])
  const [saved, setSaved] = useState<Trip[]>([])

  useEffect(() => {
    if (!user) { setSaved([]); return }
    api<{ tripIds: string[] }>('/favorites')
      .then((res) => Promise.allSettled(res.tripIds.map((id) => api<{ trip: Trip }>(`/trips/${id}`))))
      .then((results) => setSaved(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.trip] : []))))
      .catch(() => undefined)
  }, [user])

  const act = async (booking: Booking, status: BookingStatus, pin?: string) => {
    if (status === 'cancelled' && !window.confirm(t('my.confirmCancel'))) return
    try { await api(`/bookings/${booking.id}/status`, { method: 'PATCH', body: { status, ...(pin ? { pin } : {}) } }); setPinFor(null); setPinValue(''); bookings.reload(); mine.reload(); refresh() }
    catch (error) { showToast(t(errorKey(error))) }
  }
  const cancelTrip = async (trip: Trip) => {
    if (!window.confirm(t('my.confirmCancelTrip'))) return
    try { await api(`/trips/${trip.id}`, { method: 'PATCH', body: { status: 'cancelled' } }); mine.reload(); bookings.reload() } catch (error) { showToast(t(errorKey(error))) }
  }
  const deleteTrip = async (trip: Trip) => {
    if (!window.confirm(t('my.confirmDelete'))) return
    try { await api(`/trips/${trip.id}`, { method: 'DELETE' }); mine.reload() } catch (error) { showToast(t(errorKey(error))) }
  }

  const list = bookings.data?.bookings ?? []
  return (
    <div className="screen">
      <AppHeader title={t('my.title')} back={false} />
      <div className="pad">
        {user?.role === 'carrier' && user.status === 'pending' && <div className="banner"><Clock size={18} /> {t('my.pendingBanner')}</div>}
        {can('tracking:read') && (
          <Link to="/tracking" className="track-link"><span><MapPin size={22} /></span><div><strong>{t('my.track')}</strong><p>{t('my.trackText')}</p></div><ArrowLeft size={18} /></Link>
        )}

        <section className="list-section">
          <h2>{isCarrier ? t('my.incoming') : t('my.bookings')} <b>{list.length}</b></h2>
          {bookings.loading && !bookings.data && <Loading />}
          {bookings.error !== undefined && <ErrorBox error={bookings.error} onRetry={bookings.reload} />}
          {list.map((booking) => (
            <article className="mini-card tall" key={booking.id}>
              <span className="mc-icon"><Package size={20} /></span>
              <div className="mc-main">
                <strong>{city(booking.trip.originId)} {arrow} {city(booking.trip.destinationId)}</strong>
                <span dir="ltr">{booking.weightKg} KG · {booking.reference}</span>
                <small><CalendarDays size={13} /> <bdi dir="ltr">{fmtDate(booking.trip.departureAt)}</bdi> · {t(`head.${booking.status}`)}</small>
                {booking.contact && isCarrier && <small>{booking.contact.name} · <bdi dir="ltr">{booking.contact.phone}</bdi></small>}
                {booking.deliveryPin && <div className="pin-box"><span>{t('pin.title')}</span><b dir="ltr">{booking.deliveryPin}</b><small>{t('pin.hint')}</small></div>}
                {booking.allowedActions.length > 0 && (
                  <div className="mc-actions">{booking.allowedActions.map((status) => <button key={status} type="button" className={`pill-btn ${status === 'rejected' || status === 'cancelled' ? 'danger' : ''}`} onClick={() => (status === 'delivered' && user?.role !== 'admin' ? (setPinFor(pinFor === booking.id ? null : booking.id), setPinValue('')) : act(booking, status))}>{t(`act.${status}`)}</button>)}</div>
                )}
                {pinFor === booking.id && (
                  <form className="pin-form" onSubmit={(event) => { event.preventDefault(); act(booking, 'delivered', pinValue) }}>
                    <label>{t('pin.enter')}<input inputMode="numeric" maxLength={4} dir="ltr" autoFocus value={pinValue} onChange={(event) => setPinValue(event.target.value.replace(/\D/g, ''))} /></label>
                    <button type="submit" className="pill-btn" disabled={pinValue.length !== 4}>{t('pin.confirm')}</button>
                  </form>
                )}
                {booking.status === 'delivered' && user?.role === 'customer' && (booking.reviewed ? <small className="ok-text">{t('review.thanks')}</small> : <ReviewForm bookingId={booking.id} onDone={() => { bookings.reload(); refresh() }} />)}
              </div>
              <div className="mc-side"><b>{formatPrice(booking.totalPrice)}</b><Link to={`/tracking?code=${booking.reference}`} className="pill-link">{t('tracking.go')}</Link>{user?.role !== 'admin' && <Link to={`/chats/${booking.id}`} className="pill-link">{t('chat.open')}</Link>}</div>
            </article>
          ))}
          {bookings.data && list.length === 0 && <p className="mini-empty">{t('my.noBookings')} {!isCarrier && <Link to="/results">{t('my.browse')}</Link>}</p>}
        </section>

        {isCarrier && (
          <section className="list-section">
            <h2>{t('my.published')} <b>{mine.data?.trips.length ?? 0}</b></h2>
            {mine.data?.trips.map((trip) => (
              <article className="mini-card tall" key={trip.id}>
                <span className="mc-icon mint"><Box size={20} /></span>
                <div className="mc-main">
                  <strong>{city(trip.originId)} {arrow} {city(trip.destinationId)}</strong>
                  <span dir="ltr">{trip.vehicleModel} · {trip.availableKg}/{trip.capacityKg} KG {t('my.free')}</span>
                  <small><CalendarDays size={13} /> <bdi dir="ltr">{fmtDate(trip.departureAt)}</bdi> · {trip.status === 'cancelled' ? t('head.cancelled') : t('card.available')}</small>
                  {trip.status === 'open' && can('tracking:write') && trip.carrierId === user?.id && <ShareLocation tripId={trip.id} />}
                  <div className="mc-actions">
                    {trip.status === 'open' && <button type="button" className="pill-btn danger" onClick={() => cancelTrip(trip)}>{t('my.cancelTrip')}</button>}
                    <button type="button" className="pill-btn danger" onClick={() => deleteTrip(trip)}>{t('my.deleteTrip')}</button>
                  </div>
                </div>
                <div className="mc-side"><b dir="ltr">{formatMoney(trip.pricePerKg)}</b></div>
              </article>
            ))}
            {mine.data && mine.data.trips.length === 0 && <p className="mini-empty">{t('my.noPublished')} {can('trips:create') && <Link to="/publish">{t('my.publishNow')}</Link>}</p>}
          </section>
        )}

        <section className="list-section">
          <h2>{t('my.saved')} <b>{saved.length}</b></h2>
          {saved.map((trip) => (
            <article className="mini-card" key={trip.id}>
              <span className="mc-icon rose"><Heart size={20} /></span>
              <div className="mc-main"><strong>{city(trip.originId)} {arrow} {city(trip.destinationId)}</strong><span dir="ltr">{trip.vehicleModel}</span>
                <small>{trip.carrierRating !== null && <><Star size={13} fill="currentColor" /> {trip.carrierRating.toFixed(1)} · </>}<bdi dir="ltr">{fmtDate(trip.departureAt)}</bdi></small></div>
              <div className="mc-side"><b dir="ltr">{formatMoney(trip.pricePerKg)}</b><Link to={`/trip/${trip.id}`} className="pill-link">{t('my.details')}</Link></div>
            </article>
          ))}
          {saved.length === 0 && <p className="mini-empty">{t('my.noSaved')}</p>}
        </section>
      </div>
      {toast}
    </div>
  )
}
