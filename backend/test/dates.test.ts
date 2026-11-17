import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { openDb } from '../src/db.js'
import { nowLocal, placeTz, wallNow, wallToInstant } from '../src/domain.js'
import { ensureAdmin } from '../src/seed.js'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

describe('fuseaux horaires (domain)', () => {
  it('convertit une heure murale en instant réel, été et hiver', () => {
    expect(iso(wallToInstant('2027-01-15T12:00', 'Africa/Tunis'))).toBe('2027-01-15T11:00') // UTC+1 toute l'année
    expect(iso(wallToInstant('2027-07-15T12:00', 'Africa/Tunis'))).toBe('2027-07-15T11:00')
    expect(iso(wallToInstant('2027-01-15T12:00', 'Europe/Paris'))).toBe('2027-01-15T11:00') // UTC+1
    expect(iso(wallToInstant('2027-07-15T12:00', 'Europe/Paris'))).toBe('2027-07-15T10:00') // UTC+2 (heure d'été)
    expect(iso(wallToInstant('2027-07-15T12:00', 'Europe/Rome'))).toBe('2027-07-15T10:00')
  })
  it('gère le passage à l\'heure d\'été (28 mars 2027, Paris)', () => {
    expect(iso(wallToInstant('2027-03-28T01:30', 'Europe/Paris'))).toBe('2027-03-28T00:30')
    expect(iso(wallToInstant('2027-03-28T03:30', 'Europe/Paris'))).toBe('2027-03-28T01:30')
  })
  it('associe un fuseau à chaque lieu', () => {
    expect(placeTz('tn-sfax')).toBe('Africa/Tunis')
    expect(placeTz('fr-nice')).toBe('Europe/Paris')
    expect(placeTz('it-rome')).toBe('Europe/Rome')
  })
  it('wallNow suit le fuseau demandé, indépendamment du serveur', () => {
    const instant = new Date('2027-07-15T23:30:00Z')
    expect(wallNow('Africa/Tunis', instant)).toBe('2027-07-16T00:30')
    expect(wallNow('Europe/Paris', instant)).toBe('2027-07-16T01:30')
    expect(nowLocal()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe('validation des dates de trajet', () => {
  let app: ReturnType<typeof createApp>
  beforeEach(() => { const db = openDb(':memory:'); ensureAdmin(db); app = createApp(db) })
  const carrierToken = async () => {
    const admin = (await request(app).post('/api/auth/login').send({ email: 'admin@transconnect.local', password: 'Admin#12345' })).body.token
    const reg = await request(app).post('/api/auth/register').send({ name: 'Cargo Co', email: 'k@x.tc', password: 'Secret#1234', phone: '+21611111111', role: 'carrier' })
    await request(app).patch(`/api/admin/users/${reg.body.user.id}`).set({ Authorization: `Bearer ${admin}` }).send({ status: 'active' }).expect(200)
    return reg.body.token as string
  }
  const publish = (token: string, departureAt: string, arrivalAt: string, destinationId = 'fr-marseille') =>
    request(app).post('/api/trips').set({ Authorization: `Bearer ${token}` }).send({ originId: 'tn-tunis', destinationId, departureAt, arrivalAt, vehicleModel: 'Master', vehicleKind: 'van', pricePerKg: 1.1, minKg: 1, availableKg: 300, cargo: ['parcels'], services: [] })

  it('refuse une arrivée antérieure au départ une fois les fuseaux pris en compte (été)', async () => {
    const token = await carrierToken()
    // 10:00 à Tunis = 09:00 UTC ; 10:30 à Paris en été = 08:30 UTC → arrivée AVANT le départ.
    expect((await publish(token, '2027-07-01T10:00', '2027-07-01T10:30')).body.error.code).toBe('INVALID_DATES')
    // En hiver, 10:30 à Paris = 09:30 UTC → valide.
    await publish(token, '2027-01-12T10:00', '2027-01-12T10:30').expect(201)
  })
  it('accepte un trajet d\'été avec une arrivée réellement postérieure', async () => {
    const token = await carrierToken()
    await publish(token, '2027-07-01T10:00', '2027-07-01T12:30').expect(201) // 12:30 Paris = 10:30 UTC > 09:00 UTC
  })
})
