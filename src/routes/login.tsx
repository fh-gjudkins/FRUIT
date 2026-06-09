import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/auth/AuthContext'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth()

  if (loading) return <p className="muted">Loading…</p>
  if (user) return <Navigate to="/" />

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p className="muted">Use Google OAuth (configure provider in Supabase).</p>
      <button type="button" className="primary" onClick={() => void signInWithGoogle()}>
        Continue with Google
      </button>
    </div>
  )
}
