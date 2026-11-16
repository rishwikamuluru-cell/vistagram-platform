import { createBrowserClient } from '@supabase/ssr';

function cleanEnvValue(val?: string): string {
  if (!val) return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

export function getSupabasePublicConfig() {
  const url = cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key =
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const isConfigured =
    Boolean(url) &&
    Boolean(key) &&
    !url.includes('your-project-ref.supabase.co') &&
    !key.includes('your-supabase-anon-public-key') &&
    !key.includes('sb_publishable_your_key_here');

  return { url, key, isConfigured };
}

export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  return createBrowserClient(
    url || 'https://placeholder-unconfigured.supabase.co',
    key || 'placeholder-anon-key'
  );
}
