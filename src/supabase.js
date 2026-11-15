import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
// Supabase publishable keys are intentionally safe to expose in browser code.
// Pin this project key so a server-only secret can never be bundled by a
// misconfigured Vercel environment variable.
const key = "sb_publishable_MCHllSydsQCFvtFyCubbsA_3BgWW-tK";

export const supabaseConfigured = Boolean(url && key);
export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;
