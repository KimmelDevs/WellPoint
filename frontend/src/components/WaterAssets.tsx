import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Droplet, Droplets, GlassWater, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useBarangays } from '@/lib/barangays'
import { MapMarker, MarkerContent, MarkerPopup, MarkerTooltip, useMap } from '@/components/ui/map'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CAN_PLACE, CAN_SET_STATUS, KINDS, REPORT_TYPES, STATUSES,
  moveAsset, removeAsset, setStatus, useWaterStore,
} from '@/lib/water-store'
import type { Asset, AssetKind, Role, Status } from '@/lib/water-store'

const ICONS: Record<AssetKind, LucideIcon> = { pump: Droplet, well: Droplets, reservoir: Waves, station: GlassWater }
const field = 'w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm'

// Hands the MapLibre instance to the page so a drop can be turned into coordinates.
export function MapBridge({ mapRef }: { mapRef: RefObject<MapLibreMap | null> }) {
  const { map } = useMap()
  useEffect(() => {
    mapRef.current = map ?? null
    return () => {
      mapRef.current = null
    }
  }, [map, mapRef])
  return null
}

export function RolePanel() {
  const { role } = useWaterStore()
  const hint = {
    citizen: 'Find which water sources are available near you.',
    official: 'Register water sources and manage reports for your barangay.',
    lgu: 'City-wide view. Open the summary, alerts, warnings, and users from the map.',
    drrm: 'City-wide view. Issue early warnings to affected barangays.',
  }[role]
  return (
    <div className="mt-6 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-ink/70">{hint}</p>
    </div>
  )
}

export function AssetMarkers() {
  const { role, assets, reports } = useWaterStore()
  return (
    <>
      {assets.map((a) => {
        const canEdit = CAN_PLACE[role].includes(a.kind)
        const Icon = ICONS[a.kind]
        const count = reports.filter((r) => r.barangayPsgc === a.barangayPsgc && r.status !== 'resolved').length
        // Any status other than "Working" colours the pin; otherwise each kind has its own colour.
        const tone =
          STATUSES[a.status].marker ||
          (a.kind === 'reservoir' ? 'bg-deep' : a.kind === 'station' ? 'bg-aqua' : a.kind === 'well' ? 'bg-teal-600' : 'bg-well')
        return (
          // The key changes with edit rights so MapLibre rebuilds the marker with the right draggable setting.
          <MapMarker
            key={`${a.id}-${canEdit}`}
            longitude={a.lng}
            latitude={a.lat}
            draggable={canEdit}
            onDragEnd={(ll) => moveAsset(a.id, ll.lng, ll.lat)}
          >
            <MarkerContent>
              <div className={cn('relative grid size-9 place-items-center rounded-full border-2 border-white text-white shadow-md', tone)}>
                <Icon className="size-4" aria-hidden="true" />
                {(role === 'lgu' || role === 'official') && count > 0 && (
                  <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-signal text-[10px] font-bold text-ink">
                    {count}
                  </span>
                )}
              </div>
            </MarkerContent>
            <MarkerTooltip className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink shadow">{a.name}</MarkerTooltip>
            <MarkerPopup closeButton className="w-64 rounded-xl border border-line bg-white p-4 text-ink shadow-lg">
              <AssetPopup asset={a} role={role} canEdit={canEdit} />
            </MarkerPopup>
          </MapMarker>
        )
      })}
    </>
  )
}

function AssetPopup({ asset, role, canEdit }: { asset: Asset; role: Role; canEdit: boolean }) {
  const { reports } = useWaterStore()
  const { barangayOf } = useBarangays()
  const area = barangayOf(asset) ?? asset.name
  const mine = reports.filter((r) => r.barangayPsgc === asset.barangayPsgc && r.status !== 'resolved')

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-extrabold">{asset.name}</p>
        <p className="text-ink/70">{KINDS[asset.kind]}</p>
        <p className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold', STATUSES[asset.status].badge)}>
          {STATUSES[asset.status].label}
        </p>
      </div>

      {CAN_SET_STATUS[role].includes(asset.kind) && (
        <div className="space-y-1">
          <label htmlFor={`status-${asset.id}`} className="block font-semibold">
            Status
          </label>
          <select
            id={`status-${asset.id}`}
            value={asset.status}
            onChange={(e) => setStatus(asset.id, e.target.value as Status)}
            className={field}
          >
            {Object.entries(STATUSES).map(([v, s]) => (
              <option key={v} value={v}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {role === 'official' && (
        <div className="space-y-2">
          <p className="font-semibold">Reports in {area} ({mine.length})</p>
          {mine.length === 0 && <p className="text-ink/70">No open reports yet.</p>}
          <ul className="max-h-32 space-y-1.5 overflow-y-auto">
            {mine.map((r) => (
              <li key={r.id} className="rounded-md bg-mist px-2 py-1.5">
                <p className="font-semibold">{REPORT_TYPES[r.type]}</p>
                {r.description && <p>{r.description}</p>}
                <p className="text-xs text-ink/60">{new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="space-y-2">
          <p className="text-ink/70">Drag the marker to move it.</p>
          <Button size="sm" variant="outline" onClick={() => removeAsset(asset.id)}>Remove</Button>
        </div>
      )}
    </div>
  )
}
