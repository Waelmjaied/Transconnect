import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { makeAuth, signToken, toAuthUser, type UserRow } from '../auth.js'
import { config } from '../config.js'
import type { DB } from '../db.js'
import { conflict, forbidden, HttpError } from '../errors.js'
import { cancelTrip } from '../services.js'

const LANGS = ['ar', 'en', 'fr', 'de', 'it', 'cs'] as const
const THEMES = ['light', 'dark', 'system'] as const
const password = z.string().min(8).max(72)
const phone = z.string().trim().min(8).max(20)

const registerSchema = z.object({
  name: z.string().trim().min(2).max(70),
  email: z.string().trim().toLowerCase().email().max(120),
  password,
  phone,
  role: z.enum(['customer', 'carrier']), // « admin » ne peut JAMAIS être demandé à l'inscription
  lang: z.enum(LANGS).optional(),
})
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) })
const profileSchema = z.object({ name: z.string().trim().min(2).max(70), phone, lang: z.enum(LANGS), theme: z.enum(THEMES) }).partial().refine((v) => Object.keys(v).length > 0)
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(72), newPassword: password })

// hash factice pour égaliser le temps de réponse quand l'e-mail n'existe pas
const DUMMY_HASH = bcrypt.hashSync('dummy-password', config.bcryptCost)

export function authRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  const session = (row: UserRow) => ({ token: signToken(row), user: toAuthUser(db, row) })
  const byId = (id: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow

  router.post('/register', (req, res) => {
    const input = registerSchema.parse(req.body)
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) throw new HttpError(409, 'EMAIL_TAKEN')
    const id = randomUUID()
    // Client : actif tout de suite. Transporteur : « pending » jusqu'à validation par un admin.
    const status = input.role === 'carrier' ? 'pending' : 'active'
    db.prepare('INSERT INTO users (id, name, email, phone, password_hash, role, status, lang) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, input.name, input.email, input.phone, bcrypt.hashSync(input.password, config.bcryptCost), input.role, status, input.lang ?? null)
    res.status(201).json(session(byId(id)))
  })

  router.post('/login', (req, res) => {
    const input = loginSchema.parse(req.body)
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(input.email) as UserRow | undefined
    const ok = bcrypt.compareSync(input.password, row?.password_hash ?? DUMMY_HASH)
    if (!row || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS')
    if (row.status === 'disabled') throw forbidden('ACCOUNT_DISABLED')
    res.json(session(row))
  })

  router.get('/me', authenticate, (req, res) => res.json({ user: req.user }))

  router.patch('/me', authenticate, requirePermission('profile:update'), (req, res) => {
    const input = profileSchema.parse(req.body)
    const current = byId(req.user!.id)
    db.prepare("UPDATE users SET name = ?, phone = ?, lang = ?, theme = ?, updated_at = datetime('now') WHERE id = ?")
      .run(input.name ?? current.name, input.phone ?? current.phone, input.lang ?? current.lang, input.theme ?? current.theme, current.id)
    res.json({ user: toAuthUser(db, byId(current.id)) })
  })

  // RGPD : export de toutes mes données (JSON) …
  router.get('/me/export', authenticate, (req, res) => {
    const uid = req.user!.id
    const all = (sql: string) => db.prepare(sql).all(uid)
    res.setHeader('Content-Disposition', 'attachment; filename="transconnect-my-data.json"').json({
      exportedAt: new Date().toISOString(),
      profile: req.user,
      bookings: all('SELECT reference, trip_id AS tripId, weight_kg AS weightKg, cargo_type AS cargoType, total_price AS totalPrice, status, created_at AS createdAt FROM bookings WHERE customer_id = ?'),
      trips: all('SELECT id, origin_id AS originId, destination_id AS destinationId, departure_at AS departureAt, arrival_at AS arrivalAt, vehicle_model AS vehicleModel, price_per_kg AS pricePerKg, status FROM trips WHERE carrier_id = ?'),
      messagesSent: all('SELECT booking_id AS bookingId, body, created_at AS createdAt FROM messages WHERE sender_id = ?'),
      reviewsWritten: all('SELECT booking_id AS bookingId, rating, comment, created_at AS createdAt FROM reviews WHERE customer_id = ?'),
      favorites: all('SELECT trip_id AS tripId FROM favorites WHERE user_id = ?'),
      tickets: all('SELECT id, subject, status, created_at AS createdAt FROM tickets WHERE user_id = ?'),
    })
  })

  // … et suppression du compte : données personnelles effacées, historique de transport conservé de façon anonyme.
  router.delete('/me', authenticate, (req, res) => {
    const { password: confirm } = z.object({ password: z.string().min(1).max(72) }).parse(req.body)
    const row = byId(req.user!.id)
    if (!bcrypt.compareSync(confirm, row.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS')
    if (row.role === 'admin' && (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get() as { n: number }).n <= 1) throw conflict('LAST_ADMIN')
    db.transaction(() => {
      for (const trip of db.prepare("SELECT id FROM trips WHERE carrier_id = ? AND status = 'open'").all(row.id) as { id: string }[]) cancelTrip(db, trip.id, row.id)
      db.prepare("UPDATE users SET name = 'Deleted user', email = ?, phone = '', password_hash = '!', status = 'disabled', token_version = token_version + 1, lang = NULL, theme = NULL WHERE id = ?").run(`deleted-${row.id}@deleted.invalid`, row.id)
      for (const table of ['favorites', 'notifications', 'user_permissions']) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(row.id)
      // Données personnelles saisies par l'utilisateur dans le reste de la base : on les efface, on garde l'historique de transport.
      db.prepare("UPDATE bookings SET contact_name = 'Deleted user', contact_phone = '', contact_email = NULL WHERE customer_id = ?").run(row.id)
      db.prepare("UPDATE messages SET body = '[deleted]' WHERE sender_id = ?").run(row.id)
      db.prepare("UPDATE ticket_messages SET body = '[deleted]' WHERE sender_id = ?").run(row.id)
      db.prepare("UPDATE tickets SET subject = '[deleted]' WHERE user_id = ?").run(row.id)
      db.prepare('UPDATE reviews SET comment = NULL WHERE customer_id = ?').run(row.id)
      // Positions GPS des trajets du transporteur.
      db.prepare('DELETE FROM positions WHERE trip_id IN (SELECT id FROM trips WHERE carrier_id = ?)').run(row.id)
    })()
    res.status(204).end()
  })

  router.post('/me/password', authenticate, requirePermission('profile:update'), (req, res) => {
    const input = passwordSchema.parse(req.body)
    const row = byId(req.user!.id)
    if (!bcrypt.compareSync(input.currentPassword, row.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS')
    // token_version + 1 invalide toutes les anciennes sessions ; on renvoie un nouveau jeton.
    db.prepare("UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?").run(bcrypt.hashSync(input.newPassword, config.bcryptCost), row.id)
    res.json(session(byId(row.id)))
  })

  return router
}
