import 'dotenv/config'

const isProd = process.env.NODE_ENV === 'production'
const isTest = process.env.NODE_ENV === 'test'
const secret = process.env.JWT_SECRET

if (isProd && (!secret || secret.length < 32)) {
  throw new Error('JWT_SECRET (>= 32 caractères) est obligatoire en production')
}

export const config = {
  isProd,
  isTest,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: secret ?? 'dev-only-secret-change-me-dev-only-secret-0000',
  tokenTtl: process.env.TOKEN_TTL ?? '8h',
  dbPath: process.env.DB_PATH ?? './data/transconnect.db',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  seedDemo: (process.env.SEED_DEMO ?? (isProd ? 'false' : 'true')) === 'true',
  bcryptCost: isTest ? 4 : 10,
}
