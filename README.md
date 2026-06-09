# Fruit

Lightweight work tracking: **nested buckets**, **tasks** (title, description, optional checklist), **Pomodoro timers** linked to tasks, and an **append-style activity log** (created, updated, timer start/stop, checklist events). Timer totals **roll up** to each bucket via the `bucket_timer_totals()` RPC.

This repo is meant to match the **[AppStarter](https://github.com/gjudki/GOLD/blob/main/docs/AppStarter.md)** playbook in **GOLD**: **Vercel is the deploy authority** (Git-connected builds from `main`). There is **no** GitHub Action that runs `vercel deploy`.

## Stack

- [Vite](https://vitejs.dev/) + React + TypeScript  
- [TanStack Router](https://tanstack.com/router) + [TanStack Query](https://tanstack.com/query)  
- [Supabase](https://supabase.com/) (Postgres + Auth + RLS)  
- [Vercel](https://vercel.com/) — production hosting + previews from Git

## Bootstrap (same order as AppStarter)

Full detail, MCP steps, and edge cases: **[docs/AppStarter.md (GOLD)](https://github.com/gjudki/GOLD/blob/main/docs/AppStarter.md)**.

### 1. Supabase

1. Create a project and run **`supabase/migrations/20250609000000_init_fruit.sql`** (SQL editor or `supabase db push` with the CLI).
2. **Project Settings → API** — copy **Project URL** (`https://<project-ref>.supabase.co`) and the **`anon` `public`** key (never `service_role` in the browser).

### 2. Vercel (deploy authority)

1. **Vercel → Add New → Project → Import** this GitHub repo.
2. **Framework:** Vite · **Root:** `.` · **Build Command:** `npm run build` · **Output:** `dist` · **Production branch:** `main`.
3. **Project → Settings → Environment Variables** — add for **Production** (and **Preview** if previews should hit a real DB):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`  
   Then **Redeploy** so the client bundle picks them up.
4. **Do not** re-introduce a GitHub workflow that runs `vercel deploy` — that would be a second deploy pipeline. Optional **PR-only** CI is in **`.github/workflows/ci.yml`** (`npm run build` with placeholders).

### 3. Supabase Auth URLs

After you have the **production URL** from Vercel (e.g. `https://<project>.vercel.app`), configure **Authentication → URL configuration** in Supabase (**Site URL**, **Redirect URLs**, Google OAuth per AppStarter).

### 4. Google OAuth (optional)

**Authentication → Providers → Google** in Supabase; use the redirect/origin guidance in AppStarter and in Google Cloud Console.

### 5. Local dev

1. Copy `.env.example` → `.env` with the same `VITE_*` values as in **Vercel Production** (or a separate dev Supabase project).
2. `npm install` && `npm run dev`.

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
