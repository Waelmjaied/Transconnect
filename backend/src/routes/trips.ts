import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { makeAuth } from '../auth.js'
import type { DB } from '../db.js'
import { CARGO_IDS, DESTINATION_IDS, MAX_PARCEL_KG, MIN_PARCEL_KG, ORIGIN_IDS, SERVICE_IDS, VEHICLE_KINDS, arrivalInstant, departureInstant, nowLocal } from '../domain.js'
import { conflict, forbidden, HttpError, invalid, notFound } from '../errors.js'
import { TRIP_SELECT, audit, cancelTrip, tripDto } from '../services.js'

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
const tripSchema = z.object({
  originId: z.enum(ORIGIN_IDS),
  destinationId: z.enum(DESTINATION_IDS),
  departureAt: dateTime,
  arrivalAt: dateTime,
  vehicleModel: z.string().trim().min(2).max(40),
  vehicleKind: z.enum(VEHICLE_KINDS),
  pricePerKg: z.number().min(0.1).max(50),
  minKg: z.number().min(MIN_PARCEL_KG).max(MAX_PARCEL_KG),
  availableKg: z.number().min(1).max(20000),
  cargo: z.array(z.enum(CARGO_IDS)).min(1),
  services: z.array(z.enum(SERVICE_IDS)).default([]),
})
const patchSchema = z.object({
  pricePerKg: z.number().min(0.1).max(50),
  minKg: z.number().min(MIN_PARCEL_KG).max(MAX_PARCEL_KG),
  availableKg: z.number().min(0).max(20000),
  departureAt: dateTime,
  arrivalAt: dateTime,
  status: z.literal('cancelled'),
}).partial().refine((v) => Object.keys(v).length > 0)
const querySchema = z.object({
  weight: z.coerce.number().min(MIN_PARCEL_KG).max(MAX_PARCEL_KG).optional(),
  cargo: z.enum(CARGO_IDS).optional(),
  vehicle: z.enum(VEHICLE_KINDS).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gps: z.enum(['true', 'false']).optional(),
})

export function tripsRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission, requireAnyPermission } = makeAuth(db)
  const load = (id: string) => db.prepare(`${TRIP_SELECT} WHERE t.id = ?`).get(id) as Parameters<typeof tripDto>[0] | undefined

  // Public : recherche des trajets ouverts et à venir.
  router.get('/', (req, res) => {
    const q = querySchema.parse(req.query)
    const rows = db.prepare(`${TRIP_SELECT} WHERE t.status = 'open' AND t.departure_at > ? AND t.available_kg > 0 ORDER BY t.departure_at LIMIT 200`).all(nowLocal()) as Parameters<typeof tripDto>[0][]
    const trips = rows.map(tripDto).filter((t) =>
      (!q.weight || (q.weight >= t.minKg && q.weight <= t.availableKg)) &&
      (!q.cargo || t.cargo.includes(q.cargo)) &&
      (!q.vehicle || t.vehicleKind === q.vehicle) &&
      (!q.date || t.departureAt.slice(0, 10) >= q.date) &&
      (q.gps !== 'true' || t.services.includes('gps')))
    res.json({ trips })
  })

  router.get('/mine', authenticate, requirePermission('trips:manage'), (req, res) => {
    const rows = db.prepare(`SELECT t.*, u.name AS carrier_name, u.rating, u.review_count, (SELECT at FROM positions p WHERE p.trip_id = t.id ORDER BY p.id DESC LIMIT 1) AS last_position_at FROM trips t JOIN users u ON u.id = t.carrier_id WHERE t.carrier_id = ? ORDER BY t.departure_at DESC`).all(req.user!.id) as Parameters<typeof tripDto>[0][]
    res.json({ trips: rows.map(tripDto) })
  })

  // Avis publics sur le transporteur du trajet (prénom uniquement : pas de données personnelles).
  router.get('/:id/reviews', (req, res) => {
    const trip = db.prepare('SELECT carrier_id FROM trips WHERE id = ?').get(req.params.id) as { carrier_id: string } | undefined
    if (!trip) throw notFound()
    const rows = db.prepare(`SELECT r.rating, r.comment, r.created_at AS createdAt, u.name FROM reviews r JOIN users u ON u.id = r.customer_id WHERE r.carrier_id = ? AND r.hidden = 0 ORDER BY r.id DESC LIMIT 10`).all(trip.carrier_id) as { rating: number; comment: string | null; createdAt: string; name: string }[]
    res.json({ reviews: rows.map(({ name, ...rest }) => ({ ...rest, author: name.split(' ')[0] })) })
  })

  router.get('/:id', (req, res) => {
    const row = load(req.params.id)
    if (!row) throw notFound()
    res.json({ trip: tripDto(row) })
  })

  router.post('/', authenticate, requirePermission('trips:create'), (req, res) => {
    const input = tripSchema.parse(req.body)
    const candidate = { origin_id: input.originId, destination_id: input.destinationId, departure_at: input.departureAt, arrival_at: input.arrivalAt }
    if (arrivalInstant(candidate) <= departureInstant(candidate)) throw invalid('INVALID_DATES')
    if (input.departureAt <= nowLocal()) throw invalid('DEPARTURE_IN_PAST')
    if (input.minKg > input.availableKg) throw invalid('WEIGHT_OUT_OF_RANGE')
    const id = randomUUID()
    db.prepare(`INSERT INTO trips (id, carrier_id, origin_id, destination_id, departure_at, arrival_at, vehicle_model, vehicle_kind, price_per_kg, min_kg, available_kg, capacity_kg, cargo, services)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.user!.id, input.originId, input.destinationId, input.departureAt, input.arrivalAt, input.vehicleModel, input.vehicleKind, input.pricePerKg, input.minKg, input.availableKg, input.availableKg, JSON.stringify(input.cargo), JSON.stringify(input.services))
    res.status(201).json({ trip: tripDto(load(id)!) })
  })

  router.patch('/:id', authenticate, requireAnyPermission('trips:manage', 'trips:moderate'), (req, res) => {
    const input = patchSchema.parse(req.body)
    const existing = load(req.params.id)
    if (!existing) throw notFound()
    // Un transporteur ne modifie que SES trajets ; l'admin peut tout modifier.
    const moderator = req.user!.permissions.includes('trips:moderate')
    if (!moderator && existing.carrier_id !== req.user!.id) throw forbidden()
    // Un modérateur qui n'est pas le propriétaire peut seulement ANNULER le trajet (pas modifier prix, dates, capacité).
    const fullControl = req.user!.permissions.includes('trips:manage') && moderator // admin (ou droit accordé explicitement)
    if (existing.carrier_id !== req.user!.id && !fullControl && Object.keys(input).some((key) => key !== 'status')) throw forbidden()
    const next = {
      price: input.pricePerKg ?? existing.price_per_kg, min: input.minKg ?? existing.min_kg,
      avail: input.availableKg ?? existing.available_kg, dep: input.departureAt ?? existing.departure_at, arr: input.arrivalAt ?? existing.arrival_at,
    }
    if (arrivalInstant({ destination_id: existing.destination_id, arrival_at: next.arr }) <= departureInstant({ origin_id: existing.origin_id, departure_at: next.dep })) throw invalid('INVALID_DATES')
    if (next.min > next.avail) throw invalid('WEIGHT_OUT_OF_RANGE')
    db.transaction(() => {
      db.prepare("UPDATE trips SET price_per_kg = ?, min_kg = ?, available_kg = ?, capacity_kg = MAX(capacity_kg, ?), departure_at = ?, arrival_at = ?, updated_at = datetime('now') WHERE id = ?")
        .run(next.price, next.min, next.avail, next.avail, next.dep, next.arr, existing.id)
    })()
    if (input.status === 'cancelled') {
      cancelTrip(db, existing.id, req.user!.id)
      if (existing.carrier_id !== req.user!.id) audit(db, req.user!.id, 'trip.cancel', 'trip', existing.id)
    }
    res.json({ trip: tripDto(load(existing.id)!) })
  })

  // Position GPS en direct : le transporteur du trajet (appareil mobile) envoie sa position toutes les ~10 s.
  const positionSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), speed: z.number().min(0).max(120).nullish(), heading: z.number().min(0).max(360).nullish(), accuracy: z.number().min(0).max(100000).nullish() })
  router.post('/:id/positions', authenticate, requirePermission('tracking:write'), (req, res) => {
    const input = positionSchema.parse(req.body)
    const trip = db.prepare('SELECT id, carrier_id, status FROM trips WHERE id = ?').get(req.params.id) as { id: string; carrier_id: string; status: string } | undefined
    if (!trip) throw notFound()
    if (trip.carrier_id !== req.user!.id) throw forbidden() // seul le transporteur du trajet partage sa position
    if (trip.status !== 'open') throw conflict('TRIP_CLOSED')
    const last = db.prepare("SELECT CAST((julianday('now') - julianday(at)) * 86400 AS INTEGER) AS age FROM positions WHERE trip_id = ? ORDER BY id DESC LIMIT 1").get(trip.id) as { age: number } | undefined
    if (last && last.age < 4) throw new HttpError(429, 'TOO_FREQUENT')
    db.prepare('INSERT INTO positions (trip_id, lat, lng, speed, heading, accuracy) VALUES (?,?,?,?,?,?)').run(trip.id, input.lat, input.lng, input.speed ?? null, input.heading ?? null, input.accuracy ?? null)
    db.prepare('DELETE FROM positions WHERE trip_id = ? AND id NOT IN (SELECT id FROM positions WHERE trip_id = ? ORDER BY id DESC LIMIT 500)').run(trip.id, trip.id)
    res.status(201).json({ ok: true })
  })

  router.delete('/:id', authenticate, requirePermission('trips:manage'), (req, res) => {
    const existing = load(req.params.id)
    if (!existing) throw notFound()
    if (!req.user!.permissions.includes('trips:moderate') && existing.carrier_id !== req.user!.id) throw forbidden()
    if (db.prepare('SELECT 1 FROM bookings WHERE trip_id = ?').get(existing.id)) throw conflict('TRIP_HAS_BOOKINGS')
    db.prepare('DELETE FROM trips WHERE id = ?').run(existing.id)
    res.status(204).end()
  })

  return router
}
