# VistaGram Ultimate 3.0 — Complete Setup & LiveKit Guide (`SETUP.md`)

## 1. Local Environment Setup
1. Open the inner `vistagram-platform` directory in VS Code.
2. Copy `.env.example` to `.env.local` and fill in your Supabase keys (and optional LiveKit Cloud keys):
   ```powershell
   Copy-Item .env.example .env.local
   ```
3. Install dependencies:
   ```powershell
   npm install
   ```

---

## 2. Database Migration Order (Supabase SQL Editor)
Open your [Supabase Dashboard SQL Editor](https://supabase.com/dashboard) and run the migrations in order.
- If your database is **already running VistaGram 1.0 or 2.0**, you only need to run:
  1. `supabase/migrations/004_vistagram_v2_schema_repair.sql` *(if not already applied)*
  2. `supabase/migrations/005_vistagram_ultimate_v3.sql` *(adds `pg_trgm` GIN indexes, `public.search_directory_members` RPC, `calls`, `call_participants`, `call_events`, `communities`, `broadcast_channels`, `post_poll_votes`, and `moderation_actions`)*

---

## 3. Manual Setup for LiveKit Cloud (Voice & Video Calling)
VistaGram Ultimate 3.0 uses **LiveKit** for multi-device WebRTC audio/video rooms alongside **Supabase Realtime** for call invitations and state transitions.

1. Go to **[https://cloud.livekit.io/](https://cloud.livekit.io/)** and sign in (free tier includes 50GB/month bandwidth and 100 concurrent participants).
2. Click **Create Project** (e.g., `vistagram-calls`).
3. Navigate to **Settings → Keys → Add New Key**.
4. Copy the generated credentials into `.env.local` and **Vercel → Settings → Environment Variables** (without quotes):
   - `NEXT_PUBLIC_LIVEKIT_URL` = `wss://<your-project>.livekit.cloud`
   - `LIVEKIT_API_KEY` = `APIxxxxxxxxxxxx`
   - `LIVEKIT_API_SECRET` = `<your-secret>` *(STRICTLY SERVER-SIDE ONLY! Never prefix with `NEXT_PUBLIC_`)*

---

## 4. Seed Test Accounts & Run Verification
```powershell
npm run db:seed
npm run typecheck
npm test
npm run build
npm run dev
```

---

## 5. Safe Git Feature Branch Workflow
To preserve `main` while developing or testing new upgrades:
```powershell
git checkout -b feat/vistagram-ultimate-3
git add .
git commit -m "feat: upgrade to VistaGram Ultimate 3.0"
git push -u origin feat/vistagram-ultimate-3
```
Once verified on your Vercel Preview URL, merge `feat/vistagram-ultimate-3` into `main` via a GitHub Pull Request (or `git checkout main; git merge feat/vistagram-ultimate-3; git push origin main`).
