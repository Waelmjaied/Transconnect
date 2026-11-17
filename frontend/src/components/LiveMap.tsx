import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LocateFixed } from 'lucide-react'
import { PLACE_COORDS, routeFor, type LatLng } from '../data/geo'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'

// Fournisseurs de tuiles configurables (variables Vite). Par défaut : OpenStreetMap (clair) et CARTO (sombre).
// ⚠️ La politique d'OSM limite l'usage intensif : en production, utilisez un fournisseur dédié (MapTiler, Stadia, Mapbox…) via VITE_TILE_URL.
const TILES = {
  light: { url: (import.meta.env.VITE_TILE_URL as string | undefined) ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
  dark: { url: (import.meta.env.VITE_TILE_URL_DARK as string | undefined) ?? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© OpenStreetMap © CARTO' },
}

export type LivePoint = { lat: number; lng: number; heading?: number | null; live: boolean }

const pin = (cls: string, label: string) => L.divIcon({ className: 'lm-pin-wrap', html: `<span class="lm-pin ${cls}"><b>${label}</b></span>`, iconSize: [0, 0] })
const carrierIcon = (live: boolean) => L.divIcon({ className: 'lm-pin-wrap', html: `<span class="lm-carrier ${live ? 'is-live' : ''}"><i></i></span>`, iconSize: [0, 0] })
// Les panneaux d'information flottent sur la moitié droite de la carte : on cadre l'itinéraire dans la partie visible (gauche).
const fit = (m: L.Map): L.FitBoundsOptions => ({ paddingTopLeft: [24, 48], paddingBottomRight: [Math.min(236, m.getSize().x * 0.5) + 12, 70] })
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export function LiveMap({ originId, destinationId, position, trail }: { originId: string; destinationId: string; position: LivePoint | null; trail: LatLng[] }) {
  const { t, city } = useI18n()
  const { resolved } = useTheme()
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<{ tiles?: L.TileLayer; carrier?: L.Marker; trail?: L.Polyline }>({})
  const [tileErrors, setTileErrors] = useState(0)

  // Création de la carte (une seule fois)
  useEffect(() => {
    if (!host.current) return
    const m = L.map(host.current, { zoomControl: false, attributionControl: true, worldCopyJump: true }).setView([40, 8], 5)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null; layers.current = {} }
  }, [])

  // Fond de carte selon le thème (clair / sombre)
  useEffect(() => {
    const m = map.current
    if (!m) return
    layers.current.tiles?.remove()
    const cfg = TILES[resolved]
    const tiles = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 18, subdomains: 'abcd' })
    tiles.on('tileerror', () => setTileErrors((n) => n + 1))
    tiles.on('tileload', () => setTileErrors(0))
    tiles.addTo(m)
    layers.current.tiles = tiles
  }, [resolved])

  // Itinéraire + extrémités
  useEffect(() => {
    const m = map.current
    if (!m) return
    const route = routeFor(originId, destinationId)
    const group = L.layerGroup().addTo(m)
    if (route.length > 1) {
      L.polyline(route, { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round' }).addTo(group)
      L.polyline(route, { color: '#1766D8', weight: 4.5, opacity: 1, dashArray: '1 9', lineCap: 'round' }).addTo(group)
    }
    const o = PLACE_COORDS[originId], d = PLACE_COORDS[destinationId]
    if (o) L.marker(o, { icon: pin('origin', escapeHtml(city(originId))), interactive: false }).addTo(group)
    if (d) L.marker(d, { icon: pin('dest', escapeHtml(city(destinationId))), interactive: false }).addTo(group)
    if (route.length > 1) m.fitBounds(L.latLngBounds(route), fit(m))
    return () => { group.remove() }
  }, [originId, destinationId, city])

  // Position du transporteur + trace GPS
  useEffect(() => {
    const m = map.current
    if (!m) return
    layers.current.carrier?.remove(); layers.current.trail?.remove()
    if (trail.length > 1) layers.current.trail = L.polyline(trail, { color: '#14A05A', weight: 5, opacity: 0.9 }).addTo(m)
    if (position) layers.current.carrier = L.marker([position.lat, position.lng], { icon: carrierIcon(position.live), zIndexOffset: 1000, interactive: false }).addTo(m)
  }, [position, trail])

  const recenter = () => {
    const m = map.current
    if (!m) return
    if (position) m.flyTo([position.lat, position.lng], Math.max(m.getZoom(), 8))
    else { const route = routeFor(originId, destinationId); if (route.length > 1) m.fitBounds(L.latLngBounds(route), fit(m)) }
  }

  return (
    <div className="live-map" dir="ltr">
      <div ref={host} className="live-map-canvas" role="application" aria-label={t('gps.live')} />
      <button type="button" className="map-fab" onClick={recenter} aria-label={t('gps.recenter')}><LocateFixed size={20} /></button>
      {tileErrors > 4 && <p className="map-warning" role="status">{t('gps.mapError')}</p>}
    </div>
  )
}
