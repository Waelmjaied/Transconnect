import { useState, type FormEvent } from 'react'
import { LifeBuoy, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useI18n } from '../i18n'
import { api, errorKey } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { Booking } from '../types'

type TicketRow = { id: number; subject: string; status: 'open' | 'resolved'; author: string; reference: string | null; lastBody: string | null; updatedAt: string }

export function SupportPage() {
  const { t } = useI18n()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ subject: '', body: '', bookingId: '' })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>()
  const tickets = useAsync(() => api<{ tickets: TicketRow[] }>('/tickets'), [])
  const bookings = useAsync(() => (creating ? api<{ bookings: Booking[] }>('/bookings') : Promise.resolve({ bookings: [] as Booking[] })), [creating])
  const manager = can('tickets:manage')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setFailure(undefined)
    try {
      const res = await api<{ id: number }>('/tickets', { method: 'POST', body: { subject: form.subject.trim(), body: form.body.trim(), ...(form.bookingId ? { bookingId: form.bookingId } : {}) } })
      navigate(`/support/${res.id}`)
    } catch (caught) { setFailure(caught) } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      <AppHeader title={t('support.title')} fallback="/account" actions={can('tickets:create') ? <button type="button" className="icon-btn" aria-label={t('support.new')} onClick={() => setCreating((open) => !open)}><Plus size={24} /></button> : undefined} />
      <div className="pad">
        {creating && (
          <form className="form-card" onSubmit={submit}>
            <label className="field"><span>{t('support.subject')} <b>*</b></span><input required minLength={3} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></label>
            <label className="field"><span>{t('support.message')} <b>*</b></span><textarea required rows={4} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <label className="field"><span>{t('support.related')}</span>
              <select value={form.bookingId} onChange={(e) => setForm({ ...form, bookingId: e.target.value })}>
                <option value="">{t('support.none')}</option>
                {bookings.data?.bookings.map((b) => <option key={b.id} value={b.id}>{b.reference}</option>)}
              </select>
            </label>
            {failure !== undefined && <p className="field-error" role="alert">{t(errorKey(failure))}</p>}
            <button type="submit" className="btn-primary" disabled={busy}>{t('support.send')}</button>
          </form>
        )}
        {tickets.loading && !tickets.data && <Loading />}
        {tickets.error !== undefined && <ErrorBox error={tickets.error} onRetry={tickets.reload} />}
        {tickets.data && tickets.data.tickets.length === 0 && !creating && (
          <div className="empty"><span className="empty-icon"><LifeBuoy size={28} /></span><h2>{t('support.empty')}</h2>{can('tickets:create') && <button type="button" className="btn-primary" onClick={() => setCreating(true)}>{t('support.new')}</button>}</div>
        )}
        <div className="conv-list">
          {tickets.data?.tickets.map((ticket) => (
            <Link key={ticket.id} to={`/support/${ticket.id}`} className={`conv ${ticket.status === 'open' ? '' : 'resolved'}`}>
              <span className="avatar sm" aria-hidden="true">#</span>
              <div className="conv-main"><strong>{ticket.subject}</strong><small>{manager ? `${ticket.author} · ` : ''}{ticket.reference && <bdi dir="ltr">{ticket.reference} · </bdi>}{t(`support.${ticket.status}`)}</small><span>{ticket.lastBody}</span></div>
              <div className="conv-side"><small dir="ltr">{fmtDateTime(ticket.updatedAt)}</small></div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
