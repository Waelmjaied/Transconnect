import { Star } from 'lucide-react'
import { useI18n } from '../i18n'

export function Stars({ value, onChange, size = 20 }: { value: number; onChange?: (value: number) => void; size?: number }) {
  const { t } = useI18n()
  return (
    <span className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={t('review.stars', { n: value })}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icon = <Star size={size} fill={n <= value ? 'currentColor' : 'none'} />
        return onChange
          ? <button key={n} type="button" role="radio" aria-checked={n === value} aria-label={t('review.stars', { n })} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>{icon}</button>
          : <i key={n} className={n <= value ? 'on' : ''}>{icon}</i>
      })}
    </span>
  )
}
