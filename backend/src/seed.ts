import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { config } from './config.js'
import type { DB } from './db.js'
import { nowLocal } from './domain.js'

/** Jour J + n en date tunisienne (pas celle du serveur), à l'heure murale donnée. */
const at = (days: number, time: string) => {
  const base = Date.parse(`${nowLocal().slice(0, 10)}T12:00:00Z`) + days * 86_400_000
  return `${new Date(base).toISOString().slice(0, 10)}T${time}`
}

export function ensureAdmin(db: DB) {
  const email = config.adminEmail ?? (config.isProd ? undefined : 'admin@transconnect.local')
  const password = config.adminPassword ?? (config.isProd ? undefined : 'Admin#12345')
  if (!email || !password) {
    if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) console.warn('[seed] Aucun admin : définissez ADMIN_EMAIL et ADMIN_PASSWORD')
    return
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return
  db.prepare("INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES (?,?,?,?,?,'admin','active')")
    .run(randomUUID(), 'Admin', email, '+21600000000', bcrypt.hashSync(password, config.bcryptCost))
  console.log(`[seed] Admin créé : ${email}`)
}

/** Données de démonstration (comptes + trajets), uniquement si la base est vide de transporteurs. */
export function seedDemo(db: DB) {
  if (db.prepare("SELECT 1 FROM users WHERE role = 'carrier'").get()) return
  const hash = bcrypt.hashSync('Demo#12345', config.bcryptCost)
  const user = (name: string, email: string, role: string, rating: number | null, reviews: number) => {
    const id = randomUUID()
    db.prepare('INSERT INTO users (id, name, email, phone, password_hash, role, status, rating, review_count) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, name, email, '+21620000000', hash, role, 'active', rating, reviews)
    return id
  }
  user('Client Démo', 'client@demo.tc', 'customer', null, 0)
  user('Support Démo', 'support@demo.tc', 'support', null, 0)
  const fleet = user('Fleet Méditerranée', 'fleet@demo.tc', 'carrier', 4.8, 125)
  const marsa = user('La Marsa Transport', 'marsa@demo.tc', 'carrier', 4.7, 98)
  const knights = user('Cargo Knights', 'knights@demo.tc', 'carrier', 4.9, 210)
  const safe = user('Safe Travel', 'safe@demo.tc', 'carrier', 4.5, 41)
  const med = user('Med Transport', 'med@demo.tc', 'carrier', 4.6, 76)

  const all = ['parcels', 'furniture', 'clothes', 'equipment']
  const trip = (carrier: string, o: string, d: string, dep: [number, string], arr: [number, string], model: string, kind: string, price: number, min: number, avail: number, cargo: string[], services: string[]) =>
    db.prepare(`INSERT INTO trips (id, carrier_id, origin_id, destination_id, departure_at, arrival_at, vehicle_model, vehicle_kind, price_per_kg, min_kg, available_kg, capacity_kg, cargo, services)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), carrier, o, d, at(...dep), at(...arr), model, kind, price, min, avail, avail, JSON.stringify(cargo), JSON.stringify(services))

  trip(fleet, 'tn-tunis', 'fr-marseille', [3, '08:30'], [4, '11:00'], 'Renault Master', 'van', 1.1, 1, 220, all, ['gps', 'insurance', 'proof'])
  trip(marsa, 'tn-tunis', 'it-rome', [2, '06:15'], [3, '18:30'], 'Iveco Daily', 'van', 1.15, 1, 310, ['parcels', 'clothes', 'equipment'], ['gps', 'proof'])
  trip(knights, 'tn-tunis', 'fr-paris', [1, '10:00'], [3, '07:45'], 'Mercedes Sprinter', 'van', 1.2, 1, 540, all, ['gps', 'insurance', 'proof'])
  trip(safe, 'tn-tunis', 'fr-marseille', [5, '09:00'], [6, '10:30'], 'Renault Kangoo', 'car', 1.35, 1, 45, ['parcels', 'clothes'], ['proof'])
  trip(med, 'tn-sfax', 'fr-nice', [7, '07:45'], [8, '17:00'], 'Peugeot Boxer', 'van', 1.05, 2, 145, ['parcels', 'furniture', 'equipment'], ['gps', 'insurance'])
  trip(fleet, 'tn-tunis', 'fr-lyon', [9, '09:00'], [11, '06:30'], 'Volvo FH', 'truck', 1.28, 5, 720, all, ['gps', 'insurance', 'proof'])
  console.log('[seed] Données de démo créées (mot de passe démo : Demo#12345)')
}
