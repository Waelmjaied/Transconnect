import { ArrowLeft, CalendarDays, CheckCircle2, Star, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Trip } from '../types'
import { tripImage } from '../data/catalog'
import { fmtDate, formatMoney } from '../lib/format'
import { useI18n } from '../i18n'

export function availability(trip: Trip) {
  return trip.availableKg < 60 ? { tone: 'low', key: 'card.limited' } : { tone: 'ok', key: 'card.available' }
}

export function TripCard({ trip, weight }: { trip: Trip; weight?: string }) {
  const { t, city } = useI18n()
  const status = availability(trip)
  return (
    <Link to={`/trip/${trip.id}${weight ? `?weight=${encodeURIComponent(weight)}` : ''}`} className="result-card">
      <div className="rc-price">
        <strong dir="ltr">{formatMoney(trip.pricePerKg)} <small>/ KG</small></strong>
        <span>{t('card.min')}: <b dir="ltr">{trip.minKg} KG</b></span>
        <em className={`badge badge-${status.tone}`}><CheckCircle2 size={15} /> {t(status.key)}</em>
      </div>
      <div className="rc-info">
        <h3>{city(trip.originId)} <ArrowLeft size={16} /> {city(trip.destinationId)}</h3>
        <p><CalendarDays size={15} /> <span dir="ltr">{fmtDate(trip.departureAt)}</span></p>
        <p><Truck size={16} /> <span dir="ltr">{trip.vehicleModel}</span></p>
        {trip.carrierRating !== null && <p className="rc-rating"><Star size={14} fill="currentColor" /> <b dir="ltr">{trip.carrierRating.toFixed(1)}</b> <span dir="ltr">({trip.reviewCount})</span> {t('card.reviews')}</p>}
      </div>
      <img src={tripImage(trip)} alt={trip.vehicleModel} loading="lazy" />
    </Link>
  )
}
