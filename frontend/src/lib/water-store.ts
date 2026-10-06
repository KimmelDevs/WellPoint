import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import type { Disruption } from './derive'
import type {
  Asset, AssetKind, Community, CommunityReport, ReportStatus, ReportType, Role, SourceStatus,
  Warning, WarningStatus, WarningType, WaterSystem,
} from '@/data/types'

export type { Asset, AssetKind, CommunityReport, ReportStatus, ReportType, Role, SourceStatus, Warning, WarningStatus, WarningType } from '@/data/types'

// Physical assets, reports, warnings, barangays, and systems live in Supabase and
// sync here with realtime subscriptions. The current role and any active demo
// disruption stay client-side. Derived logic never touches this store directly —
// it reads the aggregate read model built in ./store.
export type Status = SourceStatus
export type Issue = 'empty' | 'low' | 'dirty'

export const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'citizen', label: 'Resident', hint: 'Find which water sources are available near you.' },
  { id: 'official', label: 'Barangay leader', hint: 'Record water sources, contamination, low pressure, and availability in your barangay.' },
  { id: 'lgu', label: 'LGU', hint: 'See everything, act immediately, and prioritize where to act first. Manage users and roles.' },
  { id: 'drrm', label: 'DRRM', hint: 'Issue early warnings to affected barangays so they can prepare.' },
]
export const KINDS: Record<AssetKind, string> = { pump: 'Water pump', well: 'Well', reservoir: 'Reservoir', station: 'Filling station' }
export const ISSUES: Record<Issue, string> = { empty: 'No water coming out', low: 'Low flow', dirty: 'Dirty water' }
export const ISSUE_TO_TYPE: Record<Issue, ReportType> = { empty: 'no_water', low: 'low_pressure', dirty: 'contamination' }

export const REPORT_TYPES: Record<ReportType, string> = {
  no_water: 'No water',
  low_pressure: 'Low pressure',
  contamination: 'Contamination',
  infrastructure_damage: 'Infrastructure damage',
  other: 'Other',
}
export const REPORT_STATUSES: Record<ReportStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
}
export const WARNING_TYPES: Record<WarningType, string> = {
  outage: 'Outage',
  contamination: 'Contamination',
  disaster: 'Disaster',
  maintenance: 'Maintenance',
  advisory: 'Advisory',
}
export const WARNING_STATUSES: Record<WarningStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

// Who may place (create/delete/move) each asset kind. Mirrors public.can_place().
// Water sources are registered by barangay leaders; DRRM places filling stations.
export const CAN_PLACE: Record<Role, AssetKind[]> = {
  lgu: [],
  drrm: ['station'],
  official: ['pump', 'well', 'reservoir'],
  citizen: [],
}

// Every status a water source can have. `marker` colours the map pin; `badge` the little label.
export const STATUSES: Record<Status, { label: string; badge: string; marker: string }> = {
  ok: { label: 'Working', badge: 'bg-sky text-well', marker: '' },
  low: { label: 'Low / near empty', badge: 'bg-amber-100 text-amber-800', marker: 'bg-amber-500' },
  empty: { label: 'Empty', badge: 'bg-red-100 text-red-700', marker: 'bg-red-600' },
  repair: { label: 'Under repair', badge: 'bg-slate-200 text-slate-700', marker: 'bg-slate-500' },
  unsafe: { label: 'Not safe to drink', badge: 'bg-purple-100 text-purple-800', marker: 'bg-purple-600' },
}

// Out of water or about to be — these show up in Outage alerts.
export const isShort = (s: Status) => s === 'empty' || s === 'low'

// Who may change the status of which kind. Mirrors public.can_set_status().
export const CAN_SET_STATUS: Record<Role, AssetKind[]> = {
  lgu: [],
  drrm: ['station'],
  official: ['pump', 'well', 'reservoir'],
  citizen: [],
}

// Pumps and wells can run dry, so they carry a working/empty status and take reports.
export const hasStatus = (kind: AssetKind) => kind === 'pump' || kind === 'well'

export type ProfileUser = { id: string; name: string; email: string; role: Role; barangayPsgc: string }

export type WaterState = {
  role: Role
  assets: Asset[]
  reports: CommunityReport[]
  warnings: Warning[]
  barangays: Community[]
  systems: WaterSystem[]
  users: ProfileUser[]
  disruption: Disruption | null
  loading: boolean // true until the first load from Supabase finishes
  error: string | null
}

const KEY = 'wellpoint.demo.v6' // v6: barangays/systems/warnings in Supabase; role + psgc kept client-side

const isRole = (v: unknown): v is Role => ROLES.some((r) => r.id === v)
const isKind = (v: unknown): v is AssetKind => v === 'pump' || v === 'well' || v === 'reservoir' || v === 'station'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isReportType = (v: unknown): v is ReportType => typeof v === 'string' && v in REPORT_TYPES
const isReportStatus = (v: unknown): v is ReportStatus => typeof v === 'string' && v in REPORT_STATUSES
const isWarningType = (v: unknown): v is WarningType => typeof v === 'string' && v in WARNING_TYPES
const isWarningStatus = (v: unknown): v is WarningStatus => typeof v === 'string' && v in WARNING_STATUSES

function loadRole(): Role {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY)
    const d = raw ? (JSON.parse(raw) as { role?: unknown } | null) : null
    if (d && isRole(d.role)) return d.role
  } catch {
    /* fall through */
  }
  return 'citizen'
}

const empty: WaterState = {
  role: loadRole(),
  assets: [],
  reports: [],
  warnings: [],
  barangays: [],
  systems: [],
  users: [],
  disruption: null,
  loading: true,
  error: null,
}

let state: WaterState = empty
const listeners = new Set<() => void>()

function set(next: WaterState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify({ role: next.role }))
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  listeners.forEach((l) => l())
}

export function useWaterStore() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}

export const getWaterState = () => state

// ---------- Supabase ----------

type Row = { id: string; kind: string; name: string; lng: number; lat: number; status: string; barangay_psgc: string | null; system_id: string | null }
const SOURCE_COLUMNS = 'id, kind, name, lng, lat, status, barangay_psgc, system_id'

const toAsset = (r: Row | null): Asset | null =>
  r && isKind(r.kind) && isNum(r.lng) && isNum(r.lat)
    ? {
        id: r.id,
        kind: r.kind,
        name: r.name,
        lng: r.lng,
        lat: r.lat,
        status: isStatus(r.status) ? r.status : 'ok',
        barangayPsgc: r.barangay_psgc ?? '',
        systemId: r.system_id ?? '',
      }
    : null

const isStatus = (v: unknown): v is Status => typeof v === 'string' && v in STATUSES

type BgyRow = {
  psgc_code: string
  name: string
  area_sqkm: number
  lat: number
  lng: number
  distance_to_center_km: number
  population: number
  affordability: number
  system_id: string | null
}
const BGY_COLUMNS = 'psgc_code, name, area_sqkm, lat, lng, distance_to_center_km, population, affordability, system_id'

const toCommunity = (r: BgyRow): Community => ({
  psgcCode: r.psgc_code,
  name: r.name,
  areaSqKm: Number(r.area_sqkm) || 0,
  lat: r.lat,
  lng: r.lng,
  distanceToCenterKm: Number(r.distance_to_center_km) || 0,
  population: Number(r.population) || 0,
  affordability: Number(r.affordability) || 50,
  systemId: r.system_id ?? '',
})

type SysRow = { id: string; name: string; level: string; service_hours: number; operator: string | null; affordability: number; population: number }
const SYS_COLUMNS = 'id, name, level, service_hours, operator, affordability, population'

const toSystem = (r: SysRow): WaterSystem | null =>
  (r.level === 'I' || r.level === 'II' || r.level === 'III')
    ? {
        id: r.id,
        name: r.name,
        level: r.level,
        barangayId: '',
        serviceHours: Number(r.service_hours) || 0,
        operator: r.operator ?? '',
        affordability: Number(r.affordability) || 0,
        population: Number(r.population) || 0,
      }
    : null

type ProfileRef = { name: string | null } | { name: string | null }[] | null
const refName = (p: ProfileRef) => (Array.isArray(p) ? p[0] : p)?.name ?? ''

type ReportRow = {
  id: string
  reporter_id: string
  barangay_psgc: string
  type: string | null
  description: string | null
  status: string | null
  created_at: string
  profiles: ProfileRef
}
const REPORT_COLUMNS = 'id, reporter_id, barangay_psgc, type, description, status, created_at, profiles(name)'

const toReport = (r: ReportRow): CommunityReport | null =>
  isReportType(r.type)
    ? {
        id: r.id,
        reporterId: r.reporter_id,
        reporterName: refName(r.profiles),
        barangayPsgc: r.barangay_psgc,
        area: '',
        type: r.type,
        description: r.description ?? '',
        status: isReportStatus(r.status) ? r.status : 'new',
        createdAt: r.created_at,
      }
    : null

type WarningRow = {
  id: string
  author_id: string
  type: string | null
  severity: string | null
  title: string
  message: string
  action: string | null
  status: string | null
  created_at: string
  profiles: ProfileRef
  warning_barangays: { barangay_psgc: string }[] | null
}
const WARNING_COLUMNS = 'id, author_id, type, severity, title, message, action, status, created_at, profiles(name), warning_barangays(barangay_psgc)'

const toWarning = (r: WarningRow): Warning | null =>
  isWarningType(r.type)
    ? {
        id: r.id,
        authorId: r.author_id,
        authorName: refName(r.profiles),
        type: r.type,
        severity: r.severity === 'critical' || r.severity === 'warning' || r.severity === 'info' ? r.severity : 'warning',
        title: r.title,
        message: r.message,
        action: r.action ?? '',
        status: isWarningStatus(r.status) ? r.status : 'active',
        barangayPsgcs: (r.warning_barangays ?? []).map((b) => b.barangay_psgc),
        createdAt: r.created_at,
      }
    : null

function friendly(message: string) {
  if (/row-level security|permission denied/i.test(message)) return "Your role isn't allowed to make that change."
  if (/fetch|network/i.test(message)) return "Can't reach Supabase. Check your internet connection."
  if (/relation .* does not exist|could not find the table/i.test(message)) return 'A Supabase table is missing. Run supabase/schema.sql in Supabase.'
  return message
}

function fail(message: string) {
  set({ ...state, error: friendly(message) })
  void loadAssets()
}

export async function loadAssets() {
  try {
    const { data, error } = await supabase().from('water_sources').select(SOURCE_COLUMNS).order('created_at')
    if (error) throw new Error(error.message)
    const assets = (data as Row[]).map(toAsset).filter((a): a is Asset => a !== null)
    set({ ...state, assets, loading: false })
  } catch (e) {
    set({ ...state, loading: false, error: friendly((e as Error).message) })
  }
}

export async function loadBarangays() {
  try {
    const { data, error } = await supabase().from('barangays').select(BGY_COLUMNS).order('name')
    if (error) throw new Error(error.message)
    set({ ...state, barangays: (data as BgyRow[]).map(toCommunity) })
  } catch {
    /* barangays table not applied yet — the client-side fallback seed fills in */
  }
}

export async function loadSystems() {
  try {
    const { data, error } = await supabase().from('water_systems').select(SYS_COLUMNS)
    if (error) throw new Error(error.message)
    const systems = (data as SysRow[]).map(toSystem).filter((s): s is WaterSystem => s !== null)
    set({ ...state, systems })
  } catch {
    /* water_systems table not applied yet — fallback seed */
  }
}

export async function loadReports() {
  try {
    const { data, error } = await supabase().from('reports').select(REPORT_COLUMNS).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const reports = (data as ReportRow[]).map(toReport).filter((r): r is CommunityReport => r !== null)
    set({ ...state, reports })
  } catch (e) {
    set({ ...state, error: friendly((e as Error).message) })
  }
}

export async function loadWarnings() {
  try {
    const { data, error } = await supabase().from('warnings').select(WARNING_COLUMNS).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const warnings = (data as WarningRow[]).map(toWarning).filter((w): w is Warning => w !== null)
    set({ ...state, warnings })
  } catch {
    /* warnings table not applied yet */
  }
}

// Loads every profile the database lets this person read (LGU: everyone, after
// supabase-users-roles.sql). Returns an error message, or null when it worked.
export async function loadUsers(): Promise<string | null> {
  type Row = { id: string; name: string | null; email: string | null; role: string | null; barangay_psgc?: string | null }
  try {
    let res: { data: unknown[] | null; error: { message: string } | null } = await supabase()
      .from('profiles')
      .select('id, name, email, role, barangay_psgc')
      .order('name')
    // Older databases have no barangay_psgc column: still list the users, just without it.
    if (res.error && /barangay_psgc/i.test(res.error.message)) {
      res = await supabase().from('profiles').select('id, name, email, role').order('name')
    }
    if (res.error) return friendly(res.error.message)
    set({
      ...state,
      users: ((res.data ?? []) as Row[]).map((r) => ({
        id: r.id,
        name: r.name ?? '',
        email: r.email ?? '',
        role: isRole(r.role) ? r.role : 'citizen',
        barangayPsgc: r.barangay_psgc ?? '',
      })),
    })
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

// Called by the dashboard once the user is logged in: first load + live updates from other users.
let started = false
export function initWaterStore() {
  if (started) return
  started = true
  void loadBarangays()
  void loadSystems()
  void loadAssets()
  void loadReports()
  void loadWarnings()
  try {
    let t1: ReturnType<typeof setTimeout> | undefined
    let t2: ReturnType<typeof setTimeout> | undefined
    let t3: ReturnType<typeof setTimeout> | undefined
    let t4: ReturnType<typeof setTimeout> | undefined
    supabase()
      .channel('wellpoint')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'water_sources' }, () => {
        clearTimeout(t1)
        t1 = setTimeout(() => void loadAssets(), 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
        clearTimeout(t2)
        t2 = setTimeout(() => void loadReports(), 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warnings' }, () => {
        clearTimeout(t3)
        t3 = setTimeout(() => void loadWarnings(), 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warning_barangays' }, () => {
        clearTimeout(t4)
        t4 = setTimeout(() => void loadWarnings(), 300)
      })
      .subscribe()
  } catch {
    /* Supabase not configured; loadAssets already showed the error */
  }
}

export const dismissError = () => set({ ...state, error: null })

// ---------- actions ----------

export function setRole(role: Role) {
  if (role === state.role) return
  set({ ...state, role, reports: [] })
  if (started) void loadReports()
}

// Registers a water source from a form (barangay leaders), with a chosen location.
export async function registerSource(input: {
  name: string
  kind: AssetKind
  status: Status
  lng: number
  lat: number
  barangayPsgc: string
}): Promise<string | null> {
  if (!CAN_PLACE[state.role].includes(input.kind)) return "Your role isn't allowed to add this."
  try {
    const { error } = await supabase().from('water_sources').insert({
      kind: input.kind,
      name: input.name,
      lng: input.lng,
      lat: input.lat,
      status: input.status,
      barangay_psgc: input.barangayPsgc,
    })
    if (error) return friendly(error.message)
    void loadAssets()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

type Table = ReturnType<ReturnType<typeof supabase>['from']>
type Result = { data: unknown[] | null; error: { message: string } | null }

async function save(change: (table: Table) => PromiseLike<Result>) {
  try {
    const { data, error } = await change(supabase().from('water_sources'))
    if (error) return fail(error.message)
    if (!data || data.length === 0) return fail('permission denied')
  } catch (e) {
    fail((e as Error).message)
  }
}

export function moveAsset(id: string, lng: number, lat: number) {
  set({ ...state, assets: state.assets.map((a) => (a.id === id ? { ...a, lng, lat } : a)), error: null })
  if (id.startsWith('temp-')) return
  void save((t) => t.update({ lng, lat }).eq('id', id).select('id'))
}

export function removeAsset(id: string) {
  set({ ...state, assets: state.assets.filter((a) => a.id !== id), error: null })
  if (id.startsWith('temp-')) return
  void save((t) => t.delete().eq('id', id).select('id'))
}

export function setStatus(assetId: string, status: Status) {
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset || !CAN_SET_STATUS[state.role].includes(asset.kind)) return
  set({ ...state, assets: state.assets.map((a) => (a.id === assetId ? { ...a, status } : a)), error: null })
  if (assetId.startsWith('temp-')) return
  void save((t) => t.update({ status }).eq('id', assetId).select('id'))
}

// Saves a community report. Returns an error message, or null when it was sent.
export async function submitReport(input: { reporterId: string; barangayPsgc: string; type: ReportType; description: string }): Promise<string | null> {
  try {
    const { error } = await supabase().from('reports').insert({
      reporter_id: input.reporterId,
      barangay_psgc: input.barangayPsgc,
      type: input.type,
      description: input.description.slice(0, 500),
    })
    if (error) return friendly(error.message)
    void loadReports()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

export async function setReportStatus(id: string, status: ReportStatus): Promise<string | null> {
  try {
    const { data, error } = (await supabase().from('reports').update({ status }).eq('id', id).select('id')) as Result
    if (error) return friendly(error.message)
    if (!data || data.length === 0) return 'permission denied'
    void loadReports()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

// Warnings (DRRM/LGU-authored early warnings)
export async function createWarning(input: {
  authorId: string
  type: WarningType
  severity: Warning['severity']
  title: string
  message: string
  action: string
  barangayPsgcs: string[]
}): Promise<string | null> {
  try {
    const { data, error } = await supabase()
      .from('warnings')
      .insert({
        author_id: input.authorId,
        type: input.type,
        severity: input.severity,
        title: input.title.slice(0, 200),
        message: input.message.slice(0, 1000),
        action: input.action.slice(0, 300),
      })
      .select('id')
      .single()
    if (error) return friendly(error.message)
    if (input.barangayPsgcs.length > 0) {
      const { error: linkError } = await supabase()
        .from('warning_barangays')
        .insert(input.barangayPsgcs.map((psgc) => ({ warning_id: data.id, barangay_psgc: psgc })))
      if (linkError) return friendly(linkError.message)
    }
    void loadWarnings()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

export async function setWarningStatus(id: string, status: WarningStatus): Promise<string | null> {
  try {
    const { data, error } = (await supabase().from('warnings').update({ status }).eq('id', id).select('id')) as Result
    if (error) return friendly(error.message)
    if (!data || data.length === 0) return 'permission denied'
    void loadWarnings()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

// LGU role management
// LGU only. Goes through the set_user_role database function (supabase-users-roles.sql), which
// checks the caller is LGU — the profiles table itself never lets anyone change a role directly.
export async function setUserRole(userId: string, role: Role, barangayPsgc: string): Promise<string | null> {
  try {
    const { error } = await supabase().rpc('set_user_role', {
      target: userId,
      new_role: role,
      new_barangay_psgc: barangayPsgc,
    })
    if (error) {
      if (/function .*set_user_role|could not find the function/i.test(error.message))
        return 'Run supabase-users-roles.sql in Supabase first.'
      return error.message // already readable, e.g. "Only the LGU can change roles."
    }
    void loadUsers()
    return null
  } catch (e) {
    return friendly((e as Error).message)
  }
}

// Demo controls: a disruption overrides the target system's derived status; reset
// clears it and restores Supabase state to known-good.
export function simulateDisruption(type: Disruption['type'], systemId: string) {
  set({ ...state, disruption: { systemId, type }, error: null })
}

export async function resetDemo() {
  set({ ...state, disruption: null, error: null })
  try {
    await supabase().from('reports').delete().not('id', 'is', null)
    await supabase().from('warnings').delete().not('id', 'is', null)
    await supabase().from('water_sources').update({ status: 'ok' }).not('id', 'is', null)
  } catch {
    /* best effort; the client-side reset is what the score depends on */
  }
  void loadAssets()
  void loadReports()
  void loadWarnings()
}
