import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { useBarangays } from '@/lib/barangays'
import { ROLES, loadUsers, setUserRole, useWaterStore } from '@/lib/water-store'
import type { Role } from '@/lib/water-store'

export const Route = createFileRoute('/dashboard/users')({ component: Page })

const card = 'rounded-xl border border-line bg-white p-4'
const field = 'rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm'

const ROLE_TONE: Record<Role, string> = {
  lgu: 'bg-ink text-white',
  drrm: 'bg-aqua text-white',
  official: 'bg-sky text-well',
  citizen: 'bg-mist text-ink/70',
}

function Row({ id, name, email, role, barangayPsgc }: { id: string; name: string; email: string; role: Role; barangayPsgc: string }) {
  const { barangays } = useBarangays()
  const [r, setR] = useState<Role>(role)
  const [b, setB] = useState(barangayPsgc)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  return (
    <li className={cn(card, 'flex flex-wrap items-center gap-3')}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold">{name || '(unnamed)'}</p>
        <p className="truncate text-xs text-ink/60">{email}</p>
      </div>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', ROLE_TONE[r])}>{r}</span>
      <select className={field} value={r} onChange={(e) => setR(e.target.value as Role)} aria-label={`Role for ${name}`}>
        {ROLES.map((x) => (
          <option key={x.id} value={x.id}>{x.label}</option>
        ))}
      </select>
      <select className={cn(field, 'max-w-48')} value={b} onChange={(e) => setB(e.target.value)} aria-label={`Barangay for ${name}`}>
        <option value="">No barangay</option>
        {barangays.map((x) => (
          <option key={x.psgcCode} value={x.psgcCode}>{x.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-lg bg-well px-3 py-1.5 text-sm font-bold text-white hover:bg-deep"
        onClick={async () => {
          setErr('')
          const error = await setUserRole(id, r, b)
          if (error) setErr(error)
          else {
            setSaved(true)
            window.setTimeout(() => setSaved(false), 2000)
          }
        }}
      >
        Save
      </button>
      {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
      {err && <span className="text-xs text-orange-700">{err}</span>}
    </li>
  )
}

function Page() {
  const { role, users } = useWaterStore()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Load the user list when an LGU opens the page (it was never loaded before).
  useEffect(() => {
    if (role !== 'lgu') return
    setLoading(true)
    loadUsers().then((err) => {
      setLoadError(err ?? '')
      setLoading(false)
    })
  }, [role])

  if (role !== 'lgu') {
    return (
      <div>
        <h1 className="text-3xl font-extrabold">Users &amp; roles</h1>
        <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-ink/70">Only the LGU can manage users and roles.</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Users &amp; roles</h1>
      <p className="mt-2 max-w-xl text-ink/70">
        Assign roles and barangays so every user is bounded by the right permissions.
      </p>

      {loadError && (
        <p role="alert" className="mt-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Couldn't load users: {loadError}
        </p>
      )}

      {loading ? (
        <p className="mt-5 text-sm text-ink/60">Loading users…</p>
      ) : users.length <= 1 && !loadError ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-ink/70">
          {users.length === 0
            ? 'No user accounts found.'
            : 'Only your own account is visible. Run supabase-users-roles.sql in Supabase so the LGU can see every user, then refresh.'}
        </p>
      ) : users.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line p-6 text-sm text-ink/70">
          No user accounts yet. Accounts appear here once someone signs up.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {users.map((u) => (
            <Row key={u.id} id={u.id} name={u.name} email={u.email} role={u.role} barangayPsgc={u.barangayPsgc} />
          ))}
        </ul>
      )}
    </div>
  )
}
