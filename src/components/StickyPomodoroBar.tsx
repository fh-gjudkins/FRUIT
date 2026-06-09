import { usePomodoro } from '@/pomodoro/PomodoroContext'

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function StickyPomodoroBar() {
  const pom = usePomodoro()
  if (!pom.visible) return null

  return (
    <div className="sticky-pom" role="region" aria-label="Pomodoro timer">
      <span className="timer">{formatClock(pom.remainingSeconds)}</span>
      <div className="row">
        {!pom.running ? (
          <button type="button" className="primary" onClick={() => void pom.resume()}>
            Resume
          </button>
        ) : (
          <button type="button" className="ghost" onClick={() => pom.pause()}>
            Pause
          </button>
        )}
        <button type="button" onClick={() => void pom.stop()}>
          Stop
        </button>
      </div>
    </div>
  )
}
