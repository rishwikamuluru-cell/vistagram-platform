import { createClient } from '@/lib/supabase/client';
import { reportSchema, updateProfileSchema } from '@/lib/validations/schemas';
import { storageService, formatSupabaseError } from './storageService';
import type {
  Profile,
  Post,
  FollowRequestRecord,
  NotificationItem,
  UserSettings,
  UserNote,
  StoryHighlight,
  Community,
  BroadcastChannel,
  SearchResultsBundle,
} from '@/types/database';

export function getDefaultUserSettings(userId: string): UserSettings {
  return {
    user_id: userId,
    theme: 'system',
    accent_color: '#0095F6',
    ui_density: 'comfortable',
    feed_preference: 'chronological',
    autoplay_videos: true,
    read_receipts_enabled: true,
    chat_theme: 'classic',
    message_privacy: 'everyone',
    reduced_motion: false,
    text_scale: 'normal',
    allow_comments: 'everyone',
    allow_mentions: 'everyone',
    show_activity_status: true,
    notify_likes: true,
    notify_comments: true,
    notify_follows: true,
    notify_messages: true,
    restricted_user_ids: [],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Safely normalizes and escapes a user search term so literal dots, underscores,
 * @ prefixes, # prefixes, and special characters never break PostgREST or SQL queries.
 */
export function sanitizeSearchQuery(rawQuery: string): {
  raw: string;
  clean: string;
  isHashtagQuery: boolean;
  isUsernameQuery: boolean;
  escapedLike: string;
} {
  const raw = (rawQuery || '').trim().slice(0, 100);
  const isHashtagQuery = raw.startsWith('#');
  const isUsernameQuery = raw.startsWith('@');
  const clean = raw.replace(/^[@#]+/, '').trim();
  const escapedLike = clean
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');

  return { raw, clean, isHashtagQuery, isUsernameQuery, escapedLike };
}

/**
 * Ranks discovered profiles by relevance:
 * 0 = exact username match
 * 1 = prefix username match
 * 2 = exact display name match
 * 3 = prefix display name match
 * 4 = partial username match
 * 5 = partial display name / bio match
 */
export function rankSearchedProfiles(profiles: Profile[], cleanQuery: string): Profile[] {
  const q = cleanQuery.toLowerCase();
  if (!q) return profiles;

  const scoreProfile = (p: Profile): number => {
    const uname = (p.username || '').toLowerCase();
    const dname = (p.display_name || '').toLowerCase();
    if (uname === q) return 0;
    if (uname.startsWith(q)) return 1;
    if (dname === q) return 2;
    if (dname.startsWith(q)) return 3;
    if (uname.includes(q)) return 4;
    return 5;
  };

  return [...profiles].sort((a, b) => {
    const diff = scoreProfile(a) - scoreProfile(b);
    if (diff !== 0) return diff;
    return (b.followers_count || 0) - (a.followers_count || 0);
  });
}

export const socialService = {
  async getProfileById(profileId: string): Promise<Profile | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();
    if (error) throw formatSupabaseError(error, 'Loading profile failed');
    return data as Profile | null;
  },

  async getSuggestedProfiles(viewerId: string, limit = 18): Promise<Profile[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', viewerId)
      .order('followers_count', { ascending: false })
      .limit(limit);
    if (error) throw formatSupabaseError(error, 'Loading suggested profiles failed');
    return (data || []) as Profile[];
  },

  async getRelationshipState(viewerId: string, targetIds: string[]) {
    if (targetIds.length === 0) {
      return {
        followingSet: new Set<string>(),
        requestedSet: new Set<string>(),
        blockedSet: new Set<string>(),
        closeFriendsSet: new Set<string>(),
      };
    }
    const supabase = createClient();
    const [{ data: follows }, { data: requests }, { data: blocks }, { data: closeFriends }] =
      await Promise.all([
        supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', viewerId)
          .in('following_id', targetIds),
        supabase
          .from('follow_requests')
          .select('target_id')
          .eq('requester_id', viewerId)
          .eq('status', 'pending')
          .in('target_id', targetIds),
        supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', viewerId),
        supabase
          .from('close_friends')
          .select('friend_id')
          .eq('owner_id', viewerId),
      ]);

    return {
      followingSet: new Set((follows || []).map((f: { following_id: string }) => f.following_id)),
      requestedSet: new Set((requests || []).map((r: { target_id: string }) => r.target_id)),
      blockedSet: new Set((blocks || []).map((b: { blocked_id: string }) => b.blocked_id)),
      closeFriendsSet: new Set((closeFriends || []).map((c: { friend_id: string }) => c.friend_id)),
    };
  },

  async getIncomingFollowRequests(userId: string): Promise<FollowRequestRecord[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('follow_requests')
      .select('*, requester:profiles!follow_requests_requester_id_fkey(*)')
      .eq('target_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw formatSupabaseError(error, 'Loading follow requests failed');
    return (data || []) as unknown as FollowRequestRecord[];
  },

  async followOrRequestUser(followerId: string, targetId: string, isTargetPrivate: boolean) {
    const supabase = createClient();
    if (followerId === targetId) throw new Error('You cannot follow yourself');

    if (isTargetPrivate) {
      const { error } = await supabase.from('follow_requests').upsert(
        {
          requester_id: followerId,
          target_id: targetId,
          status: 'pending',
        },
        { onConflict: 'requester_id,target_id' }
      );
      if (error) throw formatSupabaseError(error, 'Sending follow request failed');

      await supabase.from('notifications').insert({
        recipient_id: targetId,
        actor_id: followerId,
        type: 'follow_request',
      });
      return { status: 'requested' as const };
    } else {
      const { error } = await supabase.from('follows').insert({
        follower_id: followerId,
        following_id: targetId,
      });
      if (error) throw formatSupabaseError(error, 'Following user failed');

      await supabase.from('notifications').insert({
        recipient_id: targetId,
        actor_id: followerId,
        type: 'follow',
      });
      return { status: 'following' as const };
    }
  },

  async unfollowOrCancelRequest(followerId: string, targetId: string) {
    const supabase = createClient();
    await Promise.all([
      supabase.from('follows').delete().match({ follower_id: followerId, following_id: targetId }),
      supabase
        .from('follow_requests')
        .delete()
        .match({ requester_id: followerId, target_id: targetId }),
    ]);
    return { status: 'none' as const };
  },

  async respondToFollowRequest(requestId: string, accept: boolean) {
    const supabase = createClient();
    if (accept) {
      const { error } = await supabase.rpc('accept_follow_request', { request_uuid: requestId });
      if (error) throw formatSupabaseError(error, 'Accepting follow request failed');
    } else {
      const { error } = await supabase.from('follow_requests').delete().eq('id', requestId);
      if (error) throw formatSupabaseError(error, 'Declining follow request failed');
    }
  },

  async getFollowersOrFollowing(
    userId: string,
    mode: 'followers' | 'following'
  ): Promise<Profile[]> {
    const supabase = createClient();
    if (mode === 'followers') {
      const { data, error } = await supabase
        .from('follows')
        .select('follower:profiles!follows_follower_id_fkey(*)')
        .eq('following_id', userId);
      if (error) throw formatSupabaseError(error, 'Loading followers failed');
      const rows = (data || []) as unknown as Array<{ follower: Profile | Profile[] | null }>;
      return rows
        .map((r) => (Array.isArray(r.follower) ? r.follower[0] || null : r.follower))
        .filter((p): p is Profile => Boolean(p));
    } else {
      const { data, error } = await supabase
        .from('follows')
        .select('following:profiles!follows_following_id_fkey(*)')
        .eq('follower_id', userId);
      if (error) throw formatSupabaseError(error, 'Loading following failed');
      const rows = (data || []) as unknown as Array<{ following: Profile | Profile[] | null }>;
      return rows
        .map((r) => (Array.isArray(r.following) ? r.following[0] || null : r.following))
        .filter((p): p is Profile => Boolean(p));
    }
  },

  async removeFollower(ownerId: string, followerId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('follows')
      .delete()
      .match({ follower_id: followerId, following_id: ownerId });
    if (error) throw formatSupabaseError(error, 'Removing follower failed');
  },

  async toggleCloseFriend(ownerId: string, friendId: string, isClose: boolean) {
    const supabase = createClient();
    if (isClose) {
      await supabase
        .from('close_friends')
        .delete()
        .match({ owner_id: ownerId, friend_id: friendId });
      return false;
    } else {
      await supabase
        .from('close_friends')
        .upsert({ owner_id: ownerId, friend_id: friendId }, { onConflict: 'owner_id,friend_id' });
      return true;
    }
  },

  async blockUser(blockerId: string, blockedId: string) {
    const supabase = createClient();
    await Promise.all([
      supabase.from('follows').delete().match({ follower_id: blockerId, following_id: blockedId }),
      supabase.from('follows').delete().match({ follower_id: blockedId, following_id: blockerId }),
      supabase
        .from('follow_requests')
        .delete()
        .match({ requester_id: blockerId, target_id: blockedId }),
      supabase
        .from('follow_requests')
        .delete()
        .match({ requester_id: blockedId, target_id: blockerId }),
    ]);
    const { error } = await supabase
      .from('blocked_users')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id' });
    if (error) throw formatSupabaseError(error, 'Blocking user failed');
  },

  async unblockUser(blockerId: string, blockedId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .match({ blocker_id: blockerId, blocked_id: blockedId });
    if (error) throw formatSupabaseError(error, 'Unblocking user failed');
  },

  async getBlockedProfiles(userId: string): Promise<Profile[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked:profiles!blocked_users_blocked_id_fkey(*)')
      .eq('blocker_id', userId);
    if (error) return [];
    const rows = (data || []) as unknown as Array<{ blocked: Profile | Profile[] | null }>;
    return rows
      .map((r) => (Array.isArray(r.blocked) ? r.blocked[0] || null : r.blocked))
      .filter((p): p is Profile => Boolean(p));
  },

  async updateProfile(
    userId: string,
    input: unknown,
    avatarFile?: File | null
  ): Promise<Profile> {
    const parsed = updateProfileSchema.parse(input);
    const supabase = createClient();

    let avatarFields: Partial<Profile> = {};
    if (avatarFile) {
      const { publicUrl, storagePath } = await storageService.uploadAvatar(userId, avatarFile);
      avatarFields = { avatar_url: publicUrl, avatar_storage_path: storagePath };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...parsed,
        ...avatarFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('profiles')
        .update({
          ...parsed,
          ...(avatarFields.avatar_url ? { avatar_url: avatarFields.avatar_url } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select('*')
        .single();
      if (fallbackErr || !fallbackData) {
        throw formatSupabaseError(error, 'Updating profile failed');
      }
      return fallbackData as Profile;
    }

    return data as Profile;
  },

  async getUserSettings(userId: string): Promise<UserSettings> {
    const defaults = getDefaultUserSettings(userId);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!data) return defaults;
      return { ...defaults, ...(data as Partial<UserSettings>) };
    } catch {
      return defaults;
    }
  },

  async updateUserSettings(
    userId: string,
    patch: Partial<UserSettings>
  ): Promise<UserSettings> {
    const supabase = createClient();
    const current = await this.getUserSettings(userId);
    const merged = { ...current, ...patch, user_id: userId, updated_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          theme: merged.theme,
          allow_comments: merged.allow_comments,
          allow_mentions: merged.allow_mentions,
          show_activity_status: merged.show_activity_status,
          notify_likes: merged.notify_likes,
          notify_comments: merged.notify_comments,
          notify_follows: merged.notify_follows,
          notify_messages: merged.notify_messages,
          updated_at: merged.updated_at,
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .maybeSingle();

    if (error) {
      return merged;
    }
    return { ...merged, ...(data || {}) };
  },

  // ============================================================================
  // INSTAGRAM-INSPIRED NOTES & STORY HIGHLIGHTS
  // ============================================================================

  async fetchActiveNotes(): Promise<UserNote[]> {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('user_notes')
        .select('*, author:profiles!user_notes_author_id_fkey(*)')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []) as unknown as UserNote[];
    } catch {
      return [];
    }
  },

  async publishNote(userId: string, content: string, emoji = '✨'): Promise<UserNote | null> {
    const supabase = createClient();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('user_notes')
      .upsert(
        {
          author_id: userId,
          content: content.trim().slice(0, 60),
          emoji,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'author_id' }
      )
      .select('*, author:profiles!user_notes_author_id_fkey(*)')
      .maybeSingle();
    if (error) throw formatSupabaseError(error, 'Publishing note failed');
    return data as unknown as UserNote | null;
  },

  async fetchUserHighlights(userId: string): Promise<StoryHighlight[]> {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('story_highlights')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      return (data || []) as StoryHighlight[];
    } catch {
      return [];
    }
  },

  async createStoryHighlight(
    userId: string,
    title: string,
    coverUrl: string,
    storyIds: string[]
  ): Promise<StoryHighlight> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('story_highlights')
      .insert({
        user_id: userId,
        title: title.trim().slice(0, 40),
        cover_url: coverUrl,
        story_ids: storyIds,
      })
      .select('*')
      .single();
    if (error) throw formatSupabaseError(error, 'Creating story highlight failed');
    return data as StoryHighlight;
  },

  async deleteStoryHighlight(highlightId: string, userId: string) {
    const supabase = createClient();
    await supabase.from('story_highlights').delete().match({ id: highlightId, user_id: userId });
  },

  // ============================================================================
  // COMPLETE MEMBER SEARCH & DISCOVERY ENGINE (Part 5 — Safe Parameterized RPC + Escaped Fallback)
  // ============================================================================

  /**
   * Searches the full eligible member directory (used by both Global Search and New Message modal).
   * Excludes blocked users bidirectionally, supports @username, partial username, display_name,
   * bio keywords, dots, and underscores, and surfaces database errors cleanly.
   */
  async searchMembersDirectory(
    rawQuery: string,
    viewerId?: string,
    limit = 25
  ): Promise<{ members: Profile[]; error: string | null }> {
    const supabase = createClient();
    const { clean, escapedLike } = sanitizeSearchQuery(rawQuery);

    // 1. Fetch bidirectional blocked user IDs so blocked accounts are never returned
    const blockedIds = new Set<string>();
    if (viewerId) {
      const [{ data: myBlocks }, { data: blockedBy }] = await Promise.all([
        supabase.from('blocked_users').select('blocked_id').eq('blocker_id', viewerId),
        supabase.from('blocked_users').select('blocker_id').eq('blocked_id', viewerId),
      ]);
      for (const b of (myBlocks || []) as Array<{ blocked_id: string }>) blockedIds.add(b.blocked_id);
      for (const b of (blockedBy || []) as Array<{ blocker_id: string }>) blockedIds.add(b.blocker_id);
    }

    // 2. Try parameterized PostgreSQL RPC (`search_directory_members`) from Migration 005 first
    const { data: rpcMembers, error: rpcErr } = await supabase.rpc('search_directory_members', {
      raw_query: clean,
      viewer_uuid: viewerId || null,
      max_results: limit,
    });

    if (!rpcErr && Array.isArray(rpcMembers)) {
      const filtered = (rpcMembers as Profile[]).filter((p) => !blockedIds.has(p.id));
      return {
        members: rankSearchedProfiles(filtered, clean),
        error: null,
      };
    }

    // 3. Safe parameterized fallback (without fragile `.or()` string interpolation!)
    if (!clean) {
      const { data: topProfiles, error: topErr } = await supabase
        .from('profiles')
        .select('*')
        .order('followers_count', { ascending: false })
        .limit(limit);

      if (topErr) {
        return { members: [], error: topErr.message || 'Database error while loading members' };
      }
      const filtered = ((topProfiles || []) as Profile[]).filter((p) => !blockedIds.has(p.id));
      return { members: filtered, error: null };
    }

    const pattern = `%${escapedLike}%`;
    const [unameRes, dnameRes, bioRes] = await Promise.all([
      supabase.from('profiles').select('*').ilike('username', pattern).limit(limit),
      supabase.from('profiles').select('*').ilike('display_name', pattern).limit(limit),
      supabase.from('profiles').select('*').ilike('bio', pattern).limit(limit),
    ]);

    if (unameRes.error && dnameRes.error) {
      return {
        members: [],
        error: unameRes.error.message || 'Failed to search member directory',
      };
    }

    const map = new Map<string, Profile>();
    for (const row of [
      ...((unameRes.data || []) as Profile[]),
      ...((dnameRes.data || []) as Profile[]),
      ...((bioRes.data || []) as Profile[]),
    ]) {
      if (!blockedIds.has(row.id)) {
        map.set(row.id, row);
      }
    }

    return {
      members: rankSearchedProfiles(Array.from(map.values()), clean).slice(0, limit),
      error: null,
    };
  },

  async searchDatabase(rawQuery: string, viewerId?: string): Promise<SearchResultsBundle> {
    const supabase = createClient();
    const { clean, escapedLike } = sanitizeSearchQuery(rawQuery);

    const memberRes = await this.searchMembersDirectory(rawQuery, viewerId, 25);

    if (!clean) {
      const [{ data: topTags, error: tagErr }, { data: comms }, { data: chans }] =
        await Promise.all([
          supabase
            .from('hashtags')
            .select('name, posts_count')
            .order('posts_count', { ascending: false })
            .limit(12),
          supabase
            .from('communities')
            .select('*, owner:profiles!communities_owner_id_fkey(*)')
            .order('members_count', { ascending: false })
            .limit(6),
          supabase
            .from('broadcast_channels')
            .select('*, creator:profiles!broadcast_channels_creator_id_fkey(*)')
            .order('subscribers_count', { ascending: false })
            .limit(6),
        ]);

      return {
        accounts: memberRes.members,
        hashtags: topTags || [],
        posts: [],
        communities: (comms || []) as unknown as Community[],
        channels: (chans || []) as unknown as BroadcastChannel[],
        error: memberRes.error || (tagErr ? tagErr.message : null),
      };
    }

    const pattern = `%${escapedLike}%`;
    const [
      { data: hashtags, error: hashErr },
      { data: matchedPosts },
      { data: matchedCommunities },
      { data: matchedChannels },
    ] = await Promise.all([
      supabase
        .from('hashtags')
        .select('name, posts_count')
        .ilike('name', `%${escapedLike.toLowerCase()}%`)
        .order('posts_count', { ascending: false })
        .limit(15),
      supabase
        .from('posts')
        .select('*, author:profiles!posts_author_id_fkey(*), media:post_media(*)')
        .eq('visibility', 'public')
        .eq('is_archived', false)
        .ilike('caption', pattern)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('communities')
        .select('*, owner:profiles!communities_owner_id_fkey(*)')
        .ilike('name', pattern)
        .limit(8),
      supabase
        .from('broadcast_channels')
        .select('*, creator:profiles!broadcast_channels_creator_id_fkey(*)')
        .ilike('title', pattern)
        .limit(8),
    ]);

    return {
      accounts: memberRes.members,
      hashtags: hashtags || [],
      posts: (matchedPosts || []) as unknown as Post[],
      communities: (matchedCommunities || []) as unknown as Community[],
      channels: (matchedChannels || []) as unknown as BroadcastChannel[],
      error: memberRes.error || (hashErr ? hashErr.message : null),
    };
  },

  async getSearchHistory(userId: string): Promise<string[]> {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('search_history')
        .select('query')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data || []).map((r: { query: string }) => r.query);
    } catch {
      return [];
    }
  },

  async recordSearchQuery(userId: string, query: string) {
    const clean = query.trim();
    if (!clean) return;
    try {
      const supabase = createClient();
      await supabase
        .from('search_history')
        .upsert(
          { user_id: userId, query: clean, created_at: new Date().toISOString() },
          { onConflict: 'user_id,query' }
        );
    } catch {
      // non-blocking
    }
  },

  async clearSearchHistory(userId: string) {
    const supabase = createClient();
    await supabase.from('search_history').delete().eq('user_id', userId);
  },

  async getNotifications(userId: string): Promise<NotificationItem[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:profiles!notifications_actor_id_fkey(*)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw formatSupabaseError(error, 'Loading notifications failed');
    return (data || []) as unknown as NotificationItem[];
  },

  async markNotificationRead(notificationId: string, userId: string) {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .match({ id: notificationId, recipient_id: userId });
  },

  async markAllNotificationsRead(userId: string) {
    const supabase = createClient();
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .match({ recipient_id: userId, is_read: false });
  },

  async submitReport(reporterId: string, input: unknown) {
    const parsed = reportSchema.parse(input);
    const supabase = createClient();
    const { error } = await supabase.from('reports').insert({
      reporter_id: reporterId,
      reported_user_id: parsed.reportedUserId ?? null,
      reported_post_id: parsed.reportedPostId ?? null,
      reason: parsed.reason,
      details: parsed.details,
    });
    if (error) throw formatSupabaseError(error, 'Submitting report failed');
  },
};
