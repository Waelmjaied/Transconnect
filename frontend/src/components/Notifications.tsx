import { useEffect } from 'react'
import { BellOff, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Layer } from './Shell'
import { ErrorBox, Loading } from './State'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { useNotify } from '../notify/NotifyContext'
import { useAsync } from '../lib/useAsync'
import type { AppNotification } from '../types'

export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { refresh } = useNotify()
  const { data, error, loading, reload } = useAsync(() => (open ? api<{ notifications: AppNotification[] }>('/notifications') : Promise.resolve(null)), [open])

  const markAll = () => api('/notifications/read-all', { method: 'POST' }).then(() => { reload(); refresh() }).catch(() => undefined)
  // Ouvrir la feuille = avoir vu les notifications : on les marque comme lues après affichage.
  useEffect(() => {
    if (open && data?.notifications.some((n) => !n.read)) { const timer = window.setTimeout(markAll, 1500); return () => window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data])

  const text = (n: AppNotification) => t(`notif.${n.type}`, { reference: n.reference ?? '', status: n.status ? t(`head.${n.status}`) : '' })
  const target = (n: AppNotification) => n.link ?? (n.type === 'account_approved' ? '/publish' : n.type === 'booking_created' || n.type === 'review' ? '/my-trips' : `/tracking?code=${n.reference}`)

  return (
    <Layer open={open} onClose={onClose} variant="sheet" label={t('notif.title')}>
      <div className="sheet-head"><h2>{t('notif.title')}</h2><button type="button" className="link-btn" onClick={markAll}><Check size={15} /> {t('notif.markAll')}</button></div>
      {loading && !data && <Loading />}
      {error !== undefined && <ErrorBox error={error} onRetry={reload} />}
      {data && data.notifications.length === 0 && <div className="state-box"><BellOff size={28} /><p>{t('notif.none')}</p></div>}
      <ul className="notif-list">
        {data?.notifications.map((n) => (
          <li key={n.id} className={n.read ? '' : 'unread'}>
            <Link to={target(n)} onClick={onClose}><span>{text(n)}</span><small dir="ltr">{fmtDateTime(n.createdAt)}</small></Link>
          </li>
        ))}
      </ul>
    </Layer>
  )
}
