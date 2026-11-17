import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

export type ShareState = 'idle' | 'sharing' | 'denied' | 'unsupported' | 'error'

/** Partage la position GPS de l'appareil du transporteur (toutes les ~10 s) pour le suivi en direct. */
export function useShareLocation(tripId: string) {
  const [state, setState] = useState<ShareState>('idle')
  const watchId = useRef<number | null>(null)
  const lastSent = useRef(0)

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setState('idle')
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) { setState('unsupported'); return }
    setState('sharing')
    watchId.current = navigator.geolocation.watchPosition(
      async ({ coords }) => {
        const now = Date.now()
        if (now - lastSent.current < 10_000) return
        lastSent.current = now
        const finite = (value: number | null) => (value !== null && Number.isFinite(value) ? value : null)
        try {
          await api(`/trips/${tripId}/positions`, { method: 'POST', body: { lat: coords.latitude, lng: coords.longitude, speed: finite(coords.speed), heading: finite(coords.heading), accuracy: finite(coords.accuracy) } })
          setState('sharing')
        } catch (error) { if (!(error instanceof ApiError && error.code === 'TOO_FREQUENT')) setState('error') }
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    )
  }, [tripId])

  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current) }, [])
  return { state, start, stop }
}
