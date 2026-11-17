export type VehicleKind = 'car' | 'van' | 'truck'
export type ServiceId = 'gps' | 'insurance' | 'proof'
export type CargoId = 'parcels' | 'furniture' | 'clothes' | 'equipment'
export type BookingStatus = 'pending' | 'confirmed' | 'picked_up' | 'in_transit' | 'arrived' | 'delivered' | 'cancelled' | 'rejected'
export type Role = 'admin' | 'support' | 'carrier' | 'customer'
export type UserStatus = 'active' | 'pending' | 'disabled'
export type ThemeMode = 'light' | 'dark' | 'system'

export type User = {
  id: string; name: string; email: string; phone: string
  role: Role; status: UserStatus; lang: string | null; theme: ThemeMode | null
  permissions: string[]
}

export type Trip = {
  id: string; carrierId: string; carrierName: string | null; carrierRating: number | null; reviewCount: number
  originId: string; destinationId: string; departureAt: string; arrivalAt: string
  vehicleModel: string; vehicleKind: VehicleKind
  pricePerKg: number; minKg: number; availableKg: number; capacityKg: number
  cargo: CargoId[]; services: ServiceId[]; status: 'open' | 'cancelled'; lastPositionAt?: string | null
}

export type Booking = {
  id: string; reference: string; tripId: string; status: BookingStatus
  weightKg: number; cargoType: CargoId; totalPrice: number; createdAt: string; updatedAt: string
  trip: { originId: string; destinationId: string; departureAt: string; arrivalAt: string; vehicleModel: string; carrierName: string }
  contact: { name: string; phone: string; email: string | null } | null
  allowedActions: BookingStatus[]
  deliveryPin: string | null; reviewed: boolean
}

export type AppNotification = { id: number; type: string; bookingId: string | null; reference: string | null; status: BookingStatus | null; link: string | null; createdAt: string; read: boolean }
export type Conversation = { bookingId: string; reference: string; status: BookingStatus; originId: string; destinationId: string; counterpart: string; lastBody: string | null; lastAt: string | null; unread: number; createdAt: string }
export type ChatMessage = { id: number; body: string; mine: boolean; createdAt: string }
export type Review = { rating: number; comment: string | null; createdAt: string; author: string }

export type TrackingEvent = { status: BookingStatus; message: string | null; createdAt: string }

export type AdminUser = Omit<User, 'permissions'> & { rating: number | null; reviewCount: number; createdAt: string }
export type AdminStats = {
  usersByRole: Record<string, number>; usersByStatus: Record<string, number>
  tripsByStatus: Record<string, number>; bookingsByStatus: Record<string, number>
  totalBookedKg: number; totalRevenue: number
}

/** cargo / vehicle : « all » ou un identifiant. destination : « all » ou un identifiant de lieu. */
export type SearchFilters = { origin: string; destination: string; weight: string; cargo: string; vehicle: string; date: string }
