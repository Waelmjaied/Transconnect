import { Router } from 'express'
import { z } from 'zod'
import type { DB } from '../db.js'
import { DESTINATION_IDS, ORIGIN_IDS, nowLocal } from '../domain.js'

/** Repère de marché : aide les transporteurs à fixer leur prix au kilo (public, agrégé, sans donnée personnelle). */
export function insightsRouter(db: DB) {
  const router = Router()
  router.get('/price', (req, res) => {
    const q = z.object({ origin: z.enum(ORIGIN_IDS), destination: z.enum(DESTINATION_IDS) }).parse(req.query)
    const row = db.prepare("SELECT COUNT(*) AS count, AVG(price_per_kg) AS avg, MIN(price_per_kg) AS min, MAX(price_per_kg) AS max FROM trips WHERE status = 'open' AND origin_id = ? AND destination_id = ? AND departure_at > ?").get(q.origin, q.destination, nowLocal()) as { count: number; avg: number | null; min: number | null; max: number | null }
    const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
    res.json({ count: row.count, avg: round(row.avg), min: round(row.min), max: round(row.max), suggested: row.avg === null ? null : Math.round(row.avg * 20) / 20 })
  })
  return router
}
