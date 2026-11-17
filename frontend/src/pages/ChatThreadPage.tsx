import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useI18n } from '../i18n'
import { api, errorKey } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { useNotify } from '../notify/NotifyContext'
import type { ChatMessage } from '../types'

type Thread = { reference: string; counterpart: string; messages: ChatMessage[] }

export function ChatThreadPage() {
  const { bookingId = '' } = useParams()
  const { t } = useI18n()
  const { refresh } = useNotify()
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState<unknown>()
  const [text, setText] = useState('')
  const [sendError, setSendError] = useState<unknown>()
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const lastId = useRef(0)

  const load = useCallback(() => api<Thread>(`/messages/${encodeURIComponent(bookingId)}`).then((data) => { setThread(data); setError(undefined); refresh() }).catch(setError), [bookingId, refresh])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 6000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const newest = thread?.messages.at(-1)?.id ?? 0
    if (newest !== lastId.current) { lastId.current = newest; endRef.current?.scrollIntoView({ block: 'end' }) }
  }, [thread])

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true); setSendError(undefined)
    try { await api(`/messages/${encodeURIComponent(bookingId)}`, { method: 'POST', body: { body } }); setText(''); await load() }
    catch (caught) { setSendError(caught) } finally { setBusy(false) }
  }

  return (
    <div className="screen chat-screen">
      <AppHeader title={thread?.counterpart ?? t('chats.title')} subtitle={thread ? t('chat.about', { reference: thread.reference }) : undefined} fallback="/chats" />
      {!thread && !error && <Loading />}
      {error !== undefined && !thread && <ErrorBox error={error} onRetry={load} />}
      {thread && (
        <div className="chat-body" aria-live="polite">
          {thread.messages.length === 0 && <p className="chat-empty">{t('chat.noMessages')}</p>}
          {thread.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.mine ? 'mine' : 'theirs'}`}><p>{m.body}</p><small dir="ltr">{fmtDateTime(m.createdAt)}</small></div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      <form className="chat-input" onSubmit={send}>
        {sendError !== undefined && <p className="field-error" role="alert">{t(errorKey(sendError))}</p>}
        <div>
          <input value={text} maxLength={1000} onChange={(event) => setText(event.target.value)} placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} />
          <button type="submit" className="send-btn" disabled={busy || !text.trim()} aria-label={t('chat.send')}><Send size={20} /></button>
        </div>
      </form>
    </div>
  )
}
