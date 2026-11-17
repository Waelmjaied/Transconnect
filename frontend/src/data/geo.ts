export type LatLng = [number, number]

export const PLACE_COORDS: Record<string, LatLng> = {
  'tn-tunis': [36.8065, 10.1815],
  'tn-sfax': [34.7406, 10.7603],
  'fr-marseille': [43.2965, 5.3698],
  'fr-paris': [48.8566, 2.3522],
  'fr-lyon': [45.764, 4.8357],
  'fr-nice': [43.7102, 7.262],
  'it-rome': [41.9028, 12.4964],
}

// Étapes maritimes/terrestres intermédiaires (approximatives) pour un tracé lisible.
const CIVITAVECCHIA: LatLng = [42.0924, 11.7956]
const SFAX_TUNIS: LatLng = [36.0, 10.6]

const VIA: Record<string, LatLng[]> = {
  'tn-tunis>fr-marseille': [],
  'tn-tunis>fr-nice': [],
  'tn-tunis>fr-lyon': [PLACE_COORDS['fr-marseille']],
  'tn-tunis>fr-paris': [PLACE_COORDS['fr-marseille'], PLACE_COORDS['fr-lyon']],
  'tn-tunis>it-rome': [CIVITAVECCHIA],
  'tn-sfax>fr-marseille': [SFAX_TUNIS],
  'tn-sfax>fr-nice': [SFAX_TUNIS],
  'tn-sfax>fr-lyon': [SFAX_TUNIS, PLACE_COORDS['fr-marseille']],
  'tn-sfax>fr-paris': [SFAX_TUNIS, PLACE_COORDS['fr-marseille'], PLACE_COORDS['fr-lyon']],
  'tn-sfax>it-rome': [SFAX_TUNIS, CIVITAVECCHIA],
}

export function routeFor(originId: string, destinationId: string): LatLng[] {
  const o = PLACE_COORDS[originId]
  const d = PLACE_COORDS[destinationId]
  if (!o || !d) return []
  return [o, ...(VIA[`${originId}>${destinationId}`] ?? []), d]
}

const R = 6371
const rad = (x: number) => (x * Math.PI) / 180
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function routeLengthKm(route: LatLng[]): number {
  let total = 0
  for (let i = 1; i < route.length; i++) total += distanceKm(route[i - 1], route[i])
  return total
}

/** Point situé à la fraction f (0–1) de la longueur de l'itinéraire. */
export function pointAlong(route: LatLng[], f: number): LatLng | null {
  if (route.length === 0) return null
  if (route.length === 1) return route[0]
  const target = Math.min(1, Math.max(0, f)) * routeLengthKm(route)
  let walked = 0
  for (let i = 1; i < route.length; i++) {
    const seg = distanceKm(route[i - 1], route[i])
    if (walked + seg >= target) {
      const k = seg === 0 ? 0 : (target - walked) / seg
      return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * k, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * k]
    }
    walked += seg
  }
  return route[route.length - 1]
}

/** Fraction (0–1) de l'itinéraire parcourue au point le plus proche de `point`. */
export function fractionOf(route: LatLng[], point: LatLng): number {
  const total = routeLengthKm(route)
  if (route.length < 2 || total === 0) return 0
  let best = Infinity
  let bestAlong = 0
  let walked = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const seg = distanceKm(a, b)
    const dx = b[1] - a[1]
    const dy = b[0] - a[0]
    const len2 = dx * dx + dy * dy
    const k = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((point[1] - a[1]) * dx + (point[0] - a[0]) * dy) / len2))
    const proj: LatLng = [a[0] + dy * k, a[1] + dx * k]
    const dist = distanceKm(point, proj)
    if (dist < best) { best = dist; bestAlong = walked + seg * k }
    walked += seg
  }
  return bestAlong / total
}
