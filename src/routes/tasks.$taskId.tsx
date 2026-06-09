import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import type { Json } from '@/types/database'

export const Route = createFileRoute('/tasks/$taskId')({
  component: TaskDetailPage,
})

type TaskRow = {
  id: string
  bucket_id: string | null
  title: string
  description: string
  created_at: string
  updated_at: string
}

type CheckRow = {
  id: string
  text: string
  completed: boolean
  position: number
}

type EventRow = {
  id: string
  event_type: string
  payload: Json
  created_at: string
}

type TimerRow = {
  id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  source: string
}

function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const [checkText, setCheckText] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')

  const taskQuery = useQuery({
    queryKey: ['task', taskId],
    enabled: !!user && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('id', taskId).single()
      if (error) throw error
      return data as TaskRow
    },
  })

  const bucketsQuery = useQuery({
    queryKey: ['buckets', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('buckets').select('id,label,parent_id')
      if (error) throw error
      return data as { id: string; label: string; parent_id: string | null }[]
    },
  })

  const checklistQuery = useQuery({
    queryKey: ['checklist', taskId],
    enabled: !!user && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('position')
      if (error) throw error
      return data as CheckRow[]
    },
  })

  const eventsQuery = useQuery({
    queryKey: ['task-events', taskId],
    enabled: !!user && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_events')
        .select('id,event_type,payload,created_at')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as EventRow[]
    },
  })

  const timersQuery = useQuery({
    queryKey: ['task-timers', taskId],
    enabled: !!user && !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timer_sessions')
        .select('id,started_at,ended_at,duration_seconds,source')
        .eq('task_id', taskId)
        .order('started_at', { ascending: false })
      if (error) throw error
      return data as TimerRow[]
    },
  })

  const updateTask = useMutation({
    mutationFn: async (patch: Partial<Pick<TaskRow, 'title' | 'description' | 'bucket_id'>>) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task', taskId] })
      void qc.invalidateQueries({ queryKey: ['task-events', taskId] })
    },
  })

  const addCheck = useMutation({
    mutationFn: async () => {
      if (!user || !checkText.trim()) return
      const pos = (checklistQuery.data?.length ?? 0) + 1
      const { error } = await supabase.from('task_checklist_items').insert({
        task_id: taskId,
        text: checkText.trim(),
        position: pos,
      })
      if (error) throw error
      await supabase.from('task_events').insert({
        user_id: user.id,
        task_id: taskId,
        event_type: 'checklist_item_added',
        payload: { text: checkText.trim() },
      })
    },
    onSuccess: () => {
      setCheckText('')
      void qc.invalidateQueries({ queryKey: ['checklist', taskId] })
      void qc.invalidateQueries({ queryKey: ['task-events', taskId] })
    },
  })

  const deleteTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks'] })
      await navigate({ to: '/' })
    },
  })

  const toggleCheck = useMutation({
    mutationFn: async (item: CheckRow) => {
      if (!user) return
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ completed: !item.completed })
        .eq('id', item.id)
      if (error) throw error
      await supabase.from('task_events').insert({
        user_id: user.id,
        task_id: taskId,
        event_type: 'checklist_toggled',
        payload: { item_id: item.id, completed: !item.completed },
      })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checklist', taskId] })
      void qc.invalidateQueries({ queryKey: ['task-events', taskId] })
    },
  })

  useEffect(() => {
    if (!taskQuery.data) return
    setTitleDraft(taskQuery.data.title)
    setDescDraft(taskQuery.data.description)
  }, [taskQuery.data?.id, taskQuery.data?.title, taskQuery.data?.description])

  const bucketLabel = useMemo(() => {
    const list = bucketsQuery.data ?? []
    const map = new Map(list.map((b) => [b.id, b]))
    if (!taskQuery.data?.bucket_id) return '—'
    const parts: string[] = []
    let cur: string | null = taskQuery.data.bucket_id
    while (cur) {
      const b = map.get(cur)
      if (!b) break
      parts.unshift(b.label)
      cur = b.parent_id
    }
    return parts.join(' › ') || '—'
  }, [bucketsQuery.data, taskQuery.data?.bucket_id])

  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" />
  if (taskQuery.isLoading) return <p className="muted">Loading task…</p>
  if (taskQuery.error || !taskQuery.data) {
    return (
      <p style={{ color: 'var(--danger)' }}>
        Task not found or unavailable. <Link to="/">Back</Link>
      </p>
    )
  }

  const t = taskQuery.data

  return (
    <div>
      <p>
        <Link to="/">← Board</Link>
      </p>
      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="muted">Title</label>
        </div>
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            if (titleDraft !== t.title) updateTask.mutate({ title: titleDraft })
          }}
        />
        <div className="row" style={{ margin: '12px 0 8px' }}>
          <label className="muted">Bucket</label>
        </div>
        <select
          value={t.bucket_id ?? ''}
          onChange={(e) =>
            updateTask.mutate({
              bucket_id: e.target.value || null,
            })
          }
        >
          <option value="">Unassigned</option>
          {(bucketsQuery.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <p className="muted" style={{ marginTop: 8 }}>
          Path: {bucketLabel}
        </p>
        <div className="row" style={{ margin: '12px 0 8px' }}>
          <label className="muted">Description</label>
        </div>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            if (descDraft !== t.description) updateTask.mutate({ description: descDraft })
          }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Created {new Date(t.created_at).toLocaleString()} · Updated{' '}
          {new Date(t.updated_at).toLocaleString()}
        </p>
        <button
          type="button"
          style={{ marginTop: 12, borderColor: 'var(--danger)', color: 'var(--danger)' }}
          onClick={() => {
            if (confirm('Delete this task?')) void deleteTask.mutateAsync()
          }}
        >
          Delete task
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="panel">
          <h2>Checklist</h2>
          {(checklistQuery.data ?? []).map((item) => (
            <label key={item.id} className="check-item">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => void toggleCheck.mutateAsync(item)}
              />
              <span>{item.text}</span>
            </label>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <input
              placeholder="New checklist item"
              value={checkText}
              onChange={(e) => setCheckText(e.target.value)}
            />
            <button type="button" className="primary" onClick={() => void addCheck.mutateAsync()}>
              Add
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Timer sessions</h2>
          {(timersQuery.data ?? []).map((s) => (
            <div key={s.id} className="log-line">
              <strong>{s.source}</strong> · {s.duration_seconds ?? '…'}s ·{' '}
              {new Date(s.started_at).toLocaleString()}
              {s.ended_at ? ` → ${new Date(s.ended_at).toLocaleString()}` : ' (open)'}
            </div>
          ))}
          {(timersQuery.data ?? []).length === 0 && <p className="muted">No timers yet.</p>}
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>Activity log</h2>
        {(eventsQuery.data ?? []).map((ev) => (
          <div key={ev.id} className="log-line">
            <strong>{ev.event_type}</strong> · {new Date(ev.created_at).toLocaleString()}
            <pre
              style={{
                margin: '4px 0 0',
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                color: 'var(--muted)',
              }}
            >
              {JSON.stringify(ev.payload, null, 2)}
            </pre>
          </div>
        ))}
      </section>
    </div>
  )
}
