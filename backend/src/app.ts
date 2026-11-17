import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { ZodError } from 'zod'
import { config } from './config.js'
import type { DB } from './db.js'
import { HttpError } from './errors.js'
import { adminRouter } from './routes/admin.js'
import { authRouter } from './routes/auth.js'
import { bookingsRouter } from './routes/bookings.js'
import { favoritesRouter } from './routes/favorites.js'
import { messagesRouter } from './routes/messages.js'
import { notificationsRouter } from './routes/notifications.js'
import { insightsRouter } from './routes/insights.js'
import { ticketsRouter } from './routes/tickets.js'
import { trackingRouter } from './routes/tracking.js'
import { tripsRouter } from './routes/trips.js'

export function createApp(db: DB) {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '50kb' }))

  // Anti brute-force sur la connexion et l'inscription.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => config.isTest, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts' } } })
  app.use('/api/auth/login', authLimiter)
  app.use('/api/auth/register', authLimiter)

  // Anti-abus sur les écritures à fort volume : messages, tickets, positions GPS (le GPS envoie ~1 point / 10 s).
  const writeLimiter = (limit: number) => rateLimit({ windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip: (req) => config.isTest || req.method === 'GET', message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } } })
  app.use('/api/messages', writeLimiter(30))
  app.use('/api/tickets', writeLimiter(20))
  app.use(/^\/api\/trips\/[^/]+\/positions$/, writeLimiter(30))

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api/auth', authRouter(db))
  app.use('/api/trips', tripsRouter(db))
  app.use('/api/bookings', bookingsRouter(db))
  app.use('/api/tracking', trackingRouter(db))
  app.use('/api/favorites', favoritesRouter(db))
  app.use('/api/messages', messagesRouter(db))
  app.use('/api/notifications', notificationsRouter(db))
  app.use('/api/tickets', ticketsRouter(db))
  app.use('/api/insights', insightsRouter(db))
  app.use('/api/admin', adminRouter(db))

  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }))

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } })
    if (error instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid request', details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } })
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Malformed JSON' } })
    console.error(error)
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } })
  }
  app.use(onError)
  return app
}
