'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  Radio,
  Plus,
  Hash,
  Send,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import type {
  Profile,
  Community,
  CommunityMessage,
  BroadcastChannel,
  ChannelMessage,
} from '@/types/database';
import { communityService } from '@/services/communityService';
import { Avatar, formatRelativeTime } from '@/components/common/Avatar';

export function CommunitiesAndChannelsModule({
  currentUser,
  onSelectProfile,
}: {
  currentUser: Profile;
  onSelectProfile: (userId: string) => void;
}) {
  const [tab, setTab] = useState<'communities' | 'channels'>('communities');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [activeCommunity, setActiveCommunity] = useState<Community | null>(null);
  const [activeChannelName, setActiveChannelName] = useState<'general' | 'announcements' | 'showcase'>('general');
  const [commMessages, setCommMessages] = useState<CommunityMessage[]>([]);
  const [commInput, setCommInput] = useState('');

  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastChannel | null>(null);
  const [broadcastMsgs, setBroadcastMsgs] = useState<ChannelMessage[]>([]);
  const [broadcastInput, setBroadcastInput] = useState('');

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Technology & AI');

  useEffect(() => {
    communityService.fetchCommunities(currentUser.id).then((list) => {
      setCommunities(list);
      if (list.length > 0) setActiveCommunity(list[0]);
    });
    communityService.fetchBroadcastChannels(currentUser.id).then((list) => {
      setChannels(list);
      if (list.length > 0) setActiveBroadcast(list[0]);
    });
  }, [currentUser.id]);

  useEffect(() => {
    if (!activeCommunity) return;
    communityService
      .fetchCommunityMessages(activeCommunity.id, activeChannelName)
      .then(setCommMessages);
  }, [activeCommunity, activeChannelName]);

  useEffect(() => {
    if (!activeBroadcast) return;
    communityService.fetchChannelMessages(activeBroadcast.id).then(setBroadcastMsgs);
  }, [activeBroadcast]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (tab === 'communities') {
      const created = await communityService.createCommunity(currentUser.id, {
        name: newName,
        description: newDesc,
        category: newCategory,
      });
      setCommunities((prev) => [created, ...prev]);
      setActiveCommunity(created);
    } else {
      const created = await communityService.createBroadcastChannel(
        currentUser.id,
        newName,
        newDesc
      );
      setChannels((prev) => [created, ...prev]);
      setActiveBroadcast(created);
    }
    setNewName('');
    setNewDesc('');
    setCreateModalOpen(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 md:pt-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Communities & Broadcast Channels
          </h1>
          <p className="text-xs text-zinc-500">
            Join topic communities with multi-channel chat or subscribe to creator broadcast channels
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('communities')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              tab === 'communities'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Communities ({communities.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('channels')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              tab === 'channels'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Broadcast Channels ({channels.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-[#0095F6] hover:bg-[#1877F2] text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create {tab === 'communities' ? 'Community' : 'Channel'}</span>
          </button>
        </div>
      </div>

      {tab === 'communities' ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden min-h-[68vh]">
          {/* Left Community Directory */}
          <div className="md:col-span-4 border-r border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5 overflow-y-auto">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Discover Communities</h3>
            {communities.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">
                No communities created yet. Click &ldquo;Create Community&rdquo; above to launch the first one!
              </p>
            ) : (
              communities.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveCommunity(c)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    activeCommunity?.id === c.id
                      ? 'border-[#0095F6] bg-[#0095F6]/5'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold flex items-center gap-1">
                      <span>{c.name}</span>
                      {c.is_private && <Lock className="w-3 h-3 text-amber-500" />}
                    </p>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const joined = await communityService.toggleJoinCommunity(
                          c.id,
                          currentUser.id,
                          Boolean(c.is_member)
                        );
                        setCommunities((prev) =>
                          prev.map((item) =>
                            item.id === c.id ? { ...item, is_member: joined } : item
                          )
                        );
                        if (activeCommunity?.id === c.id) {
                          setActiveCommunity((prev) =>
                            prev ? { ...prev, is_member: joined } : prev
                          );
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        c.is_member
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-[#0095F6] text-white'
                      }`}
                    >
                      {c.is_member ? 'Joined' : 'Join'}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{c.description}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {c.category} · {c.members_count} member(s)
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Right Community Discussion Channels */}
          <div className="md:col-span-8 flex flex-col">
            {!activeCommunity ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-zinc-500">
                Select or create a community to view its channels and messages.
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{activeCommunity.name}</h3>
                    <p className="text-[11px] text-zinc-500">{activeCommunity.description}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {(['general', 'announcements', 'showcase'] as const).map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setActiveChannelName(ch)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                          activeChannelName === ch
                            ? 'bg-[#0095F6] text-white'
                            : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'
                        }`}
                      >
                        <Hash className="w-3 h-3" />
                        <span>{ch}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[46vh]">
                  {commMessages.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-10">
                      No messages in #{activeChannelName} yet. Start the discussion!
                    </p>
                  ) : (
                    commMessages.map((m) => (
                      <div key={m.id} className="flex items-start gap-2.5 text-xs">
                        <button
                          type="button"
                          onClick={() => onSelectProfile(m.sender_id)}
                        >
                          <Avatar
                            url={m.sender?.avatar_url}
                            username={m.sender?.username || 'member'}
                            size="sm"
                          />
                        </button>
                        <div className="flex-1 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold">@{m.sender?.username || 'member'}</span>
                            <span className="text-[10px] text-zinc-400">
                              {formatRelativeTime(m.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 text-zinc-700 dark:text-zinc-300">{m.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commInput.trim() || !activeCommunity.is_member) return;
                    const sent = await communityService.sendCommunityMessage(
                      activeCommunity.id,
                      activeChannelName,
                      currentUser.id,
                      commInput
                    );
                    setCommMessages((prev) => [...prev, sent]);
                    setCommInput('');
                  }}
                  className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2"
                >
                  <input
                    type="text"
                    value={commInput}
                    onChange={(e) => setCommInput(e.target.value)}
                    disabled={!activeCommunity.is_member}
                    placeholder={
                      activeCommunity.is_member
                        ? `Message #${activeChannelName}...`
                        : 'Join this community to post messages'
                    }
                    className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!activeCommunity.is_member || !commInput.trim()}
                    className="px-4 py-2 rounded-xl bg-[#0095F6] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        /* BROADCAST CHANNELS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden min-h-[68vh]">
          <div className="md:col-span-4 border-r border-zinc-200 dark:border-zinc-800 p-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Creator Broadcast Channels</h3>
            {channels.length === 0 ? (
              <p className="text-xs text-zinc-500 py-8 text-center">
                No broadcast channels yet. Create one to share updates with your followers!
              </p>
            ) : (
              channels.map((ch) => (
                <div
                  key={ch.id}
                  onClick={() => setActiveBroadcast(ch)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    activeBroadcast?.id === ch.id
                      ? 'border-purple-500 bg-purple-500/5'
                      : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold">{ch.title}</p>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const sub = await communityService.toggleChannelSubscription(
                          ch.id,
                          currentUser.id,
                          Boolean(ch.is_subscribed)
                        );
                        setChannels((prev) =>
                          prev.map((item) =>
                            item.id === ch.id ? { ...item, is_subscribed: sub } : item
                          )
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        ch.is_subscribed
                          ? 'bg-purple-500/15 text-purple-500'
                          : 'bg-purple-600 text-white'
                      }`}
                    >
                      {ch.is_subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">{ch.description}</p>
                </div>
              ))
            )}
          </div>

          <div className="md:col-span-8 flex flex-col">
            {!activeBroadcast ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-zinc-500">
                Select or create a broadcast channel.
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-purple-500" />
                    <span>{activeBroadcast.title}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0095F6]" />
                  </h3>
                  <p className="text-[11px] text-zinc-500">{activeBroadcast.description}</p>
                </div>

                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[46vh]">
                  {broadcastMsgs.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-10">
                      No announcements posted in this channel yet.
                    </p>
                  ) : (
                    broadcastMsgs.map((m) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-2xl bg-purple-500/5 border border-purple-500/20 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-purple-500">
                            @{m.sender?.username || 'creator'}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {formatRelativeTime(m.created_at)}
                          </span>
                        </div>
                        <p className="leading-relaxed">{m.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {activeBroadcast.creator_id === currentUser.id ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!broadcastInput.trim()) return;
                      const created = await communityService.postChannelAnnouncement(
                        activeBroadcast.id,
                        currentUser.id,
                        broadcastInput
                      );
                      setBroadcastMsgs((prev) => [...prev, created]);
                      setBroadcastInput('');
                    }}
                    className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex gap-2"
                  >
                    <input
                      type="text"
                      value={broadcastInput}
                      onChange={(e) => setBroadcastInput(e.target.value)}
                      placeholder="Broadcast an announcement to subscribers..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold"
                    >
                      Broadcast
                    </button>
                  </form>
                ) : (
                  <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 text-center text-[11px] text-zinc-500">
                    Only the channel creator can post announcements in a Broadcast Channel.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* CREATE COMMUNITY / CHANNEL MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4"
          >
            <h3 className="text-sm font-bold">
              Create {tab === 'communities' ? 'Community' : 'Broadcast Channel'}
            </h3>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                tab === 'communities'
                  ? 'Community Name (e.g. NIAT AI Builders)'
                  : 'Channel Title (e.g. Rithwik Dev Updates)'
              }
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
            />
            <textarea
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
            />
            {tab === 'communities' && (
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category (e.g. Technology, Photography, Gaming)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0095F6] text-white text-xs font-bold"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
