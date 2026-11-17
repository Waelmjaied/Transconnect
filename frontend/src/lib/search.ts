import type { SearchFilters } from '../types'
import { cargoIds, clampWeight, defaultSearch, vehicleKinds } from '../data/catalog'
import { getPlace } from '../data/places'

export const toParams = (values: SearchFilters) => new URLSearchParams(Object.entries(values).filter(([, value]) => Boolean(value)))

/** Lit et VALIDE les critères depuis l'URL (jamais de valeur arbitraire transmise telle quelle à l'API). */
export function readCriteria(params: URLSearchParams): SearchFilters {
  const origin = params.get('origin') ?? ''
  const destination = params.get('destination') ?? ''
  const cargo = params.get('cargo') ?? ''
  const vehicle = params.get('vehicle') ?? ''
  const date = params.get('date') ?? ''
  const weight = params.get('weight') ?? defaultSearch.weight
  return {
    origin: getPlace(origin)?.country === 'tn' ? origin : defaultSearch.origin,
    destination: destination === 'all' || (getPlace(destination) && getPlace(destination)?.country !== 'tn') ? destination : defaultSearch.destination,
    weight: /^\d{1,3}$/.test(weight) ? String(clampWeight(Number(weight))) : defaultSearch.weight,
    cargo: (cargoIds as string[]).includes(cargo) ? cargo : 'all',
    vehicle: (vehicleKinds as string[]).includes(vehicle) ? vehicle : 'all',
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
  }
}
