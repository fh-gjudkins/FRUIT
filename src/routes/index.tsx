import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthContext'
import { usePomodoro } from '@/pomodoro/PomodoroContext'

export const Route = createFileRoute('/')({
  component: HomePage,
})

type BucketRow = {
  id: string
  parent_id: string | null
  label: string
  created_at: string
}

type TaskRow = {
  id: string
  bucket_id: string | null
  title: string
  created_at: string
}

function buildChildrenMap(buckets: BucketRow[]) {
  const map = new Map<string | null, BucketRow[]>()
  for (const b of buckets) {
    const key = b.parent_id
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(b)
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label))
  }
  return map
}

function BucketTree({
  map,
  parentId,
  depth,
  selectedId,
  onSelect,
  totals,
}: {
  map: Map<string | null, BucketRow[]>
  parentId: string | null
  depth: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  totals: Map<string, number>
}) {
  const children = map.get(parentId) ?? []
  return (
    <>
      {parentId === null && (
        <div
          className={`bucket-item ${selectedId === null ? 'active' : ''}`}
          style={{ ['--depth' as string]: 0 }}
          onClick={() => onSelect(null)}
          onKeyDown={(e) => e.key === 'Enter' && onSelect(null)}
          role="button"
          tabIndex={0}
        >
          All buckets
        </div>
      )}
      {children.map((b) => {
        const secs = totals.get(b.id) ?? 0
        const label = `${b.label} · ${Math.round(secs / 60)}m`
        return (
          <div key={b.id}>
            <div
              className={`bucket-item ${selectedId === b.id ? 'active' : ''}`}
              style={{ ['--depth' as string]: depth }}
              onClick={() => onSelect(b.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(b.id)}
              role="button"
              tabIndex={0}
            >
              {label}
            </div>
            <BucketTree
              map={map}
              parentId={b.id}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              totals={totals}
            />
          </div>
        )
      })}
    </>
  )
}

function HomePage() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const pom = usePomodoro()
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null)
  const [newBucketLabel, setNewBucketLabel] = useState('')
  const [newBucketParent, setNewBucketParent] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const bucketsQuery = useQuery({
    queryKey: ['buckets', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buckets')
        .select('id,parent_id,label,created_at')
        .order('label')
      if (error) throw error
      return data as BucketRow[]
    },
  })

  const totalsQuery = useQuery({
    queryKey: ['bucket-totals', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bucket_timer_totals')
      if (error) throw error
      const map = new Map<string, number>()
      for (const row of data ?? []) {
        map.set(row.bucket_id, Number(row.total_seconds))
      }
      return map
    },
  })

  const tasksQuery = useQuery({
    queryKey: ['tasks', user?.id, selectedBucketId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('tasks').select('id,bucket_id,title,created_at').order('created_at', {
        ascending: false,
      })
      if (selectedBucketId) q = q.eq('bucket_id', selectedBucketId)
      const { data, error } = await q
      if (error) throw error
      return data as TaskRow[]
    },
  })

  const tasksForPomQuery = useQuery({
    queryKey: ['tasks-pom', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id,title')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as { id: string; title: string }[]
    },
  })

  const createBucket = useMutation({
    mutationFn: async () => {
      if (!user || !newBucketLabel.trim()) return
      const { error } = await supabase.from('buckets').insert({
        user_id: user.id,
        label: newBucketLabel.trim(),
        parent_id: newBucketParent,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNewBucketLabel('')
      void qc.invalidateQueries({ queryKey: ['buckets'] })
    },
  })

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user || !newTaskTitle.trim()) return
      const { error } = await supabase.from('tasks').insert({
        user_id: user.id,
        bucket_id: selectedBucketId,
        title: newTaskTitle.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNewTaskTitle('')
      void qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const bucketMap = useMemo(
    () => buildChildrenMap(bucketsQuery.data ?? []),
    [bucketsQuery.data],
  )

  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" />

  const totals = totalsQuery.data ?? new Map<string, number>()

  return (
    <div>
      <section className="panel" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Pomodoro</h2>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <label className="muted" htmlFor="pom-min">
            Focus minutes
          </label>
          <input
            id="pom-min"
            type="number"
            min={1}
            max={120}
            style={{ maxWidth: 100 }}
            defaultValue={25}
            onChange={(e) => pom.setFocusMinutes(Number(e.target.value) || 25)}
          />
        </div>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <label className="muted" htmlFor="pom-task">
            Link to task (optional)
          </label>
          <select
            id="pom-task"
            value={pom.linkedTaskId ?? ''}
            onChange={(e) => pom.setLinkedTaskId(e.target.value || null)}
            style={{ maxWidth: 320 }}
          >
            <option value="">No task</option>
            {(tasksForPomQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!!pom.activeSessionId}
            onClick={() => void pom.start()}
          >
            Start
          </button>
          <span className="muted">
            Sticky bar appears while a session is active (top of every page).
          </span>
        </div>
      </section>

      <div className="grid">
        <aside className="panel">
          <h2>Buckets</h2>
          {bucketsQuery.isLoading && <p className="muted">Loading buckets…</p>}
          {bucketsQuery.error && (
            <p style={{ color: 'var(--danger)' }}>{String(bucketsQuery.error.message)}</p>
          )}
          <BucketTree
            map={bucketMap}
            parentId={null}
            depth={0}
            selectedId={selectedBucketId}
            onSelect={setSelectedBucketId}
            totals={totals}
          />
          <hr style={{ borderColor: 'var(--border)', margin: '1rem 0' }} />
          <label className="muted">New bucket label</label>
          <input value={newBucketLabel} onChange={(e) => setNewBucketLabel(e.target.value)} />
          <label className="muted" style={{ display: 'block', marginTop: 8 }}>
            Parent (optional)
          </label>
          <select
            value={newBucketParent ?? ''}
            onChange={(e) => setNewBucketParent(e.target.value || null)}
          >
            <option value="">Top level</option>
            {(bucketsQuery.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary"
            style={{ marginTop: 8 }}
            onClick={() => void createBucket.mutateAsync()}
          >
            Add bucket
          </button>
        </aside>

        <main className="panel">
          <h2>Tasks {selectedBucketId ? '(filtered)' : ''}</h2>
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <input
              placeholder="New task title"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="button" className="primary" onClick={() => void createTask.mutateAsync()}>
              Add task
            </button>
          </div>
          {tasksQuery.isLoading && <p className="muted">Loading tasks…</p>}
          {(tasksQuery.data ?? []).map((t) => (
            <div key={t.id} className="task-row">
              <Link to="/tasks/$taskId" params={{ taskId: t.id }}>
                {t.title}
              </Link>
              <span className="muted">{new Date(t.created_at).toLocaleString()}</span>
            </div>
          ))}
          {(tasksQuery.data ?? []).length === 0 && !tasksQuery.isLoading && (
            <p className="muted">No tasks yet.</p>
          )}
        </main>
      </div>
    </div>
  )
}
