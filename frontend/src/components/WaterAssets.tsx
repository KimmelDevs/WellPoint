import { useEffect, useRef, useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import type { RefObject } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useBarangays } from '@/lib/barangays'
import { MapMarker, MarkerContent, MarkerPopup, MarkerTooltip, useMap } from '@/components/ui/map'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CAN_PLACE, CAN_SET_STATUS, KINDS, REPORT_TYPES, STATUSES,
  loadSourceImage, moveAsset, removeAsset, setLocked, setSourceImage, setStatus, useWaterStore,
} from '@/lib/water-store'
import { photoToBase64 } from '@/lib/image'
import { SOURCE_ICONS, SOURCE_TONE } from '@/components/sourceIcons'
import type { Asset, Role, Status } from '@/lib/water-store'

const ICONS = SOURCE_ICONS
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
          SOURCE_TONE[a.kind]
        return (
          // The key changes with edit rights so MapLibre rebuilds the marker with the right draggable setting.
          <MapMarker
            key={`${a.id}-${canEdit}-${a.locked !== false}`}
            longitude={a.lng}
            latitude={a.lat}
            draggable={canEdit && a.locked === false}
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

      <SourcePhoto id={asset.id} name={asset.name} canEdit={canEdit} />

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

      {canEdit && <LockControl asset={asset} />}
    </div>
  )
}

// The source's photo, fetched when the popup opens. Editors can add, replace or remove it.
function SourcePhoto({ id, name, canEdit }: { id: string; name: string; canEdit: boolean }) {
  const [image, setImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    loadSourceImage(id).then((img) => {
      if (!alive) return
      setImage(img)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id])

  const change = async (next: string | null) => {
    setBusy(true)
    setError('')
    const err = await setSourceImage(id, next)
    if (err) setError(err)
    else setImage(next)
    setBusy(false)
  }

  if (loading) return <div className="h-24 animate-pulse rounded-lg bg-mist" aria-label="Loading photo" />
  if (!image && !canEdit) return null

  return (
    <div className="space-y-1.5">
      {image && <img src={image} alt={`Photo of ${name}`} className="max-h-40 w-full rounded-lg object-cover" />}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = '' // allow picking the same file again
              if (!file) return
              try {
                await change(await photoToBase64(file))
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Saving…' : image ? 'Change photo' : 'Add photo'}
          </Button>
          {image && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void change(null)}>
              Remove photo
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-orange-700">{error}</p>}
    </div>
  )
}

// Locked (default): the marker stays put. Unlock to drag it, then lock it again.
function LockControl({ asset }: { asset: Asset }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = asset.locked !== false

  const toggle = async () => {
    setBusy(true)
    setError('')
    const err = await setLocked(asset.id, !locked)
    if (err) setError(err)
    setBusy(false)
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="flex items-center gap-1.5 text-ink/70">
        {locked ? <Lock className="size-4" aria-hidden="true" /> : <LockOpen className="size-4 text-well" aria-hidden="true" />}
        {locked ? 'Locked in place.' : 'Unlocked: drag the marker to move it, then lock it.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={locked ? 'outline' : 'default'} disabled={busy} onClick={() => void toggle()}>
          {locked ? 'Unlock to move' : 'Lock'}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => removeAsset(asset.id)}>Remove</Button>
      </div>
      {error && <p role="alert" className="text-xs text-orange-700">{error}</p>}
    </div>
  )
}
