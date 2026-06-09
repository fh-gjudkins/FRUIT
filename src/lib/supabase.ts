import { createClient, type Session, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

// createClient throws if URL or key is empty (validateSupabaseUrl / supabaseKey checks).
// Dev without .env was a blank page because the module failed before React mounted.
const fallbackUrl = 'https://local-dev-placeholder.supabase.co'
const fallbackKey = 'local-dev-placeholder-anon-key'

if (!url || !key) {
  console.warn(
    '[FRUIT] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — using placeholders so the app loads. Copy .env.example → .env and add real Supabase values.',
  )
}

export const supabase = createClient(url || fallbackUrl, key || fallbackKey)

export type { Session, User }
