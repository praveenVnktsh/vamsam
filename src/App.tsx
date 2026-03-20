import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AppShell } from './app/AppShell'
import './App.css'
import {
  createPrimaryTree,
  fetchInvitePreview,
  fetchPrimaryTreeAccess,
  redeemInviteLink,
  resetPrimaryTreeGraph,
  savePrimaryTreeGraph,
  type InvitePreview,
  type TreeAccess,
} from './data/cloudGraph'
import { isSupabaseConfigured, supabase } from './data/supabase'

const INVITE_EMAIL = 'praveenvnktsh0@gmail.com'

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Please try again.`))
    }, ms)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

function AuthScreen({ invitePreview }: { invitePreview?: InvitePreview | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(false)

  useEffect(() => {
    if (invitePreview?.targetEmail) {
      setEmail(invitePreview.targetEmail)
    }
  }, [invitePreview])

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

  async function handleGoogleSignIn() {
    if (!supabase) return

    setOauthSubmitting(true)
    setError('')

    const response = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    })

    if (response.error) {
      setError(response.error.message)
      setOauthSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card auth-card-onboarding">
        <div className="auth-card-onboarding__intro">
          <p className="auth-card__romanized">வம்சம் · Vaṃsam</p>
          <h1>See your family, branch by branch</h1>
          <p className="auth-card__lead">A private shared family graph for people, photos, and Indian kinship context.</p>

          <div className="auth-hero-preview" aria-hidden="true">
            <div className="auth-hero-preview__grid" />
            <div className="auth-hero-preview__node auth-hero-preview__node-root">
              <span>AK</span>
            </div>
            <div className="auth-hero-preview__node auth-hero-preview__node-partner">
              <span>JL</span>
            </div>
            <div className="auth-hero-preview__node auth-hero-preview__node-child-a">
              <span>PR</span>
            </div>
            <div className="auth-hero-preview__node auth-hero-preview__node-child-b">
              <span>AR</span>
            </div>
            <div className="auth-hero-preview__connector auth-hero-preview__connector-partner" />
            <div className="auth-hero-preview__connector auth-hero-preview__connector-left" />
            <div className="auth-hero-preview__connector auth-hero-preview__connector-right" />
            <div className="auth-hero-preview__badge auth-hero-preview__badge-kin">attai · māmā · chitti</div>
            <div className="auth-hero-preview__badge auth-hero-preview__badge-private">private family workspace</div>
          </div>

          <div className="auth-onboarding-strip">
            <article className="auth-onboarding-step">
              <span className="auth-onboarding-step__index">01</span>
              <strong>Map people</strong>
              <p>Add parents, partners, siblings, and children.</p>
            </article>
            <article className="auth-onboarding-step">
              <span className="auth-onboarding-step__index">02</span>
              <strong>Recognize branches</strong>
              <p>See lineage with Tamil and Hindi kinship labels.</p>
            </article>
            <article className="auth-onboarding-step">
              <span className="auth-onboarding-step__index">03</span>
              <strong>Keep it shared</strong>
              <p>Invite-only access, cloud sync, and photo cards.</p>
            </article>
          </div>

          <div className="auth-onboarding-pills" aria-label="Key product traits">
            <span>Invite only</span>
            <span>Photo based</span>
            <span>Kinship aware</span>
            <span>Shared family editing</span>
          </div>
        </div>

        <div className="auth-card-onboarding__signin">
          <h2>{invitePreview ? 'Accept invite' : 'Sign in'}</h2>
          <p>
            {invitePreview
              ? `Continue as ${invitePreview.targetEmail} to join ${invitePreview.treeName}.`
              : 'Use the invited family account for your branch.'}
          </p>
          {invitePreview ? (
            <div className="auth-invite-chip">
              <span>{invitePreview.role}</span>
              <strong>Invite expires {new Date(invitePreview.expiresAt).toLocaleDateString()}</strong>
            </div>
          ) : null}
          <button
            type="button"
            className="auth-oauth-button"
            onClick={() => void handleGoogleSignIn()}
            disabled={oauthSubmitting || submitting}
          >
            <span className="auth-oauth-button__icon" aria-hidden="true">
              G
            </span>
            <span>{oauthSubmitting ? 'Redirecting...' : 'Continue with Google'}</span>
          </button>
          <div className="auth-divider" aria-hidden="true">
            <span>or use email</span>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                readOnly={Boolean(invitePreview)}
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
          {!invitePreview ? (
            <div className="auth-request-invite">
              <span>Need access?</span>
              <a
                href={`mailto:${INVITE_EMAIL}?subject=${encodeURIComponent('Vaṃsam invite request')}`}
                className="auth-request-invite__button"
              >
                Request invite
              </a>
              <p>Send your request to {INVITE_EMAIL}</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function NoTreeAccessScreen({
  session,
  onCreated,
  canCreateTree,
}: {
  session: Session
  onCreated: (tree: TreeAccess) => void
  canCreateTree: boolean
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
        <p>
          {canCreateTree
            ? 'This account can bootstrap the primary tree.'
            : 'This account is signed in, but it has not been attached to a family tree yet.'}
        </p>
        {error && <p className="auth-form__error">{error}</p>}
        {canCreateTree ? (
          <div className="auth-form__actions">
            <button type="button" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? 'Creating...' : 'Create primary tree'}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function SupabaseApp({ inviteToken = null }: { inviteToken?: string | null }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [treeAccess, setTreeAccess] = useState<TreeAccess | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeLoadAttempt, setTreeLoadAttempt] = useState(0)
  const [treeError, setTreeError] = useState('')
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken))

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null)
      setInviteLoading(false)
      return
    }

    let cancelled = false
    setInviteLoading(true)

    void fetchInvitePreview(inviteToken)
      .then((preview) => {
        if (!cancelled) {
          setInvitePreview(preview)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvitePreview(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInviteLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [inviteToken])

  useEffect(() => {
    if (!supabase) return undefined

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession((currentSession) => {
        const currentUserId = currentSession?.user.id ?? null
        const nextUserId = nextSession?.user.id ?? null

        if (currentUserId !== nextUserId) {
          setTreeAccess(null)
          setTreeError('')
        }

        return nextSession
      })
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

    void (async () => {
      let inviteErrorMessage = ''
      if (inviteToken) {
        try {
          await redeemInviteLink(inviteToken)
        } catch (error) {
          inviteErrorMessage =
            error instanceof Error ? error.message : 'Unable to redeem invite link.'
        }
      }

      try {
        const tree = await withTimeout(
          fetchPrimaryTreeAccess(
            session.user.id,
            session.user.email ?? '',
            String(session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture ?? ''),
          ),
          12000,
          'Loading family tree',
        )
        if (cancelled) return
        if (!tree && inviteErrorMessage) {
          setTreeError(inviteErrorMessage)
          return
        }
        setTreeAccess(tree)
      } catch (error) {
        if (cancelled) return
        setTreeError(error instanceof Error ? error.message : 'Unable to load the family tree.')
      }
    })()
      .finally(() => {
        if (!cancelled) {
          setTreeLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [inviteToken, session, treeLoadAttempt])

  if (!isSupabaseConfigured) return <SetupScreen />
  if (sessionLoading) return <LoadingScreen label="Checking session..." />
  if (inviteToken && inviteLoading) return <LoadingScreen label="Loading invite..." />
  if (inviteToken && !session && !invitePreview) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-card-compact">
          <p className="mini-label">வம்சம்</p>
          <p className="auth-card__romanized">Vaṃsam</p>
          <h1>Invite unavailable</h1>
          <p>This invite link is invalid, already used, or expired.</p>
        </section>
      </main>
    )
  }
  if (!session) return <AuthScreen invitePreview={invitePreview} />
  if (treeLoading && !treeAccess) return <LoadingScreen label="Loading family tree..." />
  if (treeError) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-card-compact">
          <p className="auth-form__error">{treeError}</p>
          <div className="auth-form__actions">
            <button type="button" onClick={() => setTreeLoadAttempt((value) => value + 1)}>
              Retry
            </button>
          </div>
        </section>
      </main>
    )
  }
  if (!treeAccess) {
    return (
      <NoTreeAccessScreen
        session={session}
        onCreated={setTreeAccess}
        canCreateTree={session.user.email?.toLowerCase() === INVITE_EMAIL}
      />
    )
  }

  return (
    <AppShell
      initialGraph={treeAccess.graph}
      treeId={treeAccess.id}
      userEmail={session.user.email ?? 'Signed in'}
      currentUserId={session.user.id}
      currentUserProfilePhoto={String(
        session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture ?? '',
      )}
      linkedPersonId={treeAccess.linkedPersonId}
      role={treeAccess.role}
      canEdit={treeAccess.role !== 'viewer'}
      onPersistGraph={(graph) => savePrimaryTreeGraph(treeAccess.id, graph)}
      onResetGraph={() => resetPrimaryTreeGraph(treeAccess.id, treeAccess.name, session.user.id)}
      onSignOut={async () => {
        await supabase?.auth.signOut()
      }}
    />
  )
}

function InviteRoute() {
  const { token = '' } = useParams()
  return <SupabaseApp inviteToken={token} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<SupabaseApp />} />
      <Route path="/invite/:token" element={<InviteRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
