import { Droplet, Droplets, GlassWater, Waves } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AssetKind } from '@/lib/water-store'

// One icon and colour per kind of water source, used by the map markers and the add form.
export const SOURCE_ICONS: Record<AssetKind, LucideIcon> = { pump: Droplet, well: Droplets, reservoir: Waves, station: GlassWater }
export const SOURCE_TONE: Record<AssetKind, string> = { pump: 'bg-well', well: 'bg-teal-600', reservoir: 'bg-deep', station: 'bg-aqua' }
