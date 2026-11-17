import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'

type Thread = {
  ticket: { id: number; subject: string; status: 'open' | 'resolved'; author: string; reference: string | null }
  messages: { id: number; body: string; createdAt: string; sender: string; role: string; mine: boolean }[]
}

export function TicketPage() {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<unknown>()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api<Thread>(`/tickets/${encodeURIComponent(id)}`).then((data) => { setThread(data); setError(undefined) }).catch(setError), [id])
  useEffect(() => {
    load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 8000)
    return () => window.clearInterval(timer)
  }, [load])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    try { await api(`/tickets/${id}/messages`, { method: 'POST', body: { body: text.trim() } }); setText(''); await load() } catch (caught) { setError(caught) } finally { setBusy(false) }
  }
  const setStatus = async (status: 'open' | 'resolved') => { try { await api(`/tickets/${id}`, { method: 'PATCH', body: { status } }); await load() } catch (caught) { setError(caught) } }

  return (
    <div className="screen chat-screen">
      <AppHeader title={thread?.ticket.subject ?? t('support.title')} subtitle={thread ? `${thread.ticket.author}${thread.ticket.reference ? ` · ${thread.ticket.reference}` : ''}` : undefined} fallback="/support" />
      {!thread && !error && <Loading />}
      {error !== undefined && <ErrorBox error={error} onRetry={load} />}
      {thread && (
        <>
          <div className="chat-body">
            <div className="ticket-status"><span className={`role-tag ${thread.ticket.status === 'open' ? 'st-pending' : 'st-active'}`}>{t(`support.${thread.ticket.status}`)}</span>
              <button type="button" className="pill-btn" onClick={() => setStatus(thread.ticket.status === 'open' ? 'resolved' : 'open')}>{thread.ticket.status === 'open' ? t('support.resolve') : t('support.reopen')}</button></div>
            {thread.messages.map((m) => (
              <div key={m.id} className={`bubble ${m.mine ? 'mine' : 'theirs'}`}>
                {!m.mine && <strong className="bubble-author">{m.sender} {(m.role === 'support' || m.role === 'admin') && <span className="role-tag role-admin">{t(`role.${m.role}`)}</span>}</strong>}
                <p>{m.body}</p><small dir="ltr">{fmtDateTime(m.createdAt)}</small>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={send}>
            <div><input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={t('support.reply')} aria-label={t('support.reply')} />
              <button type="submit" className="send-btn" disabled={busy || !text.trim()} aria-label={t('support.send')}><Send size={20} /></button></div>
          </form>
        </>
      )}
    </div>
  )
}
