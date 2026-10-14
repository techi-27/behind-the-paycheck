/* Public client configuration for Behind the Paycheck.
 * These are public browser values, NOT secret keys.
 * Never put a Supabase service-role key or Turnstile secret in this file.
 */
window.BTP_CONFIG = {
  // Example: https://YOUR_PROJECT_REF.supabase.co
  supabaseUrl: "",
  // Supabase publishable key (or legacy anon key); safe for browser use with RLS/Edge Function protections.
  publishableKey: "",
  // Cloudflare Turnstile SITE key (public site key, not the secret key).
  turnstileSiteKey: ""
};
