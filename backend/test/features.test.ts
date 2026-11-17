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

async function scenario() {
  const carrier = await signup('carrier', 'k@x.tc', 'Cargo Co')
  await api().patch(`/api/admin/users/${carrier.id}`).set(auth(await adminToken())).send({ status: 'active' }).expect(200)
  const customer = await signup('customer', 'c@x.tc', 'Amine Ben Ali')
  const stranger = await signup('customer', 'c2@x.tc')
  const otherCarrier = await signup('carrier', 'k2@x.tc')
  const trip = (await api().post('/api/trips').set(auth(carrier.token)).send({ originId: 'tn-tunis', destinationId: 'fr-marseille', departureAt: future(3), arrivalAt: future(4), vehicleModel: 'Master', vehicleKind: 'van', pricePerKg: 1.1, minKg: 10, availableKg: 100, cargo: ['parcels'], services: ['gps'] })).body.trip
  const booking = (await api().post('/api/bookings').set(auth(customer.token)).send({ tripId: trip.id, weightKg: 20, cargoType: 'parcels', contactName: 'Amine', contactPhone: '+21622222222' })).body.booking
  const setStatus = (token: string, status: string, extra: object = {}) => api().patch(`/api/bookings/${booking.id}/status`).set(auth(token)).send({ status, ...extra })
  return { carrier, customer, stranger, otherCarrier, trip, booking, setStatus }
}
async function toArrived(s: Awaited<ReturnType<typeof scenario>>) {
  for (const st of ['confirmed', 'picked_up', 'in_transit', 'arrived']) await s.setStatus(s.carrier.token, st).expect(200)
}

beforeEach(() => { const db = openDb(':memory:'); ensureAdmin(db); app = createApp(db) })

describe('code de livraison (PIN)', () => {
  it('seul le client voit le code ; le transporteur doit le saisir pour livrer', async () => {
    const s = await scenario()
    expect(s.booking.deliveryPin).toMatch(/^\d{4}$/)
    const asCarrier = (await api().get(`/api/bookings/${s.booking.id}`).set(auth(s.carrier.token))).body.booking
    expect(asCarrier.deliveryPin).toBeNull()
    await toArrived(s)
    expect((await s.setStatus(s.carrier.token, 'delivered')).status).toBe(422)
    const wrong = s.booking.deliveryPin === '0000' ? '1111' : '0000'
    expect((await s.setStatus(s.carrier.token, 'delivered', { pin: wrong })).body.error.code).toBe('INVALID_PIN')
    await s.setStatus(s.carrier.token, 'delivered', { pin: s.booking.deliveryPin }).expect(200)
  })
  it('bloque après 5 essais erronés, même avec le bon code ; l’admin peut clôturer', async () => {
    const s = await scenario()
    await toArrived(s)
    const wrong = s.booking.deliveryPin === '0000' ? '1111' : '0000'
    for (let i = 0; i < 5; i++) await s.setStatus(s.carrier.token, 'delivered', { pin: wrong }).expect(422)
    expect((await s.setStatus(s.carrier.token, 'delivered', { pin: s.booking.deliveryPin })).body.error.code).toBe('PIN_LOCKED')
    await s.setStatus(await adminToken(), 'delivered').expect(200)
  })
})

describe('évaluations', () => {
  it('uniquement le client propriétaire, après livraison, une seule fois', async () => {
    const s = await scenario()
    const review = (token: string) => api().post(`/api/bookings/${s.booking.id}/review`).set(auth(token)).send({ rating: 5, comment: 'Parfait' })
    expect((await review(s.customer.token)).body.error.code).toBe('NOT_DELIVERED')
    await toArrived(s)
    await s.setStatus(s.carrier.token, 'delivered', { pin: s.booking.deliveryPin }).expect(200)
    await review(s.carrier.token).expect(403)
    await review(s.stranger.token).expect(404)
    await review(s.customer.token).expect(201)
    expect((await review(s.customer.token)).body.error.code).toBe('ALREADY_REVIEWED')
    await api().post(`/api/bookings/${s.booking.id}/review`).set(auth(s.customer.token)).send({ rating: 9 }).expect(400)
  })
  it('met à jour la note du transporteur et n’expose que le prénom', async () => {
    const s = await scenario()
    await toArrived(s)
    await s.setStatus(s.carrier.token, 'delivered', { pin: s.booking.deliveryPin })
    await api().post(`/api/bookings/${s.booking.id}/review`).set(auth(s.customer.token)).send({ rating: 4, comment: 'Bien' })
    const trip = (await api().get(`/api/trips/${s.trip.id}`)).body.trip
    expect(trip.carrierRating).toBe(4)
    expect(trip.reviewCount).toBe(1)
    const reviews = (await api().get(`/api/trips/${s.trip.id}/reviews`)).body.reviews
    expect(reviews[0].author).toBe('Amine')
    expect(JSON.stringify(reviews)).not.toContain('Ben Ali')
  })
})

describe('messagerie privée', () => {
  it('client et transporteur échangent ; compteurs de non-lus', async () => {
    const s = await scenario()
    const url = `/api/messages/${s.booking.id}`
    await api().post(url).set(auth(s.customer.token)).send({ body: 'Bonjour' }).expect(201)
    const summary = (await api().get('/api/notifications/summary').set(auth(s.carrier.token))).body
    expect(summary.messages).toBe(1)
    const list = (await api().get('/api/messages').set(auth(s.carrier.token))).body.conversations
    expect(list[0].unread).toBe(1)
    expect(list[0].counterpart).toBe('Amine Ben Ali')
    const thread = (await api().get(url).set(auth(s.carrier.token))).body
    expect(thread.messages).toEqual([expect.objectContaining({ body: 'Bonjour', mine: false })])
    expect((await api().get('/api/notifications/summary').set(auth(s.carrier.token))).body.messages).toBe(0)
    await api().post(url).set(auth(s.carrier.token)).send({ body: 'Reçu' }).expect(201)
    expect((await api().get(url).set(auth(s.customer.token))).body.messages).toHaveLength(2)
  })
  it('tiers, autre transporteur et admin n’ont aucun accès', async () => {
    const s = await scenario()
    const url = `/api/messages/${s.booking.id}`
    await api().post(url).set(auth(s.customer.token)).send({ body: 'Secret' })
    for (const token of [s.stranger.token, s.otherCarrier.token, await adminToken()]) {
      await api().get(url).set(auth(token)).expect(404)
      await api().post(url).set(auth(token)).send({ body: 'intrus' }).expect(404)
    }
    expect((await api().get('/api/messages').set(auth(s.stranger.token))).body.conversations).toHaveLength(0)
    await api().get(url).expect(401)
    await api().post(url).set(auth(s.customer.token)).send({ body: '   ' }).expect(400)
  })
})

describe('notifications', () => {
  it('créées pour la bonne personne et marquées lues', async () => {
    const s = await scenario()
    await s.setStatus(s.carrier.token, 'confirmed').expect(200)
    const carrierList = (await api().get('/api/notifications').set(auth(s.carrier.token))).body.notifications
    expect(carrierList.map((n: { type: string }) => n.type)).toContain('booking_created')
    const customerList = (await api().get('/api/notifications').set(auth(s.customer.token))).body.notifications
    expect(customerList[0]).toMatchObject({ type: 'booking_status', status: 'confirmed', reference: s.booking.reference, read: false })
    expect((await api().get('/api/notifications/summary').set(auth(s.stranger.token))).body).toEqual({ notifications: 0, messages: 0 })
    await api().post('/api/notifications/read-all').set(auth(s.customer.token)).expect(204)
    expect((await api().get('/api/notifications/summary').set(auth(s.customer.token))).body.notifications).toBe(0)
  })
  it('le client qui annule prévient le transporteur ; l’approbation prévient le transporteur', async () => {
    const s = await scenario()
    await s.setStatus(s.customer.token, 'cancelled').expect(200)
    const list = (await api().get('/api/notifications').set(auth(s.carrier.token))).body.notifications
    expect(list[0]).toMatchObject({ type: 'booking_status', status: 'cancelled' })
    expect(list.some((n: { type: string }) => n.type === 'account_approved')).toBe(true)
  })
})
