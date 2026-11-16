# VistaGram — Production Deployment, Backup & Security Guide (`DEPLOYMENT.md`)

## 1. Production Vercel Deployment Steps
1. Push your `vistagram-platform` repository to GitHub (`.gitignore` automatically excludes `.env.local`, `node_modules`, and `.next`).
2. Open [https://vercel.com/new](https://vercel.com/new) and import your GitHub repository.
3. Configure the following **Production Environment Variables** in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://<YOUR_PROJECT_REF>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_<YOUR_KEY>` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - `SUPABASE_SERVICE_ROLE_KEY` = `<YOUR_SERVICE_ROLE_OR_SECRET_KEY>`
   - `NEXT_PUBLIC_APP_URL` = `https://your-production-domain.vercel.app`
   - `NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH` = `false` (or `true` once Google OAuth is configured)
   - `NEXT_PUBLIC_MAX_IMAGE_SIZE_MB` = `10`
   - `NEXT_PUBLIC_MAX_VIDEO_SIZE_MB` = `50`
4. Click **Deploy**.

---

## 2. Production Authentication & Custom Domain Configuration
1. In Vercel → **Project Settings** → **Domains**, attach your custom domain (e.g., `https://vistagram.yourdomain.com`).
2. In Supabase Dashboard → **Authentication** → **URL Configuration**:
   - Update **Site URL** to `https://vistagram.yourdomain.com`.
   - Add `https://vistagram.yourdomain.com/auth/callback` and `https://vistagram.yourdomain.com/reset-password` to **Redirect URLs**.

---

## 3. Automated 24-Hour Story Cleanup (`pg_cron`)
Enable `pg_cron` in Supabase Dashboard → **Database** → **Extensions**, then run in **SQL Editor**:
```sql
SELECT cron.schedule(
  'vistagram-hourly-story-cleanup',
  '0 * * * *',
  $$SELECT public.cleanup_expired_stories();$$
);
```

---

## 4. Database Backup & Disaster Recovery Recommendations
1. **Automated Daily Backups & Point-in-Time Recovery (PITR)**:
   - In Supabase Dashboard → **Database** → **Backups**, enable daily automated backups (and PITR for production workloads requiring RPO < 2 minutes).
2. **Logical Schema & Data Export (`pg_dump`)**:
   - Before applying schema changes, run:
     ```bash
     pg_dump --clean --if-exists --quote-all-identifiers "$SUPABASE_DB_URL" > backup_$(date +%F).sql
     ```
3. **Storage Bucket Recovery**:
   - Retain versioned backups of critical media buckets using the Supabase Storage S3-compatible endpoint (`rclone sync`).

---

## 5. Production Security Checklist
- [x] **Row Level Security (RLS)**: Enabled across all 24 tables in `public` (`002_rls_policies.sql`).
- [x] **Private Account Media Protection**: `post-media`, `stories`, `reels`, and `dm-attachments` buckets are set to `public = false` (`003_storage_and_triggers.sql`) and served via short-lived signed URLs after verifying `public.can_view_account(auth.uid(), owner_uuid)`.
- [x] **Zero Email Leakage on Username Login**: `public.get_email_by_username(uname)` revokes execution from `PUBLIC`, `anon`, and `authenticated` and is callable exclusively by the server-side `/api/auth/login` route via `service_role`.
- [x] **Service Role Key Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is referenced only inside `src/lib/supabase/server.ts` and server route handlers (`/api/auth/login`, `/api/account/delete`).
- [x] **HTTP Security Headers**: Configured in `next.config.mjs` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).
