import { describe, expect, it } from 'vitest'
import { arrivalMs, departureMs, fmtDate, formatPrice, tripHours, wallToInstant } from './format'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)
const trip = (departureAt: string, arrivalAt: string, destinationId = 'fr-marseille') => ({ originId: 'tn-tunis', destinationId, departureAt, arrivalAt })

describe('fuseaux des trajets', () => {
  it('convertit les heures murales en instants (Tunis UTC+1 toute l’année, Paris/Rome avec heure d’été)', () => {
    expect(iso(wallToInstant('2027-01-15T12:00', 'Africa/Tunis'))).toBe('2027-01-15T11:00')
    expect(iso(wallToInstant('2027-07-15T12:00', 'Africa/Tunis'))).toBe('2027-07-15T11:00')
    expect(iso(wallToInstant('2027-01-15T12:00', 'Europe/Paris'))).toBe('2027-01-15T11:00')
    expect(iso(wallToInstant('2027-07-15T12:00', 'Europe/Paris'))).toBe('2027-07-15T10:00')
  })
  it('la durée tient compte du décalage entre Tunis et la destination', () => {
    // Hiver : 08:30 Tunis → 11:00 Paris le lendemain = 25 h 30 − 0 h (même UTC+1) → 26.5 h
    expect(tripHours(trip('2027-01-12T08:30', '2027-01-13T11:00'))).toBeCloseTo(26.5, 5)
    // Été : Paris est à UTC+2, Tunis à UTC+1 → 1 h de moins qu’en lecture naïve
    expect(tripHours(trip('2027-07-12T08:30', '2027-07-13T11:00'))).toBeCloseTo(25.5, 5)
  })
  it('départ et arrivée utilisent chacun le fuseau de leur lieu', () => {
    const t = trip('2027-07-01T10:00', '2027-07-01T12:30', 'it-rome')
    expect(iso(departureMs(t))).toBe('2027-07-01T09:00')
    expect(iso(arrivalMs(t))).toBe('2027-07-01T10:30')
  })
})

describe('affichage', () => {
  it('fmtDate garde l’heure murale du serveur', () => {
    expect(fmtDate('2026-11-24T08:30')).toBe('24/11/2026')
    expect(fmtDate('')).toBe('')
  })
  it('formatPrice', () => {
    expect(formatPrice(1.1)).toBe('1.10 €')
    expect(formatPrice(2)).toBe('2 €')
  })
})
