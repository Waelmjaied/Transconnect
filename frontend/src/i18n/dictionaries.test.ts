import { describe, expect, it } from 'vitest'
import { ar } from './ar'
import { cs } from './cs'
import { de } from './de'
import { en } from './en'
import { fr } from './fr'
import { it as italian } from './it'

const reference = Object.keys(en).sort()
const placeholders = (text: string) => (text.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',')

describe.each([['ar', ar], ['cs', cs], ['de', de], ['fr', fr], ['it', italian]] as const)('dictionnaire %s', (_name, dict) => {
  it('a exactement les mêmes clés que en.ts', () => {
    expect(Object.keys(dict).sort()).toEqual(reference)
  })
  it('conserve les mêmes variables {…} que en.ts', () => {
    const wrong = reference.filter((key) => placeholders((dict as Record<string, string>)[key]) !== placeholders((en as Record<string, string>)[key]))
    expect(wrong).toEqual([])
  })
  it('n’a aucune traduction vide', () => {
    expect(Object.entries(dict).filter(([, value]) => !String(value).trim()).map(([key]) => key)).toEqual([])
  })
})
