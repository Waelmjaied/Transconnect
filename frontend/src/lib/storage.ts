import type { SearchFilters } from '../types'
import { getPlace } from '../data/places'
import { cargoIds, vehicleKinds } from '../data/catalog'

const SEARCH = 'transconnect:search'
export const TOKEN_KEY = 'transconnect:token'

export const readStored = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
export const writeStored = (key: string, value: string | null) => {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* stockage indisponible */ }
}

export function getSearch(fallback: SearchFilters): SearchFilters {
  try {
    const saved = { ...fallback, ...(JSON.parse(readStored(SEARCH) ?? '{}') as Partial<SearchFilters>) }
    const okOrigin = getPlace(saved.origin)?.country === 'tn'
    const okDestination = saved.destination === 'all' || (!!getPlace(saved.destination) && getPlace(saved.destination)?.country !== 'tn')
    const okCargo = saved.cargo === 'all' || (cargoIds as string[]).includes(saved.cargo)
    const okVehicle = saved.vehicle === 'all' || (vehicleKinds as string[]).includes(saved.vehicle)
    return okOrigin && okDestination && okCargo && okVehicle ? saved : fallback
  } catch { return fallback }
}
export const saveSearch = (search: SearchFilters) => writeStored(SEARCH, JSON.stringify(search))
