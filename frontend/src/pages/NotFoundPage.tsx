import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/Shell'
import { useI18n } from '../i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="screen">
      <AppHeader title="404" fallback="/" />
      <div className="pad">
        <div className="empty">
          <span className="empty-icon"><Compass size={28} /></span>
          <h2>{t('nf.title')}</h2><p>{t('nf.text')}</p>
          <Link to="/" className="btn-primary">{t('nf.home')}</Link>
        </div>
      </div>
    </div>
  )
}
