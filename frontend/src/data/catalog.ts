import type { CargoId, ServiceId, VehicleKind, SearchFilters } from '../types'

export const cargoIds: CargoId[] = ['parcels', 'furniture', 'clothes', 'equipment']
export const vehicleKinds: VehicleKind[] = ['car', 'van', 'truck']
export const serviceIds: ServiceId[] = ['gps', 'insurance', 'proof']

/** Un colis pèse entre 1 kg et 60 kg (même règle que le backend). */
export const MIN_PARCEL_KG = 1
export const MAX_PARCEL_KG = 60
export const weightPresets = [5, 10, 20, 30, 40, 50, 60]
export const clampWeight = (value: number) => {
  if (!Number.isFinite(value) || value < MIN_PARCEL_KG) return MIN_PARCEL_KG
  return Math.min(MAX_PARCEL_KG, Math.round(value))
}

export const defaultSearch: SearchFilters = {
  origin: 'tn-tunis',
  destination: 'fr-marseille',
  weight: '10',
  cargo: 'all',
  vehicle: 'all',
  date: '',
}

const images: Record<VehicleKind, string> = {
  car: '/assets/van-small.webp',
  van: '/assets/van-medium.webp',
  truck: '/assets/truck-large.webp',
}
export const tripImage = (trip: { vehicleKind: VehicleKind }) => images[trip.vehicleKind] ?? images.van
