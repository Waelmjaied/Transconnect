import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export type DB = Database.Database

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','support','carrier','customer')),
  status TEXT NOT NULL CHECK (status IN ('active','pending','disabled')),
  lang TEXT,
  theme TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  rating REAL,
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  carrier_id TEXT NOT NULL REFERENCES users(id),
  origin_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  departure_at TEXT NOT NULL,
  arrival_at TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_kind TEXT NOT NULL CHECK (vehicle_kind IN ('car','van','truck')),
  price_per_kg REAL NOT NULL CHECK (price_per_kg > 0),
  min_kg REAL NOT NULL CHECK (min_kg > 0),
  available_kg REAL NOT NULL CHECK (available_kg >= 0),
  capacity_kg REAL NOT NULL CHECK (capacity_kg > 0),
  cargo TEXT NOT NULL,
  services TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trips_search ON trips(status, departure_at);
CREATE INDEX IF NOT EXISTS idx_trips_carrier ON trips(carrier_id);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  trip_id TEXT NOT NULL REFERENCES trips(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  cargo_type TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  contact_email TEXT,
  total_price REAL NOT NULL,
  delivery_pin TEXT NOT NULL DEFAULT '',
  pin_attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','picked_up','in_transit','arrived','delivered','cancelled','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE TABLE IF NOT EXISTS tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_booking ON tracking_events(booking_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id, id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  booking_id TEXT,
  reference TEXT,
  status TEXT,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  carrier_id TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_carrier ON reviews(carrier_id, id);
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed REAL,
  heading REAL,
  accuracy REAL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_positions_trip ON positions(trip_id, id);
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  PRIMARY KEY (user_id, permission)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(id);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  booking_id TEXT REFERENCES bookings(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, status);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages ON ticket_messages(ticket_id, id);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, trip_id)
);
`

/**
 * Migrations versionnées (PRAGMA user_version). Pour changer le schéma : ajouter une entrée À LA FIN de la liste
 * avec le numéro suivant — ne jamais modifier une migration déjà publiée. Chaque migration s'exécute dans une transaction.
 *
 * Exemple :  { version: 2, up: (db) => db.exec('ALTER TABLE trips ADD COLUMN notes TEXT') }
 */
type Migration = { version: number; up: (db: DB) => void }

const columnsOf = (db: DB, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name)
const addColumn = (db: DB, table: string, column: string, ddl: string) => {
  if (!columnsOf(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

export const MIGRATIONS: Migration[] = [
  {
    // Référence : schéma complet + rattrapage des bases créées avant le versionnage (idempotent).
    version: 1,
    up: (db) => {
      db.exec(schema)
      addColumn(db, 'bookings', 'delivery_pin', "delivery_pin TEXT NOT NULL DEFAULT ''")
      addColumn(db, 'bookings', 'pin_attempts', 'pin_attempts INTEGER NOT NULL DEFAULT 0')
      addColumn(db, 'reviews', 'hidden', 'hidden INTEGER NOT NULL DEFAULT 0')
      addColumn(db, 'notifications', 'link', 'link TEXT')
      // Le rôle « support » ne peut pas être ajouté à une contrainte CHECK existante : refuser clairement plutôt que planter plus tard.
      const usersSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get() as { sql: string }).sql
      if (!usersSql.includes("'support'")) throw new Error('Base de données obsolète (rôle « support » absent) : supprimez backend/data/ pour la recréer.')
    },
  },
]

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

export function migrate(db: DB) {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > LATEST_VERSION) throw new Error(`La base est en version ${current}, plus récente que ce code (${LATEST_VERSION}) : mettez l'application à jour.`)
  for (const migration of MIGRATIONS.filter((m) => m.version > current)) {
    db.transaction(() => {
      migration.up(db)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
}

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
