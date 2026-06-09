import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'

const DEFAULT_FOCUS_SECONDS = 25 * 60

type PomodoroState = {
  /** Visible whenever a session exists (running or paused mid-pom) */
  visible: boolean
  running: boolean
  remainingSeconds: number
  focusTotalSeconds: number
  linkedTaskId: string | null
  activeSessionId: string | null
  setLinkedTaskId: (id: string | null) => void
  setFocusMinutes: (m: number) => void
  start: () => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => Promise<void>
}

const PomodoroContext = createContext<PomodoroState | null>(null)

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [running, setRunning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(DEFAULT_FOCUS_SECONDS)
  const [focusTotalSeconds, setFocusTotalSeconds] = useState(DEFAULT_FOCUS_SECONDS)
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const tickRef = useRef<number | null>(null)

  const completingRef = useRef(false)

  const clearTick = () => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  useEffect(() => () => clearTick(), [])

  const setFocusMinutes = useCallback((m: number) => {
    const secs = Math.max(1, Math.round(m * 60))
    setFocusTotalSeconds(secs)
    if (!running && !activeSessionId) setRemainingSeconds(secs)
  }, [running, activeSessionId])

  const start = useCallback(async () => {
    if (!user) return
    clearTick()
    const startedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('timer_sessions')
      .insert({
        user_id: user.id,
        task_id: linkedTaskId,
        started_at: startedAt,
        source: 'pomodoro',
      })
      .select('id')
      .single()
    if (error) {
      console.error(error)
      return
    }
    setActiveSessionId(data.id)
    setRemainingSeconds(focusTotalSeconds)
    setRunning(true)
    tickRef.current = window.setInterval(() => {
      setRemainingSeconds((s) => {
        if (s <= 1) {
          clearTick()
          return 0
        }
        return s - 1
      })
    }, 1000)
  }, [user, linkedTaskId, focusTotalSeconds])

  useEffect(() => {
    if (!running || remainingSeconds !== 0 || !activeSessionId || !user) return
    if (completingRef.current) return
    completingRef.current = true
    const sessionId = activeSessionId
    const duration = focusTotalSeconds
    void (async () => {
      await supabase
        .from('timer_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: duration,
        })
        .eq('id', sessionId)
      setRunning(false)
      setActiveSessionId(null)
      setRemainingSeconds(focusTotalSeconds)
      completingRef.current = false
    })()
  }, [remainingSeconds, running, user, activeSessionId, focusTotalSeconds])

  const pause = useCallback(() => {
    setRunning(false)
    clearTick()
  }, [])

  const resume = useCallback(() => {
    if (!activeSessionId || remainingSeconds <= 0) return
    setRunning(true)
    clearTick()
    tickRef.current = window.setInterval(() => {
      setRemainingSeconds((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
  }, [activeSessionId, remainingSeconds])

  const stop = useCallback(async () => {
    clearTick()
    setRunning(false)
    if (!user || !activeSessionId) {
      setActiveSessionId(null)
      setRemainingSeconds(focusTotalSeconds)
      return
    }
    const elapsed = Math.max(0, focusTotalSeconds - remainingSeconds)
    if (elapsed > 0) {
      await supabase
        .from('timer_sessions')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: elapsed,
        })
        .eq('id', activeSessionId)
    } else {
      await supabase.from('timer_sessions').delete().eq('id', activeSessionId)
    }
    setActiveSessionId(null)
    setRemainingSeconds(focusTotalSeconds)
  }, [user, activeSessionId, remainingSeconds, focusTotalSeconds])

  const value = useMemo(
    () => ({
      visible: activeSessionId !== null,
      running,
      remainingSeconds,
      focusTotalSeconds,
      linkedTaskId,
      activeSessionId,
      setLinkedTaskId,
      setFocusMinutes,
      start,
      pause,
      resume,
      stop,
    }),
    [
      activeSessionId,
      running,
      remainingSeconds,
      focusTotalSeconds,
      linkedTaskId,
      setFocusMinutes,
      start,
      pause,
      resume,
      stop,
    ],
  )

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext)
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider')
  return ctx
}
