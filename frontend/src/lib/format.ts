const pad = (value: number) => String(value).padStart(2, '0')

export const toInput = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const dateInDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return toInput(date) }
export const todayInput = () => dateInDays(0)
export const tomorrowInput = () => dateInDays(1)
/** Valeur pour <input type="datetime-local"> */
export const datetimeInDays = (days: number, time: string) => `${dateInDays(days)}T${time}`

/** '2026-11-24' ou '2026-11-24T08:30' → 24/11/2026 (chiffres latins dans toutes les langues) */
export const fmtDate = (value: string) => {
  if (!value) return ''
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Date locale du serveur ('…T08:30') ou horodatage SQLite UTC ('… 08:30:00') → 24/11/2026 - 08:30 */
export const fmtDateTime = (value: string) => {
  const date = value.includes('T') ? new Date(value) : new Date(`${value.replace(' ', 'T')}Z`)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} - ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const round2 = (value: number) => Math.round(value * 100) / 100
export const formatMoney = (value: number) => `${round2(value).toFixed(2)} €`
export const formatPrice = (value: number) => {
  const rounded = round2(value)
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} €`
}

/**
 * Les dates de trajet sont des heures murales sans fuseau : le départ est à l'heure du lieu de départ,
 * l'arrivée à l'heure du lieu d'arrivée. On les convertit en instants réels avant tout calcul.
 */
const TZ_BY_COUNTRY: Record<string, string> = { tn: 'Africa/Tunis', fr: 'Europe/Paris', it: 'Europe/Rome' }
const placeTz = (placeId: string) => TZ_BY_COUNTRY[placeId.slice(0, 2)] ?? 'UTC'
const parts = (tz: string, instant: number) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
export function wallToInstant(wall: string, tz: string): number {
  const asUtc = Date.parse(`${wall.slice(0, 16)}:00Z`)
  const offsetAt = (instant: number) => { const get = parts(tz, instant); return Date.parse(`${get.year}-${get.month}-${get.day}T${get.hour}:${get.minute}:${get.second}Z`) - instant }
  return asUtc - offsetAt(asUtc - offsetAt(asUtc))
}
type TripTimes = { originId: string; destinationId: string; departureAt: string; arrivalAt: string }
export const departureMs = (trip: TripTimes) => wallToInstant(trip.departureAt, placeTz(trip.originId))
export const arrivalMs = (trip: TripTimes) => wallToInstant(trip.arrivalAt, placeTz(trip.destinationId))
export const tripHours = (trip: TripTimes) => (arrivalMs(trip) - departureMs(trip)) / 36e5
export const hoursUntilArrival = (trip: TripTimes) => (arrivalMs(trip) - Date.now()) / 36e5
