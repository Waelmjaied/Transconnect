export const ORIGIN_IDS = ['tn-tunis', 'tn-sfax'] as const
export const DESTINATION_IDS = ['fr-marseille', 'fr-paris', 'fr-lyon', 'fr-nice', 'it-rome'] as const
export const CARGO_IDS = ['parcels', 'furniture', 'clothes', 'equipment'] as const
export const VEHICLE_KINDS = ['car', 'van', 'truck'] as const
export const SERVICE_IDS = ['gps', 'insurance', 'proof'] as const
export const BOOKING_STATUSES = ['pending', 'confirmed', 'picked_up', 'in_transit', 'arrived', 'delivered', 'cancelled', 'rejected'] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Convention des dates de trajet (format 'YYYY-MM-DDTHH:mm', sans fuseau) :
 *  - le DÉPART est l'heure murale du lieu de départ (Tunisie) ;
 *  - l'ARRIVÉE est l'heure murale du lieu d'arrivée (France / Italie).
 * Toute comparaison passe par des instants réels (wallToInstant) : le résultat ne dépend ni du fuseau du serveur ni de celui du navigateur.
 */
const TZ_BY_COUNTRY: Record<string, string> = { tn: 'Africa/Tunis', fr: 'Europe/Paris', it: 'Europe/Rome' }
export const placeTz = (placeId: string) => TZ_BY_COUNTRY[placeId.slice(0, 2)] ?? 'UTC'

const partsFormat = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Heure murale actuelle dans un fuseau, au format 'YYYY-MM-DDTHH:mm'. */
export const wallNow = (tz: string, now = new Date()) => {
  const get = Object.fromEntries(partsFormat(tz).formatToParts(now).map((part) => [part.type, part.value]))
  return `${get.year}-${get.month}-${get.day}T${get.hour}:${get.minute}`
}

/** Instant (ms depuis l'époque) correspondant à une heure murale 'YYYY-MM-DDTHH:mm' dans le fuseau donné. */
export function wallToInstant(wall: string, tz: string): number {
  const asUtc = Date.parse(`${wall}:00Z`)
  const offsetAt = (instant: number) => {
    const get = Object.fromEntries(partsFormat(tz).formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
    return Date.parse(`${get.year}-${get.month}-${get.day}T${get.hour}:${get.minute}:${get.second}Z`) - instant
  }
  let instant = asUtc - offsetAt(asUtc)
  instant = asUtc - offsetAt(instant) // 2e passe : stabilise autour des changements d'heure
  return instant
}

export const departureInstant = (trip: { origin_id: string; departure_at: string }) => wallToInstant(trip.departure_at, placeTz(trip.origin_id))
export const arrivalInstant = (trip: { destination_id: string; arrival_at: string }) => wallToInstant(trip.arrival_at, placeTz(trip.destination_id))

/** Heure murale actuelle en Tunisie (toutes les origines sont tunisiennes) : comparable directement à `departure_at`. */
export const nowLocal = () => wallNow('Africa/Tunis')

/** Un colis pèse entre 1 kg et 60 kg, partout dans l'application. */
export const MIN_PARCEL_KG = 1
export const MAX_PARCEL_KG = 60
