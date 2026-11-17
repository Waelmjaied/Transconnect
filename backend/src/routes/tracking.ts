import { Router } from 'express'
import type { DB } from '../db.js'
import { makeAuth } from '../auth.js'
import { bookingDto, findBookingFor } from '../services.js'

type Point = { lat: number; lng: number; speed: number | null; heading: number | null; at: string }

export function trackingRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  // Le suivi est réservé au client concerné, au transporteur du trajet et aux profils autorisés (support/admin).
  router.get('/:reference', authenticate, requirePermission('tracking:read'), (req, res) => {
    const user = req.user!
    const row = findBookingFor(db, user, 'reference', req.params.reference.toUpperCase())
    const events = db.prepare('SELECT status, message, created_at AS createdAt FROM tracking_events WHERE booking_id = ? ORDER BY id').all(row.id)
    // La position du transporteur n'est visible par le client que pendant le transport (jamais avant la prise en charge ni après la livraison).
    const inTransit = ['picked_up', 'in_transit', 'arrived'].includes(row.status)
    const privileged = row.carrier_id === user.id || user.permissions.includes('bookings:read_all')
    let position: Point | null = null
    let trail: Point[] = []
    if (inTransit || privileged) {
      const rows = db.prepare('SELECT lat, lng, speed, heading, at FROM positions WHERE trip_id = ? ORDER BY id DESC LIMIT 120').all(row.trip_id) as Point[]
      trail = rows.reverse()
      position = trail.at(-1) ?? null
    }
    res.json({ booking: bookingDto(row, user), events, position, trail })
  })
  return router
}
