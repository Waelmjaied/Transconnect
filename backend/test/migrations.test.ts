import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { LATEST_VERSION, migrate, openDb } from '../src/db.js'

describe('migrations', () => {
  it('une base neuve est créée à la dernière version', () => {
    const db = openDb(':memory:')
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })
  it('migrate est idempotent', () => {
    const db = openDb(':memory:')
    migrate(db)
    migrate(db)
    expect(db.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })
  it('rattrape une base d\'avant le versionnage (colonnes manquantes) sans perdre de données', () => {
    const raw = openDb(':memory:')
    raw.exec("INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES ('u1','A','a@x.tc','1','h','customer','active')")
    raw.exec('ALTER TABLE bookings DROP COLUMN delivery_pin') // simule une base d'avant le versionnage
    raw.pragma('user_version = 0')
    migrate(raw)
    expect(raw.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 1 })
    expect(raw.prepare('PRAGMA table_info(bookings)').all().map((c) => (c as { name: string }).name)).toContain('delivery_pin')
    expect(raw.pragma('user_version', { simple: true })).toBe(LATEST_VERSION)
  })
  it('refuse une base d\'une version plus récente que le code', () => {
    const raw = new Database(':memory:')
    raw.pragma(`user_version = ${LATEST_VERSION + 1}`)
    expect(() => migrate(raw)).toThrow(/plus récente/)
  })
  it('refuse une très ancienne base sans le rôle support, avec un message clair', () => {
    const raw = new Database(':memory:')
    raw.exec("CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT CHECK (role IN ('admin','carrier','customer')))")
    expect(() => migrate(raw)).toThrow(/obsolète/)
    expect(raw.pragma('user_version', { simple: true })).toBe(0)
  })
})
