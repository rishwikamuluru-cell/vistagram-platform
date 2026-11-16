import { createClient } from '@/lib/supabase/client';
import { sendMessageSchema } from '@/lib/validations/schemas';
import { storageService, formatSupabaseError } from './storageService';
import type {
  Profile,
  Story,
  StoryOverlayMeta,
  Reel,
  Conversation,
  Message,
  NotificationItem,
} from '@/types/database';

export const messageAndStoryService = {
  // ============================================================================
  // STORIES SYSTEM (Part 8: 24h Expiry, Story Studio Overlays, Instants, Reactions, Viewers)
  // ============================================================================

  async fetchActiveStories(): Promise<Story[]> {
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('stories')
      .select(
        `
        *,
        author:profiles!stories_author_id_fkey(*),
        views:story_views(viewer_id, viewed_at, viewer:profiles!story_views_viewer_id_fkey(*))
      `
      )
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });

    if (error) throw formatSupabaseError(error, 'Loading active stories failed');
    type RawStoryRow = Story & {
      views?: Array<{ viewer_id: string; viewed_at: string; viewer?: Profile | null }>;
    };
    const rawStories = (data || []) as unknown as RawStoryRow[];
    if (rawStories.length === 0) return [];

    const paths = rawStories
      .map((s) => s.storage_path)
      .filter((p): p is string => Boolean(p));
    const signedMap = await storageService.resolveSignedUrls('stories', paths);

    return rawStories.map((s) => ({
      ...s,
      media_url:
        s.storage_path && signedMap[s.storage_path]
          ? signedMap[s.storage_path]
          : s.media_url,
      viewer_ids: (s.views || []).map((v) => v.viewer_id),
      viewers: (s.views || [])
        .map((v) => v.viewer)
        .filter((p): p is Profile => Boolean(p)),
    }));
  },

  async uploadStory(
    userId: string,
    file: File,
    caption = '',
    audience: 'everyone' | 'close_friends' = 'everyone',
    overlay?: StoryOverlayMeta
  ): Promise<Story> {
    const uploaded = await storageService.uploadPrivateMedia('stories', userId, file);
    const supabase = createClient();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: primaryStory, error: primaryErr } = await supabase
      .from('stories')
      .insert({
        author_id: userId,
        storage_bucket: 'stories',
        storage_path: uploaded.storagePath,
        media_url: uploaded.signedUrl,
        media_type: uploaded.mediaType,
        caption: caption.slice(0, 250),
        audience,
        overlay_json: overlay || {},
        duration_seconds: uploaded.mediaType === 'video' ? 15 : 5,
        expires_at: expiresAt,
      })
      .select('*, author:profiles!stories_author_id_fkey(*)')
      .single();

    if (primaryErr) {
      const { data: fallbackStory, error: fallbackErr } = await supabase
        .from('stories')
        .insert({
          author_id: userId,
          media_url: uploaded.signedUrl,
          media_type: uploaded.mediaType,
          caption: caption.slice(0, 250),
          duration_seconds: uploaded.mediaType === 'video' ? 15 : 5,
          expires_at: expiresAt,
        })
        .select('*, author:profiles!stories_author_id_fkey(*)')
        .single();

      if (fallbackErr || !fallbackStory) {
        throw formatSupabaseError(primaryErr, 'Publishing story to PostgreSQL failed');
      }
      return {
        ...(fallbackStory as unknown as Story),
        media_url: uploaded.signedUrl,
        viewer_ids: [userId],
        viewers: [],
      };
    }

    return {
      ...(primaryStory as unknown as Story),
      media_url: uploaded.signedUrl,
      viewer_ids: [userId],
      viewers: [],
    };
  },

  async deleteStory(storyId: string, authorId: string, storagePath?: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('stories')
      .delete()
      .match({ id: storyId, author_id: authorId });
    if (error) throw formatSupabaseError(error, 'Deleting story failed');
    if (storagePath) {
      await supabase.storage.from('stories').remove([storagePath]);
    }
  },

  async recordStoryView(storyId: string, viewerId: string) {
    const supabase = createClient();
    await supabase
      .from('story_views')
      .upsert({ story_id: storyId, viewer_id: viewerId }, { onConflict: 'story_id,viewer_id' });
  },

  async reactToStory(
    storyId: string,
    storyAuthorId: string,
    viewerId: string,
    emoji: string
  ) {
    const supabase = createClient();
    try {
      await supabase
        .from('story_reactions')
        .upsert(
          { story_id: storyId, user_id: viewerId, emoji },
          { onConflict: 'story_id,user_id' }
        );
    } catch {
      // fallback if story_reactions table not yet created
    }
    if (storyAuthorId !== viewerId) {
      await supabase.from('notifications').insert({
        recipient_id: storyAuthorId,
        actor_id: viewerId,
        type: 'story_view',
        story_id: storyId,
      });
    }
  },

  // ============================================================================
  // REELS SYSTEM (Part 9: Vertical Video, Views & Watch-Time Tracking)
  // ============================================================================

  async fetchReels(viewerId: string): Promise<Reel[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('reels')
      .select(
        `
        *,
        author:profiles!reels_author_id_fkey(*),
        comments:reel_comments(*, author:profiles!reel_comments_author_id_fkey(*))
      `
      )
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) {
      const { data: simpleData } = await supabase
        .from('reels')
        .select('*, author:profiles!reels_author_id_fkey(*)')
        .order('created_at', { ascending: false })
        .limit(25);
      return ((simpleData || []) as unknown as Reel[]).map((r) => ({
        ...r,
        is_liked: false,
        comments: [],
      }));
    }

    const rawReels = (data || []) as unknown as Reel[];
    if (rawReels.length === 0) return [];

    const paths = rawReels
      .map((r) => r.storage_path)
      .filter((p): p is string => Boolean(p));
    const signedMap = await storageService.resolveSignedUrls('reels', paths);

    const reelIds = rawReels.map((r) => r.id);
    const { data: likedRows } = await supabase
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', viewerId)
      .in('reel_id', reelIds);
    const likedSet = new Set((likedRows || []).map((r: { reel_id: string }) => r.reel_id));

    return rawReels.map((r) => ({
      ...r,
      video_url:
        r.storage_path && signedMap[r.storage_path]
          ? signedMap[r.storage_path]
          : r.video_url,
      is_liked: likedSet.has(r.id),
    }));
  },

  async uploadReel(
    userId: string,
    file: File,
    caption: string,
    audioTrack = 'Original Audio'
  ): Promise<Reel> {
    const uploaded = await storageService.uploadPrivateMedia('reels', userId, file);
    const supabase = createClient();

    const { data: primaryReel, error: primaryErr } = await supabase
      .from('reels')
      .insert({
        author_id: userId,
        storage_bucket: 'reels',
        storage_path: uploaded.storagePath,
        video_url: uploaded.signedUrl,
        caption,
        audio_track_name: audioTrack,
      })
      .select('*, author:profiles!reels_author_id_fkey(*)')
      .single();

    if (primaryErr) {
      const { data: fallbackReel, error: fallbackErr } = await supabase
        .from('reels')
        .insert({
          author_id: userId,
          video_url: uploaded.signedUrl,
          caption,
          audio_track_name: audioTrack,
        })
        .select('*, author:profiles!reels_author_id_fkey(*)')
        .single();
      if (fallbackErr || !fallbackReel) {
        throw formatSupabaseError(primaryErr, 'Publishing Reel failed');
      }
      return {
        ...(fallbackReel as unknown as Reel),
        video_url: uploaded.signedUrl,
        is_liked: false,
        comments: [],
      };
    }

    return {
      ...(primaryReel as unknown as Reel),
      video_url: uploaded.signedUrl,
      is_liked: false,
      comments: [],
    };
  },

  async toggleReelLike(reelId: string, userId: string, isLiked: boolean) {
    const supabase = createClient();
    if (isLiked) {
      await supabase.from('reel_likes').delete().match({ reel_id: reelId, user_id: userId });
      return { liked: false };
    } else {
      await supabase.from('reel_likes').insert({ reel_id: reelId, user_id: userId });
      return { liked: true };
    }
  },

  async addReelComment(reelId: string, authorId: string, content: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('reel_comments')
      .insert({ reel_id: reelId, author_id: authorId, content: content.trim() })
      .select('*, author:profiles!reel_comments_author_id_fkey(*)')
      .single();
    if (error) throw formatSupabaseError(error, 'Commenting on Reel failed');
    return data;
  },

  // ============================================================================
  // DIRECT & GROUP MESSAGING SYSTEM (Part 11: Voice Notes, Edit, Replies, Reactions)
  // ============================================================================

  async getOrCreateDirectConversation(currentUserId: string, peerUserId: string): Promise<string> {
    if (currentUserId === peerUserId) {
      throw new Error('You cannot start a direct message conversation with yourself.');
    }
    const supabase = createClient();

    const { data: rpcConvId, error: rpcErr } = await supabase.rpc(
      'get_or_create_direct_conversation',
      { peer_uuid: peerUserId }
    );
    if (!rpcErr && rpcConvId) {
      return rpcConvId as string;
    }

    const { data: myMems } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', currentUserId);
    const myConvIds = (myMems || []).map((m: { conversation_id: string }) => m.conversation_id);

    if (myConvIds.length > 0) {
      const { data: peerMems } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', peerUserId)
        .in('conversation_id', myConvIds);

      if (peerMems && peerMems.length > 0) {
        return (peerMems[0] as { conversation_id: string }).conversation_id;
      }
    }

    const { data: createdConv, error: createConvErr } = await supabase
      .from('conversations')
      .insert({ is_group: false })
      .select('id')
      .single();

    if (createConvErr || !createdConv) {
      throw formatSupabaseError(
        createConvErr || rpcErr,
        'Starting conversation failed. Please run 004_vistagram_v2_schema_repair.sql in Supabase SQL Editor'
      );
    }

    const { error: memInsertErr } = await supabase.from('conversation_members').insert([
      { conversation_id: createdConv.id, user_id: currentUserId },
      { conversation_id: createdConv.id, user_id: peerUserId },
    ]);

    if (memInsertErr) {
      throw formatSupabaseError(memInsertErr, 'Adding conversation members failed');
    }

    return createdConv.id as string;
  },

  async createGroupConversation(
    currentUserId: string,
    title: string,
    memberIds: string[]
  ): Promise<string> {
    const supabase = createClient();
    const { data: rpcId, error: rpcErr } = await supabase.rpc('create_group_conversation', {
      group_title: title.trim() || 'Group Chat',
      member_uuids: memberIds,
    });
    if (!rpcErr && rpcId) return rpcId as string;

    const { data: createdConv, error: convErr } = await supabase
      .from('conversations')
      .insert({ is_group: true, title: title.trim() || 'Group Chat' })
      .select('id')
      .single();
    if (convErr || !createdConv) {
      throw formatSupabaseError(convErr || rpcErr, 'Creating group conversation failed');
    }

    const uniqueIds = Array.from(new Set([currentUserId, ...memberIds]));
    await supabase.from('conversation_members').insert(
      uniqueIds.map((uid) => ({ conversation_id: createdConv.id, user_id: uid }))
    );

    return createdConv.id as string;
  },

  async fetchConversations(userId: string): Promise<Conversation[]> {
    const supabase = createClient();
    const { data: myMemberships, error: memErr } = await supabase
      .from('conversation_members')
      .select('conversation_id, is_pinned, is_muted')
      .eq('user_id', userId);

    if (memErr) {
      const { data: basicMems, error: basicErr } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (basicErr || !basicMems || basicMems.length === 0) return [];
      const convIds = basicMems.map((m: { conversation_id: string }) => m.conversation_id);
      return this._hydrateConversations(userId, convIds, {});
    }

    if (!myMemberships || myMemberships.length === 0) return [];
    const metaByConv: Record<string, { is_pinned?: boolean; is_muted?: boolean }> = {};
    const convIds: string[] = [];
    for (const m of myMemberships as Array<{
      conversation_id: string;
      is_pinned?: boolean;
      is_muted?: boolean;
    }>) {
      convIds.push(m.conversation_id);
      metaByConv[m.conversation_id] = { is_pinned: m.is_pinned, is_muted: m.is_muted };
    }
    return this._hydrateConversations(userId, convIds, metaByConv);
  },

  async _hydrateConversations(
    userId: string,
    convIds: string[],
    metaByConv: Record<string, { is_pinned?: boolean; is_muted?: boolean }>
  ): Promise<Conversation[]> {
    const supabase = createClient();
    const [{ data: convs }, { data: allMembers }, { data: recentMsgs }] = await Promise.all([
      supabase
        .from('conversations')
        .select('*')
        .in('id', convIds)
        .order('last_message_at', { ascending: false }),
      supabase
        .from('conversation_members')
        .select('conversation_id, user_id, profile:profiles!conversation_members_user_id_fkey(*)')
        .in('conversation_id', convIds),
      supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ]);

    interface RawMemberRow {
      conversation_id: string;
      user_id: string;
      profile?: Profile | Profile[] | null;
    }
    const memberRows = (allMembers || []) as unknown as RawMemberRow[];

    const hydrated = (convs || []).map(
      (c: { id: string; is_group: boolean; title: string; last_message_at: string }) => {
        const convMembers = memberRows.filter(
          (m) => m.conversation_id === c.id && m.user_id !== userId
        );
        const participants: Profile[] = convMembers
          .map((m) => (Array.isArray(m.profile) ? m.profile[0] || null : m.profile || null))
          .filter((p): p is Profile => Boolean(p));

        const resolvedPeer = participants[0] || undefined;

        const convMsgs = ((recentMsgs || []) as Message[]).filter(
          (m) => m.conversation_id === c.id
        );
        const unreadCount = convMsgs.filter(
          (m) => m.sender_id !== userId && !m.is_read && !m.is_unsent
        ).length;

        return {
          id: c.id,
          is_group: c.is_group,
          title:
            c.is_group && c.title
              ? c.title
              : resolvedPeer?.display_name || resolvedPeer?.username || 'Direct Chat',
          last_message_at: c.last_message_at,
          peer: resolvedPeer,
          participants,
          is_pinned: Boolean(metaByConv[c.id]?.is_pinned),
          is_muted: Boolean(metaByConv[c.id]?.is_muted),
          unread_count: unreadCount,
          last_message: convMsgs[0] || null,
        };
      }
    );

    return hydrated.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  },

  async toggleConversationFlag(
    conversationId: string,
    userId: string,
    field: 'is_pinned' | 'is_muted',
    value: boolean
  ) {
    const supabase = createClient();
    await supabase
      .from('conversation_members')
      .update({ [field]: value })
      .match({ conversation_id: conversationId, user_id: userId });
  },

  async fetchMessages(conversationId: string, viewerId: string): Promise<Message[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw formatSupabaseError(error, 'Loading conversation messages failed');
    const messages = (data || []) as Message[];

    const unreadIds = messages
      .filter((m) => m.sender_id !== viewerId && !m.is_read)
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
    }

    const paths = messages
      .map((m) => m.storage_path)
      .filter((p): p is string => Boolean(p));
    const signedMap = await storageService.resolveSignedUrls('dm-attachments', paths);

    return messages.map((m) => ({
      ...m,
      attachment_url:
        m.storage_path && signedMap[m.storage_path]
          ? signedMap[m.storage_path]
          : m.attachment_url,
    }));
  },

  async sendMessage(
    senderId: string,
    recipientId: string | undefined,
    input: {
      conversationId: string;
      content: string;
      attachmentFile?: File | null;
      replyToId?: string | null;
      voiceDurationSeconds?: number;
    }
  ): Promise<Message> {
    const supabase = createClient();
    let storagePath = '';
    let attachmentUrl = '';
    let attachmentType: '' | 'image' | 'video' | 'voice' = '';

    if (input.attachmentFile) {
      const uploaded = await storageService.uploadPrivateMedia(
        'dm-attachments',
        `${input.conversationId}/${senderId}`,
        input.attachmentFile
      );
      storagePath = uploaded.storagePath;
      attachmentUrl = uploaded.signedUrl;
      if (input.attachmentFile.type.startsWith('audio/')) {
        attachmentType = 'voice';
      } else if (input.attachmentFile.type.startsWith('video/')) {
        attachmentType = 'video';
      } else {
        attachmentType = 'image';
      }
    }

    const parsed = sendMessageSchema.parse({
      conversationId: input.conversationId,
      content: input.content,
      attachmentUrl,
      attachmentType,
    });

    const { data: primaryMsg, error: primaryErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: parsed.conversationId,
        sender_id: senderId,
        content: parsed.content,
        storage_path: storagePath,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        voice_duration_seconds: input.voiceDurationSeconds || 0,
        reply_to_id: input.replyToId || null,
      })
      .select('*')
      .single();

    let insertedMsg: Message;
    if (primaryErr) {
      const { data: fallbackMsg, error: fallbackErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: parsed.conversationId,
          sender_id: senderId,
          content: parsed.content,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType === 'voice' || attachmentType === 'video' ? 'image' : attachmentType,
        })
        .select('*')
        .single();

      if (fallbackErr || !fallbackMsg) {
        throw formatSupabaseError(primaryErr, 'Sending message failed');
      }
      insertedMsg = fallbackMsg as Message;
    } else {
      insertedMsg = primaryMsg as Message;
    }

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', parsed.conversationId);

    if (recipientId && recipientId !== senderId) {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: senderId,
        type: 'message',
        conversation_id: parsed.conversationId,
      });
    }

    return insertedMsg;
  },

  async editMessage(messageId: string, senderId: string, newContent: string): Promise<Message> {
    const clean = newContent.trim().slice(0, 2000);
    if (!clean) throw new Error('Edited message cannot be empty');
    const supabase = createClient();
    const { data, error } = await supabase
      .from('messages')
      .update({
        content: clean,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .match({ id: messageId, sender_id: senderId })
      .select('*')
      .single();

    if (error) {
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('messages')
        .update({ content: clean })
        .match({ id: messageId, sender_id: senderId })
        .select('*')
        .single();
      if (fallbackErr || !fallbackData) {
        throw formatSupabaseError(error, 'Editing message failed');
      }
      return { ...(fallbackData as Message), is_edited: true };
    }
    return data as Message;
  },

  async reactToMessage(
    messageId: string,
    userId: string,
    emoji: string,
    currentReactions: Record<string, string[]> = {}
  ) {
    const supabase = createClient();
    const next = { ...currentReactions };
    const list = new Set(next[emoji] || []);
    if (list.has(userId)) list.delete(userId);
    else list.add(userId);
    next[emoji] = Array.from(list);

    await supabase.from('messages').update({ reactions: next }).eq('id', messageId);
    return next;
  },

  async unsendMessage(messageId: string, senderId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('messages')
      .update({ content: '', attachment_url: '', is_unsent: true })
      .match({ id: messageId, sender_id: senderId });
    if (error) throw formatSupabaseError(error, 'Unsending message failed');
  },

  subscribeToConversationMessages(
    conversationId: string,
    onMessageEvent: (msg: Message, eventType: 'INSERT' | 'UPDATE') => void
  ) {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            onMessageEvent(payload.new as Message, payload.eventType);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToUserNotifications(
    userId: string,
    onNewNotification: (notif: NotificationItem) => void
  ) {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const raw = payload.new as NotificationItem;
          const { data: actor } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', raw.actor_id)
            .maybeSingle();
          onNewNotification({ ...raw, actor: (actor as Profile | null) || undefined });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
