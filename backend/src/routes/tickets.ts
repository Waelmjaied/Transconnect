import { Router } from 'express'
import { z } from 'zod'
import { makeAuth } from '../auth.js'
import type { DB } from '../db.js'
import { forbidden, notFound } from '../errors.js'
import { findBookingFor, notify } from '../services.js'

const createSchema = z.object({ subject: z.string().trim().min(3).max(120), body: z.string().trim().min(1).max(1000), bookingId: z.string().max(64).optional() })
const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) })

type Ticket = { id: number; user_id: string; booking_id: string | null; subject: string; status: 'open' | 'resolved'; created_at: string; updated_at: string }

/** Support / litiges : tout utilisateur ouvre un ticket (éventuellement lié à une de SES réservations) ; le support et l'admin répondent. */
export function ticketsRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate)

  const manages = (user: { permissions: string[] }) => user.permissions.includes('tickets:manage')
  const load = (id: string, user: { id: string; permissions: string[] }) => {
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as Ticket | undefined
    if (!ticket || (ticket.user_id !== user.id && !manages(user))) throw notFound()
    return ticket
  }
  const dto = (t: Ticket & { author?: string; reference?: string | null; last_body?: string | null }) => ({
    id: t.id, subject: t.subject, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at, author: t.author, reference: t.reference ?? null, lastBody: t.last_body ?? null,
  })
  const SELECT = `SELECT t.*, u.name AS author, b.reference AS reference, (SELECT body FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body
    FROM tickets t JOIN users u ON u.id = t.user_id LEFT JOIN bookings b ON b.id = t.booking_id`

  router.post('/', requirePermission('tickets:create'), (req, res) => {
    const input = createSchema.parse(req.body)
    const user = req.user!
    if (input.bookingId) findBookingFor(db, user, 'id', input.bookingId) // 404 si ce n'est pas la réservation de l'utilisateur
    const id = db.transaction(() => {
      const info = db.prepare('INSERT INTO tickets (user_id, booking_id, subject) VALUES (?,?,?)').run(user.id, input.bookingId ?? null, input.subject)
      const ticketId = Number(info.lastInsertRowid)
      db.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, body) VALUES (?,?,?)').run(ticketId, user.id, input.body)
      for (const agent of db.prepare("SELECT id FROM users WHERE role IN ('support','admin') AND status = 'active' AND id <> ?").all(user.id) as { id: string }[]) {
        notify(db, agent.id, { type: 'ticket_new', reference: `#${ticketId}`, link: `/support/${ticketId}` })
      }
      return ticketId
    })()
    res.status(201).json({ id })
  })

  router.get('/', (req, res) => {
    const user = req.user!
    if (!user.permissions.includes('tickets:create') && !manages(user)) throw forbidden()
    const status = z.enum(['open', 'resolved']).optional().parse(req.query.status)
    const where = [manages(user) ? '1=1' : 't.user_id = ?']
    const args: unknown[] = manages(user) ? [] : [user.id]
    if (status) { where.push('t.status = ?'); args.push(status) }
    const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY (t.status = 'open') DESC, t.updated_at DESC LIMIT 100`).all(...args) as Ticket[]
    res.json({ tickets: rows.map(dto) })
  })

  router.get('/:id', (req, res) => {
    const ticket = load(req.params.id, req.user!)
    const full = db.prepare(`${SELECT} WHERE t.id = ?`).get(ticket.id) as Ticket
    const messages = db.prepare('SELECT m.id, m.body, m.created_at AS createdAt, m.sender_id AS senderId, u.name AS sender, u.role AS role FROM ticket_messages m JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id').all(ticket.id) as { senderId: string }[]
    res.json({ ticket: dto(full), messages: messages.map(({ senderId, ...m }) => ({ ...m, mine: senderId === req.user!.id })) })
  })

  router.post('/:id/messages', (req, res) => {
    const { body } = messageSchema.parse(req.body)
    const user = req.user!
    const ticket = load(req.params.id, user)
    db.transaction(() => {
      db.prepare('INSERT INTO ticket_messages (ticket_id, sender_id, body) VALUES (?,?,?)').run(ticket.id, user.id, body)
      // Une réponse du propriétaire rouvre un ticket résolu ; une réponse du support prévient l'utilisateur.
      db.prepare("UPDATE tickets SET updated_at = datetime('now'), status = CASE WHEN ? THEN 'open' ELSE status END WHERE id = ?").run(user.id === ticket.user_id ? 1 : 0, ticket.id)
      if (user.id !== ticket.user_id) notify(db, ticket.user_id, { type: 'ticket_reply', reference: `#${ticket.id}`, link: `/support/${ticket.id}` })
    })()
    res.status(201).json({ ok: true })
  })

  router.patch('/:id', (req, res) => {
    const { status } = z.object({ status: z.enum(['open', 'resolved']) }).parse(req.body)
    const ticket = load(req.params.id, req.user!)
    db.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, ticket.id)
    if (status === 'resolved' && req.user!.id !== ticket.user_id) notify(db, ticket.user_id, { type: 'ticket_resolved', reference: `#${ticket.id}`, link: `/support/${ticket.id}` })
    res.json({ ok: true })
  })

  return router
}
