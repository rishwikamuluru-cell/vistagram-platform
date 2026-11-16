# VistaGram — Production Full-Stack Social Media Platform

VistaGram is a multi-user Instagram-inspired social networking platform built with **Next.js 14 (App Router)**, **React 18**, **TypeScript**, **Tailwind CSS**, **Zod**, and **Supabase** (PostgreSQL, Auth, Private Storage with Signed URLs, and Realtime).

## Summary of Phase 1–10 Architectural Repairs

1. **Zero Hardcoded Demo State in Production Code**: Removed `u_rithwik` initialization and all `INITIAL_PROFILES`, `INITIAL_POSTS`, `INITIAL_COMMENTS`, `INITIAL_STORIES`, and `INITIAL_REELS` arrays from `src/app/page.tsx`.
2. **Real PostgreSQL & Supabase Storage Persistence**: Content and interactions are stored in PostgreSQL and Supabase Storage (`localStorage` is restricted strictly to the light/dark theme toggle key `vistagram_theme_preference`).
3. **Real Authentication & Missing Routes Added**: Implemented `/login`, `/signup`, `/reset-password`, `/auth/callback`, and `/api/auth/login` (with IP rate limiting and server-only `get_email_by_username` lookup).
4. **Private Storage Buckets & Signed URLs**: Configured `post-media`, `stories`, `reels`, and `dm-attachments` as private buckets (`public = false`) protected by `storage.objects` RLS policies (`003_storage_and_triggers.sql`) so private-account media cannot be accessed by guessing a URL.
5. **Modular Component Architecture**: Refactored the application into 11 focused modules under `src/components/` (`auth`, `stories`, `posts`, `search`, `reels`, `messages`, `notifications`, `upload`, `profile`, `settings`, `common`).
