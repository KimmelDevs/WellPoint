import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Move, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SOURCE_ICONS, SOURCE_TONE } from '@/components/sourceIcons'
import { MapMarker, MarkerContent, useMap } from '@/components/ui/map'
import { Button } from '@/components/ui/button'
import { useBarangays } from '@/lib/barangays'
import { photoToBase64 } from '@/lib/image'
import { CAN_PLACE, KINDS, STATUSES, registerSource, useWaterStore } from '@/lib/water-store'
import type { AssetKind, Status } from '@/lib/water-store'

export type Point = { lng: number; lat: number }

const field = 'w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm'

// Lives inside <Map>: while active, the next tap/click on the map picks the spot.
export function PlaceClick({ active, onPick }: { active: boolean; onPick: (p: Point) => void }) {
  const { map, isLoaded } = useMap()
  const pick = useRef(onPick)
  pick.current = onPick

  useEffect(() => {
    if (!map || !isLoaded || !active) return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const handler = (e: { lngLat: { lng: number; lat: number } }) => pick.current({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    map.once('click', handler)
    return () => {
      map.off('click', handler)
      canvas.style.cursor = ''
    }
  }, [map, isLoaded, active])
  return null
}

// The new source's pin, shown with its type's icon and colour. Drag it to fine-tune the spot
// until the source is saved or cancelled.
export function PendingMarker({ point, kind, onMove }: { point: Point; kind: AssetKind; onMove: (p: Point) => void }) {
  const Icon = SOURCE_ICONS[kind]
  return (
    <MapMarker longitude={point.lng} latitude={point.lat} draggable onDragEnd={(ll) => onMove({ lng: ll.lng, lat: ll.lat })}>
      <MarkerContent>
        <div
          title="Drag to adjust the spot"
          className={cn(
            'grid size-11 cursor-grab place-items-center rounded-full border-[3px] border-white text-white shadow-lg ring-4 ring-signal/60 active:cursor-grabbing',
            SOURCE_TONE[kind],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </MarkerContent>
    </MapMarker>
  )
}

// The form shown after a spot is picked: kind, name, status and an optional photo.
type PanelProps = {
  point: Point
  kind: AssetKind // shared with the pin on the map, so it shows the same icon
  onKindChange: (k: AssetKind) => void
  onDone: () => void
  onCancel: () => void
  onRepick: () => void
}

export function AddSourcePanel({ point, kind, onKindChange, onDone, onCancel, onRepick }: PanelProps) {
  const { role } = useWaterStore()
  const { barangayAt } = useBarangays()
  const kinds = CAN_PLACE[role]
  const barangay = barangayAt(point)

  const [name, setName] = useState('')
  const [status, setStatus] = useState<Status>('ok')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const save = async () => {
    if (!name.trim()) return setError('Give the source a name.')
    setBusy(true)
    setError('')
    const err = await registerSource({
      name: name.trim(),
      kind,
      status,
      lng: point.lng,
      lat: point.lat,
      barangayPsgc: barangay?.psgcCode ?? '',
      base64Image: photo,
    })
    setBusy(false)
    if (err) setError(err)
    else onDone()
  }

  return (
    <section
      aria-label="Add a water source"
      className="absolute inset-x-3 bottom-3 z-10 max-h-[75%] overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-xl sm:left-auto sm:w-96"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-extrabold">Add a water source</h2>
          <p className="text-xs text-ink/60">
            {barangay ? `Brgy. ${barangay.name}` : 'Outside the barangay boundaries'} · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-well">
            <Move className="size-3.5" aria-hidden="true" /> Drag the pin on the map to adjust the spot
          </p>
        </div>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-ink/50 hover:text-ink">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        <fieldset>
          <legend className="text-sm font-semibold">Type</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {kinds.map((k) => {
              const Icon = SOURCE_ICONS[k]
              const on = k === kind
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onKindChange(k)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm',
                    on ? 'border-well bg-sky font-semibold' : 'border-line hover:bg-mist',
                  )}
                >
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-white', SOURCE_TONE[k])}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {KINDS[k]}
                </button>
              )
            })}
          </div>
        </fieldset>

        <div>
          <label className="text-sm font-semibold">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={`${field} mt-1 font-normal`}>
              {Object.entries(STATUSES).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <label className="text-sm font-semibold">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={`e.g. ${barangay?.name ?? 'Barangay'} ${KINDS[kind].toLowerCase()}`}
            className={`${field} mt-1 font-normal`}
            autoFocus
          />
        </label>

        <div>
          <p className="text-sm font-semibold">Photo (optional)</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setPhotoBusy(true)
              setError('')
              try {
                setPhoto(await photoToBase64(file))
              } catch (err) {
                setError((err as Error).message)
              } finally {
                setPhotoBusy(false)
              }
            }}
          />
          {photo ? (
            <div className="relative mt-1">
              <img src={photo} alt="Selected photo" className="max-h-40 w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold shadow"
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={photoBusy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-4 text-sm text-ink/70 hover:bg-mist"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              {photoBusy ? 'Preparing photo…' : 'Take or choose a photo'}
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-orange-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={busy || photoBusy}>{busy ? 'Saving…' : 'Add source'}</Button>
          <Button variant="outline" onClick={onRepick} disabled={busy}>Pick another spot</Button>
        </div>
      </div>
    </section>
  )
}
