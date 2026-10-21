import { createClient } from "@supabase/supabase-js";
import { isApp } from "@/shared/lib/native";

/** The publishable key is meant to ship in the browser; row-level security protects the data. */
const url = import.meta.env.VITE_SUPABASE_URL || "https://ehvppploqbmtzvbulyic.supabase.co";
const key = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_7aDtqSyVS7jGO14FHTBSsQ_kFWwmI83";

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "bloom.auth",
    // The apps finish Google sign-in through a bloom:// link carrying a one-time code.
    flowType: isApp ? "pkce" : "implicit",
  },
});
