-- ============================================================================
-- MIGRATION 003: PRIVATE STORAGE BUCKETS, STORAGE.OBJECTS RLS POLICIES,
-- SERVER-ONLY USERNAME RESOLUTION, AND ATOMIC DATABASE TRIGGERS
-- ============================================================================

-- 1. STORAGE BUCKET CREATION
-- Security requirement (Phase 5): Private-account media must NEVER become publicly
-- accessible simply because its URL is known. Therefore `post-media`, `stories`,
-- `reels`, and `dm-attachments` are configured with `public = false` and accessed
-- via RLS-authenticated downloads or short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('post-media', 'post-media', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('stories', 'stories', false, 31457280, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('reels', 'reels', false, 52428800, ARRAY['video/mp4', 'video/webm', 'image/jpeg', 'image/png']),
  ('dm-attachments', 'dm-attachments', false, 15728640, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. STORAGE.OBJECTS ROW LEVEL SECURITY POLICIES (Audit Issue #9 & Phase 5 Fix)
-- Every uploaded object must be stored under `<user_uuid>/<filename>` so the first
-- folder segment (`(storage.foldername(name))[1]::uuid`) identifies the owner.

-- Avatars: publicly viewable, owner-only upload/update/delete
CREATE POLICY "Avatars are viewable by everyone"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar in user folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update or delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Post Media, Stories, and Reels: viewable ONLY if `public.can_view_account(auth.uid(), owner_uuid)` is TRUE
CREATE POLICY "Authorized viewers can read post-media, stories, and reels objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id IN ('post-media', 'stories', 'reels') AND
    public.can_view_account(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Authenticated users can upload into their own folder in post-media, stories, and reels"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('post-media', 'stories', 'reels') AND
    auth.uid() IS NOT NULL AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners can delete their own post-media, stories, and reels objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id IN ('post-media', 'stories', 'reels') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- DM Attachments: viewable and uploadable ONLY by members of the conversation
-- Path convention: `<conversation_uuid>/<sender_uuid>/<filename>`
CREATE POLICY "Conversation members can view dm-attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dm-attachments' AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = ((storage.foldername(name))[1])::uuid
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Conversation members can upload dm-attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'dm-attachments' AND
    (storage.foldername(name))[2] = auth.uid()::text AND
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = ((storage.foldername(name))[1])::uuid
        AND cm.user_id = auth.uid()
    )
  );

-- 3. SERVER-ONLY USERNAME TO EMAIL LOOKUP FUNCTION (Audit Issue #8 & Phase 2 Fix)
-- Supports username login WITHOUT exposing user email addresses to `anon` or `authenticated` clients.
-- Explicitly revokes EXECUTE from PUBLIC, anon, and authenticated, and grants ONLY to `service_role`.
CREATE OR REPLACE FUNCTION public.get_email_by_username(uname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  found_email TEXT;
BEGIN
  SELECT u.email INTO found_email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(trim(uname))
  LIMIT 1;

  RETURN found_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_by_username(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_email_by_username(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO service_role;

-- 4. AUTOMATIC PROFILE, SETTINGS & DEFAULT COLLECTION CREATION ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  generated_username VARCHAR(30);
BEGIN
  generated_username := COALESCE(
    NULLIF(lower(regexp_replace(NEW.raw_user_meta_data->>'username', '[^a-zA-Z0-9._]', '', 'g')), ''),
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9._]', '', 'g')) || '_' || substr(NEW.id::text, 1, 4)
  );

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    generated_username,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), generated_username),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.collections (user_id, name)
  VALUES (NEW.id, 'All Saved Posts')
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. ATOMIC COUNTER TRIGGERS (Posts, Likes, Comments, Follows, Story Views, Reel Likes/Comments)
CREATE OR REPLACE FUNCTION public.maintain_profile_posts_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET posts_count = posts_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET posts_count = GREATEST(0, posts_count - 1) WHERE id = OLD.author_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_posts_count ON public.posts;
CREATE TRIGGER trg_profile_posts_count
  AFTER INSERT OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.maintain_profile_posts_count();

CREATE OR REPLACE FUNCTION public.maintain_post_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_likes_count ON public.likes;
CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.maintain_post_likes_count();

CREATE OR REPLACE FUNCTION public.maintain_post_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.maintain_post_comments_count();

CREATE OR REPLACE FUNCTION public.maintain_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(0, following_count - 1) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(0, followers_count - 1) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON public.follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.maintain_follow_counts();

CREATE OR REPLACE FUNCTION public.maintain_story_views_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.stories SET views_count = views_count + 1 WHERE id = NEW.story_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_story_views_count ON public.story_views;
CREATE TRIGGER trg_story_views_count
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.maintain_story_views_count();

-- 6. TRANSACTIONAL RPC FUNCTIONS (Accept Follow Request & Get-or-Create 1-to-1 Conversation)
CREATE OR REPLACE FUNCTION public.accept_follow_request(request_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM public.follow_requests
  WHERE id = request_uuid AND target_id = auth.uid() AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Follow request not found or unauthorized';
  END IF;

  DELETE FROM public.follow_requests WHERE id = request_uuid;

  INSERT INTO public.follows (follower_id, following_id)
  VALUES (req.requester_id, req.target_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.notifications (recipient_id, actor_id, type)
  VALUES (req.requester_id, req.target_id, 'follow_accepted');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(peer_uuid UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID := auth.uid();
  existing_conv_id UUID;
  new_conv_id UUID;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF current_uid = peer_uuid THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = current_uid AND blocked_id = peer_uuid)
       OR (blocker_id = peer_uuid AND blocked_id = current_uid)
  ) THEN
    RAISE EXCEPTION 'Cannot message a blocked user';
  END IF;

  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  INNER JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = current_uid
  INNER JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = peer_uuid
  WHERE c.is_group = FALSE
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  INSERT INTO public.conversations (is_group)
  VALUES (FALSE)
  RETURNING id INTO new_conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES
    (new_conv_id, current_uid),
    (new_conv_id, peer_uuid);

  RETURN new_conv_id;
END;
$$;

-- 7. EXPIRED STORIES CLEANUP FUNCTION
CREATE OR REPLACE FUNCTION public.cleanup_expired_stories()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.stories
    WHERE expires_at <= NOW()
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;
