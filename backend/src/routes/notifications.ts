import { Router } from 'express'
import type { DB } from '../db.js'
import { makeAuth } from '../auth.js'

export function notificationsRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate, requirePermission('notifications:read'))

  // Compteurs légers pour le polling de l'application (badge cloche + badge messages).
  router.get('/summary', (req, res) => {
    const uid = req.user!.id
    const n = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(uid) as { n: number }
    const m = db.prepare(`SELECT COUNT(*) AS n FROM messages m JOIN bookings b ON b.id = m.booking_id JOIN trips t ON t.id = b.trip_id
      WHERE m.read_at IS NULL AND m.sender_id <> ? AND (b.customer_id = ? OR t.carrier_id = ?)`).get(uid, uid, uid) as { n: number }
    res.json({ notifications: n.n, messages: m.n })
  })

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT id, type, booking_id AS bookingId, reference, status, link, created_at AS createdAt, read_at IS NOT NULL AS read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user!.id) as { read: number }[]
    res.json({ notifications: rows.map((row) => ({ ...row, read: Boolean(row.read) })) })
  })

  router.post('/read-all', (req, res) => {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user!.id)
    res.status(204).end()
  })

  return router
}
