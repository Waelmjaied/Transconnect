import { Router } from 'express'
import { z } from 'zod'
import { makeAuth, type AuthUser } from '../auth.js'
import type { DB } from '../db.js'
import { BOOKING_STATUSES, CARGO_IDS, nowLocal } from '../domain.js'
import { conflict, forbidden } from '../errors.js'
import { BOOKING_SELECT, addEvent, notify, allowedTransitions, bookingDto, changeStatus, createBooking, findBookingFor } from '../services.js'

const createSchema = z.object({
  tripId: z.string().min(1).max(64),
  weightKg: z.number().positive().max(20000),
  cargoType: z.enum(CARGO_IDS),
  contactName: z.string().trim().min(2).max(70),
  contactPhone: z.string().trim().min(8).max(20),
  contactEmail: z.string().trim().email().max(120).optional(),
})
const statusSchema = z.object({ status: z.enum(BOOKING_STATUSES), message: z.string().trim().max(200).optional(), pin: z.string().regex(/^\d{4}$/).optional() })
const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(400).optional() })
const eventSchema = z.object({ message: z.string().trim().min(1).max(200) })

type Row = Parameters<typeof bookingDto>[0]

export function bookingsRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate)

  const withActions = (row: Row, user: AuthUser) => ({ ...bookingDto(row, user), allowedActions: allowedTransitions(user, row) })

  router.post('/', requirePermission('bookings:create'), (req, res) => {
    const input = createSchema.parse(req.body)
    const row = createBooking(db, req.user!, input, nowLocal())
    res.status(201).json({ booking: withActions(row, req.user!) })
  })

  // Portée selon le rôle : client = ses réservations ; transporteur = celles de ses trajets ; admin = toutes.
  router.get('/', requirePermission('bookings:read'), (req, res) => {
    const user = req.user!
    const filters = z.object({ status: z.enum(BOOKING_STATUSES).optional(), q: z.string().trim().max(60).optional() }).parse(req.query)
    // Portée : droit « read_all » (support/admin) = toutes ; sinon transporteur = ses trajets ; sinon client = les siennes.
    const where: string[] = []
    const args: unknown[] = []
    if (!user.permissions.includes('bookings:read_all')) { where.push(user.role === 'carrier' ? 't.carrier_id = ?' : 'b.customer_id = ?'); args.push(user.id) }
    if (filters.status) { where.push('b.status = ?'); args.push(filters.status) }
    if (filters.q) { where.push('(b.reference LIKE ? OR b.contact_name LIKE ?)'); args.push(`%${filters.q.replace(/[%_]/g, '')}%`, `%${filters.q.replace(/[%_]/g, '')}%`) }
    const rows = db.prepare(`${BOOKING_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.created_at DESC LIMIT 200`).all(...args) as Row[]
    res.json({ bookings: rows.map((row) => withActions(row, user)) })
  })

  router.get('/:id', requirePermission('bookings:read'), (req, res) => {
    res.json({ booking: withActions(findBookingFor(db, req.user!, 'id', req.params.id), req.user!) })
  })

  router.patch('/:id/status', (req, res) => {
    const input = statusSchema.parse(req.body)
    const user = req.user!
    if (!user.permissions.includes('bookings:manage') && !user.permissions.includes('bookings:cancel')) throw forbidden()
    res.json({ booking: withActions(changeStatus(db, user, req.params.id, input.status, input.message, input.pin), user) })
  })

  // Note de suivi libre (ex. « embarqué sur le ferry GNV ») sans changer le statut.
  router.post('/:id/events', requirePermission('tracking:write'), (req, res) => {
    const { message } = eventSchema.parse(req.body)
    const user = req.user!
    const row = findBookingFor(db, user, 'id', req.params.id)
    if (!user.permissions.includes('bookings:read_all') && row.carrier_id !== user.id) throw forbidden()
    addEvent(db, row.id, row.status, user.id, message)
    res.status(201).json({ ok: true })
  })

  // Évaluation du transporteur : seulement le client propriétaire, une seule fois, après livraison.
  router.post('/:id/review', requirePermission('reviews:create'), (req, res) => {
    const input = reviewSchema.parse(req.body)
    const user = req.user!
    const row = findBookingFor(db, user, 'id', req.params.id)
    if (row.customer_id !== user.id) throw forbidden()
    if (row.status !== 'delivered') throw conflict('NOT_DELIVERED')
    if (row.reviewed) throw conflict('ALREADY_REVIEWED')
    db.transaction(() => {
      db.prepare('INSERT INTO reviews (booking_id, carrier_id, customer_id, rating, comment) VALUES (?,?,?,?,?)').run(row.id, row.carrier_id, user.id, input.rating, input.comment || null)
      db.prepare('UPDATE users SET rating = ROUND((COALESCE(rating, 0) * review_count + ?) / (review_count + 1), 2), review_count = review_count + 1 WHERE id = ?').run(input.rating, row.carrier_id)
      notify(db, row.carrier_id, { type: 'review', bookingId: row.id, reference: row.reference })
    })()
    res.status(201).json({ ok: true })
  })

  return router
}
