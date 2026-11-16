'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  Lock,
  Hash,
  Heart,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Users,
  Radio,
  RefreshCw,
} from 'lucide-react';
import type { Profile, Post, Community, BroadcastChannel } from '@/types/database';
import { socialService } from '@/services/socialService';
import { Avatar } from '@/components/common/Avatar';

export function SearchModule({
  currentUser,
  followingSet,
  requestedSet,
  onSelectProfile,
  onSelectHashtag,
  onSelectPost,
  onFollowToggle,
  onStartDirectChat,
  onOpenCommunities,
}: {
  currentUser: Profile;
  followingSet: Set<string>;
  requestedSet: Set<string>;
  onSelectProfile: (userId: string) => void;
  onSelectHashtag: (tag: string) => void;
  onSelectPost?: (post: Post) => void;
  onFollowToggle: (target: Profile) => void;
  onStartDirectChat?: (peer: Profile) => void;
  onOpenCommunities?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'people' | 'posts' | 'hashtags' | 'communities' | 'channels'
  >('all');
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [hashtags, setHashtags] = useState<Array<{ name: string; posts_count: number }>>([]);
  const [matchedPosts, setMatchedPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [channels, setChannels] = useState<BroadcastChannel[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    socialService
      .getSearchHistory(currentUser.id)
      .then(setHistory)
      .catch(() => {});
  }, [currentUser.id]);

  // 280ms Debounce to prevent un-debounced keystroke spam
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  const executeSearch = useCallback(
    async (q: string, isCancelled: () => boolean) => {
      setLoading(true);
      setSearchError(null);
      try {
        const res = await socialService.searchDatabase(q, currentUser.id);
        if (isCancelled()) return;
        setAccounts(res.accounts);
        setHashtags(res.hashtags);
        setMatchedPosts(res.posts || []);
        setCommunities(res.communities || []);
        setChannels(res.channels || []);
        if (res.error) {
          setSearchError(res.error);
        }
      } catch (err: unknown) {
        if (!isCancelled()) {
          setSearchError(
            (err instanceof Error ? err.message : undefined) ||
              'Failed to execute PostgreSQL search'
          );
        }
      } finally {
        if (!isCancelled()) {
          setLoading(false);
        }
      }
    },
    [currentUser.id]
  );

  useEffect(() => {
    let cancelled = false;
    executeSearch(debouncedQuery, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, executeSearch]);

  const categories = [
    { id: 'all' as const, label: 'All' },
    { id: 'people' as const, label: `People (${accounts.length})` },
    { id: 'hashtags' as const, label: `Hashtags (${hashtags.length})` },
    { id: 'posts' as const, label: `Posts (${matchedPosts.length})` },
    { id: 'communities' as const, label: `Communities (${communities.length})` },
    { id: 'channels' as const, label: `Channels (${channels.length})` },
  ];

  const showPeople = activeCategory === 'all' || activeCategory === 'people';
  const showHashtags = activeCategory === 'all' || activeCategory === 'hashtags';
  const showPosts = activeCategory === 'all' || activeCategory === 'posts';
  const showCommunities = activeCategory === 'all' || activeCategory === 'communities';
  const showChannels = activeCategory === 'all' || activeCategory === 'channels';

  const hasAnyResult =
    accounts.length > 0 ||
    hashtags.length > 0 ||
    matchedPosts.length > 0 ||
    communities.length > 0 ||
    channels.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
      <div className="mb-4">
        <h2 className="text-xl font-bold tracking-tight">Search & Discovery</h2>
        <p className="text-xs text-zinc-500">
          Find members by @username, display name, bio, #hashtags, public posts, communities, or channels
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search @username, name, bio, #hashtag, or community..."
          aria-label="Search VistaGram members and content"
          className="w-full pl-10 pr-10 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0095F6]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search query"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-5">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition ${
              activeCategory === cat.id
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Explicit Database Error State */}
      {searchError && (
        <div className="mb-5 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Search error: {searchError}</span>
          </div>
          <button
            type="button"
            onClick={() => executeSearch(debouncedQuery, () => false)}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold flex items-center gap-1 shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Recent Searches */}
      {!query.trim() && history.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-bold uppercase text-zinc-400">Recent Searches</h3>
            <button
              type="button"
              onClick={async () => {
                await socialService.clearSearchHistory(currentUser.id);
                setHistory([]);
              }}
              className="text-xs font-semibold text-[#0095F6]"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setQuery(h)}
                className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-2.5 mb-6" aria-live="polite">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 animate-pulse border border-zinc-200/60 dark:border-zinc-800/60"
            />
          ))}
        </div>
      )}

      {/* Empty No-Results State */}
      {!loading && !searchError && debouncedQuery.trim().length > 0 && !hasAnyResult && (
        <div className="p-10 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-center space-y-2 mb-6">
          <Search className="w-8 h-8 text-zinc-400 mx-auto" />
          <p className="text-sm font-bold">No matches found for &ldquo;{debouncedQuery}&rdquo;</p>
          <p className="text-xs text-zinc-500">
            Try searching by partial username (e.g. @arjun), display name, bio keyword, or #hashtag.
          </p>
        </div>
      )}

      {/* 1. Accounts / Members Section */}
      {showPeople && accounts.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase text-zinc-400 mb-3">
            {debouncedQuery.trim() ? 'Matching Members' : 'Suggested & Popular Members'}
          </h3>
          <div className="space-y-2.5">
            {accounts.map((acc) => {
              const isFollow = followingSet.has(acc.id);
              const isReq = requestedSet.has(acc.id);
              return (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                >
                  <button
                    type="button"
                    onClick={() => {
                      socialService.recordSearchQuery(currentUser.id, `@${acc.username}`);
                      onSelectProfile(acc.id);
                    }}
                    className="flex items-center gap-3 text-left min-w-0 flex-1"
                  >
                    <Avatar url={acc.avatar_url} username={acc.username} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold flex items-center gap-1 truncate">
                        <span className="truncate">@{acc.username}</span>
                        {acc.is_verified && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#0095F6] shrink-0" />
                        )}
                        {acc.is_private && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {acc.display_name} · {(acc.followers_count || 0).toLocaleString()} followers
                      </p>
                      {acc.bio && (
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{acc.bio}</p>
                      )}
                    </div>
                  </button>

                  {acc.id !== currentUser.id && (
                    <div className="flex items-center gap-2 shrink-0">
                      {onStartDirectChat && (
                        <button
                          type="button"
                          onClick={() => onStartDirectChat(acc)}
                          className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        >
                          Message
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onFollowToggle(acc)}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                          isFollow || isReq
                            ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                            : 'bg-[#0095F6] hover:bg-[#1877F2] text-white'
                        }`}
                      >
                        {isFollow ? 'Following' : isReq ? 'Requested' : 'Follow'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Hashtags Section */}
      {showHashtags && hashtags.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase text-zinc-400 mb-3">Hashtags</h3>
          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => {
                  socialService.recordSearchQuery(currentUser.id, `#${tag.name}`);
                  onSelectHashtag(tag.name);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-semibold hover:border-[#0095F6] transition"
              >
                <Hash className="w-3.5 h-3.5 text-[#0095F6]" />
                <span>{tag.name}</span>
                <span className="text-[10px] text-zinc-400">({tag.posts_count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Public Posts Matching Query */}
      {showPosts && matchedPosts.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold uppercase text-zinc-400 mb-3">Matching Public Posts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {matchedPosts.map((post) => {
              const firstMedia = post.media?.[0];
              return (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => onSelectPost && onSelectPost(post)}
                  className="text-left rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 group"
                >
                  {firstMedia?.media_url && (
                    <div className="aspect-square bg-zinc-900 overflow-hidden">
                      <img
                        src={firstMedia.media_url}
                        alt={post.caption}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-xs font-bold truncate">@{post.author?.username || 'user'}</p>
                    <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">{post.caption}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Communities & Broadcast Channels */}
      {(showCommunities && communities.length > 0) || (showChannels && channels.length > 0) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showCommunities && communities.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase text-zinc-400 mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                <span>Communities</span>
              </h3>
              <div className="space-y-2">
                {communities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpenCommunities && onOpenCommunities()}
                    className="w-full text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-emerald-500 transition"
                  >
                    <p className="text-xs font-bold">{c.name}</p>
                    <p className="text-[11px] text-zinc-500 line-clamp-1">
                      {c.description || c.category} · {c.members_count} members
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showChannels && channels.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase text-zinc-400 mb-3 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-purple-500" />
                <span>Broadcast Channels</span>
              </h3>
              <div className="space-y-2">
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => onOpenCommunities && onOpenCommunities()}
                    className="w-full text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:border-purple-500 transition"
                  >
                    <p className="text-xs font-bold">{ch.title}</p>
                    <p className="text-[11px] text-zinc-500 line-clamp-1">
                      By @{ch.creator?.username || 'creator'} · {ch.subscribers_count} subscribers
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ExploreModule({
  posts,
  onSelectPost,
  onOpenSearch,
}: {
  posts: Post[];
  onSelectPost: (post: Post) => void;
  onOpenSearch: () => void;
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-16">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold">Explore</h2>
          <p className="text-xs text-zinc-500">Discover trending public photography and videos</p>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          <span>Search Directory</span>
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="p-12 text-center border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-500">
          No public posts uploaded yet. Be the first to create a post!
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
          {posts.map((post) => {
            const firstMedia = post.media?.[0];
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelectPost(post)}
                className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900"
              >
                {firstMedia?.media_type === 'video' ? (
                  <video src={firstMedia.media_url} className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={firstMedia?.media_url}
                    alt={post.caption}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                )}
                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-6 text-white font-bold text-sm">
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-5 h-5 fill-white" />
                    {post.likes_count}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="w-5 h-5 fill-white" />
                    {post.comments_count}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
