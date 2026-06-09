# Fruit

Lightweight work tracking: **nested buckets**, **tasks** (title, description, optional checklist), **Pomodoro timers** linked to tasks, and an **append-style activity log** (created, updated, timer start/stop, checklist events). Timer totals **roll up** to each bucket via the `bucket_timer_totals()` RPC.

## Stack

- [Vite](https://vitejs.dev/) + React + TypeScript  
- [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)  
- [Supabase](https://supabase.com/) (Postgres + Auth + RLS)

## Supabase setup

1. Create a project and run the SQL migration:  
   `supabase/migrations/20250609000000_init_fruit.sql`  
   (Supabase SQL editor, or `supabase db push` if you use the CLI.)

2. **Auth → Providers → Google**: enable Google, add OAuth client id/secret, and set redirect URL to your app origin (e.g. `http://localhost:5173` for local dev).

3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Deploy (GitHub Actions + Vercel)

Production-only flow: push to **`main`** (or run the **Deploy (Production)** workflow manually).  
Bootstrap checklist (canonical copy in **GOLD**): **[AppStarter.md in gjudki/GOLD](https://github.com/gjudki/GOLD/blob/main/docs/AppStarter.md)**.

## Run locally

```bash
npm install
npm run dev
```

## Data model (summary)

| Table | Purpose |
|--------|---------|
| `buckets` | Nested labels (`parent_id`), per-user, `created_at` / `updated_at` |
| `tasks` | `title`, `description`, `bucket_id` |
| `task_checklist_items` | Optional checklist rows |
| `timer_sessions` | Pomodoro/manual sessions; optional `task_id`; `duration_seconds` when closed |
| `task_events` | Log: DB triggers for task create/update and timer start/stop; client inserts for checklist |

RPC **`bucket_timer_totals()`** returns `{ bucket_id, total_seconds }` for the signed-in user, summing completed sessions for tasks in each bucket and all descendant buckets.

## Notes

- Regenerate typed DB definitions later with the Supabase CLI (`supabase gen types typescript`) and replace `src/types/database.ts` if you evolve the schema.
- The sticky Pomodoro bar is shown whenever a `timer_sessions` row is open for the current focus session.
