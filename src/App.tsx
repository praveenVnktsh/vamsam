import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './app/AppShell'
import './App.css'
import {
  createPrimaryTree,
  fetchPrimaryTreeAccess,
  resetPrimaryTreeGraph,
  savePrimaryTreeGraph,
  type TreeAccess,
} from './data/cloudGraph'
import { isSupabaseConfigured, supabase } from './data/supabase'

function SetupScreen() {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="mini-label">வம்சம்</p>
        <p className="auth-card__romanized">Vaṃsam</p>
        <h1>Supabase setup required</h1>
        <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your local env before using the shared family graph.</p>
      </section>
    </main>
  )
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="auth-screen">
      <section className="auth-card auth-card-compact">
        <p>{label}</p>
      </section>
    </main>
  )
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setSubmitting(true)
    setError('')

    const response = await supabase.auth.signInWithPassword({ email, password })

    if (response.error) {
      setError(response.error.message)
    }

    setSubmitting(false)
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="mini-label">வம்சம்</p>
        <p className="auth-card__romanized">Vaṃsam</p>
        <h1>Sign in</h1>
        <p>Use an invited account. Self-signup is disabled.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="auth-form__error">{error}</p>}
          <div className="auth-form__actions">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Working...' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

function NoTreeAccessScreen({
  session,
  onCreated,
}: {
  session: Session
  onCreated: (tree: TreeAccess) => void
}) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const tree = await createPrimaryTree(session.user)
      onCreated(tree)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create the tree.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="mini-label">வம்சம்</p>
        <p className="auth-card__romanized">Vaṃsam</p>
        <h1>No tree access yet</h1>
        <p>This account does not have a family tree assigned yet. Create the primary tree to begin.</p>
        {error && <p className="auth-form__error">{error}</p>}
        <div className="auth-form__actions">
          <button type="button" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? 'Creating...' : 'Create primary tree'}
          </button>
        </div>
      </section>
    </main>
  )
}

function SupabaseApp() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [treeAccess, setTreeAccess] = useState<TreeAccess | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeError, setTreeError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setTreeAccess(null)
      setTreeError('')
      setSessionLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) return

    let cancelled = false
    setTreeLoading(true)
    setTreeError('')

    void fetchPrimaryTreeAccess(session.user.id)
      .then((tree) => {
        if (cancelled) return
        setTreeAccess(tree)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setTreeError(error instanceof Error ? error.message : 'Unable to load the family tree.')
      })
      .finally(() => {
        if (!cancelled) {
          setTreeLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  if (!isSupabaseConfigured) return <SetupScreen />
  if (sessionLoading) return <LoadingScreen label="Checking session..." />
  if (!session) return <AuthScreen />
  if (treeLoading) return <LoadingScreen label="Loading family tree..." />
  if (treeError) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-card-compact">
          <p className="auth-form__error">{treeError}</p>
        </section>
      </main>
    )
  }
  if (!treeAccess) {
    return <NoTreeAccessScreen session={session} onCreated={setTreeAccess} />
  }

  return (
    <AppShell
      initialGraph={treeAccess.graph}
      userEmail={session.user.email ?? 'Signed in'}
      canEdit={treeAccess.role !== 'viewer'}
      onPersistGraph={(graph) => savePrimaryTreeGraph(treeAccess.id, graph)}
      onResetGraph={() => resetPrimaryTreeGraph(treeAccess.id, treeAccess.name, session.user.id)}
      onSignOut={async () => {
        await supabase?.auth.signOut()
      }}
    />
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<SupabaseApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
