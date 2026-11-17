import { useState } from 'react'
import { Download, Lock, ShieldAlert } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BarChart, HBars } from '../components/Charts'
import { DataTable } from '../components/DataTable'
import { AppHeader, Layer } from '../components/Shell'
import { ErrorBox, Loading } from '../components/State'
import { Stars } from '../components/Stars'
import { useToast } from '../components/Toast'
import { ADMIN_ONLY, ALL_PERMISSIONS } from '../data/permissions'
import { useI18n } from '../i18n'
import { api, downloadFile, errorKey } from '../lib/api'
import { fmtDate, fmtDateTime, formatPrice } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { AdminUser, Booking, BookingStatus, Role, Trip, UserStatus } from '../types'

type Overview = {
  kpis: { users: number; newUsers7d: number; pendingCarriers: number; openTrips: number; bookings30d: number; revenue30d: number; avgRating: number; deliveredRate: number; fillRate: number; openTickets: number }
  series: { date: string; bookings: number; revenue: number; signups: number }[]
  bookingsByStatus: Record<string, number>
  topRoutes: { originId: string; destinationId: string; bookings: number; kg: number; revenue: number }[]
  topCarriers: { id: string; name: string; rating: number | null; reviewCount: number; bookings: number; revenue: number }[]
}
type AdminTrip = Trip & { bookingsCount: number }
type AdminReview = { id: number; rating: number; comment: string | null; hidden: boolean; createdAt: string; customer: string; carrier: string; reference: string }
type AuditEntry = { id: number; action: string; targetType: string; targetId: string; detail: unknown; at: string; actor: string }
type TicketRow = { id: number; subject: string; status: 'open' | 'resolved'; author: string; reference: string | null; updatedAt: string }
type Effect = 'allow' | 'deny'

const TABS = [
  { id: 'overview', perm: 'stats:read', key: 'dash.overview' }, { id: 'users', perm: 'users:read', key: 'dash.users' },
  { id: 'trips', perm: 'trips:moderate', key: 'dash.trips' }, { id: 'bookings', perm: 'bookings:read_all', key: 'dash.bookings' },
  { id: 'reviews', perm: 'reviews:moderate', key: 'dash.reviews' }, { id: 'tickets', perm: 'tickets:manage', key: 'dash.tickets' },
  { id: 'audit', perm: 'audit:read', key: 'dash.audit' },
]
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const roles: Role[] = ['customer', 'carrier', 'support', 'admin']

export function AdminPage() {
  const { t } = useI18n()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const tabs = TABS.filter((tab) => can(tab.perm))
  const active = tabs.find((tab) => tab.id === params.get('tab'))?.id ?? tabs[0]?.id
  const go = (tab: string, extra: Record<string, string> = {}) => setParams({ tab, ...extra }, { replace: true })

  if (!active) return <div className="screen"><AppHeader title={t('dash.title')} fallback="/account" /><div className="pad"><div className="empty"><span className="empty-icon"><ShieldAlert size={26} /></span><p>{t('err.FORBIDDEN')}</p></div></div></div>

  return (
    <div className="screen admin">
      <AppHeader title={t('dash.title')} fallback="/account" />
      <nav className="tabs-scroll" role="tablist" aria-label={t('dash.title')}>
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className={active === tab.id ? 'on' : ''} onClick={() => go(tab.id)}>{t(tab.key)}</button>)}
      </nav>
      <div className="admin-body">
        {active === 'overview' && <OverviewTab onGo={go} />}
        {active === 'users' && <UsersTab initialStatus={(params.get('status') as UserStatus | null) ?? 'all'} />}
        {active === 'trips' && <TripsTab />}
        {active === 'bookings' && <BookingsTab />}
        {active === 'reviews' && <ReviewsTab />}
        {active === 'tickets' && <TicketsTab />}
        {active === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

function OverviewTab({ onGo }: { onGo: (tab: string, extra?: Record<string, string>) => void }) {
  const { t, place, city, arrow } = useI18n()
  const { can } = useAuth()
  const { toast, showToast } = useToast()
  const { data, error, loading, reload } = useAsync(() => api<Overview>('/admin/overview'), [])
  if (loading && !data) return <Loading />
  if (error !== undefined || !data) return <ErrorBox error={error} onRetry={reload} />
  const k = data.kpis
  const cards: { label: string; value: string; alert?: boolean; to?: [string, Record<string, string>?] }[] = [
    { label: t('kpi.users'), value: String(k.users) }, { label: t('kpi.newUsers'), value: `+${k.newUsers7d}` },
    { label: t('kpi.pendingCarriers'), value: String(k.pendingCarriers), alert: k.pendingCarriers > 0, to: ['users', { status: 'pending' }] },
    { label: t('kpi.openTrips'), value: String(k.openTrips), to: ['trips'] },
    { label: t('kpi.bookings30'), value: String(k.bookings30d), to: ['bookings'] }, { label: t('kpi.revenue30'), value: formatPrice(k.revenue30d) },
    { label: t('kpi.rating'), value: k.avgRating ? `${k.avgRating.toFixed(2)} / 5` : '—' }, { label: t('kpi.delivered'), value: `${k.deliveredRate}%` },
    { label: t('kpi.fill'), value: `${k.fillRate}%` }, { label: t('kpi.tickets'), value: String(k.openTickets), alert: k.openTickets > 0, to: ['tickets'] },
  ]
  const days = data.series
  const sum = (key: 'bookings' | 'revenue' | 'signups') => days.reduce((total, d) => total + d[key], 0)
  const exportCsv = () => downloadFile('/admin/export/bookings.csv', 'bookings.csv').catch((e) => showToast(t(errorKey(e))))
  return (
    <>
      <div className="dash-actions">{can('bookings:read_all') && can('stats:read') && <button type="button" className="pill-btn" onClick={exportCsv}><Download size={14} /> {t('dash.export')}</button>}</div>
      <div className="kpi-grid">
        {cards.map((c) => {
          const body = <><b>{c.value}</b><span>{c.label}</span></>
          return c.to ? <button key={c.label} type="button" className={`kpi ${c.alert ? 'alert' : ''}`} onClick={() => onGo(c.to![0], c.to![1])}>{body}</button> : <div key={c.label} className="kpi">{body}</div>
        })}
      </div>
      <div className="chart-grid">
        <BarChart title={t('chart.bookings')} total={String(sum('bookings'))} data={days.map((d) => ({ label: shortDay(d.date), value: d.bookings }))} />
        <BarChart title={t('chart.revenue')} total={formatPrice(sum('revenue'))} color="var(--green)" format={formatPrice} data={days.map((d) => ({ label: shortDay(d.date), value: d.revenue }))} />
        <BarChart title={t('chart.signups')} total={String(sum('signups'))} color="var(--gold)" data={days.map((d) => ({ label: shortDay(d.date), value: d.signups }))} />
        <HBars title={t('chart.status')} items={Object.entries(data.bookingsByStatus).map(([status, value]) => ({ label: t(`head.${status}`), value }))} />
      </div>
      <h2 className="block-title">{t('chart.routes')}</h2>
      <DataTable rows={data.topRoutes} rowKey={(r) => `${r.originId}-${r.destinationId}`} columns={[
        { key: 'r', header: t('col.route'), render: (r) => `${city(r.originId)} ${arrow} ${place(r.destinationId)}` },
        { key: 'b', header: t('col.bookings'), render: (r) => r.bookings }, { key: 'k', header: t('col.weight'), render: (r) => <bdi dir="ltr">{r.kg} kg</bdi> },
        { key: 'v', header: t('col.price'), render: (r) => formatPrice(r.revenue) },
      ]} />
      <h2 className="block-title">{t('chart.carriers')}</h2>
      <DataTable rows={data.topCarriers} rowKey={(r) => r.id} columns={[
        { key: 'n', header: t('col.carrier'), render: (r) => r.name }, { key: 'b', header: t('col.bookings'), render: (r) => r.bookings },
        { key: 'v', header: t('col.price'), render: (r) => formatPrice(r.revenue) }, { key: 'r', header: t('col.rating'), render: (r) => (r.rating ? <><Stars value={Math.round(r.rating)} size={13} /> <bdi dir="ltr">{r.rating.toFixed(1)}</bdi></> : '—') },
      ]} />
      {toast}
    </>
  )
}

function UsersTab({ initialStatus }: { initialStatus: 'all' | UserStatus }) {
  const { t } = useI18n()
  const { user, can } = useAuth()
  const { toast, showToast } = useToast()
  const [status, setStatus] = useState<'all' | UserStatus>(initialStatus)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const users = useAsync(() => {
    const p = new URLSearchParams()
    if (status !== 'all') p.set('status', status)
    if (q.trim()) p.set('q', q.trim())
    return api<{ users: AdminUser[] }>(`/admin/users?${p}`)
  }, [status, q])
  const patch = async (target: AdminUser, body: { role?: Role; status?: UserStatus }) => {
    if (body.status === 'disabled' && !window.confirm(t('admin.confirmDisable'))) return
    try { await api(`/admin/users/${target.id}`, { method: 'PATCH', body }); users.reload() } catch (error) { showToast(t(errorKey(error))) }
  }
  const manage = can('users:manage')
  return (
    <>
      <div className="filter-row">
        <input className="search-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.search')} aria-label={t('admin.search')} maxLength={80} />
        <div className="chips">{(['all', 'pending', 'active', 'disabled'] as const).map((s) => <button key={s} type="button" className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s === 'all' ? t('common.all') : t(`userStatus.${s}`)}</button>)}</div>
      </div>
      {users.loading && !users.data && <Loading />}
      {users.error !== undefined && <ErrorBox error={users.error} onRetry={users.reload} />}
      {users.data && (
        <DataTable rows={users.data.users} rowKey={(u) => u.id} empty={t('admin.empty')} columns={[
          { key: 'n', header: t('col.name'), render: (u) => <>{u.name} {u.id === user?.id && <small>({t('admin.you')})</small>}</> },
          { key: 'e', header: t('col.email'), render: (u) => <bdi dir="ltr">{u.email}</bdi> },
          { key: 'r', header: t('col.role'), render: (u) => manage && u.id !== user?.id
            ? <select className="role-select" value={u.role} aria-label={t('users.changeRole')} onChange={(e) => patch(u, { role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>
            : <span className={`role-tag role-${u.role}`}>{t(`role.${u.role}`)}</span> },
          { key: 's', header: t('col.status'), render: (u) => <span className={`role-tag st-${u.status}`}>{t(`userStatus.${u.status}`)}</span> },
          { key: 'a', header: t('col.actions'), render: (u) => u.id === user?.id ? null : (
            <div className="mc-actions">
              {manage && u.status === 'pending' && <button type="button" className="pill-btn" onClick={() => patch(u, { status: 'active' })}>{t('admin.approve')}</button>}
              {manage && u.status === 'active' && <button type="button" className="pill-btn danger" onClick={() => patch(u, { status: 'disabled' })}>{t('admin.disable')}</button>}
              {manage && u.status === 'disabled' && <button type="button" className="pill-btn" onClick={() => patch(u, { status: 'active' })}>{t('admin.enable')}</button>}
              {can('users:permissions') && <button type="button" className="pill-btn" onClick={() => setEditing(u)}><Lock size={13} /> {t('users.privileges')}</button>}
            </div>) },
        ]} />
      )}
      {editing && <PermissionsSheet target={editing} onClose={() => setEditing(null)} onSaved={() => { showToast(t('users.saved')); users.reload() }} />}
      {toast}
    </>
  )
}

function PermissionsSheet({ target, onClose, onSaved }: { target: AdminUser; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n()
  const info = useAsync(() => api<{ role: Role; base: string[]; overrides: Record<string, Effect>; locked: boolean }>(`/admin/users/${target.id}/permissions`), [target.id])
  const [draft, setDraft] = useState<Record<string, Effect> | null>(null)
  const [failure, setFailure] = useState<unknown>()
  const overrides = draft ?? info.data?.overrides ?? {}
  const set = (permission: string, value: 'inherit' | Effect) => {
    const next = { ...overrides }
    if (value === 'inherit') delete next[permission]; else next[permission] = value
    setDraft(next)
  }
  const save = async () => {
    try { await api(`/admin/users/${target.id}/permissions`, { method: 'PUT', body: { overrides } }); onSaved(); onClose() } catch (error) { setFailure(error) }
  }
  return (
    <Layer open onClose={onClose} variant="sheet" label={t('users.privileges')}>
      <div className="sheet-head"><h2>{t('users.privileges')}</h2><span className={`role-tag role-${target.role}`}>{target.name}</span></div>
      {info.loading && !info.data && <Loading />}
      {info.data?.locked && <p className="banner">{t('users.adminLocked')}</p>}
      {info.data && !info.data.locked && <p className="hint-line">{t('users.grantHint')}</p>}
      {info.data && (
        <ul className="perm-list">
          {ALL_PERMISSIONS.map((permission) => {
            const base = info.data!.base.includes(permission)
            const current = overrides[permission] ?? 'inherit'
            const effective = current === 'allow' ? true : current === 'deny' ? false : base
            const locked = info.data!.locked || ADMIN_ONLY.includes(permission)
            return (
              <li key={permission} className={effective ? 'granted' : ''}>
                <div><strong>{t(`perm.${permission}`)}</strong><small dir="ltr">{permission}{locked && !info.data!.locked ? ` · ${t('users.adminOnly')}` : ''}</small></div>
                {locked ? <span className={`dot ${effective ? 'on' : ''}`} aria-label={effective ? t('users.allow') : t('users.deny')} /> : (
                  <div className="tri" role="radiogroup" aria-label={t(`perm.${permission}`)}>
                    {(['inherit', 'allow', 'deny'] as const).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={current === value} className={`${current === value ? 'on' : ''} v-${value}`} onClick={() => set(permission, value)}>
                        {value === 'inherit' ? t('users.inherit') : value === 'allow' ? t('users.allow') : t('users.deny')}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {failure !== undefined && <p className="field-error" role="alert">{t(errorKey(failure))}</p>}
      {info.data && !info.data.locked && <button type="button" className="btn-primary" onClick={save}>{t('users.save')}</button>}
    </Layer>
  )
}

function TripsTab() {
  const { t, city, arrow } = useI18n()
  const { can } = useAuth()
  const { toast, showToast } = useToast()
  const [q, setQ] = useState('')
  const trips = useAsync(() => api<{ trips: AdminTrip[] }>(`/admin/trips${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`), [q])
  const cancel = async (trip: AdminTrip) => {
    if (!window.confirm(t('my.confirmCancelTrip'))) return
    try { await api(`/trips/${trip.id}`, { method: 'PATCH', body: { status: 'cancelled' } }); trips.reload() } catch (error) { showToast(t(errorKey(error))) }
  }
  const live = (trip: AdminTrip) => trip.lastPositionAt && Date.now() - new Date(`${trip.lastPositionAt.replace(' ', 'T')}Z`).getTime() < 15 * 60_000
  return (
    <>
      <input className="search-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.search')} aria-label={t('admin.search')} maxLength={60} />
      {trips.loading && !trips.data && <Loading />}
      {trips.error !== undefined && <ErrorBox error={trips.error} onRetry={trips.reload} />}
      {trips.data && <DataTable rows={trips.data.trips} rowKey={(r) => r.id} empty={t('results.emptyTitle')} columns={[
        { key: 'r', header: t('col.route'), render: (r) => `${city(r.originId)} ${arrow} ${city(r.destinationId)}` },
        { key: 'd', header: t('col.date'), render: (r) => <bdi dir="ltr">{fmtDate(r.departureAt)}</bdi> },
        { key: 'c', header: t('col.carrier'), render: (r) => r.carrierName }, { key: 'v', header: t('col.vehicle'), render: (r) => <bdi dir="ltr">{r.vehicleModel}</bdi> },
        { key: 'p', header: t('col.price'), render: (r) => <bdi dir="ltr">{r.pricePerKg.toFixed(2)} €/kg</bdi> },
        { key: 'f', header: t('col.weight'), render: (r) => <bdi dir="ltr">{r.availableKg}/{r.capacityKg} kg</bdi> }, { key: 'b', header: t('col.bookings'), render: (r) => r.bookingsCount },
        { key: 's', header: t('col.status'), render: (r) => <>{r.status === 'cancelled' ? t('head.cancelled') : t('card.available')} {live(r) && <span className="role-tag st-active">GPS</span>}</> },
        { key: 'a', header: t('col.actions'), render: (r) => r.status === 'open' && can('trips:moderate') ? <button type="button" className="pill-btn danger" onClick={() => cancel(r)}>{t('my.cancelTrip')}</button> : null },
      ]} />}
      {toast}
    </>
  )
}

function BookingsTab() {
  const { t, city, arrow } = useI18n()
  const { toast, showToast } = useToast()
  const [status, setStatus] = useState<'all' | BookingStatus>('all')
  const [q, setQ] = useState('')
  const list = useAsync(() => {
    const p = new URLSearchParams()
    if (status !== 'all') p.set('status', status)
    if (q.trim()) p.set('q', q.trim())
    return api<{ bookings: Booking[] }>(`/bookings?${p}`)
  }, [status, q])
  const act = async (booking: Booking, next: BookingStatus) => {
    if ((next === 'cancelled' || next === 'rejected') && !window.confirm(t('my.confirmCancel'))) return
    try { await api(`/bookings/${booking.id}/status`, { method: 'PATCH', body: { status: next } }); list.reload() } catch (error) { showToast(t(errorKey(error))) }
  }
  const statuses: BookingStatus[] = ['pending', 'confirmed', 'picked_up', 'in_transit', 'arrived', 'delivered', 'cancelled', 'rejected']
  return (
    <>
      <div className="filter-row">
        <input className="search-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('col.reference')} / ${t('col.customer')}`} aria-label={t('col.reference')} maxLength={60} />
        <div className="chips">{(['all', ...statuses] as const).map((s) => <button key={s} type="button" className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s === 'all' ? t('common.all') : t(`head.${s}`)}</button>)}</div>
      </div>
      {list.loading && !list.data && <Loading />}
      {list.error !== undefined && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data && <DataTable rows={list.data.bookings} rowKey={(b) => b.id} empty={t('my.noBookings')} columns={[
        { key: 'ref', header: t('col.reference'), render: (b) => <Link to={`/tracking?code=${b.reference}`} className="link-inline"><bdi dir="ltr">{b.reference}</bdi></Link> },
        { key: 'r', header: t('col.route'), render: (b) => `${city(b.trip.originId)} ${arrow} ${city(b.trip.destinationId)}` },
        { key: 'c', header: t('col.customer'), render: (b) => <>{b.contact?.name} <bdi dir="ltr">{b.contact?.phone}</bdi></> }, { key: 'k', header: t('col.carrier'), render: (b) => b.trip.carrierName },
        { key: 'w', header: t('col.weight'), render: (b) => <bdi dir="ltr">{b.weightKg} kg</bdi> }, { key: 'p', header: t('col.price'), render: (b) => formatPrice(b.totalPrice) },
        { key: 's', header: t('col.status'), render: (b) => t(`head.${b.status}`) },
        { key: 'a', header: t('col.actions'), render: (b) => <div className="mc-actions">{b.allowedActions.map((a) => <button key={a} type="button" className={`pill-btn ${a === 'cancelled' || a === 'rejected' ? 'danger' : ''}`} onClick={() => act(b, a)}>{t(`act.${a}`)}</button>)}</div> },
      ]} />}
      {toast}
    </>
  )
}

function ReviewsTab() {
  const { t } = useI18n()
  const { toast, showToast } = useToast()
  const reviews = useAsync(() => api<{ reviews: AdminReview[] }>('/admin/reviews'), [])
  const toggle = async (review: AdminReview) => {
    try { await api(`/admin/reviews/${review.id}`, { method: 'PATCH', body: { hidden: !review.hidden } }); reviews.reload() } catch (error) { showToast(t(errorKey(error))) }
  }
  if (reviews.loading && !reviews.data) return <Loading />
  if (reviews.error !== undefined) return <ErrorBox error={reviews.error} onRetry={reviews.reload} />
  return (
    <>
      <DataTable rows={reviews.data?.reviews ?? []} rowKey={(r) => r.id} empty={t('review.none')} columns={[
        { key: 'r', header: t('col.rating'), render: (r) => <Stars value={r.rating} size={14} /> }, { key: 'c', header: t('col.comment'), render: (r) => <span className={r.hidden ? 'struck' : ''}>{r.comment ?? '—'}</span> },
        { key: 'u', header: t('col.customer'), render: (r) => r.customer }, { key: 'k', header: t('col.carrier'), render: (r) => r.carrier },
        { key: 'ref', header: t('col.reference'), render: (r) => <bdi dir="ltr">{r.reference}</bdi> }, { key: 'd', header: t('col.date'), render: (r) => <bdi dir="ltr">{fmtDate(r.createdAt)}</bdi> },
        { key: 'a', header: t('col.actions'), render: (r) => <button type="button" className={`pill-btn ${r.hidden ? '' : 'danger'}`} onClick={() => toggle(r)}>{r.hidden ? t('reviews.restore') : t('reviews.hide')}</button> },
      ]} />
      {toast}
    </>
  )
}

function TicketsTab() {
  const { t } = useI18n()
  const [status, setStatus] = useState<'open' | 'resolved'>('open')
  const tickets = useAsync(() => api<{ tickets: TicketRow[] }>(`/tickets?status=${status}`), [status])
  return (
    <>
      <div className="chips">{(['open', 'resolved'] as const).map((s) => <button key={s} type="button" className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{t(`support.${s}`)}</button>)}</div>
      {tickets.loading && !tickets.data && <Loading />}
      {tickets.error !== undefined && <ErrorBox error={tickets.error} onRetry={tickets.reload} />}
      {tickets.data && <DataTable rows={tickets.data.tickets} rowKey={(r) => r.id} empty={t('support.empty')} columns={[
        { key: 'id', header: '#', render: (r) => <Link to={`/support/${r.id}`} className="link-inline">#{r.id}</Link> }, { key: 's', header: t('col.subject'), render: (r) => r.subject },
        { key: 'u', header: t('col.customer'), render: (r) => r.author }, { key: 'ref', header: t('col.reference'), render: (r) => (r.reference ? <bdi dir="ltr">{r.reference}</bdi> : '—') },
        { key: 'd', header: t('col.date'), render: (r) => <bdi dir="ltr">{fmtDateTime(r.updatedAt)}</bdi> }, { key: 'st', header: t('col.status'), render: (r) => t(`support.${r.status}`) },
      ]} />}
    </>
  )
}

function AuditTab() {
  const { t } = useI18n()
  const audit = useAsync(() => api<{ entries: AuditEntry[] }>('/admin/audit'), [])
  if (audit.loading && !audit.data) return <Loading />
  if (audit.error !== undefined) return <ErrorBox error={audit.error} onRetry={audit.reload} />
  const label = (action: string) => { const key = `audit.${action}`; const text = t(key); return text === key ? action : text }
  return (
    <DataTable rows={audit.data?.entries ?? []} rowKey={(e) => e.id} empty={t('audit.empty')} columns={[
      { key: 'd', header: t('col.date'), render: (e) => <bdi dir="ltr">{fmtDateTime(e.at)}</bdi> }, { key: 'a', header: t('col.actor'), render: (e) => e.actor },
      { key: 'ac', header: t('col.action'), render: (e) => label(e.action) }, { key: 't', header: t('col.target'), render: (e) => <bdi dir="ltr">{e.targetType}:{e.targetId.slice(0, 8)}</bdi> },
      { key: 'x', header: '', render: (e) => (e.detail ? <code className="audit-detail" dir="ltr">{JSON.stringify(e.detail).slice(0, 120)}</code> : null) },
    ]} />
  )
}
