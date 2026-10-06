import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { logout, reloadProfile } from './auth'

// The signed-in person's profile, stored in the Supabase "profiles" table (extra columns come
// from supabase-profile-details.sql), so it follows them to any device.

export type Profile = {
  fullName: string
  barangay: string // barangay name, for display
  barangayPsgc: string // PSA code — what's actually saved (profiles.barangay_psgc)
  phone: string
  purok: string
  householdSize: string // kept as text for the number input; '' = not given
  hasVulnerable: boolean
  position: string
}

const EMPTY: Profile = {
  fullName: '', barangay: '', barangayPsgc: '', phone: '', purok: '',
  householdSize: '', hasVulnerable: false, position: '',
}

type BgyRef = { name: string | null } | { name: string | null }[] | null
const bgyName = (b: BgyRef) => (Array.isArray(b) ? b[0]?.name : b?.name) ?? ''

type Row = {
  name: string | null
  barangay_psgc: string | null
  barangays: BgyRef
  phone: string | null
  purok: string | null
  household_size: number | null
  has_vulnerable: boolean | null
  position: string | null
}

const MIGRATION_HINT = 'Profile details need a database update. Run supabase-profile-details.sql in Supabase.'
const needsMigration = (m: string) => /column .* does not exist|could not find the .* column|function .*delete_my_account/i.test(m)

let current: Profile = EMPTY
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

async function userId(): Promise<string | null> {
  const { data } = await supabase().auth.getSession()
  return data.session?.user.id ?? null
}

// When someone logs out or a different account logs in, forget the old profile.
// (Supabase also reports "signed in" when you return to the tab — same account, so nothing changes.)
let watching = false
let loadedFor: string | null = null
function watchAuth() {
  if (watching) return
  watching = true
  try {
    supabase().auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null
      if (id === loadedFor) return
      loadedFor = id
      current = EMPTY
      loaded = false
      loading = null
      emit()
      if (id && listeners.size > 0) void loadProfileDetails()
    })
  } catch {
    /* Supabase not configured */
  }
}

// Reads the profile once (and again after saving). Safe to call from many components.
export function loadProfileDetails(): Promise<void> {
  watchAuth()
  loading ??= (async () => {
    try {
      const id = await userId()
      loadedFor = id
      if (!id) return
      const { data, error } = await supabase()
        .from('profiles')
        .select('name, barangay_psgc, barangays(name), phone, purok, household_size, has_vulnerable, position')
        .eq('id', id)
        .maybeSingle()
      if (error) {
        // Probably supabase-profile-details.sql hasn't been run yet: show the sign-up basics.
        console.warn('Could not load profile details:', error.message)
        const basic = await supabase().from('profiles').select('name, barangay_psgc, barangays(name)').eq('id', id).maybeSingle()
        if (basic.data) {
          const b = basic.data as { name: string | null; barangay_psgc: string | null; barangays: BgyRef }
          current = { ...EMPTY, fullName: b.name ?? '', barangay: bgyName(b.barangays), barangayPsgc: b.barangay_psgc ?? '' }
        }
      } else if (data) {
        const r = data as Row
        current = {
          fullName: r.name ?? '',
          barangay: bgyName(r.barangays),
          barangayPsgc: r.barangay_psgc ?? '',
          phone: r.phone ?? '',
          purok: r.purok ?? '',
          householdSize: r.household_size ? String(r.household_size) : '',
          hasVulnerable: !!r.has_vulnerable,
          position: r.position ?? '',
        }
      }
    } catch (e) {
      console.warn('Could not load profile:', (e as Error).message)
    } finally {
      loaded = true
      emit()
    }
  })()
  return loading
}

export function useProfile(): Profile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      if (!loading) void loadProfileDetails()
      return () => listeners.delete(cb)
    },
    () => current,
    () => current,
  )
}

// True once the profile has been read from Supabase (so forms can fill themselves in).
export function useProfileLoaded(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      if (!loading) void loadProfileDetails()
      return () => listeners.delete(cb)
    },
    () => loaded,
    () => loaded,
  )
}

const PHONE = /^(09\d{9}|\+639\d{9})$/
const cleanPhone = (p: string) => p.replace(/[\s-]/g, '')

// Checks the form; returns field -> message for anything wrong.
export function validateProfile(p: Profile, household: boolean): Partial<Record<keyof Profile, string>> {
  const errors: Partial<Record<keyof Profile, string>> = {}
  if (!p.fullName.trim()) errors.fullName = 'Enter your full name.'
  else if (p.fullName.trim().length > 100) errors.fullName = 'Keep your name under 100 characters.'
  if (!p.barangayPsgc.trim()) errors.barangay = 'Select your barangay.'
  const phone = cleanPhone(p.phone)
  if (phone && !PHONE.test(phone)) errors.phone = 'Use a mobile number like 09171234567.'
  if (household && p.householdSize) {
    const n = Number(p.householdSize)
    if (!Number.isInteger(n) || n < 1 || n > 50) errors.householdSize = 'Enter a number from 1 to 50.'
  }
  return errors
}

async function writeProfile(patch: Record<string, unknown>) {
  const id = await userId()
  if (!id) throw new Error('Your session has expired. Please log in again.')
  const { data, error } = await supabase().from('profiles').update(patch).eq('id', id).select('id')
  if (error) throw new Error(needsMigration(error.message) ? MIGRATION_HINT : error.message)
  if (!data || data.length === 0) throw new Error("Your profile couldn't be saved. Please log in again.")
}

// Create / update: saves the form. Only residents may change their barangay (an official's
// barangay decides which reports they see). Throws with a readable message if refused.
export async function saveProfile(p: Profile, canChangeBarangay: boolean): Promise<void> {
  const next: Profile = {
    ...p,
    fullName: p.fullName.trim(),
    phone: cleanPhone(p.phone),
    purok: p.purok.trim(),
    position: p.position.trim(),
    barangay: canChangeBarangay ? p.barangay : current.barangay,
    barangayPsgc: canChangeBarangay ? p.barangayPsgc : current.barangayPsgc,
  }
  await writeProfile({
    name: next.fullName.slice(0, 100),
    ...(canChangeBarangay ? { barangay_psgc: next.barangayPsgc || null } : {}),
    phone: next.phone.slice(0, 20),
    purok: next.purok.slice(0, 120),
    household_size: next.householdSize ? Number(next.householdSize) : null,
    has_vulnerable: next.hasVulnerable,
    position: next.position.slice(0, 100),
  })
  current = next
  emit()
  await reloadProfile() // keep the cached name/barangay used elsewhere in sync
}

// Delete (details): clears the optional information but keeps the account, name and barangay.
export async function clearProfileDetails(): Promise<void> {
  await writeProfile({ phone: '', purok: '', household_size: null, has_vulnerable: false, position: '' })
  current = { ...current, phone: '', purok: '', householdSize: '', hasVulnerable: false, position: '' }
  emit()
}

// Delete (account): removes the login, the profile and the person's delivery requests,
// then signs out. The database refuses while a paid delivery is still on its way.
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().rpc('delete_my_account')
  if (error) throw new Error(needsMigration(error.message) ? MIGRATION_HINT : error.message)
  await logout()
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
