import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getUser } from '@/lib/auth'
import { useBarangays } from '@/lib/barangays'
import { useWaterStore } from '@/lib/water-store'
import {
  clearProfileDetails, deleteAccount, initials, saveProfile, useProfile, useProfileLoaded, validateProfile,
} from '@/lib/profile'
import type { Profile } from '@/lib/profile'

export const Route = createFileRoute('/dashboard/profile')({ component: Page })

const ROLE_LABEL = { lgu: 'LGU', official: 'Barangay official', drrm: 'DRRM', citizen: 'Household' } as const

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {hint && !error && <p className="mt-1 text-xs font-normal text-ink/60">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs font-normal text-orange-700">{error}</p>}
    </label>
  )
}

function Page() {
  const saved = useProfile()
  const loaded = useProfileLoaded()
  const { role } = useWaterStore()
  const { names } = useBarangays()
  const email = typeof window === 'undefined' ? '' : (getUser()?.email ?? '')
  const household = role === 'citizen'

  const [form, setForm] = useState<Profile>(saved)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof Profile, string>>>({})
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState('')

  // Fill the form once the profile arrives from Supabase (unless the user already started typing).
  useEffect(() => {
    if (!dirty) setForm(saved)
  }, [saved, dirty])

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
    setDone('')
  }

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true)
    setSaveError('')
    setDone('')
    try {
      await action()
      setDirty(false)
      setDone(message)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const found = validateProfile(form, household)
    setErrors(found)
    if (Object.keys(found).length === 0) void run(() => saveProfile(form, household), 'Saved.')
  }

  const clear = () => {
    if (!window.confirm('Remove your mobile number and other optional details? Your name, barangay and account stay.')) return
    setErrors({})
    void run(clearProfileDetails, 'Optional details removed.')
  }

  const hasDetails = !!(saved.phone || saved.purok || saved.householdSize || saved.hasVulnerable || saved.position)

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Profile</h1>

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* summary card */}
        <section className="self-start rounded-3xl bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-well text-2xl font-bold text-white">
            {initials(saved.fullName)}
          </div>
          <p className="mt-3 text-lg font-extrabold">{saved.fullName || (loaded ? 'No name yet' : 'Loading…')}</p>
          <p className="text-sm text-ink/60">{ROLE_LABEL[role]}</p>
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-sky px-3 py-1 text-sm font-semibold text-well">
            <MapPin className="size-4" aria-hidden="true" />
            {saved.barangay || 'Barangay not set'}
          </p>
          {saved.phone && <p className="mt-3 text-sm text-ink/70">{saved.phone}</p>}
          {household && saved.purok && <p className="mt-1 text-sm text-ink/70">{saved.purok}</p>}
          {household && saved.householdSize && (
            <p className="mt-1 text-sm text-ink/70">
              {saved.householdSize} {saved.householdSize === '1' ? 'person' : 'people'} at home
              {saved.hasVulnerable && ', including vulnerable members'}
            </p>
          )}
          {!household && saved.position && <p className="mt-1 text-sm text-ink/70">{saved.position}</p>}
        </section>

        <div className="space-y-5">
          {/* edit form */}
          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <fieldset disabled={!loaded || busy}>
                <h2 className="font-extrabold">Account details</h2>
                <p className="mt-1 text-sm text-ink/60">What you gave when you signed up.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" error={errors.fullName}>
                    <Input
                      value={form.fullName}
                      autoComplete="name"
                      maxLength={100}
                      aria-invalid={!!errors.fullName}
                      onChange={(e) => set('fullName', e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Barangay"
                    error={errors.barangay}
                    hint={household ? undefined : 'Your barangay decides which reports you see. Ask the LGU to change it.'}
                  >
                    <select
                      value={form.barangay}
                      onChange={(e) => set('barangay', e.target.value)}
                      disabled={!household}
                      aria-invalid={!!errors.barangay}
                      className={cn('h-9 w-full rounded-md border border-line bg-white px-3 text-sm', !household && 'bg-mist text-ink/70')}
                    >
                      <option value="">Select your barangay</option>
                      {form.barangay && !names.includes(form.barangay) && <option value={form.barangay}>{form.barangay}</option>}
                      {names.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Email" hint="The email you log in with.">
                    <Input value={email} readOnly disabled className="bg-mist text-ink/70" />
                  </Field>
                </div>

                <h2 className="mt-8 font-extrabold">{household ? 'Contact and household' : 'Contact and work'}</h2>
                <p className="mt-1 text-sm text-ink/60">Optional. Used only to send water alerts and plan deliveries.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Mobile number" error={errors.phone} hint={household ? 'Filled in for you when you request a delivery.' : undefined}>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="09xx xxx xxxx"
                      aria-invalid={!!errors.phone}
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                    />
                  </Field>
                  {household ? (
                    <>
                      <Field label="Purok / street" hint="Used as your delivery address.">
                        <Input value={form.purok} onChange={(e) => set('purok', e.target.value)} maxLength={120} />
                      </Field>
                      <Field label="People in your household" error={errors.householdSize}>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          aria-invalid={!!errors.householdSize}
                          value={form.householdSize}
                          onChange={(e) => set('householdSize', e.target.value)}
                        />
                      </Field>
                      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
                        <input type="checkbox" checked={form.hasVulnerable} onChange={(e) => set('hasVulnerable', e.target.checked)} />
                        Seniors, PWD, infants or pregnant members at home
                      </label>
                    </>
                  ) : (
                    <Field label="Position / office">
                      <Input value={form.position} onChange={(e) => set('position', e.target.value)} maxLength={100} />
                    </Field>
                  )}
                </div>
              </fieldset>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={busy || !loaded}>
                  {busy ? 'Saving…' : 'Save profile'}
                </Button>
                {dirty && !busy && (
                  <Button type="button" variant="outline" onClick={() => { setForm(saved); setDirty(false); setErrors({}) }}>
                    Undo changes
                  </Button>
                )}
                {done && <p role="status" className="text-sm font-semibold text-well">{done}</p>}
                {saveError && <p role="alert" className="text-sm text-orange-700">{saveError}</p>}
              </div>
            </form>
          </section>

          <DeleteSection hasDetails={hasDetails} busy={busy} onClear={clear} />
        </div>
      </div>
    </div>
  )
}

// Delete: clear the optional details, or remove the whole account (typed confirmation).
function DeleteSection({ hasDetails, busy, onClear }: { hasDetails: boolean; busy: boolean; onClear: () => void }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const remove = async () => {
    setDeleting(true)
    setError('')
    try {
      await deleteAccount()
      navigate({ to: '/' })
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
      <h2 className="font-extrabold">Delete</h2>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Remove optional details</p>
          <p className="text-sm text-ink/60">Clears your mobile number and the other optional fields.</p>
        </div>
        <Button type="button" variant="outline" disabled={busy || !hasDetails} onClick={onClear}>
          Remove details
        </Button>
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <p className="text-sm font-semibold">Delete my account</p>
        <p className="text-sm text-ink/60">
          Permanently removes your login, profile and delivery requests. Reports you sent stay with the LGU, without your
          name linked to your account. This can't be undone.
        </p>
        {!confirming ? (
          <Button type="button" variant="destructive" className="mt-3" onClick={() => setConfirming(true)}>
            Delete my account
          </Button>
        ) : (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold">
              Type DELETE to confirm
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 w-48" autoFocus />
            </label>
            <Button type="button" variant="destructive" disabled={typed !== 'DELETE' || deleting} onClick={() => void remove()}>
              {deleting ? 'Deleting…' : 'Delete forever'}
            </Button>
            <Button type="button" variant="outline" disabled={deleting} onClick={() => { setConfirming(false); setTyped('') }}>
              Keep my account
            </Button>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-orange-700">{error}</p>}
      </div>
    </section>
  )
}
