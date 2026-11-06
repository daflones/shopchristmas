import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { requireEnv } from './http.ts'

let _service: SupabaseClient | null = null
export function serviceClient(): SupabaseClient {
  if (!_service) _service = createClient(
    requireEnv('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? requireEnv('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } })
  return _service
}
