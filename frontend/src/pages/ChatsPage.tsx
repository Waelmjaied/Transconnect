import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { Conversation } from '../types'

export function ChatsPage() {
  const { t, city, arrow } = useI18n()
  const { data, error, loading, reload } = useAsync(() => api<{ conversations: Conversation[] }>('/messages'), [])
  const list = data?.conversations ?? []
  return (
    <div className="screen">
      <AppHeader title={t('chats.title')} back={false} />
      <div className="pad">
        {loading && !data && <Loading />}
        {error !== undefined && <ErrorBox error={error} onRetry={reload} />}
        {data && list.length === 0 && (
          <div className="empty">
            <span className="empty-icon"><MessageCircle size={28} /></span>
            <h2>{t('chats.emptyTitle')}</h2><p>{t('chats.emptyText')}</p>
            <Link to="/results" className="btn-primary">{t('chats.cta')}</Link>
          </div>
        )}
        <div className="conv-list">
          {list.map((c) => (
            <Link key={c.bookingId} to={`/chats/${c.bookingId}`} className={`conv ${c.unread ? 'unread' : ''}`}>
              <span className="avatar sm" aria-hidden="true">{[...c.counterpart][0]?.toUpperCase()}</span>
              <div className="conv-main">
                <strong>{c.counterpart}</strong>
                <small>{city(c.originId)} {arrow} {city(c.destinationId)} · <bdi dir="ltr">{c.reference}</bdi></small>
                <span>{c.lastBody ?? t('chat.noMessages')}</span>
              </div>
              <div className="conv-side">{c.lastAt && <small dir="ltr">{fmtDateTime(c.lastAt)}</small>}{c.unread > 0 && <b className="count-badge">{c.unread}</b>}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
