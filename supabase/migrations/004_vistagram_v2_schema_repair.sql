-- ============================================================================
-- MIGRATION 004: VISTAGRAM 2.0 IDEMPOTENT SCHEMA REPAIR, MESSAGING RLS FIX,
-- CUSTOMIZATION PREFERENCES, STORY HIGHLIGHTS, NOTES, CLOSE FRIENDS & REPOSTS
-- Safe to run on both brand-new databases and existing databases from v1!
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. REPAIR LEGACY v1 COLUMN MISMATCHES ON `public.posts`, `post_media`, `stories`, `reels`, `messages`, `profiles`
DO $$
BEGIN
  -- If `posts` was created with mixed-case "Tagged_usernames" in v1, rename it to lowercase `tagged_usernames`
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'Tagged_usernames'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'tagged_usernames'
  ) THEN
    ALTER TABLE public.posts RENAME COLUMN "Tagged_usernames" TO tagged_usernames;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) NOT NULL DEFAULT '#0095F6',
  ADD COLUMN IF NOT EXISTS ui_density VARCHAR(15) NOT NULL DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS feed_preference VARCHAR(20) NOT NULL DEFAULT 'chronological',
  ADD COLUMN IF NOT EXISTS autoplay_videos BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS chat_theme VARCHAR(20) NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS message_privacy VARCHAR(20) NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS text_scale VARCHAR(10) NOT NULL DEFAULT 'normal';

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS tagged_usernames TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS repost_of_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reposts_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(40) NOT NULL DEFAULT 'post-media',
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '';

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(40) NOT NULL DEFAULT 'stories',
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS overlay_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(40) NOT NULL DEFAULT 'reels',
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(6,2) NOT NULL DEFAULT 15.0,
  ADD COLUMN IF NOT EXISTS watch_time_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_accepted BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(15) NOT NULL DEFAULT 'sent';

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE;

-- 2. CREATE NEW VISTAGRAM 2.0 TABLES IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.reel_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.reel_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reel_id UUID NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  query TEXT NOT NULL CHECK (char_length(trim(query)) > 0 AND char_length(query) <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, query)
);

CREATE TABLE IF NOT EXISTS public.story_highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(40) NOT NULL CHECK (char_length(trim(title)) > 0),
  cover_url TEXT NOT NULL DEFAULT '',
  story_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.story_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL DEFAULT '❤️',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(story_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.user_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  content VARCHAR(60) NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 60),
  emoji VARCHAR(16) NOT NULL DEFAULT '✨',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.close_friends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, friend_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;

-- 3. FIX MESSAGING RLS INFINITE RECURSION (BUG 2 ROOT CAUSE FIX)
-- In v1, the SELECT policy on `conversation_members` queried `conversation_members` itself,
-- triggering PostgreSQL `42P17: infinite recursion detected in policy for relation "conversation_members"`.
-- Using a `SECURITY DEFINER` helper function breaks the recursion cleanly and securely.
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = conv_uuid AND user_id = user_uuid
  );
$$;

DROP POLICY IF EXISTS "View conversations where user is a member" ON public.conversations;
CREATE POLICY "View conversations where user is a member"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Update conversation timestamp if member" ON public.conversations;
CREATE POLICY "Update conversation timestamp if member"
  ON public.conversations FOR UPDATE
  USING (public.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "View conversation members for own conversations" ON public.conversation_members;
CREATE POLICY "View conversation members for own conversations"
  ON public.conversation_members FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Insert conversation members" ON public.conversation_members;
CREATE POLICY "Insert conversation members"
  ON public.conversation_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR public.is_conversation_member(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Update own conversation membership" ON public.conversation_members;
CREATE POLICY "Update own conversation membership"
  ON public.conversation_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "View messages only in joined conversations" ON public.messages;
CREATE POLICY "View messages only in joined conversations"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Send messages only to joined conversations when not blocked" ON public.messages;
CREATE POLICY "Send messages only to joined conversations when not blocked"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    public.is_conversation_member(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Sender can unsend or recipient can mark read" ON public.messages;
CREATE POLICY "Sender can unsend or recipient can mark read"
  ON public.messages FOR UPDATE
  USING (public.is_conversation_member(conversation_id, auth.uid()));

-- 4. POLICIES FOR NEW V2 TABLES (Story Highlights, Story Reactions, Notes, Close Friends)
DROP POLICY IF EXISTS "View story highlights of accessible accounts" ON public.story_highlights;
CREATE POLICY "View story highlights of accessible accounts"
  ON public.story_highlights FOR SELECT
  USING (public.can_view_account(auth.uid(), user_id));

DROP POLICY IF EXISTS "Manage own story highlights" ON public.story_highlights;
CREATE POLICY "Manage own story highlights"
  ON public.story_highlights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "View story reactions" ON public.story_reactions;
CREATE POLICY "View story reactions"
  ON public.story_reactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Manage own story reactions" ON public.story_reactions;
CREATE POLICY "Manage own story reactions"
  ON public.story_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "View active user notes from accessible accounts" ON public.user_notes;
CREATE POLICY "View active user notes from accessible accounts"
  ON public.user_notes FOR SELECT
  USING (expires_at > NOW() AND public.can_view_account(auth.uid(), author_id));

DROP POLICY IF EXISTS "Manage own user note" ON public.user_notes;
CREATE POLICY "Manage own user note"
  ON public.user_notes FOR ALL
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Manage own close friends list" ON public.close_friends;
CREATE POLICY "Manage own close friends list"
  ON public.close_friends FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 5. GROUP CONVERSATION CREATION RPC
CREATE OR REPLACE FUNCTION public.create_group_conversation(group_title TEXT, member_uuids UUID[])
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID := auth.uid();
  new_conv_id UUID;
  m_id UUID;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.conversations (is_group, title)
  VALUES (TRUE, COALESCE(NULLIF(trim(group_title), ''), 'Group Chat'))
  RETURNING id INTO new_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (new_conv_id, current_uid)
  ON CONFLICT DO NOTHING;

  FOREACH m_id IN ARRAY member_uuids LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id)
    VALUES (new_conv_id, m_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN new_conv_id;
END;
$$;

-- Reload PostgREST schema cache immediately so new/renamed columns work without restarting Supabase
NOTIFY pgrst, 'reload schema';
