export type Role = 'admin' | 'support' | 'carrier' | 'customer'
export type UserStatus = 'active' | 'pending' | 'disabled'
export type Effect = 'allow' | 'deny'

export const ALL_PERMISSIONS = [
  'profile:update',
  'favorites:manage',
  'notifications:read',
  'messages:use', // messagerie d'une réservation (participants uniquement — jamais l'admin)
  'trips:create',
  'trips:manage', // gérer SES trajets (admin : tous)
  'trips:moderate', // annuler le trajet de n'importe qui
  'bookings:create',
  'bookings:read', // portée par défaut : client = les siennes, transporteur = celles de ses trajets
  'bookings:read_all', // toutes les réservations (support, admin)
  'bookings:cancel', // annuler SA réservation
  'bookings:manage', // confirmer / refuser / faire avancer le statut
  'tracking:read',
  'tracking:write', // partager la position GPS, ajouter des notes de suivi
  'reviews:create',
  'reviews:moderate',
  'tickets:create',
  'tickets:manage',
  'users:read',
  'users:manage',
  'users:permissions',
  'stats:read',
  'audit:read',
] as const
export type Permission = (typeof ALL_PERMISSIONS)[number]

/** Réservé au rôle admin : ne peut JAMAIS être accordé par surcharge individuelle. */
export const ADMIN_ONLY: readonly Permission[] = ['users:manage', 'users:permissions', 'audit:read']

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: ['profile:update', 'favorites:manage', 'notifications:read', 'messages:use', 'bookings:create', 'bookings:read', 'bookings:cancel', 'tracking:read', 'reviews:create', 'tickets:create'],
  carrier: ['profile:update', 'favorites:manage', 'notifications:read', 'messages:use', 'trips:create', 'trips:manage', 'bookings:read', 'bookings:manage', 'tracking:read', 'tracking:write', 'tickets:create'],
  support: ['profile:update', 'favorites:manage', 'notifications:read', 'users:read', 'stats:read', 'bookings:read', 'bookings:read_all', 'tracking:read', 'trips:moderate', 'reviews:moderate', 'tickets:manage', 'tickets:create'],
  admin: ALL_PERMISSIONS,
}

/** Un transporteur « pending » (non validé) ne peut ni publier ni gérer d'expéditions, même avec une surcharge. */
export const REQUIRES_ACTIVE: readonly Permission[] = ['trips:create', 'trips:manage', 'bookings:manage', 'tracking:write']

export const isPermission = (value: string): value is Permission => (ALL_PERMISSIONS as readonly string[]).includes(value)
export const rolePermissions = (role: Role): Permission[] => [...ROLE_PERMISSIONS[role]]

/** permissions effectives = préréglage du rôle + surcharges « allow » − surcharges « deny » (puis règles de statut). */
export function permissionsFor(role: Role, status: UserStatus, overrides: Record<string, Effect> = {}): Permission[] {
  if (status === 'disabled') return []
  if (role === 'admin') return [...ALL_PERMISSIONS] // l'admin ne peut pas se verrouiller par une surcharge
  const set = new Set<Permission>(ROLE_PERMISSIONS[role])
  for (const [permission, effect] of Object.entries(overrides)) {
    if (!isPermission(permission)) continue
    if (effect === 'allow' && !ADMIN_ONLY.includes(permission)) set.add(permission)
    if (effect === 'deny') set.delete(permission)
  }
  if (status === 'pending') for (const permission of REQUIRES_ACTIVE) set.delete(permission)
  return [...set]
}
