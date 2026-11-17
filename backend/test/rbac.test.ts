import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDb, type DB } from '../src/db.js'
import { nowLocal } from '../src/domain.js'
import { ensureAdmin } from '../src/seed.js'

let db: DB
let app: ReturnType<typeof createApp>
const api = () => request(app)

async function signup(role: 'customer' | 'carrier', email: string) {
  const res = await api().post('/api/auth/register').send({ name: 'Test User', email, password: 'Secret#1234', phone: '+21611111111', role })
  expect(res.status).toBe(201)
  return { token: res.body.token as string, id: res.body.user.id as string, user: res.body.user }
}
const login = async (email: string, password: string) => (await api().post('/api/auth/login').send({ email, password })).body.token as string
const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

const future = (days: number, time = '10:00') => {
  const d = new Date(); d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${time}`
}
const tripBody = { originId: 'tn-tunis', destinationId: 'fr-marseille', departureAt: future(3), arrivalAt: future(4), vehicleModel: 'Renault Master', vehicleKind: 'van', pricePerKg: 1.1, minKg: 10, availableKg: 100, cargo: ['parcels', 'clothes'], services: ['gps'] }
const bookingBody = (tripId: string, weightKg = 20) => ({ tripId, weightKg, cargoType: 'parcels', contactName: 'Client', contactPhone: '+21622222222' })

async function adminToken() {
  return login('admin@transconnect.local', 'Admin#12345')
}
async function approvedCarrier(email: string) {
  const carrier = await signup('carrier', email)
  const admin = await adminToken()
  await api().patch(`/api/admin/users/${carrier.id}`).set(auth(admin)).send({ status: 'active' }).expect(200)
  return carrier
}

beforeEach(() => {
  db = openDb(':memory:')
  ensureAdmin(db)
  app = createApp(db)
})

describe('inscription & rôles', () => {
  it('refuse de s’inscrire comme admin et ne fuit pas le hash', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Eve', email: 'eve@x.tc', password: 'Secret#1234', phone: '+21611111111', role: 'admin' })
    expect(res.status).toBe(400)
    const ok = await signup('customer', 'c@x.tc')
    expect(JSON.stringify(ok.user)).not.toContain('hash')
    expect(ok.user.role).toBe('customer')
  })
  it('client actif, transporteur en attente', async () => {
    expect((await signup('customer', 'c@x.tc')).user.status).toBe('active')
    expect((await signup('carrier', 'k@x.tc')).user.status).toBe('pending')
  })
  it('e-mail déjà pris → 409 ; mauvais mot de passe → 401', async () => {
    await signup('customer', 'c@x.tc')
    await api().post('/api/auth/register').send({ name: 'Dup', email: 'C@x.tc', password: 'Secret#1234', phone: '+21611111111', role: 'customer' }).expect(409)
    await api().post('/api/auth/login').send({ email: 'c@x.tc', password: 'wrong-password' }).expect(401)
  })
  it('sans jeton → 401', async () => {
    await api().get('/api/auth/me').expect(401)
    await api().get('/api/bookings').expect(401)
  })
})

describe('privilèges trajets', () => {
  it('client : 403 ; transporteur en attente : CARRIER_NOT_APPROVED ; transporteur validé : 201', async () => {
    const customer = await signup('customer', 'c@x.tc')
    expect((await api().post('/api/trips').set(auth(customer.token)).send(tripBody)).status).toBe(403)
    const pending = await signup('carrier', 'k@x.tc')
    const denied = await api().post('/api/trips').set(auth(pending.token)).send(tripBody)
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('CARRIER_NOT_APPROVED')
    const carrier = await approvedCarrier('k2@x.tc')
    await api().post('/api/trips').set(auth(carrier.token)).send(tripBody).expect(201)
  })
  it('un transporteur ne modifie/supprime pas le trajet d’un autre ; l’admin le peut', async () => {
    const a = await approvedCarrier('a@x.tc')
    const b = await approvedCarrier('b@x.tc')
    const trip = (await api().post('/api/trips').set(auth(a.token)).send(tripBody)).body.trip
    await api().patch(`/api/trips/${trip.id}`).set(auth(b.token)).send({ pricePerKg: 9 }).expect(403)
    await api().delete(`/api/trips/${trip.id}`).set(auth(b.token)).expect(403)
    await api().patch(`/api/trips/${trip.id}`).set(auth(a.token)).send({ pricePerKg: 1.5 }).expect(200)
    await api().patch(`/api/trips/${trip.id}`).set(auth(await adminToken())).send({ pricePerKg: 1.6 }).expect(200)
  })
  it('la recherche est publique', async () => {
    const a = await approvedCarrier('a@x.tc')
    await api().post('/api/trips').set(auth(a.token)).send(tripBody).expect(201)
    const res = await api().get('/api/trips?weight=50&vehicle=van')
    expect(res.status).toBe(200)
    expect(res.body.trips).toHaveLength(1)
    expect(res.body.trips[0]).not.toHaveProperty('contact')
  })
  it('rejette les dates incohérentes', async () => {
    const a = await approvedCarrier('a@x.tc')
    await api().post('/api/trips').set(auth(a.token)).send({ ...tripBody, arrivalAt: tripBody.departureAt }).expect(422)
    await api().post('/api/trips').set(auth(a.token)).send({ ...tripBody, departureAt: '2020-01-01T10:00', arrivalAt: '2020-01-02T10:00' }).expect(422)
  })
})

describe('réservations : portée et capacité', () => {
  async function setup() {
    const carrier = await approvedCarrier('k@x.tc')
    const other = await approvedCarrier('k2@x.tc')
    const customer = await signup('customer', 'c@x.tc')
    const stranger = await signup('customer', 'c2@x.tc')
    const trip = (await api().post('/api/trips').set(auth(carrier.token)).send(tripBody)).body.trip
    return { carrier, other, customer, stranger, trip }
  }

  it('un transporteur ne peut pas réserver ; le client réserve et la capacité baisse', async () => {
    const { carrier, customer, trip } = await setup()
    await api().post('/api/bookings').set(auth(carrier.token)).send(bookingBody(trip.id)).expect(403)
    const res = await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 20)).expect(201)
    expect(res.body.booking.totalPrice).toBe(22)
    expect((await api().get(`/api/trips/${trip.id}`)).body.trip.availableKg).toBe(80)
  })
  it('refuse poids hors plage, cargaison non acceptée et sur-réservation', async () => {
    const { customer, trip } = await setup()
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 5)).expect(422)
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 500)).expect(422)
    await api().post('/api/bookings').set(auth(customer.token)).send({ ...bookingBody(trip.id), cargoType: 'furniture' }).expect(422)
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 60)).expect(201)
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 50)).expect(422)
  })
  it('isolation : un client ne voit pas les réservations d’un autre, ni un autre transporteur', async () => {
    const { carrier, other, customer, stranger, trip } = await setup()
    const b = (await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id))).body.booking
    await api().get(`/api/bookings/${b.id}`).set(auth(stranger.token)).expect(404)
    await api().get(`/api/bookings/${b.id}`).set(auth(other.token)).expect(404)
    await api().get(`/api/tracking/${b.reference}`).set(auth(stranger.token)).expect(404)
    await api().get(`/api/tracking/${b.reference}`).set(auth(other.token)).expect(404)
    expect((await api().get('/api/bookings').set(auth(stranger.token))).body.bookings).toHaveLength(0)
    expect((await api().get('/api/bookings').set(auth(other.token))).body.bookings).toHaveLength(0)
    expect((await api().get('/api/bookings').set(auth(carrier.token))).body.bookings).toHaveLength(1)
    expect((await api().get('/api/bookings').set(auth(await adminToken()))).body.bookings).toHaveLength(1)
    const track = await api().get(`/api/tracking/${b.reference.toLowerCase()}`).set(auth(customer.token)).expect(200)
    expect(track.body.events).toHaveLength(1)
  })
  it('machine d’états : le client annule, seul le bon transporteur avance le statut', async () => {
    const { carrier, other, customer, trip } = await setup()
    const b = (await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 30))).body.booking
    await api().patch(`/api/bookings/${b.id}/status`).set(auth(customer.token)).send({ status: 'confirmed' }).expect(409)
    await api().patch(`/api/bookings/${b.id}/status`).set(auth(other.token)).send({ status: 'confirmed' }).expect(404)
    await api().patch(`/api/bookings/${b.id}/status`).set(auth(carrier.token)).send({ status: 'delivered' }).expect(409)
    await api().patch(`/api/bookings/${b.id}/status`).set(auth(carrier.token)).send({ status: 'confirmed', message: 'OK' }).expect(200)
    for (const s of ['picked_up', 'in_transit', 'arrived', 'delivered']) await api().patch(`/api/bookings/${b.id}/status`).set(auth(carrier.token)).send({ status: s, ...(s === 'delivered' ? { pin: b.deliveryPin } : {}) }).expect(200)
    await api().patch(`/api/bookings/${b.id}/status`).set(auth(customer.token)).send({ status: 'cancelled' }).expect(409)
    expect((await api().get(`/api/tracking/${b.reference}`).set(auth(customer.token))).body.events.length).toBe(6)
  })
  it('annulation/refus restituent la capacité', async () => {
    const { carrier, customer, trip } = await setup()
    const b1 = (await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 40))).body.booking
    const b2 = (await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id, 30))).body.booking
    expect((await api().get(`/api/trips/${trip.id}`)).body.trip.availableKg).toBe(30)
    await api().patch(`/api/bookings/${b1.id}/status`).set(auth(customer.token)).send({ status: 'cancelled' }).expect(200)
    await api().patch(`/api/bookings/${b2.id}/status`).set(auth(carrier.token)).send({ status: 'rejected' }).expect(200)
    expect((await api().get(`/api/trips/${trip.id}`)).body.trip.availableKg).toBe(100)
  })
  it('le client ne voit pas les coordonnées d’un autre client ; le transporteur voit celles de ses clients', async () => {
    const { carrier, customer, trip } = await setup()
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id))
    const list = (await api().get('/api/bookings').set(auth(carrier.token))).body.bookings
    expect(list[0].contact.phone).toBe('+21622222222')
  })
  it('annuler un trajet annule les réservations ouvertes ; suppression refusée s’il y a des réservations', async () => {
    const { carrier, customer, trip } = await setup()
    const b = (await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id))).body.booking
    await api().delete(`/api/trips/${trip.id}`).set(auth(carrier.token)).expect(409)
    await api().patch(`/api/trips/${trip.id}`).set(auth(carrier.token)).send({ status: 'cancelled' }).expect(200)
    expect((await api().get(`/api/bookings/${b.id}`).set(auth(customer.token))).body.booking.status).toBe('cancelled')
    await api().post('/api/bookings').set(auth(customer.token)).send(bookingBody(trip.id)).expect(404)
  })
})

describe('administration', () => {
  it('routes admin interdites aux non-admins', async () => {
    const customer = await signup('customer', 'c@x.tc')
    const carrier = await approvedCarrier('k@x.tc')
    for (const t of [customer.token, carrier.token]) {
      await api().get('/api/admin/users').set(auth(t)).expect(403)
      await api().get('/api/admin/stats').set(auth(t)).expect(403)
      await api().patch(`/api/admin/users/${customer.id}`).set(auth(t)).send({ role: 'admin' }).expect(403)
    }
    await api().get('/api/admin/stats').expect(401)
  })
  it('un utilisateur désactivé perd l’accès immédiatement avec son ancien jeton', async () => {
    const customer = await signup('customer', 'c@x.tc')
    await api().get('/api/auth/me').set(auth(customer.token)).expect(200)
    await api().patch(`/api/admin/users/${customer.id}`).set(auth(await adminToken())).send({ status: 'disabled' }).expect(200)
    const res = await api().get('/api/auth/me').set(auth(customer.token))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED')
    expect((await api().post('/api/auth/login').send({ email: 'c@x.tc', password: 'Secret#1234' })).status).toBe(403)
  })
  it('un changement de rôle s’applique immédiatement (privilèges non figés dans le JWT)', async () => {
    const customer = await signup('customer', 'c@x.tc')
    const admin = await adminToken()
    await api().patch(`/api/admin/users/${customer.id}`).set(auth(admin)).send({ role: 'admin' }).expect(200)
    await api().get('/api/admin/users').set(auth(customer.token)).expect(200)
    await api().patch(`/api/admin/users/${customer.id}`).set(auth(admin)).send({ role: 'customer' }).expect(200)
    await api().get('/api/admin/users').set(auth(customer.token)).expect(403)
  })
  it('protège contre l’auto-modification et la suppression du dernier admin', async () => {
    const admin = await adminToken()
    const me = (await api().get('/api/auth/me').set(auth(admin))).body.user
    expect((await api().patch(`/api/admin/users/${me.id}`).set(auth(admin)).send({ role: 'customer' })).body.error.code).toBe('SELF_MODIFICATION')
    const second = await signup('customer', 'c@x.tc')
    await api().patch(`/api/admin/users/${second.id}`).set(auth(admin)).send({ role: 'admin' }).expect(200)
    const secondToken = await login('c@x.tc', 'Secret#1234')
    // l'autre admin ne peut pas se retirer le dernier admin restant : on désactive d'abord le 1er via le 2e, puis le 2e est le dernier
    await api().patch(`/api/admin/users/${me.id}`).set(auth(secondToken)).send({ status: 'disabled' }).expect(200)
    const last = await api().patch(`/api/admin/users/${second.id}`).set(auth(secondToken)).send({ role: 'customer' })
    expect(last.body.error.code).toBe('SELF_MODIFICATION')
  })
  it('changer son mot de passe invalide les anciens jetons', async () => {
    const c = await signup('customer', 'c@x.tc')
    const res = await api().post('/api/auth/me/password').set(auth(c.token)).send({ currentPassword: 'Secret#1234', newPassword: 'Another#5678' }).expect(200)
    await api().get('/api/auth/me').set(auth(c.token)).expect(401)
    await api().get('/api/auth/me').set(auth(res.body.token)).expect(200)
  })
  it('stats et liste filtrée', async () => {
    await signup('carrier', 'k@x.tc')
    const admin = await adminToken()
    const list = await api().get('/api/admin/users?status=pending&role=carrier').set(auth(admin)).expect(200)
    expect(list.body.users).toHaveLength(1)
    expect(list.body.users[0]).not.toHaveProperty('password_hash')
    const stats = await api().get('/api/admin/stats').set(auth(admin)).expect(200)
    expect(stats.body.usersByRole.carrier).toBe(1)
  })
})

describe('divers', () => {
  it('favoris propres à chaque utilisateur', async () => {
    const carrier = await approvedCarrier('k@x.tc')
    const trip = (await api().post('/api/trips').set(auth(carrier.token)).send(tripBody)).body.trip
    const a = await signup('customer', 'a@x.tc')
    const b = await signup('customer', 'b@x.tc')
    await api().put(`/api/favorites/${trip.id}`).set(auth(a.token)).expect(204)
    expect((await api().get('/api/favorites').set(auth(a.token))).body.tripIds).toEqual([trip.id])
    expect((await api().get('/api/favorites').set(auth(b.token))).body.tripIds).toEqual([])
    await api().put('/api/favorites/unknown').set(auth(a.token)).expect(404)
  })
  it('JSON invalide et route inconnue', async () => {
    await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{bad').expect(400)
    await api().get('/api/nope').expect(404)
  })
  it('nowLocal a le bon format', () => expect(nowLocal()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))
})
