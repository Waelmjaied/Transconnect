import { Router } from 'express'
import type { DB } from '../db.js'
import { makeAuth } from '../auth.js'
import { notFound } from '../errors.js'

export function favoritesRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate, requirePermission('favorites:manage'))
  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT trip_id FROM favorites WHERE user_id = ?').all(req.user!.id) as { trip_id: string }[]
    res.json({ tripIds: rows.map((row) => row.trip_id) })
  })
  router.put('/:tripId', (req, res) => {
    if (!db.prepare('SELECT 1 FROM trips WHERE id = ?').get(req.params.tripId)) throw notFound()
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, trip_id) VALUES (?,?)').run(req.user!.id, req.params.tripId)
    res.status(204).end()
  })
  router.delete('/:tripId', (req, res) => {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND trip_id = ?').run(req.user!.id, req.params.tripId)
    res.status(204).end()
  })
  return router
}
