import { Router } from 'express'
import { z } from 'zod'
import { makeAuth } from '../auth.js'
import type { DB } from '../db.js'
import { notFound } from '../errors.js'

const bodySchema = z.object({ body: z.string().trim().min(1).max(1000) })

type Participant = { id: string; customer_id: string; carrier_id: string; reference: string; customer_name: string; carrier_name: string }

export function messagesRouter(db: DB) {
  const router = Router()
  const { authenticate, requirePermission } = makeAuth(db)
  router.use(authenticate)

  /** Seuls le client et le transporteur de la réservation participent à la conversation. L'admin n'a PAS accès aux messages privés. */
  const participant = (bookingId: string, userId: string): Participant => {
    const row = db.prepare(`SELECT b.id, b.customer_id, t.carrier_id, b.reference, cu.name AS customer_name, ca.name AS carrier_name
      FROM bookings b JOIN trips t ON t.id = b.trip_id JOIN users cu ON cu.id = b.customer_id JOIN users ca ON ca.id = t.carrier_id WHERE b.id = ?`).get(bookingId) as Participant | undefined
    if (!row || (row.customer_id !== userId && row.carrier_id !== userId)) throw notFound()
    return row
  }

  router.get('/', requirePermission('messages:use'), (req, res) => {
    const uid = req.user!.id
    const rows = db.prepare(`SELECT b.id AS bookingId, b.reference, b.status, t.origin_id AS originId, t.destination_id AS destinationId,
        cu.name AS customerName, ca.name AS carrierName, b.customer_id AS customerId,
        (SELECT body FROM messages m WHERE m.booking_id = b.id ORDER BY m.id DESC LIMIT 1) AS lastBody,
        (SELECT created_at FROM messages m WHERE m.booking_id = b.id ORDER BY m.id DESC LIMIT 1) AS lastAt,
        (SELECT COUNT(*) FROM messages m WHERE m.booking_id = b.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread,
        b.created_at AS createdAt
      FROM bookings b JOIN trips t ON t.id = b.trip_id JOIN users cu ON cu.id = b.customer_id JOIN users ca ON ca.id = t.carrier_id
      WHERE b.customer_id = ? OR t.carrier_id = ? ORDER BY COALESCE(lastAt, b.created_at) DESC LIMIT 100`).all(uid, uid, uid) as (Record<string, unknown> & { customerId: string; customerName: string; carrierName: string })[]
    res.json({ conversations: rows.map(({ customerId, customerName, carrierName, ...rest }) => ({ ...rest, counterpart: customerId === uid ? carrierName : customerName })) })
  })

  router.get('/:bookingId', requirePermission('messages:use'), (req, res) => {
    const uid = req.user!.id
    const p = participant(req.params.bookingId, uid)
    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE booking_id = ? AND sender_id <> ? AND read_at IS NULL").run(p.id, uid)
    const rows = db.prepare('SELECT id, sender_id AS senderId, body, created_at AS createdAt FROM messages WHERE booking_id = ? ORDER BY id DESC LIMIT 200').all(p.id) as { id: number; senderId: string; body: string; createdAt: string }[]
    res.json({
      reference: p.reference,
      counterpart: p.customer_id === uid ? p.carrier_name : p.customer_name,
      messages: rows.reverse().map(({ senderId, ...m }) => ({ ...m, mine: senderId === uid })),
    })
  })

  router.post('/:bookingId', requirePermission('messages:use'), (req, res) => {
    const { body } = bodySchema.parse(req.body)
    const p = participant(req.params.bookingId, req.user!.id)
    const info = db.prepare('INSERT INTO messages (booking_id, sender_id, body) VALUES (?,?,?)').run(p.id, req.user!.id, body)
    res.status(201).json({ message: { id: Number(info.lastInsertRowid), body, mine: true, createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ') } })
  })

  return router
}
