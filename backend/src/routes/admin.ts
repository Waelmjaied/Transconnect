import { Router } from 'express'
import { z } from 'zod'
import { makeAuth, toAuthUser, type UserRow } from '../auth.js'
import type { DB } from '../db.js'
import { conflict, notFound } from '../errors.js'
import { ADMIN_ONLY, ALL_PERMISSIONS, isPermission, permissionsFor, rolePermissions } from '../permissions.js'
import { HttpError } from '../errors.js'
import { BOOKING_SELECT, audit, notify, tripDto, TRIP_SELECT } from '../services.js'
import { overridesOf } from '../auth.js'

const patchSchema = z.object({
  role: z.enum(['admin', 'support', 'carrier', 'customer']),
  status: z.enum(['active', 'pending', 'disabled']),
}).partial().refine((v) => Object.keys(v).length > 0)
const listSchema = z.object({
  role: z.enum(['admin', 'support', 'carrier', 'customer']).optional(),
  status: z.enum(['active', 'pending', 'disabled']).optional(),
  q: z.string().trim().max(80).optional(),
})

const publicUser = (db: DB, row: UserRow) => {
  const { permissions: _permissions, ...rest } = toAuthUser(db, row)
  return { ...rest, rating: row.rating, reviewCount: row.review_count, createdAt: row.created_at }
}

export function adminRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate)

  router.get('/users', requirePermission('users:read'), (req, res) => {
    const q = listSchema.parse(req.query)
    const like = q.q ? `%${q.q.replace(/[%_]/g, '')}%` : null
    const rows = db.prepare(`SELECT * FROM users WHERE (? IS NULL OR role = ?) AND (? IS NULL OR status = ?) AND (? IS NULL OR name LIKE ? OR email LIKE ?)
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`)
      .all(q.role ?? null, q.role ?? null, q.status ?? null, q.status ?? null, like, like, like) as UserRow[]
    res.json({ users: rows.map((row) => publicUser(db, row)) })
  })

  router.patch('/users/:id', requirePermission('users:manage'), (req, res) => {
    const input = patchSchema.parse(req.body)
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as UserRow | undefined
    if (!target) throw notFound()
    const role = input.role ?? target.role
    const status = input.status ?? target.status
    if (target.id === req.user!.id && (role !== target.role || status !== target.status)) throw conflict('SELF_MODIFICATION')
    const losesAdmin = target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active')
    if (losesAdmin) {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get() as { n: number }
      if (n <= 1) throw conflict('LAST_ADMIN')
    }
    db.prepare("UPDATE users SET role = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(role, status, target.id)
    audit(db, req.user!.id, 'user.update', 'user', target.id, { role: [target.role, role], status: [target.status, status] })
    if (target.role === 'carrier' && target.status === 'pending' && role === 'carrier' && status === 'active') notify(db, target.id, { type: 'account_approved' })
    res.json({ user: publicUser(db, db.prepare('SELECT * FROM users WHERE id = ?').get(target.id) as UserRow) })
  })

  router.get('/stats', requirePermission('stats:read'), (_req, res) => {
    const group = (sql: string) => Object.fromEntries((db.prepare(sql).all() as { k: string; n: number }[]).map((r) => [r.k, r.n]))
    const money = db.prepare("SELECT COALESCE(SUM(total_price),0) AS revenue, COALESCE(SUM(weight_kg),0) AS kg FROM bookings WHERE status NOT IN ('cancelled','rejected')").get() as { revenue: number; kg: number }
    res.json({
      usersByRole: group('SELECT role AS k, COUNT(*) AS n FROM users GROUP BY role'),
      usersByStatus: group('SELECT status AS k, COUNT(*) AS n FROM users GROUP BY status'),
      tripsByStatus: group('SELECT status AS k, COUNT(*) AS n FROM trips GROUP BY status'),
      bookingsByStatus: group('SELECT status AS k, COUNT(*) AS n FROM bookings GROUP BY status'),
      totalBookedKg: money.kg,
      totalRevenue: money.revenue,
    })
  })


  // ---------- Vue d'ensemble : indicateurs, séries sur 30 jours, classements ----------
  router.get('/overview', requirePermission('stats:read'), (_req, res) => {
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - (29 - i)); return d.toISOString().slice(0, 10) })
    const rows = (sql: string) => db.prepare(sql).all() as Record<string, number | string | null>[]
    const num = (sql: string) => (db.prepare(sql).get() as { n: number | null }).n ?? 0
    const byDay = (sql: string) => new Map(rows(sql).map((r) => [String(r.d), r]))
    const b = byDay("SELECT date(created_at) AS d, COUNT(*) AS n, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','rejected') THEN total_price END),0) AS revenue FROM bookings WHERE created_at >= date('now','-29 days') GROUP BY d")
    const u = byDay("SELECT date(created_at) AS d, COUNT(*) AS n FROM users WHERE created_at >= date('now','-29 days') GROUP BY d")
    const group = (sql: string) => Object.fromEntries(rows(sql).map((r) => [String(r.k), Number(r.n)]))
    const delivered = num("SELECT COUNT(*) AS n FROM bookings WHERE status = 'delivered'")
    const terminal = num("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('delivered','cancelled','rejected')")
    const cap = db.prepare("SELECT COALESCE(SUM(capacity_kg),0) AS cap, COALESCE(SUM(available_kg),0) AS free FROM trips WHERE status = 'open'").get() as { cap: number; free: number }
    res.json({
      kpis: {
        users: num('SELECT COUNT(*) AS n FROM users'),
        newUsers7d: num("SELECT COUNT(*) AS n FROM users WHERE created_at >= date('now','-6 days')"),
        pendingCarriers: num("SELECT COUNT(*) AS n FROM users WHERE role = 'carrier' AND status = 'pending'"),
        openTrips: num("SELECT COUNT(*) AS n FROM trips WHERE status = 'open'"),
        bookings30d: num("SELECT COUNT(*) AS n FROM bookings WHERE created_at >= date('now','-29 days')"),
        revenue30d: num("SELECT SUM(total_price) AS n FROM bookings WHERE created_at >= date('now','-29 days') AND status NOT IN ('cancelled','rejected')"),
        avgRating: num('SELECT ROUND(AVG(rating),2) AS n FROM reviews WHERE hidden = 0'),
        deliveredRate: terminal ? Math.round((delivered / terminal) * 100) : 0,
        fillRate: cap.cap ? Math.round((1 - cap.free / cap.cap) * 100) : 0,
        openTickets: num("SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'"),
      },
      series: days.map((d) => ({ date: d, bookings: Number(b.get(d)?.n ?? 0), revenue: Number(b.get(d)?.revenue ?? 0), signups: Number(u.get(d)?.n ?? 0) })),
      bookingsByStatus: group('SELECT status AS k, COUNT(*) AS n FROM bookings GROUP BY status'),
      topRoutes: rows("SELECT t.origin_id AS originId, t.destination_id AS destinationId, COUNT(b.id) AS bookings, COALESCE(SUM(b.weight_kg),0) AS kg, COALESCE(SUM(b.total_price),0) AS revenue FROM trips t LEFT JOIN bookings b ON b.trip_id = t.id AND b.status NOT IN ('cancelled','rejected') GROUP BY t.origin_id, t.destination_id ORDER BY revenue DESC, bookings DESC LIMIT 5"),
      topCarriers: rows("SELECT u.id, u.name, u.rating, u.review_count AS reviewCount, COUNT(b.id) AS bookings, COALESCE(SUM(b.total_price),0) AS revenue FROM users u JOIN trips t ON t.carrier_id = u.id LEFT JOIN bookings b ON b.trip_id = t.id AND b.status NOT IN ('cancelled','rejected') WHERE u.role = 'carrier' GROUP BY u.id ORDER BY revenue DESC LIMIT 5"),
    })
  })

  // ---------- Modération des trajets ----------
  router.get('/trips', requirePermission('trips:moderate'), (req, res) => {
    const q = z.object({ status: z.enum(['open', 'cancelled']).optional(), q: z.string().trim().max(60).optional() }).parse(req.query)
    const like = q.q ? `%${q.q.replace(/[%_]/g, '')}%` : null
    const rows = db.prepare(`SELECT t.*, u.name AS carrier_name, u.rating, u.review_count, (SELECT COUNT(*) FROM bookings b WHERE b.trip_id = t.id) AS bookings_count,
        (SELECT at FROM positions p WHERE p.trip_id = t.id ORDER BY p.id DESC LIMIT 1) AS last_position_at
      FROM trips t JOIN users u ON u.id = t.carrier_id WHERE (? IS NULL OR t.status = ?) AND (? IS NULL OR u.name LIKE ? OR t.vehicle_model LIKE ?) ORDER BY t.departure_at DESC LIMIT 200`)
      .all(q.status ?? null, q.status ?? null, like, like, like) as (Parameters<typeof tripDto>[0] & { bookings_count: number })[]
    res.json({ trips: rows.map((row) => ({ ...tripDto(row), bookingsCount: row.bookings_count })) })
  })
  void TRIP_SELECT

  // ---------- Modération des avis ----------
  router.get('/reviews', requirePermission('reviews:moderate'), (_req, res) => {
    const rows = db.prepare(`SELECT r.id, r.rating, r.comment, r.hidden, r.created_at AS createdAt, cu.name AS customer, ca.name AS carrier, b.reference
      FROM reviews r JOIN users cu ON cu.id = r.customer_id JOIN users ca ON ca.id = r.carrier_id JOIN bookings b ON b.id = r.booking_id ORDER BY r.id DESC LIMIT 100`).all() as { hidden: number }[]
    res.json({ reviews: rows.map((r) => ({ ...r, hidden: Boolean(r.hidden) })) })
  })
  router.patch('/reviews/:id', requirePermission('reviews:moderate'), (req, res) => {
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body)
    const review = db.prepare('SELECT id, carrier_id, rating, hidden FROM reviews WHERE id = ?').get(req.params.id) as { id: number; carrier_id: string; rating: number; hidden: number } | undefined
    if (!review) throw notFound()
    if (Boolean(review.hidden) !== hidden) {
      db.transaction(() => {
        db.prepare('UPDATE reviews SET hidden = ? WHERE id = ?').run(hidden ? 1 : 0, review.id)
        // La note moyenne du transporteur suit la modération (retrait ou rétablissement de l'avis).
        const c = db.prepare('SELECT rating, review_count AS count FROM users WHERE id = ?').get(review.carrier_id) as { rating: number | null; count: number }
        const count = hidden ? c.count - 1 : c.count + 1
        const rating = count > 0 ? Math.round((((c.rating ?? 0) * c.count + (hidden ? -review.rating : review.rating)) / count) * 100) / 100 : null
        db.prepare('UPDATE users SET rating = ?, review_count = ? WHERE id = ?').run(rating, Math.max(0, count), review.carrier_id)
        audit(db, req.user!.id, hidden ? 'review.hide' : 'review.restore', 'review', String(review.id))
      })()
    }
    res.json({ ok: true })
  })

  // ---------- Journal d'audit ----------
  router.get('/audit', requirePermission('audit:read'), (_req, res) => {
    const rows = db.prepare(`SELECT a.id, a.action, a.target_type AS targetType, a.target_id AS targetId, a.detail, a.at, u.name AS actor FROM audit_log a JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 100`).all() as { detail: string | null }[]
    res.json({ entries: rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })) })
  })

  // ---------- Privilèges individuels : préréglage du rôle + surcharges allow/deny ----------
  const loadTarget = (id: string) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    if (!target) throw notFound()
    return target
  }
  router.get('/users/:id/permissions', requirePermission('users:permissions'), (req, res) => {
    const target = loadTarget(req.params.id)
    const overrides = overridesOf(db, target.id)
    res.json({ role: target.role, status: target.status, base: rolePermissions(target.role), overrides, effective: permissionsFor(target.role, target.status, overrides),
      grantable: ALL_PERMISSIONS.filter((p) => !ADMIN_ONLY.includes(p)), locked: target.role === 'admin' })
  })
  router.put('/users/:id/permissions', requirePermission('users:permissions'), (req, res) => {
    const { overrides } = z.object({ overrides: z.record(z.string(), z.enum(['allow', 'deny'])) }).parse(req.body)
    const target = loadTarget(req.params.id)
    if (target.id === req.user!.id) throw conflict('SELF_MODIFICATION')
    if (target.role === 'admin') throw conflict('ADMIN_PROTECTED')
    for (const key of Object.keys(overrides)) if (!isPermission(key) || ADMIN_ONLY.includes(key)) throw new HttpError(400, 'VALIDATION', `Permission not grantable: ${key}`)
    db.transaction(() => {
      db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(target.id)
      for (const [permission, effect] of Object.entries(overrides)) db.prepare('INSERT INTO user_permissions (user_id, permission, effect) VALUES (?,?,?)').run(target.id, permission, effect)
      audit(db, req.user!.id, 'user.permissions', 'user', target.id, overrides)
    })()
    res.json({ overrides, effective: permissionsFor(target.role, target.status, overrides) })
  })

  // ---------- Export CSV des réservations (protégé contre l'injection de formules) ----------
  router.get('/export/bookings.csv', requirePermission('stats:read', 'bookings:read_all'), (req, res) => {
    const rows = db.prepare(`${BOOKING_SELECT} ORDER BY b.created_at DESC LIMIT 5000`).all() as { reference: string; status: string; created_at: string; origin_id: string; destination_id: string; carrier_name: string; contact_name: string; weight_kg: number; total_price: number }[]
    const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"` }
    const lines = [['reference', 'status', 'created_at', 'origin', 'destination', 'carrier', 'customer', 'weight_kg', 'total_price'].join(',')]
    for (const r of rows) lines.push([r.reference, r.status, r.created_at, r.origin_id, r.destination_id, r.carrier_name, r.contact_name, r.weight_kg, r.total_price].map(cell).join(','))
    audit(db, req.user!.id, 'export.bookings', 'bookings', 'all', { rows: rows.length })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="bookings.csv"').send(lines.join('\n'))
  })

  return router
}
