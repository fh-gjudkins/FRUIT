import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { StickyPomodoroBar } from '@/components/StickyPomodoroBar'
import { useAuth } from '@/auth/AuthContext'
import { usePomodoro } from '@/pomodoro/PomodoroContext'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { user, loading, signOut } = useAuth()
  const pom = usePomodoro()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className={pom.visible ? 'with-sticky-pom' : undefined}>
      <StickyPomodoroBar />
      <div className="layout">
        <header className="top-nav">
          <div className="row">
            <span className="brand">Fruit</span>
            {user && (
              <Link to="/" className="muted" style={{ textDecoration: 'none' }}>
                Board
              </Link>
            )}
          </div>
          <div className="row">
            {!loading && !user && pathname !== '/login' && (
              <Link to="/login">Sign in</Link>
            )}
            {user && (
              <>
                <span className="muted">{user.email}</span>
                <button type="button" className="ghost" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
