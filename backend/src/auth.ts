import type { NextFunction, Request, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import type { DB } from './db.js'
import { forbidden, unauthenticated } from './errors.js'
import { permissionsFor, REQUIRES_ACTIVE, type Effect, type Permission, type Role, type UserStatus } from './permissions.js'

export type UserRow = {
  id: string; name: string; email: string; phone: string; password_hash: string
  role: Role; status: UserStatus; lang: string | null; theme: string | null; token_version: number
  rating: number | null; review_count: number; created_at: string
}

export type AuthUser = {
  id: string; name: string; email: string; phone: string
  role: Role; status: UserStatus; lang: string | null; theme: string | null
  permissions: Permission[]
}

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export const signToken = (user: Pick<UserRow, 'id' | 'token_version'>) =>
  jwt.sign({ tv: user.token_version }, config.jwtSecret, { subject: user.id, expiresIn: config.tokenTtl as jwt.SignOptions['expiresIn'], algorithm: 'HS256' })

export const overridesOf = (db: DB, userId: string): Record<string, Effect> =>
  Object.fromEntries((db.prepare('SELECT permission, effect FROM user_permissions WHERE user_id = ?').all(userId) as { permission: string; effect: Effect }[]).map((r) => [r.permission, r.effect]))

export const toAuthUser = (db: DB, row: UserRow): AuthUser => ({
  id: row.id, name: row.name, email: row.email, phone: row.phone,
  role: row.role, status: row.status, lang: row.lang, theme: row.theme,
  permissions: permissionsFor(row.role, row.status, overridesOf(db, row.id)),
})

export function makeAuth(db: DB) {
  /** Relit l'utilisateur en base à chaque requête : changement de rôle, désactivation et
   *  changement de mot de passe prennent effet immédiatement (pas de privilèges périmés dans le JWT). */
  const resolve = (req: Request): AuthUser | undefined => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return undefined
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as UserRow | undefined
      if (!row || row.token_version !== payload.tv) return undefined
      if (row.status === 'disabled') throw forbidden('ACCOUNT_DISABLED')
      return toAuthUser(db, row)
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error
      return undefined
    }
  }

  const authenticate: RequestHandler = (req, _res, next) => {
    try {
      const user = resolve(req)
      if (!user) throw unauthenticated()
      req.user = user
      next()
    } catch (error) { next(error) }
  }

  const requirePermission = (...needed: Permission[]): RequestHandler => (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user
    if (!user) return next(unauthenticated())
    const missing = needed.find((permission) => !user.permissions.includes(permission))
    if (!missing) return next()
    if (user.role === 'carrier' && user.status === 'pending' && REQUIRES_ACTIVE.includes(missing)) return next(forbidden('CARRIER_NOT_APPROVED'))
    next(forbidden())
  }

  /** Autorise si l'utilisateur possède AU MOINS UNE des permissions listées. */
  const requireAnyPermission = (...any: Permission[]): RequestHandler => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated())
    if (any.some((permission) => req.user!.permissions.includes(permission))) return next()
    next(forbidden())
  }

  return { authenticate, requirePermission, requireAnyPermission }
}
