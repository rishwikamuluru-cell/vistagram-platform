-- ============================================================================
-- MIGRATION 005: VISTAGRAM ULTIMATE 3.0 — PARAMETERIZED MEMBER SEARCH (pg_trgm),
-- LIVEKIT VOICE/VIDEO CALLING, COMMUNITIES, BROADCAST CHANNELS, POLLS,
-- VOICE NOTES, QUOTE REPOSTS & ADMIN MODERATION AUDIT
-- Idempotent & safe to run on existing VistaGram 1.0 / 2.0 databases
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. TRIGRAM INDEXES & SAFE PARAMETERIZED MEMBER SEARCH RPC (Part 5)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_bio_trgm
  ON public.profiles USING gin (bio gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_hashtags_name_trgm
  ON public.hashtags USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_posts_caption_trgm
  ON public.posts USING gin (caption gin_trgm_ops);

-- Safe parameterized member search function that:
-- 1. Escapes ILIKE special characters (%, _, \) and strips leading @/#
-- 2. Excludes bidirectional blocked accounts
-- 3. Ranks exact username > prefix username > display_name > bio similarity
-- 4. Never exposes email addresses or sensitive auth fields
CREATE OR REPLACE FUNCTION public.search_directory_members(
  raw_query TEXT,
  viewer_uuid UUID DEFAULT auth.uid(),
  max_results INTEGER DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  username VARCHAR,
  display_name VARCHAR,
  bio TEXT,
  website VARCHAR,
  avatar_url TEXT,
  account_type VARCHAR,
  is_private BOOLEAN,
  is_verified BOOLEAN,
  posts_count INTEGER,
  followers_count INTEGER,
  following_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  cleaned TEXT;
  escaped_like TEXT;
BEGIN
  cleaned := lower(trim(regexp_replace(COALESCE(raw_query, ''), '^[@#]+', '')));
  IF char_length(cleaned) = 0 THEN
    RETURN QUERY
    SELECT
      p.id, p.username, p.display_name, p.bio, p.website, p.avatar_url,
      p.account_type, p.is_private, p.is_verified,
      p.posts_count, p.followers_count, p.following_count,
      p.created_at, p.updated_at
    FROM public.profiles p
    WHERE (viewer_uuid IS NULL OR NOT public.is_blocked_between(viewer_uuid, p.id))
    ORDER BY p.followers_count DESC, p.created_at DESC
    LIMIT LEAST(GREATEST(max_results, 1), 50);
    RETURN;
  END IF;

  -- Escape \, %, and _ so literal dots, underscores, and symbols match safely
  escaped_like := replace(replace(replace(cleaned, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT
    p.id, p.username, p.display_name, p.bio, p.website, p.avatar_url,
    p.account_type, p.is_private, p.is_verified,
    p.posts_count, p.followers_count, p.following_count,
    p.created_at, p.updated_at
  FROM public.profiles p
  WHERE
    (viewer_uuid IS NULL OR NOT public.is_blocked_between(viewer_uuid, p.id))
    AND (
      lower(p.username) LIKE '%' || escaped_like || '%' ESCAPE '\'
      OR lower(p.display_name) LIKE '%' || escaped_like || '%' ESCAPE '\'
      OR lower(COALESCE(p.bio, '')) LIKE '%' || escaped_like || '%' ESCAPE '\'
      OR similarity(lower(p.username), cleaned) > 0.25
      OR similarity(lower(p.display_name), cleaned) > 0.25
    )
  ORDER BY
    CASE
      WHEN lower(p.username) = cleaned THEN 0
      WHEN lower(p.username) LIKE escaped_like || '%' ESCAPE '\' THEN 1
      WHEN lower(p.display_name) LIKE escaped_like || '%' ESCAPE '\' THEN 2
      WHEN lower(p.username) LIKE '%' || escaped_like || '%' ESCAPE '\' THEN 3
      ELSE 4
    END ASC,
    p.followers_count DESC,
    p.username ASC
  LIMIT LEAST(GREATEST(max_results, 1), 50);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_directory_members(TEXT, UUID, INTEGER) TO authenticated, anon;

-- ============================================================================
-- 2. VOICE & VIDEO CALLING TABLES & RLS (Part 10: 1-to-1 & Group Calls)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id VARCHAR(120) NOT NULL UNIQUE,
  call_type VARCHAR(16) NOT NULL DEFAULT 'video' CHECK (call_type IN ('voice', 'video')),
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'ringing' CHECK (
    status IN ('ringing', 'accepted', 'declined', 'cancelled', 'missed', 'busy', 'ended', 'failed')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  end_reason VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'participant')),
  state VARCHAR(20) NOT NULL DEFAULT 'invited' CHECK (
    state IN ('invited', 'ringing', 'joined', 'declined', 'left', 'missed', 'busy')
  ),
  mic_muted BOOLEAN NOT NULL DEFAULT FALSE,
  camera_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(call_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.call_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_call_participant(target_call_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.call_participants
    WHERE call_id = target_call_uuid AND user_id = user_uuid
  ) OR EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = target_call_uuid AND (
      c.initiator_id = user_uuid OR
      (c.conversation_id IS NOT NULL AND public.is_conversation_member(c.conversation_id, user_uuid))
    )
  );
$$;

DROP POLICY IF EXISTS "View authorized calls" ON public.calls;
CREATE POLICY "View authorized calls"
  ON public.calls FOR SELECT
  USING (public.is_call_participant(id, auth.uid()));

DROP POLICY IF EXISTS "Initiate calls when authenticated" ON public.calls;
CREATE POLICY "Initiate calls when authenticated"
  ON public.calls FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);

DROP POLICY IF EXISTS "Update authorized calls" ON public.calls;
CREATE POLICY "Update authorized calls"
  ON public.calls FOR UPDATE
  USING (public.is_call_participant(id, auth.uid()));

DROP POLICY IF EXISTS "View call participants" ON public.call_participants;
CREATE POLICY "View call participants"
  ON public.call_participants FOR SELECT
  USING (public.is_call_participant(call_id, auth.uid()));

DROP POLICY IF EXISTS "Insert call participants" ON public.call_participants;
CREATE POLICY "Insert call participants"
  ON public.call_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_call_participant(call_id, auth.uid()));

DROP POLICY IF EXISTS "Update own call participant state" ON public.call_participants;
CREATE POLICY "Update own call participant state"
  ON public.call_participants FOR UPDATE
  USING (auth.uid() = user_id OR public.is_call_participant(call_id, auth.uid()));

DROP POLICY IF EXISTS "View call events" ON public.call_events;
CREATE POLICY "View call events"
  ON public.call_events FOR SELECT
  USING (public.is_call_participant(call_id, auth.uid()));

DROP POLICY IF EXISTS "Insert call events" ON public.call_events;
CREATE POLICY "Insert call events"
  ON public.call_events FOR INSERT
  WITH CHECK (public.is_call_participant(call_id, auth.uid()));

-- ============================================================================
-- 3. ENHANCED MESSAGING COLUMNS (Voice Notes, Message Edit, Disappearing)
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voice_duration_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Re-widen attachment_type check constraint on messages to support voice & video attachments
DO $$
BEGIN
  ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_attachment_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 4. COMMUNITIES & BROADCAST CHANNELS (Part 12)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL CHECK (char_length(trim(name)) >= 2),
  slug VARCHAR(60) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(40) NOT NULL DEFAULT 'General',
  avatar_url TEXT NOT NULL DEFAULT '',
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  members_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  status VARCHAR(20) NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'pending', 'banned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  channel_name VARCHAR(40) NOT NULL DEFAULT 'general',
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.broadcast_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL CHECK (char_length(trim(title)) >= 2),
  description TEXT NOT NULL DEFAULT '',
  subscribers_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.channel_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES public.broadcast_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2200),
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View communities" ON public.communities;
CREATE POLICY "View communities" ON public.communities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Create communities" ON public.communities;
CREATE POLICY "Create communities" ON public.communities FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Update own communities" ON public.communities;
CREATE POLICY "Update own communities" ON public.communities FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "View community members" ON public.community_members;
CREATE POLICY "View community members" ON public.community_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Join or manage community membership" ON public.community_members;
CREATE POLICY "Join or manage community membership"
  ON public.community_members FOR ALL
  USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "View community messages" ON public.community_messages;
CREATE POLICY "View community messages" ON public.community_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Send community messages if member" ON public.community_messages;
CREATE POLICY "Send community messages if member"
  ON public.community_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_messages.community_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'joined'
    )
  );

DROP POLICY IF EXISTS "View broadcast channels" ON public.broadcast_channels;
CREATE POLICY "View broadcast channels" ON public.broadcast_channels FOR SELECT USING (true);

DROP POLICY IF EXISTS "Create broadcast channels" ON public.broadcast_channels;
CREATE POLICY "Create broadcast channels"
  ON public.broadcast_channels FOR INSERT WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "View channel members" ON public.channel_members;
CREATE POLICY "View channel members" ON public.channel_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage own channel subscription" ON public.channel_members;
CREATE POLICY "Manage own channel subscription"
  ON public.channel_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "View channel messages" ON public.channel_messages;
CREATE POLICY "View channel messages" ON public.channel_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Creator can post to broadcast channel" ON public.channel_messages;
CREATE POLICY "Creator can post to broadcast channel"
  ON public.channel_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND EXISTS (
      SELECT 1 FROM public.broadcast_channels bc
      WHERE bc.id = channel_messages.channel_id AND bc.creator_id = auth.uid()
    )
  );

-- ============================================================================
-- 5. INTERACTIVE POLLS, QUOTE REPOSTS & ADMIN MODERATION AUDIT (Parts 13, 15, 21)
-- ============================================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS quote_comment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS poll_question VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS poll_options JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.post_poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL CHECK (option_index >= 0 AND option_index <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  action_type VARCHAR(40) NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.post_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View poll votes" ON public.post_poll_votes;
CREATE POLICY "View poll votes" ON public.post_poll_votes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Vote in polls" ON public.post_poll_votes;
CREATE POLICY "Vote in polls"
  ON public.post_poll_votes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage moderation actions" ON public.moderation_actions;
CREATE POLICY "Admins manage moderation actions"
  ON public.moderation_actions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = TRUE)
  );

NOTIFY pgrst, 'reload schema';
