import { describe, expect, it } from 'vitest'
import { defaultSearch } from '../data/catalog'
import { readCriteria, toParams } from './search'

const read = (query: string) => readCriteria(new URLSearchParams(query))

describe('readCriteria : l’URL n’est jamais transmise telle quelle', () => {
  it('retombe sur les valeurs par défaut quand l’URL est vide', () => {
    expect(read('')).toEqual(defaultSearch)
  })
  it('rejette origine, destination, fret et véhicule inconnus', () => {
    const result = read('origin=fr-paris&destination=tn-tunis&cargo=<script>&vehicle=boat')
    expect(result.origin).toBe(defaultSearch.origin)
    expect(result.destination).toBe(defaultSearch.destination)
    expect(result.cargo).toBe('all')
    expect(result.vehicle).toBe('all')
  })
  it('accepte des critères valides', () => {
    const result = read('origin=tn-sfax&destination=it-rome&cargo=parcels&vehicle=van&weight=20&date=2027-02-03')
    expect(result).toMatchObject({ origin: 'tn-sfax', destination: 'it-rome', cargo: 'parcels', vehicle: 'van', weight: '20', date: '2027-02-03' })
  })
  it('borne le poids à 1–60 kg et ignore une date mal formée', () => {
    expect(read('weight=999').weight).toBe('60')
    expect(read('weight=abc').weight).toBe(defaultSearch.weight)
    expect(read('date=demain').date).toBe('')
  })
  it('toParams omet les champs vides', () => {
    expect(toParams({ ...defaultSearch, date: '' }).has('date')).toBe(false)
  })
})
