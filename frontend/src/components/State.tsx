import { RotateCcw } from 'lucide-react'
import { errorKey } from '../lib/api'
import { useI18n } from '../i18n'

export function Loading() {
  const { t } = useI18n()
  return <div className="state-box" role="status"><span className="spinner" aria-hidden="true" /><p>{t('common.loading')}</p></div>
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="state-box state-error" role="alert">
      <p>{t(errorKey(error))}</p>
      {onRetry && <button type="button" className="btn-outline" onClick={onRetry}><RotateCcw size={16} /> {t('common.retry')}</button>}
    </div>
  )
}
