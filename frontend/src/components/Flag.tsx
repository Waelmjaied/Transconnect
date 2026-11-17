import type { CountryCode } from '../data/places'
import { useI18n } from '../i18n'

export function Flag({ country, size = 28 }: { country: CountryCode; size?: number }) {
  const { t } = useI18n()
  const style = { width: size, height: size }
  const label = t(`country.${country}`)
  if (country === 'tn') {
    return <span className="flag" style={style} role="img" aria-label={label}><svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="17" fill="#fff"/><circle cx="18" cy="18" r="10.5" fill="#e51e38"/><circle cx="20.5" cy="17" r="5.5" fill="#fff"/><circle cx="22.3" cy="16.8" r="4.5" fill="#e51e38"/><path d="m18.2 12.1 1.2 3.4 3.6.1-2.9 2.1 1.1 3.5-3-2.1-2.9 2.1 1-3.5-2.9-2.1 3.7-.1z" fill="#fff"/></svg></span>
  }
  return <span className={`flag flag-stripes flag-${country}`} style={style} role="img" aria-label={label}><i /><i /><i /></span>
}
