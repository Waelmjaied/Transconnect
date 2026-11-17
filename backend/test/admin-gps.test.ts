import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'
import { ensureAdmin } from '../src/seed.js'

let app: ReturnType<typeof createApp>
const api = () => request(app)
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })
const future = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:00` }
async function signup(role: 'customer' | 'carrier', email: string, name = 'Test User') {
  const res = await api().post('/api/auth/register').send({ name, email, password: 'Secret#1234', phone: '+21611111111', role })
  return { token: res.body.token as string, id: res.body.user.id as string }
}
const adminToken = async () => (await api().post('/api/auth/login').send({ email: 'admin@transconnect.local', password: 'Admin#12345' })).body.token as string
async function world() {
  const admin = await adminToken()
  const carrier = await signup('carrier', 'k@x.tc', 'Cargo Co')
  await api().patch(`/api/admin/users/${carrier.id}`).set(auth(admin)).send({ status: 'active' }).expect(200)
  const customer = await signup('customer', 'c@x.tc', 'Amine Ben Ali')
  const other = await signup('customer', 'c2@x.tc')
  const trip = (await api().post('/api/trips').set(auth(carrier.token)).send({ originId: 'tn-tunis', destinationId: 'fr-marseille', departureAt: future(3), arrivalAt: future(4), vehicleModel: 'Master', vehicleKind: 'van', pricePerKg: 1.1, minKg: 1, availableKg: 300, cargo: ['parcels'], services: ['gps'] })).body.trip
  const book = (token: string, weightKg: number) => api().post('/api/bookings').set(auth(token)).send({ tripId: trip.id, weightKg, cargoType: 'parcels', contactName: 'Amine', contactPhone: '+21622222222' })
  return { admin, carrier, customer, other, trip, book }
}
beforeEach(() => { const db = openDb(':memory:'); ensureAdmin(db); app = createApp(db) })

describe('colis de 1 à 60 kg', () => {
  it('accepte 1 kg et 60 kg, refuse 0.5 / 61 kg (même si le trajet a de la place)', async () => {
    const w = await world()
    await w.book(w.customer.token, 1).expect(201)
    await w.book(w.customer.token, 60).expect(201)
    expect((await w.book(w.customer.token, 61)).body.error.code).toBe('WEIGHT_OUT_OF_RANGE')
    expect((await w.book(w.customer.token, 0.5)).body.error.code).toBe('WEIGHT_OUT_OF_RANGE')
  })
  it('recherche et publication respectent la borne de 60 kg', async () => {
    const w = await world()
    await api().get('/api/trips?weight=61').expect(400)
    await api().get('/api/trips?weight=0').expect(400)
    expect((await api().get('/api/trips?weight=1')).body.trips).toHaveLength(1)
    await api().post('/api/trips').set(auth(w.carrier.token)).send({ originId: 'tn-tunis', destinationId: 'it-rome', departureAt: future(5), arrivalAt: future(6), vehicleModel: 'Daily', vehicleKind: 'van', pricePerKg: 1, minKg: 61, availableKg: 100, cargo: ['parcels'], services: [] }).expect(400)
  })
})

describe('GPS en direct', () => {
  it('seul le transporteur du trajet publie ; le client ne voit la position que pendant le transport', async () => {
    const w = await world()
    const booking = (await w.book(w.customer.token, 10)).body.booking
    const gps = (token: string, lat = 37.5) => api().post(`/api/trips/${w.trip.id}/positions`).set(auth(token)).send({ lat, lng: 9.5, speed: 12 })
    await gps(w.customer.token).expect(403)
    const stranger = await signup('carrier', 'k2@x.tc')
    await api().patch(`/api/admin/users/${stranger.id}`).set(auth(w.admin)).send({ status: 'active' })
    await gps(stranger.token).expect(403)
    await api().post(`/api/trips/${w.trip.id}/positions`).set(auth(w.carrier.token)).send({ lat: 95, lng: 0 }).expect(400)
    await gps(w.carrier.token).expect(201)
    expect((await gps(w.carrier.token)).body.error.code).toBe('TOO_FREQUENT')
    const before = (await api().get(`/api/tracking/${booking.reference}`).set(auth(w.customer.token))).body
    expect(before.position).toBeNull() // pas encore en transport
    for (const s of ['confirmed', 'picked_up', 'in_transit']) await api().patch(`/api/bookings/${booking.id}/status`).set(auth(w.carrier.token)).send({ status: s }).expect(200)
    const during = (await api().get(`/api/tracking/${booking.reference}`).set(auth(w.customer.token))).body
    expect(during.position).toMatchObject({ lat: 37.5, lng: 9.5 })
    expect((await api().get(`/api/tracking/${booking.reference}`).set(auth(w.carrier.token))).body.position).not.toBeNull()
  })
})

describe('privilèges individuels (surcharges)', () => {
  it('l’admin peut accorder ou retirer un droit ; effet immédiat ; journalisé', async () => {
    const w = await world()
    await api().get('/api/admin/stats').set(auth(w.customer.token)).expect(403)
    await api().put(`/api/admin/users/${w.customer.id}/permissions`).set(auth(w.admin)).send({ overrides: { 'stats:read': 'allow', 'bookings:create': 'deny' } }).expect(200)
    await api().get('/api/admin/stats').set(auth(w.customer.token)).expect(200)
    await w.book(w.customer.token, 5).expect(403)
    const perms = (await api().get(`/api/admin/users/${w.customer.id}/permissions`).set(auth(w.admin))).body
    expect(perms.effective).toContain('stats:read')
    expect(perms.effective).not.toContain('bookings:create')
    const audit = (await api().get('/api/admin/audit').set(auth(w.admin))).body.entries
    expect(audit[0]).toMatchObject({ action: 'user.permissions', targetId: w.customer.id })
  })
  it('droits réservés à l’admin non accordables ; pas d’auto-modification ; admin protégé ; non-admin refusé', async () => {
    const w = await world()
    const put = (token: string, id: string, overrides: object) => api().put(`/api/admin/users/${id}/permissions`).set(auth(token)).send({ overrides })
    expect((await put(w.admin, w.customer.id, { 'users:manage': 'allow' })).status).toBe(400)
    expect((await put(w.admin, w.customer.id, { 'nope:nope': 'allow' })).status).toBe(400)
    const me = (await api().get('/api/auth/me').set(auth(w.admin))).body.user
    expect((await put(w.admin, me.id, {})).body.error.code).toBe('SELF_MODIFICATION')
    await put(w.customer.token, w.other.id, { 'stats:read': 'allow' }).expect(403)
    await api().get('/api/admin/audit').set(auth(w.customer.token)).expect(403)
  })
  it('une surcharge ne contourne pas la validation d’un transporteur en attente', async () => {
    const w = await world()
    const pending = await signup('carrier', 'p@x.tc')
    await api().put(`/api/admin/users/${pending.id}/permissions`).set(auth(w.admin)).send({ overrides: { 'trips:create': 'allow' } }).expect(200)
    expect((await api().post('/api/trips').set(auth(pending.token)).send({})).body.error.code).toBe('CARRIER_NOT_APPROVED')
  })
})

describe('rôle support', () => {
  async function support(w: Awaited<ReturnType<typeof world>>) {
    const s = await signup('customer', 'sup@x.tc', 'Agent')
    await api().patch(`/api/admin/users/${s.id}`).set(auth(w.admin)).send({ role: 'support' }).expect(200)
    return s
  }
  it('voit tout en lecture, ne peut ni gérer les utilisateurs ni changer un statut, pas d’accès aux messages privés', async () => {
    const w = await world()
    const s = await support(w)
    const booking = (await w.book(w.customer.token, 5)).body.booking
    expect((await api().get('/api/bookings').set(auth(s.token))).body.bookings).toHaveLength(1)
    expect((await api().get(`/api/bookings/${booking.id}`).set(auth(s.token))).body.booking.deliveryPin).toBeNull()
    await api().get('/api/admin/users').set(auth(s.token)).expect(200)
    await api().patch(`/api/admin/users/${w.other.id}`).set(auth(s.token)).send({ role: 'admin' }).expect(403)
    await api().patch(`/api/bookings/${booking.id}/status`).set(auth(s.token)).send({ status: 'confirmed' }).expect(403)
    await api().post(`/api/messages/${booking.id}`).set(auth(s.token)).send({ body: 'x' }).expect(403)
    await api().get('/api/admin/audit').set(auth(s.token)).expect(403)
  })
  it('modère les avis et annule un trajet (audité)', async () => {
    const w = await world()
    const s = await support(w)
    const booking = (await w.book(w.customer.token, 5)).body.booking
    for (const st of ['confirmed', 'picked_up', 'in_transit', 'arrived']) await api().patch(`/api/bookings/${booking.id}/status`).set(auth(w.carrier.token)).send({ status: st }).expect(200)
    const pin = booking.deliveryPin
    await api().patch(`/api/bookings/${booking.id}/status`).set(auth(w.carrier.token)).send({ status: 'delivered', pin }).expect(200)
    await api().post(`/api/bookings/${booking.id}/review`).set(auth(w.customer.token)).send({ rating: 1, comment: 'spam' }).expect(201)
    const id = (await api().get('/api/admin/reviews').set(auth(s.token))).body.reviews[0].id
    await api().patch(`/api/admin/reviews/${id}`).set(auth(s.token)).send({ hidden: true }).expect(200)
    expect((await api().get(`/api/trips/${w.trip.id}/reviews`)).body.reviews).toHaveLength(0)
    expect((await api().get(`/api/trips/${w.trip.id}`)).body.trip.reviewCount).toBe(0)
    await api().patch(`/api/admin/reviews/${id}`).set(auth(s.token)).send({ hidden: false }).expect(200)
    expect((await api().get(`/api/trips/${w.trip.id}`)).body.trip.carrierRating).toBe(1)
    await api().patch(`/api/trips/${w.trip.id}`).set(auth(s.token)).send({ status: 'cancelled' }).expect(200)
    const audit = (await api().get('/api/admin/audit').set(auth(w.admin))).body.entries.map((e: { action: string }) => e.action)
    expect(audit).toEqual(expect.arrayContaining(['review.hide', 'review.restore', 'trip.cancel']))
  })
})

describe('tickets de support', () => {
  it('l’utilisateur ouvre un ticket, le support répond et résout ; isolation entre utilisateurs', async () => {
    const w = await world()
    const agent = await signup('customer', 'sup@x.tc', 'Agent')
    await api().patch(`/api/admin/users/${agent.id}`).set(auth(w.admin)).send({ role: 'support' })
    const booking = (await w.book(w.customer.token, 5)).body.booking
    await api().post('/api/tickets').set(auth(w.other.token)).send({ subject: 'Problème', body: 'x', bookingId: booking.id }).expect(404) // pas sa réservation
    const { id } = (await api().post('/api/tickets').set(auth(w.customer.token)).send({ subject: 'Colis endommagé', body: 'Bonjour', bookingId: booking.id })).body
    await api().get(`/api/tickets/${id}`).set(auth(w.other.token)).expect(404)
    expect((await api().get('/api/tickets').set(auth(w.other.token))).body.tickets).toHaveLength(0)
    expect((await api().get('/api/tickets').set(auth(agent.token))).body.tickets).toHaveLength(1)
    await api().post(`/api/tickets/${id}/messages`).set(auth(agent.token)).send({ body: 'Nous traitons votre demande' }).expect(201)
    const n = (await api().get('/api/notifications').set(auth(w.customer.token))).body.notifications
    expect(n.some((x: { type: string; link: string }) => x.type === 'ticket_reply' && x.link === `/support/${id}`)).toBe(true)
    await api().patch(`/api/tickets/${id}`).set(auth(agent.token)).send({ status: 'resolved' }).expect(200)
    const thread = (await api().get(`/api/tickets/${id}`).set(auth(w.customer.token))).body
    expect(thread.ticket.status).toBe('resolved')
    expect(thread.messages).toHaveLength(2)
    await api().post(`/api/tickets/${id}/messages`).set(auth(w.customer.token)).send({ body: 'Toujours un souci' }).expect(201)
    expect((await api().get(`/api/tickets/${id}`).set(auth(w.customer.token))).body.ticket.status).toBe('open')
  })
})

describe('tableau de bord, export, RGPD, insights', () => {
  it('vue d’ensemble complète, réservée aux profils autorisés', async () => {
    const w = await world()
    await w.book(w.customer.token, 10).expect(201)
    const o = (await api().get('/api/admin/overview').set(auth(w.admin))).body
    expect(o.series).toHaveLength(30)
    expect(o.kpis).toMatchObject({ users: 4, pendingCarriers: 0, openTrips: 1, bookings30d: 1 })
    expect(o.kpis.revenue30d).toBeCloseTo(11)
    expect(o.topRoutes[0]).toMatchObject({ originId: 'tn-tunis', destinationId: 'fr-marseille', bookings: 1 })
    await api().get('/api/admin/overview').set(auth(w.customer.token)).expect(403)
    const trips = (await api().get('/api/admin/trips').set(auth(w.admin))).body.trips
    expect(trips[0].bookingsCount).toBe(1)
    await api().get('/api/admin/trips').set(auth(w.carrier.token)).expect(403)
  })
  it('export CSV : neutralise les formules', async () => {
    const w = await world()
    await api().post('/api/bookings').set(auth(w.customer.token)).send({ tripId: w.trip.id, weightKg: 5, cargoType: 'parcels', contactName: '=HYPERLINK("http://evil")', contactPhone: '+21622222222' }).expect(201)
    const csv = (await api().get('/api/admin/export/bookings.csv').set(auth(w.admin))).text
    expect(csv).toContain("\"'=HYPERLINK")
    await api().get('/api/admin/export/bookings.csv').set(auth(w.customer.token)).expect(403)
  })
  it('RGPD : export de mes données puis suppression avec mot de passe', async () => {
    const w = await world()
    await w.book(w.customer.token, 5)
    const data = (await api().get('/api/auth/me/export').set(auth(w.customer.token))).body
    expect(data.bookings).toHaveLength(1)
    expect(JSON.stringify(data)).not.toContain('password')
    await api().delete('/api/auth/me').set(auth(w.customer.token)).send({ password: 'wrong' }).expect(401)
    await api().delete('/api/auth/me').set(auth(w.customer.token)).send({ password: 'Secret#1234' }).expect(204)
    await api().get('/api/auth/me').set(auth(w.customer.token)).expect(401)
    expect((await api().post('/api/auth/login').send({ email: 'c@x.tc', password: 'Secret#1234' })).status).toBe(401)
  })
  it('RGPD : la suppression efface aussi contacts, messages et avis du client', async () => {
    const w = await world()
    const booking = (await w.book(w.customer.token, 5)).body.booking
    await api().post(`/api/messages/${booking.id}`).set(auth(w.customer.token)).send({ body: 'Mon adresse : 12 rue X' }).expect(201)
    await api().delete('/api/auth/me').set(auth(w.customer.token)).send({ password: 'Secret#1234' }).expect(204)
    const seen = (await api().get(`/api/bookings/${booking.id}`).set(auth(w.carrier.token))).body.booking
    expect(seen.contact).toMatchObject({ name: 'Deleted user', phone: '', email: null })
    const messages = JSON.stringify((await api().get(`/api/messages/${booking.id}`).set(auth(w.carrier.token))).body)
    expect(messages).not.toContain('12 rue X')
    expect(messages).toContain('[deleted]')
  })
  it('repère de marché sur le prix au kilo', async () => {
    const w = await world()
    const res = (await api().get('/api/insights/price?origin=tn-tunis&destination=fr-marseille')).body
    expect(res).toMatchObject({ count: 1, avg: 1.1, suggested: 1.1 })
    expect((await api().get('/api/insights/price?origin=tn-tunis&destination=it-rome')).body.avg).toBeNull()
    void w
  })
})
