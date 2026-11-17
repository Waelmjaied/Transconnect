import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Box, CalendarDays, Car, Globe, Plus, Search, Weight, X } from 'lucide-react'
import type { SearchFilters } from '../types'
import { cargoIds, clampWeight, MAX_PARCEL_KG, MIN_PARCEL_KG, vehicleKinds } from '../data/catalog'
import { destinationPlaces, getPlace, originPlaces } from '../data/places'
import { fmtDate, todayInput } from '../lib/format'
import { useI18n } from '../i18n'
import { Flag } from './Flag'

type Option = { value: string; label: string }

function SelectBox({ label, icon, value, options, onChange }: { label: string; icon: ReactNode; value: string; options: Option[]; onChange: (value: string) => void }) {
  const current = options.find((option) => option.value === value)
  return (
    <label className="f-box">
      <span className="f-icon">{icon}</span>
      <span className="f-body"><span className="f-label">{label}</span><span className="f-value">{current?.label ?? value}</span></span>
      <select className="f-native" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

const placeIcon = (id: string) => { const place = getPlace(id); return place ? <Flag country={place.country} size={30} /> : <Globe size={30} strokeWidth={1.8} /> }

export function SearchForm({ initial, onSearch }: { initial: SearchFilters; onSearch: (values: SearchFilters) => void }) {
  const { t, place } = useI18n()
  const [values, setValues] = useState<SearchFilters>(initial)
  useEffect(() => setValues(initial), [initial])
  const update = (key: keyof SearchFilters, value: string) => setValues((current) => ({ ...current, [key]: value }))
  const bump = () => update('weight', String(clampWeight((Number(values.weight) || 0) + 10)))
  const submit = (event: FormEvent) => { event.preventDefault(); onSearch({ ...values, weight: String(clampWeight(Number(values.weight))) }) }

  return (
    <form className="search-form" onSubmit={submit}>
      <SelectBox label={t('form.from')} icon={placeIcon(values.origin)} value={values.origin} onChange={(v) => update('origin', v)} options={originPlaces.map((p) => ({ value: p.id, label: place(p.id) }))} />
      <SelectBox label={t('form.to')} icon={placeIcon(values.destination)} value={values.destination} onChange={(v) => update('destination', v)} options={[...destinationPlaces.map((p) => ({ value: p.id, label: place(p.id) })), { value: 'all', label: t('form.allDestinations') }]} />

      <div className="f-box">
        <span className="f-icon"><Weight size={30} strokeWidth={1.7} /></span>
        <span className="f-body">
          <label className="f-label" htmlFor="weight-input">{t('form.weight')}</label>
          <span className="f-weight">
            <input id="weight-input" className="f-input" type="number" min={MIN_PARCEL_KG} max={MAX_PARCEL_KG} inputMode="numeric" value={values.weight} placeholder="50" onChange={(event) => update('weight', event.target.value)} onBlur={() => update('weight', String(clampWeight(Number(values.weight))))} />
            <button type="button" className="f-plus" onClick={bump} aria-label={t('form.addWeight')}><Plus size={13} strokeWidth={2.6} /></button>
          </span>
        </span>
      </div>
      <SelectBox label={t('form.cargo')} icon={<Box size={30} strokeWidth={1.8} />} value={values.cargo} onChange={(v) => update('cargo', v)} options={['all', ...cargoIds].map((id) => ({ value: id, label: t(`cargo.${id}`) }))} />

      <SelectBox label={t('form.vehicle')} icon={<Car size={30} strokeWidth={1.8} />} value={values.vehicle} onChange={(v) => update('vehicle', v)} options={['all', ...vehicleKinds].map((id) => ({ value: id, label: t(`vehicle.${id}`) }))} />
      <label className="f-box">
        <span className="f-icon"><CalendarDays size={30} strokeWidth={1.8} /></span>
        <span className="f-body"><span className="f-label">{t('form.dateOptional')}</span><span className={`f-value ${values.date ? '' : 'f-placeholder'}`}>{values.date ? fmtDate(values.date) : t('form.anyDate')}</span></span>
        {values.date && <button type="button" className="f-clear" onClick={() => update('date', '')} aria-label={t('form.clearDate')}><X size={14} /></button>}
        <input className="f-native" type="date" min={todayInput()} value={values.date} aria-label={t('form.date')} onChange={(event) => update('date', event.target.value)} onClick={(event) => { try { event.currentTarget.showPicker?.() } catch { /* non supporté */ } }} />
      </label>

      <button type="submit" className="btn-primary f-submit"><Search size={21} /> {t('form.search')}</button>
    </form>
  )
}
