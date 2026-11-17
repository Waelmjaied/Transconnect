import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { api, errorKey } from '../lib/api'
import { Stars } from './Stars'

export function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const { t } = useI18n()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined)
    try { await api(`/bookings/${bookingId}/review`, { method: 'POST', body: { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) } }); onDone() }
    catch (caught) { setError(caught) } finally { setBusy(false) }
  }
  return (
    <form className="review-form" onSubmit={submit}>
      <strong>{t('review.rate')}</strong>
      <Stars value={rating} onChange={setRating} size={26} />
      <textarea value={comment} maxLength={400} rows={2} onChange={(event) => setComment(event.target.value)} placeholder={t('review.comment')} aria-label={t('review.comment')} />
      {error !== undefined && <p className="field-error" role="alert">{t(errorKey(error))}</p>}
      <button type="submit" className="pill-btn" disabled={busy}>{t('review.submit')}</button>
    </form>
  )
}
