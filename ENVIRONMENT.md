# VistaGram 2.0 — Environment Variables Reference (`ENVIRONMENT.md`)

Copy `.env.example` to `.env.local` in `vistagram-platform/` for local development, and configure the same keys in your Vercel Project Settings for production deployment.

| Variable Name | Scope | Required | Description & Where to Find |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Client & Server | **Yes** | Your Supabase project URL (`https://<project-ref>.supabase.co`). Found in **Supabase Dashboard → Project Settings → API → Project URL**. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client & Server | **Yes** (or Anon Key) | Current Supabase publishable key (`sb_publishable_...`). Found in **Project Settings → APIKeys**. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client & Server | Fallback | Legacy Supabase `anon` `public` JWT key (`eyJ...`). Either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be provided. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-Only** | **Yes** | Your Supabase `service_role` or `sb_secret_...` key. **Never expose in client code or prefix with `NEXT_PUBLIC_`.** Used strictly by `/api/auth/login` (username-to-email lookup), `/api/account/delete`, and `scripts/seed.ts`. |
| `NEXT_PUBLIC_APP_URL` | Client & Server | **Yes** | Base URL of your web application (`http://localhost:3000` locally, or `https://your-domain.vercel.app` in production). |
| `NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH` | Client | Optional | Set to `"true"` only after configuring Google OAuth credentials in **Supabase Dashboard → Authentication → Providers → Google**. Defaults to `"false"`. |
| `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` | Client & Server | Optional | Maximum allowed image upload size in megabytes. Defaults to `"10"`. |
| `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` | Client & Server | Optional | Maximum allowed video upload size in megabytes. Defaults to `"50"`. |
