import { randomInt, randomUUID } from 'node:crypto'
import type { AuthUser } from './auth.js'
import type { DB } from './db.js'
import { MAX_PARCEL_KG, MIN_PARCEL_KG, type BookingStatus, round2 } from './domain.js'
import { conflict, forbidden, invalid, notFound } from './errors.js'

const MAX_PIN_ATTEMPTS = 5

type TripRow = {
  id: string; carrier_id: string; origin_id: string; destination_id: string
  departure_at: string; arrival_at: string; vehicle_model: string; vehicle_kind: string
  price_per_kg: number; min_kg: number; available_kg: number; capacity_kg: number
  cargo: string; services: string; status: string; carrier_name?: string
  rating?: number | null; review_count?: number; last_position_at?: string | null
}

export const tripDto = (row: TripRow) => ({
  id: row.id,
  carrierId: row.carrier_id,
  carrierName: row.carrier_name ?? null,
  carrierRating: row.rating ?? null,
  reviewCount: row.review_count ?? 0,
  originId: row.origin_id,
  destinationId: row.destination_id,
  departureAt: row.departure_at,
  arrivalAt: row.arrival_at,
  vehicleModel: row.vehicle_model,
  vehicleKind: row.vehicle_kind,
  pricePerKg: row.price_per_kg,
  minKg: row.min_kg,
  availableKg: row.available_kg,
  capacityKg: row.capacity_kg,
  cargo: JSON.parse(row.cargo) as string[],
  services: JSON.parse(row.services) as string[],
  status: row.status,
  lastPositionAt: row.last_position_at ?? null,
})

export const TRIP_SELECT = `SELECT t.*, u.name AS carrier_name, u.rating, u.review_count FROM trips t JOIN users u ON u.id = t.carrier_id`

type BookingJoin = {
  id: string; reference: string; trip_id: string; customer_id: string; weight_kg: number; cargo_type: string
  contact_name: string; contact_phone: string; contact_email: string | null; total_price: number
  status: BookingStatus; created_at: string; updated_at: string
  origin_id: string; destination_id: string; departure_at: string; arrival_at: string
  vehicle_model: string; carrier_id: string; carrier_name: string
  delivery_pin: string; pin_attempts: number; reviewed: number
}

export const BOOKING_SELECT = `SELECT b.*, t.origin_id, t.destination_id, t.departure_at, t.arrival_at, t.vehicle_model, t.carrier_id, u.name AS carrier_name,
  EXISTS(SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS reviewed
  FROM bookings b JOIN trips t ON t.id = b.trip_id JOIN users u ON u.id = t.carrier_id`

export const bookingDto = (row: BookingJoin, viewer: AuthUser) => ({
  id: row.id,
  reference: row.reference,
  tripId: row.trip_id,
  status: row.status,
  weightKg: row.weight_kg,
  cargoType: row.cargo_type,
  totalPrice: row.total_price,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  reviewed: Boolean(row.reviewed),
  // Code de livraison : visible UNIQUEMENT par le client propriétaire, tant que l'envoi est actif.
  deliveryPin: viewer.id === row.customer_id && row.delivery_pin && ['pending', 'confirmed', 'picked_up', 'in_transit', 'arrived'].includes(row.status) ? row.delivery_pin : null,
  trip: { originId: row.origin_id, destinationId: row.destination_id, departureAt: row.departure_at, arrivalAt: row.arrival_at, vehicleModel: row.vehicle_model, carrierName: row.carrier_name },
  // Les coordonnées du client ne sont visibles que par le client lui-même, le transporteur du trajet et un admin.
  contact: viewer.id === row.customer_id || viewer.id === row.carrier_id || viewer.permissions.includes('bookings:read_all') ? { name: row.contact_name, phone: row.contact_phone, email: row.contact_email } : null,
})

/** Renvoie la réservation si l'utilisateur a le droit de la voir, sinon 404 (pas d'énumération). */
export function findBookingFor(db: DB, user: AuthUser, where: 'id' | 'reference', value: string): BookingJoin {
  const row = db.prepare(`${BOOKING_SELECT} WHERE b.${where} = ?`).get(value) as BookingJoin | undefined
  if (!row) throw notFound()
  const allowed = user.permissions.includes('bookings:read_all') || row.customer_id === user.id || row.carrier_id === user.id
  if (!allowed) throw notFound()
  return row
}

const CARRIER_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected'],
  confirmed: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['arrived'],
  arrived: ['delivered'],
  delivered: [], cancelled: [], rejected: [],
}
const CUSTOMER_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = { pending: ['cancelled'], confirmed: ['cancelled'] }
const NON_TERMINAL: BookingStatus[] = ['pending', 'confirmed', 'picked_up', 'in_transit', 'arrived']

/** « Opérateur » : peut agir sur toutes les réservations (admin, ou utilisateur à qui l'admin a accordé ces deux droits). */
export const isOperator = (user: AuthUser) => user.permissions.includes('bookings:read_all') && user.permissions.includes('bookings:manage')

export function allowedTransitions(user: AuthUser, row: BookingJoin): BookingStatus[] {
  const own = row.customer_id === user.id && user.permissions.includes('bookings:cancel') ? CUSTOMER_TRANSITIONS[row.status] ?? [] : []
  let managed: BookingStatus[] = []
  if (user.permissions.includes('bookings:manage') && (isOperator(user) || row.carrier_id === user.id)) {
    managed = CARRIER_TRANSITIONS[row.status]
    if (isOperator(user) && NON_TERMINAL.includes(row.status)) managed = [...managed, 'cancelled']
  }
  return [...new Set([...own, ...managed])]
}

export function addEvent(db: DB, bookingId: string, status: BookingStatus, userId: string, message?: string | null) {
  db.prepare('INSERT INTO tracking_events (booking_id, status, message, created_by) VALUES (?,?,?,?)').run(bookingId, status, message ?? null, userId)
}

export function notify(db: DB, userId: string, n: { type: string; bookingId?: string; reference?: string; status?: string; link?: string }) {
  db.prepare('INSERT INTO notifications (user_id, type, booking_id, reference, status, link) VALUES (?,?,?,?,?,?)').run(userId, n.type, n.bookingId ?? null, n.reference ?? null, n.status ?? null, n.link ?? null)
}

/** Journal d'audit : toute action d'un opérateur/admin sur les données d'autrui est tracée. */
export function audit(db: DB, actorId: string, action: string, targetType: string, targetId: string, detail?: unknown) {
  db.prepare('INSERT INTO audit_log (actor_id, action, target_type, target_id, detail) VALUES (?,?,?,?,?)').run(actorId, action, targetType, targetId, detail === undefined ? null : JSON.stringify(detail))
}

/** Annule un trajet et toutes ses réservations ouvertes (capacité restituée inutile : le trajet est fermé). */
export function cancelTrip(db: DB, tripId: string, actorId: string) {
  db.transaction(() => {
    db.prepare("UPDATE trips SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(tripId)
    const open = db.prepare("SELECT id, reference, customer_id FROM bookings WHERE trip_id = ? AND status IN ('pending','confirmed')").all(tripId) as { id: string; reference: string; customer_id: string }[]
    for (const booking of open) {
      db.prepare("UPDATE bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(booking.id)
      addEvent(db, booking.id, 'cancelled', actorId, 'TRIP_CANCELLED')
      notify(db, booking.customer_id, { type: 'booking_status', bookingId: booking.id, reference: booking.reference, status: 'cancelled' })
    }
  })()
}

/** Le transporteur doit saisir le code que le client lui remet à la livraison. 5 essais max, puis blocage (l'admin peut débloquer en clôturant). */
function verifyDeliveryPin(db: DB, user: AuthUser, id: string, pin: string | undefined) {
  const row = findBookingFor(db, user, 'id', id)
  if (!row.delivery_pin || !allowedTransitions(user, row).includes('delivered')) return
  if (row.pin_attempts >= MAX_PIN_ATTEMPTS) throw conflict('PIN_LOCKED')
  if (pin !== row.delivery_pin) {
    db.prepare('UPDATE bookings SET pin_attempts = pin_attempts + 1 WHERE id = ?').run(id)
    throw invalid('INVALID_PIN')
  }
}

export function changeStatus(db: DB, user: AuthUser, id: string, next: BookingStatus, message?: string, pin?: string) {
  if (next === 'delivered' && !isOperator(user)) verifyDeliveryPin(db, user, id, pin)
  return db.transaction(() => {
    const row = findBookingFor(db, user, 'id', id)
    if (!allowedTransitions(user, row).includes(next)) {
      if (!isOperator(user) && row.carrier_id !== user.id && row.customer_id !== user.id) throw forbidden()
      throw conflict('INVALID_TRANSITION', `${row.status} → ${next} is not allowed`)
    }
    db.prepare("UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, id)
    if (next === 'cancelled' || next === 'rejected') db.prepare('UPDATE trips SET available_kg = MIN(capacity_kg, available_kg + ?) WHERE id = ?').run(row.weight_kg, row.trip_id)
    addEvent(db, id, next, user.id, user.permissions.includes('tracking:write') ? message : undefined)
    if (isOperator(user) && row.carrier_id !== user.id) audit(db, user.id, 'booking.status', 'booking', id, { from: row.status, to: next })
    // Notifie l'autre partie (le client si l'acteur est le transporteur/admin, sinon le transporteur).
    notify(db, user.id === row.customer_id ? row.carrier_id : row.customer_id, { type: 'booking_status', bookingId: id, reference: row.reference, status: next })
    return findBookingFor(db, user, 'id', id)
  })()
}

export function createBooking(db: DB, user: AuthUser, input: { tripId: string; weightKg: number; cargoType: string; contactName: string; contactPhone: string; contactEmail?: string }, nowLocal: string) {
  return db.transaction(() => {
    const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(input.tripId) as TripRow | undefined
    if (!trip || trip.status !== 'open') throw notFound()
    if (trip.carrier_id === user.id) throw conflict('OWN_TRIP')
    if (trip.departure_at <= nowLocal) throw conflict('TRIP_DEPARTED')
    if (!(JSON.parse(trip.cargo) as string[]).includes(input.cargoType)) throw invalid('CARGO_NOT_ACCEPTED')
    // Règle produit : un colis pèse de 1 kg à 60 kg.
    if (input.weightKg < MIN_PARCEL_KG || input.weightKg > MAX_PARCEL_KG) throw invalid('WEIGHT_OUT_OF_RANGE', `A parcel weighs between ${MIN_PARCEL_KG} and ${MAX_PARCEL_KG} kg`)
    if (input.weightKg < trip.min_kg || input.weightKg > trip.available_kg) throw invalid('WEIGHT_OUT_OF_RANGE', `Weight must be between ${trip.min_kg} and ${trip.available_kg} kg`)
    // Décrément atomique : empêche la sur-réservation en cas de requêtes concurrentes.
    const updated = db.prepare("UPDATE trips SET available_kg = available_kg - ?, updated_at = datetime('now') WHERE id = ? AND available_kg >= ?").run(input.weightKg, trip.id, input.weightKg)
    if (updated.changes !== 1) throw conflict('INSUFFICIENT_CAPACITY')
    const id = randomUUID()
    const pin = String(randomInt(0, 10000)).padStart(4, '0')
    let reference = ''
    for (let attempt = 0; attempt < 10; attempt++) {
      reference = `TCX-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`
      if (!db.prepare('SELECT 1 FROM bookings WHERE reference = ?').get(reference)) break
    }
    db.prepare(`INSERT INTO bookings (id, reference, trip_id, customer_id, weight_kg, cargo_type, contact_name, contact_phone, contact_email, total_price, delivery_pin, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')`).run(id, reference, trip.id, user.id, input.weightKg, input.cargoType, input.contactName, input.contactPhone, input.contactEmail ?? null, round2(input.weightKg * trip.price_per_kg), pin)
    addEvent(db, id, 'pending', user.id)
    notify(db, trip.carrier_id, { type: 'booking_created', bookingId: id, reference })
    return findBookingFor(db, user, 'id', id)
  })()
}
