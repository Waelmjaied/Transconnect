import { Navigation, Radio } from 'lucide-react'
import { useI18n } from '../i18n'
import { useShareLocation } from '../lib/useShareLocation'

export function ShareLocation({ tripId }: { tripId: string }) {
  const { t } = useI18n()
  const { state, start, stop } = useShareLocation(tripId)
  const sharing = state === 'sharing'
  return (
    <div className="share-loc">
      <button type="button" className={`pill-btn ${sharing ? 'live' : ''}`} onClick={sharing ? stop : start}>
        {sharing ? <Radio size={14} /> : <Navigation size={14} />} {sharing ? t('gps.stop') : t('gps.share')}
      </button>
      {sharing && <small className="ok-text">{t('gps.sharing')}</small>}
      {state === 'denied' && <small className="field-error">{t('gps.denied')}</small>}
      {state === 'unsupported' && <small className="field-error">{t('gps.unsupported')}</small>}
      {state === 'error' && <small className="field-error">{t('err.NETWORK')}</small>}
    </div>
  )
}
