import { createClient } from '@/lib/supabase/client';
import { formatSupabaseError } from './storageService';
import type {
  Community,
  CommunityMessage,
  BroadcastChannel,
  ChannelMessage,
} from '@/types/database';

export const communityService = {
  async fetchCommunities(viewerId: string): Promise<Community[]> {
    try {
      const supabase = createClient();
      const [{ data: comms }, { data: myMems }] = await Promise.all([
        supabase
          .from('communities')
          .select('*, owner:profiles!communities_owner_id_fkey(*)')
          .order('members_count', { ascending: false })
          .limit(30),
        supabase
          .from('community_members')
          .select('community_id')
          .eq('user_id', viewerId)
          .eq('status', 'joined'),
      ]);

      const joinedSet = new Set(
        ((myMems || []) as Array<{ community_id: string }>).map((m) => m.community_id)
      );

      return ((comms || []) as unknown as Community[]).map((c) => ({
        ...c,
        is_member: joinedSet.has(c.id) || c.owner_id === viewerId,
      }));
    } catch {
      return [];
    }
  },

  async createCommunity(
    ownerId: string,
    input: { name: string; description: string; category: string; isPrivate?: boolean }
  ): Promise<Community> {
    const supabase = createClient();
    const cleanName = input.name.trim();
    const slug = `${cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;

    const { data, error } = await supabase
      .from('communities')
      .insert({
        owner_id: ownerId,
        name: cleanName,
        slug,
        description: input.description.trim(),
        category: input.category || 'General',
        is_private: Boolean(input.isPrivate),
        members_count: 1,
      })
      .select('*, owner:profiles!communities_owner_id_fkey(*)')
      .single();

    if (error || !data) {
      throw formatSupabaseError(
        error,
        'Creating community failed. Run 005_vistagram_ultimate_v3.sql in Supabase SQL Editor.'
      );
    }

    await supabase.from('community_members').upsert(
      {
        community_id: data.id,
        user_id: ownerId,
        role: 'owner',
        status: 'joined',
      },
      { onConflict: 'community_id,user_id' }
    );

    return { ...(data as unknown as Community), is_member: true };
  },

  async toggleJoinCommunity(communityId: string, userId: string, currentlyJoined: boolean) {
    const supabase = createClient();
    if (currentlyJoined) {
      await supabase
        .from('community_members')
        .delete()
        .match({ community_id: communityId, user_id: userId });
      return false;
    } else {
      await supabase.from('community_members').upsert(
        {
          community_id: communityId,
          user_id: userId,
          role: 'member',
          status: 'joined',
        },
        { onConflict: 'community_id,user_id' }
      );
      return true;
    }
  },

  async fetchCommunityMessages(
    communityId: string,
    channelName = 'general'
  ): Promise<CommunityMessage[]> {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('community_messages')
        .select('*, sender:profiles!community_messages_sender_id_fkey(*)')
        .eq('community_id', communityId)
        .eq('channel_name', channelName)
        .order('created_at', { ascending: true })
        .limit(80);
      return (data || []) as unknown as CommunityMessage[];
    } catch {
      return [];
    }
  },

  async sendCommunityMessage(
    communityId: string,
    channelName: string,
    senderId: string,
    content: string
  ): Promise<CommunityMessage> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('community_messages')
      .insert({
        community_id: communityId,
        channel_name: channelName,
        sender_id: senderId,
        content: content.trim(),
      })
      .select('*, sender:profiles!community_messages_sender_id_fkey(*)')
      .single();

    if (error || !data) throw formatSupabaseError(error, 'Sending community message failed');
    return data as unknown as CommunityMessage;
  },

  // ============================================================================
  // BROADCAST CHANNELS (1-to-Many Creator Announcement Channels)
  // ============================================================================

  async fetchBroadcastChannels(viewerId: string): Promise<BroadcastChannel[]> {
    try {
      const supabase = createClient();
      const [{ data: chans }, { data: subs }] = await Promise.all([
        supabase
          .from('broadcast_channels')
          .select('*, creator:profiles!broadcast_channels_creator_id_fkey(*)')
          .order('subscribers_count', { ascending: false })
          .limit(30),
        supabase.from('channel_members').select('channel_id').eq('user_id', viewerId),
      ]);

      const subSet = new Set(
        ((subs || []) as Array<{ channel_id: string }>).map((s) => s.channel_id)
      );

      return ((chans || []) as unknown as BroadcastChannel[]).map((ch) => ({
        ...ch,
        is_subscribed: subSet.has(ch.id) || ch.creator_id === viewerId,
      }));
    } catch {
      return [];
    }
  },

  async createBroadcastChannel(
    creatorId: string,
    title: string,
    description: string
  ): Promise<BroadcastChannel> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('broadcast_channels')
      .insert({
        creator_id: creatorId,
        title: title.trim(),
        description: description.trim(),
        subscribers_count: 1,
      })
      .select('*, creator:profiles!broadcast_channels_creator_id_fkey(*)')
      .single();

    if (error || !data) {
      throw formatSupabaseError(error, 'Creating broadcast channel failed');
    }

    await supabase.from('channel_members').upsert(
      { channel_id: data.id, user_id: creatorId },
      { onConflict: 'channel_id,user_id' }
    );

    return { ...(data as unknown as BroadcastChannel), is_subscribed: true };
  },

  async toggleChannelSubscription(channelId: string, userId: string, isSubscribed: boolean) {
    const supabase = createClient();
    if (isSubscribed) {
      await supabase
        .from('channel_members')
        .delete()
        .match({ channel_id: channelId, user_id: userId });
      return false;
    } else {
      await supabase
        .from('channel_members')
        .upsert({ channel_id: channelId, user_id: userId }, { onConflict: 'channel_id,user_id' });
      return true;
    }
  },

  async fetchChannelMessages(channelId: string): Promise<ChannelMessage[]> {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('channel_messages')
        .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(80);
      return (data || []) as unknown as ChannelMessage[];
    } catch {
      return [];
    }
  },

  async postChannelAnnouncement(
    channelId: string,
    creatorId: string,
    content: string
  ): Promise<ChannelMessage> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('channel_messages')
      .insert({
        channel_id: channelId,
        sender_id: creatorId,
        content: content.trim(),
      })
      .select('*, sender:profiles!channel_messages_sender_id_fkey(*)')
      .single();

    if (error || !data) throw formatSupabaseError(error, 'Posting announcement failed');
    return data as unknown as ChannelMessage;
  },
};
