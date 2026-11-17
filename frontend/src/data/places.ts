export type CountryCode = 'tn' | 'fr' | 'it'
export type Place = { id: string; country: CountryCode }

export const places: Place[] = [
  { id: 'tn-tunis', country: 'tn' },
  { id: 'tn-sfax', country: 'tn' },
  { id: 'fr-marseille', country: 'fr' },
  { id: 'fr-paris', country: 'fr' },
  { id: 'fr-lyon', country: 'fr' },
  { id: 'fr-nice', country: 'fr' },
  { id: 'it-rome', country: 'it' },
]

export const originPlaces = places.filter((p) => p.country === 'tn')
export const destinationPlaces = places.filter((p) => p.country !== 'tn')

export const getPlace = (id: string): Place | undefined => places.find((p) => p.id === id)
