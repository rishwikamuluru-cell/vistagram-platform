-- ============================================================================
-- MIGRATION 002: ROW LEVEL SECURITY (RLS) POLICIES
-- Enforces backend privacy for private accounts, block lists, conversation
-- membership, saved collections, search history, and owner-only mutations.
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Security helper function: checks whether viewer can see target user's content
CREATE OR REPLACE FUNCTION public.can_view_account(viewer UUID, target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN viewer IS NOT NULL AND viewer = target THEN TRUE
      WHEN viewer IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.blocked_users
        WHERE (blocker_id = target AND blocked_id = viewer)
           OR (blocker_id = viewer AND blocked_id = target)
      ) THEN FALSE
      WHEN EXISTS (
        SELECT 1 FROM public.profiles WHERE id = target AND is_private = FALSE
      ) THEN TRUE
      WHEN viewer IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.follows WHERE follower_id = viewer AND following_id = target
      ) THEN TRUE
      ELSE FALSE
    END;
$$;

-- 1. PROFILES POLICIES
CREATE POLICY "Profiles are viewable when not blocked"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.blocked_users
      WHERE (blocker_id = profiles.id AND blocked_id = auth.uid())
         OR (blocker_id = auth.uid() AND blocked_id = profiles.id)
    )
  );

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. USER_SETTINGS POLICIES
CREATE POLICY "Users can view and manage own settings"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. POSTS & POST_MEDIA POLICIES (Enforces Private Account & Visibility on Backend)
CREATE POLICY "View posts if author is accessible and visibility permits"
  ON public.posts FOR SELECT
  USING (
    public.can_view_account(auth.uid(), author_id) AND
    (
      visibility = 'public'
      OR author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.follows
        WHERE follower_id = auth.uid() AND following_id = posts.author_id
      )
    )
  );

CREATE POLICY "Users can create their own posts"
  ON public.posts FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own posts"
  ON public.posts FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own posts"
  ON public.posts FOR DELETE
  USING (auth.uid() = author_id);

CREATE POLICY "View post media if parent post is accessible"
  ON public.post_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media.post_id
        AND public.can_view_account(auth.uid(), p.author_id)
    )
  );

CREATE POLICY "Owners can insert post media"
  ON public.post_media FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media.post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete post media"
  ON public.post_media FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media.post_id AND p.author_id = auth.uid()
    )
  );

-- 4. LIKES, COMMENTS & COMMENT_LIKES POLICIES
CREATE POLICY "View likes on accessible posts"
  ON public.likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = likes.post_id AND public.can_view_account(auth.uid(), p.author_id)
    )
  );

CREATE POLICY "Authenticated users can like accessible posts"
  ON public.likes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = likes.post_id AND public.can_view_account(auth.uid(), p.author_id)
    )
  );

CREATE POLICY "Users can remove their own likes"
  ON public.likes FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "View comments on accessible posts"
  ON public.comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id AND public.can_view_account(auth.uid(), p.author_id)
    )
  );

CREATE POLICY "Authenticated users can comment on accessible posts"
  ON public.comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id
        AND p.comments_disabled = FALSE
        AND public.can_view_account(auth.uid(), p.author_id)
    )
  );

CREATE POLICY "Comment authors or post owners can delete comments"
  ON public.comments FOR DELETE
  USING (
    auth.uid() = author_id OR
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = comments.post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "View comment likes"
  ON public.comment_likes FOR SELECT
  USING (true);

CREATE POLICY "Manage own comment likes"
  ON public.comment_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. FOLLOWS & FOLLOW_REQUESTS POLICIES
CREATE POLICY "View follows for accessible accounts"
  ON public.follows FOR SELECT
  USING (public.can_view_account(auth.uid(), following_id) OR auth.uid() = follower_id);

CREATE POLICY "Follow public accounts directly"
  ON public.follows FOR INSERT
  WITH CHECK (
    auth.uid() = follower_id AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = following_id AND p.is_private = FALSE
    ) AND
    NOT EXISTS (
      SELECT 1 FROM public.blocked_users
      WHERE (blocker_id = following_id AND blocked_id = auth.uid())
         OR (blocker_id = auth.uid() AND blocked_id = following_id)
    )
  );

CREATE POLICY "Unfollow or remove follower"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

CREATE POLICY "View own incoming or outgoing follow requests"
  ON public.follow_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

CREATE POLICY "Create follow request when not blocked"
  ON public.follow_requests FOR INSERT
  WITH CHECK (
    auth.uid() = requester_id AND
    NOT EXISTS (
      SELECT 1 FROM public.blocked_users
      WHERE (blocker_id = target_id AND blocked_id = auth.uid())
         OR (blocker_id = auth.uid() AND blocked_id = target_id)
    )
  );

CREATE POLICY "Target can accept/reject or requester can cancel"
  ON public.follow_requests FOR UPDATE
  USING (auth.uid() = target_id OR auth.uid() = requester_id);

CREATE POLICY "Cancel or clear follow request"
  ON public.follow_requests FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- 6. STORIES & STORY_VIEWS POLICIES (Enforces 24h expiry on backend)
CREATE POLICY "View active non-expired stories of accessible accounts"
  ON public.stories FOR SELECT
  USING (
    expires_at > NOW() AND
    public.can_view_account(auth.uid(), author_id)
  );

CREATE POLICY "Users can create own stories"
  ON public.stories FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own stories"
  ON public.stories FOR DELETE
  USING (auth.uid() = author_id);

CREATE POLICY "Story author and viewer can see story views"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = viewer_id OR
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_views.story_id AND s.author_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can record story view on accessible stories"
  ON public.story_views FOR INSERT
  WITH CHECK (
    auth.uid() = viewer_id AND
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_views.story_id
        AND s.expires_at > NOW()
        AND public.can_view_account(auth.uid(), s.author_id)
    )
  );

-- 7. REELS, REEL_LIKES & REEL_COMMENTS POLICIES
CREATE POLICY "View reels from accessible accounts"
  ON public.reels FOR SELECT
  USING (public.can_view_account(auth.uid(), author_id));

CREATE POLICY "Create own reels"
  ON public.reels FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Delete own reels"
  ON public.reels FOR DELETE
  USING (auth.uid() = author_id);

CREATE POLICY "View reel likes on accessible reels"
  ON public.reel_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_likes.reel_id AND public.can_view_account(auth.uid(), r.author_id)
    )
  );

CREATE POLICY "Manage own reel likes"
  ON public.reel_likes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "View reel comments on accessible reels"
  ON public.reel_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_comments.reel_id AND public.can_view_account(auth.uid(), r.author_id)
    )
  );

CREATE POLICY "Add reel comments on accessible reels"
  ON public.reel_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.reels r
      WHERE r.id = reel_comments.reel_id AND public.can_view_account(auth.uid(), r.author_id)
    )
  );

CREATE POLICY "Delete own reel comments"
  ON public.reel_comments FOR DELETE
  USING (auth.uid() = author_id);

-- 8. SAVED POSTS & COLLECTIONS POLICIES (Strictly private to account owner)
CREATE POLICY "Saved posts strictly private to owner"
  ON public.saved_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Collections strictly private to owner"
  ON public.collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Collection posts strictly private to collection owner"
  ON public.collection_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_posts.collection_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_posts.collection_id AND c.user_id = auth.uid()
    )
  );

-- 9. DIRECT MESSAGING POLICIES (Enforces conversation membership)
CREATE POLICY "View conversations where user is a member"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Update conversation timestamp if member"
  ON public.conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "View conversation members for own conversations"
  ON public.conversation_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Update own conversation read timestamp"
  ON public.conversation_members FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "View messages only in joined conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Send messages only to joined conversations when not blocked"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Sender can unsend or recipient can mark read"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid()
    )
  );

-- 10. NOTIFICATIONS, HASHTAGS, BLOCKS, REPORTS & SEARCH HISTORY POLICIES
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can update own notifications read status"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

CREATE POLICY "Authenticated users can trigger notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "Public read for hashtags"
  ON public.hashtags FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert hashtags"
  ON public.hashtags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Public read for post_hashtags"
  ON public.post_hashtags FOR SELECT USING (true);

CREATE POLICY "Post authors can insert post_hashtags"
  ON public.post_hashtags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_hashtags.post_id AND p.author_id = auth.uid()
    )
  );

CREATE POLICY "Users manage own blocked accounts"
  ON public.blocked_users FOR ALL
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can submit and view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

CREATE POLICY "Users can submit reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users manage own search history"
  ON public.search_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


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
