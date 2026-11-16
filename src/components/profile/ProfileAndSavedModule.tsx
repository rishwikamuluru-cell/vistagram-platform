'use client';

import React, { useState } from 'react';
import { Lock, Bookmark, FolderPlus, Trash2, X, Play, Plus, Share2 } from 'lucide-react';
import type { Profile, Post, Reel, Collection, StoryHighlight } from '@/types/database';
import { Avatar } from '@/components/common/Avatar';

export function ProfileModule({
  viewedProfile,
  currentUser,
  posts,
  reels,
  highlights,
  isFollowing,
  isRequested,
  isBlocked,
  canViewContent,
  onFollowToggle,
  onStartMessage,
  onBlockToggle,
  onOpenSettings,
  onOpenSaved,
  onSelectPost,
  onOpenFollowList,
  onCreateHighlight,
  onDeleteHighlight,
}: {
  viewedProfile: Profile;
  currentUser: Profile;
  posts: Post[];
  reels: Reel[];
  highlights: StoryHighlight[];
  isFollowing: boolean;
  isRequested: boolean;
  isBlocked: boolean;
  canViewContent: boolean;
  onFollowToggle: (target: Profile) => void;
  onStartMessage: (targetId: string) => void;
  onBlockToggle: (targetId: string) => void;
  onOpenSettings: () => void;
  onOpenSaved: () => void;
  onSelectPost: (post: Post) => void;
  onOpenFollowList: (mode: 'followers' | 'following') => void;
  onCreateHighlight: (title: string) => Promise<void>;
  onDeleteHighlight: (id: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'posts' | 'reels' | 'tagged'>('posts');
  const [newHighlightOpen, setNewHighlightOpen] = useState(false);
  const [highlightTitle, setHighlightTitle] = useState('');

  const profilePosts = posts.filter((p) => p.author_id === viewedProfile.id);
  const profileReels = reels.filter((r) => r.author_id === viewedProfile.id);
  const taggedPosts = posts.filter((p) =>
    (p.tagged_usernames || []).includes(viewedProfile.username)
  );

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 pt-5">
      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-10 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <Avatar url={viewedProfile.avatar_url} username={viewedProfile.username} size="xl" />

        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-1.5 mr-1">
              {viewedProfile.username}
              {viewedProfile.is_private && <Lock className="w-4 h-4 text-amber-500" />}
            </h2>

            {viewedProfile.id === currentUser.id ? (
              <>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={onOpenSaved}
                  className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  Saved
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onFollowToggle(viewedProfile)}
                  className={`px-5 py-1.5 rounded-xl text-xs font-bold ${
                    isFollowing || isRequested
                      ? 'bg-zinc-200 dark:bg-zinc-800'
                      : 'bg-[#0095F6] text-white'
                  }`}
                >
                  {isFollowing ? 'Following' : isRequested ? 'Requested' : 'Follow'}
                </button>
                <button
                  type="button"
                  onClick={() => onStartMessage(viewedProfile.id)}
                  className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold"
                >
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => onBlockToggle(viewedProfile.id)}
                  className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-500 text-xs font-semibold"
                >
                  {isBlocked ? 'Unblock' : 'Block'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(
                  `${window.location.origin}/?profile=${viewedProfile.username}`
                );
              }}
              className="p-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-500"
              title="Copy profile link"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center sm:justify-start gap-6 mb-4 text-sm">
            <span>
              <strong>{Math.max(viewedProfile.posts_count, profilePosts.length)}</strong> posts
            </span>
            <button
              type="button"
              onClick={() => onOpenFollowList('followers')}
              className="hover:underline"
            >
              <strong>{viewedProfile.followers_count}</strong> followers
            </button>
            <button
              type="button"
              onClick={() => onOpenFollowList('following')}
              className="hover:underline"
            >
              <strong>{viewedProfile.following_count}</strong> following
            </button>
          </div>

          <div className="text-xs space-y-1 max-w-md mx-auto sm:mx-0">
            <p className="font-bold text-sm">{viewedProfile.display_name}</p>
            {viewedProfile.bio && (
              <p className="text-zinc-600 dark:text-zinc-300">{viewedProfile.bio}</p>
            )}
            {viewedProfile.website && (
              <a
                href={viewedProfile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#0095F6] font-semibold hover:underline block truncate"
              >
                {viewedProfile.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Story Highlights Row (Part 6 & Part 10) */}
      {canViewContent && (
        <div className="flex items-center gap-5 py-4 overflow-x-auto no-scrollbar border-b border-zinc-200 dark:border-zinc-800">
          {viewedProfile.id === currentUser.id && (
            <button
              type="button"
              onClick={() => setNewHighlightOpen(true)}
              className="flex flex-col items-center gap-1.5 shrink-0"
            >
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:border-[#0095F6] hover:text-[#0095F6] transition">
                <Plus className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-medium">New</span>
            </button>
          )}

          {highlights.map((hl) => (
            <div key={hl.id} className="flex flex-col items-center gap-1.5 shrink-0 group relative">
              <div className="w-16 h-16 rounded-full p-0.5 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center bg-gradient-to-tr from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800">
                <span className="text-sm font-bold">{hl.title.slice(0, 2).toUpperCase()}</span>
              </div>
              <span className="text-[11px] font-medium truncate max-w-[68px]">{hl.title}</span>
              {viewedProfile.id === currentUser.id && (
                <button
                  type="button"
                  onClick={() => onDeleteHighlight(hl.id)}
                  className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 p-1 rounded-full bg-red-500 text-white"
                  title="Delete highlight"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Private Account Lock Screen vs Content Grid */}
      {!canViewContent ? (
        <div className="py-16 text-center">
          <div className="w-16 h-16 rounded-full border-2 border-zinc-400 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-7 h-7 text-zinc-500" />
          </div>
          <h3 className="font-bold text-base">This Account is Private</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
            Follow @{viewedProfile.username} to see their photos, videos, stories, and reels.
            Enforced on the backend by PostgreSQL Row Level Security.
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-8 border-b border-zinc-200 dark:border-zinc-800 mb-5">
            {(['posts', 'reels', 'tagged'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`py-3 text-xs font-bold uppercase tracking-widest border-t-2 -mt-[1px] ${
                  tab === t
                    ? 'border-zinc-900 dark:border-white text-zinc-900 dark:text-white'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'posts' && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
              {profilePosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onSelectPost(post)}
                  className="aspect-square rounded-xl overflow-hidden bg-zinc-900"
                >
                  <img
                    src={post.media?.[0]?.media_url}
                    alt={post.caption}
                    className="w-full h-full object-cover hover:scale-105 transition duration-300"
                  />
                </button>
              ))}
            </div>
          )}

          {tab === 'reels' && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
              {profileReels.map((reel) => (
                <div
                  key={reel.id}
                  className="aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 relative"
                >
                  <video src={reel.video_url} className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-white text-xs font-bold flex items-center gap-1">
                    <Play className="w-3.5 h-3.5 fill-white" /> {reel.views_count}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'tagged' && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
              {taggedPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onSelectPost(post)}
                  className="aspect-square rounded-xl overflow-hidden bg-zinc-900"
                >
                  <img
                    src={post.media?.[0]?.media_url}
                    alt={post.caption}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Story Highlight Modal */}
      {newHighlightOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">New Story Highlight</h3>
              <button type="button" onClick={() => setNewHighlightOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              maxLength={40}
              value={highlightTitle}
              onChange={(e) => setHighlightTitle(e.target.value)}
              placeholder="Highlight title (e.g. Travel, Projects)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
            />
            <button
              type="button"
              disabled={!highlightTitle.trim()}
              onClick={async () => {
                await onCreateHighlight(highlightTitle.trim());
                setHighlightTitle('');
                setNewHighlightOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-[#0095F6] text-white text-xs font-bold disabled:opacity-40"
            >
              Add Highlight
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SavedCollectionsModule({
  collections,
  allPosts,
  onCreateCollection,
  onDeleteCollection,
  onRemoveFromSaved,
  onSelectPost,
}: {
  collections: Collection[];
  allPosts: Post[];
  onCreateCollection: (name: string) => void;
  onDeleteCollection: (id: string) => void;
  onRemoveFromSaved: (post: Post, collectionId?: string) => void;
  onSelectPost: (post: Post) => void;
}) {
  const [activeId, setActiveId] = useState<string>(collections[0]?.id || '');
  const [newName, setNewName] = useState('');

  const activeCol = collections.find((c) => c.id === activeId) || collections[0];
  const savedPosts = allPosts.filter((p) => activeCol?.post_ids.includes(p.id));

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold">Saved Collections</h2>
          <p className="text-xs text-zinc-500">Strictly private to your account via Supabase RLS</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name..."
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (!newName.trim()) return;
              onCreateCollection(newName.trim());
              setNewName('');
            }}
            className="px-3 py-1.5 rounded-lg bg-[#0095F6] text-white text-xs font-semibold flex items-center gap-1"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {collections.map((col) => (
          <div key={col.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveId(col.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                activeCol?.id === col.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {col.name} ({col.post_ids.length})
            </button>
            {col.name !== 'All Saved Posts' && (
              <button
                type="button"
                onClick={() => onDeleteCollection(col.id)}
                className="p-1.5 text-zinc-400 hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {savedPosts.length === 0 ? (
        <div className="p-12 text-center border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Bookmark className="w-10 h-10 mx-auto text-zinc-400 mb-2" />
          <p className="font-bold text-sm">No saved posts in this collection yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {savedPosts.map((post) => (
            <div
              key={post.id}
              className="relative group aspect-square rounded-xl overflow-hidden bg-zinc-900"
            >
              <img
                src={post.media?.[0]?.media_url}
                alt={post.caption}
                onClick={() => onSelectPost(post)}
                className="w-full h-full object-cover cursor-pointer"
              />
              <button
                type="button"
                onClick={() => onRemoveFromSaved(post, activeCol?.id)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white text-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
