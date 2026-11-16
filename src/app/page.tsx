'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Search,
  Compass,
  Clapperboard,
  MessageCircle,
  Heart,
  PlusSquare,
  User,
  Settings,
  Bookmark,
  Users,
  Sun,
  Moon,
  LogOut,
  Sparkles,
  CheckCircle2,
  Hash,
  X,
} from 'lucide-react';
import type {
  Profile,
  Post,
  Comment,
  Story,
  Reel,
  Collection,
  Conversation,
  NotificationItem,
  FollowRequestRecord,
  UserSettings,
  UserNote,
  StoryHighlight,
  CallSession,
} from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { authService } from '@/services/authService';
import { postService } from '@/services/postService';
import { socialService, getDefaultUserSettings } from '@/services/socialService';
import { messageAndStoryService } from '@/services/messageAndStoryService';
import { callService } from '@/services/callService';
import { Avatar } from '@/components/common/Avatar';
import { AuthView } from '@/components/auth/AuthView';
import { StoriesTray, StoryViewerModal, type StoryGroup } from '@/components/stories/StoriesModule';
import { PostCard } from '@/components/posts/PostCard';
import { SearchModule, ExploreModule } from '@/components/search/SearchAndExploreModule';
import { ReelsModule } from '@/components/reels/ReelsModule';
import { MessagingModule } from '@/components/messages/MessagingModule';
import { NotificationsModule } from '@/components/notifications/NotificationsModule';
import { UploadModule } from '@/components/upload/UploadModule';
import { ProfileModule, SavedCollectionsModule } from '@/components/profile/ProfileAndSavedModule';
import { SettingsModule } from '@/components/settings/SettingsModule';
import { CommunitiesAndChannelsModule } from '@/components/communities/CommunitiesAndChannelsModule';
import { IncomingCallBanner, ActiveCallModal } from '@/components/calls/CallModal';

export default function VistaGramPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  const [activeNav, setActiveNav] = useState<
    | 'home'
    | 'search'
    | 'explore'
    | 'reels'
    | 'messages'
    | 'communities'
    | 'notifications'
    | 'create'
    | 'saved'
    | 'profile'
    | 'settings'
  >('home');
  const [uploadInitialTab, setUploadInitialTab] = useState<'post' | 'story' | 'reel'>('post');

  const [feedMode, setFeedMode] = useState<'following' | 'explore'>('following');
  const [fellBackToDiscover, setFellBackToDiscover] = useState(false);
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [stories, setStories] = useState<Story[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FollowRequestRecord[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [requestedSet, setRequestedSet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [closeFriendsSet, setCloseFriendsSet] = useState<Set<string>>(new Set());
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);

  // Voice & Video Calling State
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);

  // Settings is always initialized with a valid default object, never null
  const [settings, setSettings] = useState<UserSettings>(getDefaultUserSettings(''));

  // Modals & Active Selections
  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);
  const [activeStoryAuthorId, setActiveStoryAuthorId] = useState<string | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [followModalState, setFollowModalState] = useState<{
    mode: 'followers' | 'following';
    users: Profile[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => setToast(msg);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('vistagram_theme_preference');
      if (savedTheme === 'dark') setDarkMode(true);
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  const setThemeMode = (mode: 'light' | 'dark' | 'system') => {
    const isDark =
      mode === 'dark' ||
      (mode === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
    try {
      localStorage.setItem('vistagram_theme_preference', isDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };

  const loadAuthenticatedApplicationData = useCallback(async () => {
    setAuthLoading(true);
    try {
      const { profile } = await authService.getCurrentSessionAndProfile();
      setCurrentUser(profile);
      if (!profile) {
        setAuthLoading(false);
        return;
      }

      setSettings((prev) => ({ ...prev, user_id: profile.id }));
      setViewedProfile((prev) => prev || profile);

      const results = await Promise.allSettled([
        postService.getFeedPosts({
          viewerId: profile.id,
          mode: feedMode,
          hashtag: selectedHashtag,
        }),
        messageAndStoryService.fetchActiveStories(),
        messageAndStoryService.fetchReels(profile.id),
        postService.getUserCollections(profile.id),
        messageAndStoryService.fetchConversations(profile.id),
        socialService.getNotifications(profile.id),
        socialService.getIncomingFollowRequests(profile.id),
        socialService.getSuggestedProfiles(profile.id),
        socialService.getUserSettings(profile.id),
        socialService.getBlockedProfiles(profile.id),
        socialService.fetchActiveNotes(),
        socialService.fetchUserHighlights(profile.id),
      ]);

      const feedRes =
        results[0].status === 'fulfilled'
          ? results[0].value
          : { posts: [], fellBackToDiscover: false };
      setPosts(feedRes.posts);
      setFellBackToDiscover(feedRes.fellBackToDiscover);

      if (results[1].status === 'fulfilled') setStories(results[1].value);
      if (results[2].status === 'fulfilled') setReels(results[2].value);
      if (results[3].status === 'fulfilled') setCollections(results[3].value);
      if (results[4].status === 'fulfilled') setConversations(results[4].value);
      if (results[5].status === 'fulfilled') setNotifications(results[5].value);
      if (results[6].status === 'fulfilled') setIncomingRequests(results[6].value);

      const sugList = results[7].status === 'fulfilled' ? results[7].value : [];
      setSuggestedProfiles(sugList);

      if (results[8].status === 'fulfilled') {
        setSettings(results[8].value);
      } else {
        setSettings(getDefaultUserSettings(profile.id));
      }

      if (results[9].status === 'fulfilled') setBlockedProfiles(results[9].value);
      if (results[10].status === 'fulfilled') setNotes(results[10].value);
      if (results[11].status === 'fulfilled') setHighlights(results[11].value);

      const targetIds = Array.from(
        new Set([...sugList.map((s) => s.id), ...feedRes.posts.map((p) => p.author_id)])
      );
      const rel = await socialService.getRelationshipState(profile.id, targetIds);
      setFollowingSet(rel.followingSet);
      setRequestedSet(rel.requestedSet);
      setBlockedSet(rel.blockedSet);
      setCloseFriendsSet(rel.closeFriendsSet);

      const commentMap: Record<string, Comment[]> = {};
      await Promise.allSettled(
        feedRes.posts.slice(0, 8).map(async (p) => {
          commentMap[p.id] = await postService.getPostComments(p.id);
        })
      );
      setCommentsByPost(commentMap);
    } catch (err: unknown) {
      console.error('Error initializing session:', err);
    } finally {
      setAuthLoading(false);
    }
  }, [feedMode, selectedHashtag]);

  useEffect(() => {
    loadAuthenticatedApplicationData();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        loadAuthenticatedApplicationData();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadAuthenticatedApplicationData]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribeNotif = messageAndStoryService.subscribeToUserNotifications(
      currentUser.id,
      (incoming) => {
        setNotifications((prev) =>
          prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]
        );
      }
    );

    const unsubscribeCalls = callService.subscribeToIncomingCalls(
      currentUser.id,
      (callInvite) => {
        setIncomingCall(callInvite);
      },
      (updatedCall) => {
        setActiveCall((prev) => {
          if (!prev || prev.id !== updatedCall.id) return prev;
          if (['ended', 'declined', 'cancelled', 'missed'].includes(updatedCall.status)) {
            return null;
          }
          return updatedCall;
        });
        setIncomingCall((prev) => {
          if (!prev || prev.id !== updatedCall.id) return prev;
          if (updatedCall.status !== 'ringing') return null;
          return updatedCall;
        });
      }
    );

    return () => {
      unsubscribeNotif();
      unsubscribeCalls();
    };
  }, [currentUser]);

  const storyGroups: StoryGroup[] = useMemo(() => {
    if (!currentUser) return [];
    const map = new Map<string, Story[]>();
    for (const s of stories) {
      const list = map.get(s.author_id) || [];
      list.push(s);
      map.set(s.author_id, list);
    }
    return Array.from(map.entries()).map(([, list]) => {
      const author = list[0]?.author || currentUser;
      return {
        author,
        stories: list,
        allViewed: list.every((st) => (st.viewer_ids || []).includes(currentUser.id)),
      };
    });
  }, [stories, currentUser]);

  if (authLoading) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-zinc-500 text-xs">
          Loading VistaGram Ultimate 3.0...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <AuthView onAuthenticated={loadAuthenticatedApplicationData} />
      </div>
    );
  }

  const handleSelectProfile = async (userId: string) => {
    const prof = await socialService.getProfileById(userId);
    if (prof) {
      setViewedProfile(prof);
      const [rel, hl] = await Promise.all([
        socialService.getRelationshipState(currentUser.id, [prof.id]),
        socialService.fetchUserHighlights(prof.id),
      ]);
      setHighlights(hl);
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (rel.followingSet.has(prof.id)) next.add(prof.id);
        return next;
      });
      setActiveNav('profile');
    }
  };

  const handleFollowToggle = async (target: Profile) => {
    const isFollow = followingSet.has(target.id);
    const isReq = requestedSet.has(target.id);

    if (isFollow || isReq) {
      await socialService.unfollowOrCancelRequest(currentUser.id, target.id);
      setFollowingSet((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setRequestedSet((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      showToast(`Unfollowed @${target.username}`);
    } else {
      const res = await socialService.followOrRequestUser(
        currentUser.id,
        target.id,
        target.is_private
      );
      if (res.status === 'following') {
        setFollowingSet((prev) => new Set(prev).add(target.id));
        showToast(`Following @${target.username}`);
      } else {
        setRequestedSet((prev) => new Set(prev).add(target.id));
        showToast(`Follow request sent to @${target.username}`);
      }
    }
    const [refreshedViewer, refreshedTarget] = await Promise.all([
      socialService.getProfileById(currentUser.id),
      socialService.getProfileById(target.id),
    ]);
    if (refreshedViewer) setCurrentUser(refreshedViewer);
    if (viewedProfile?.id === target.id && refreshedTarget) setViewedProfile(refreshedTarget);
  };

  const handleStartDirectChat = async (peerOrId: Profile | string) => {
    const peerId = typeof peerOrId === 'string' ? peerOrId : peerOrId.id;
    try {
      const convId = await messageAndStoryService.getOrCreateDirectConversation(
        currentUser.id,
        peerId
      );
      const updated = await messageAndStoryService.fetchConversations(currentUser.id);
      setConversations(updated);
      setActiveConversationId(convId);
      setActiveNav('messages');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not open conversation');
    }
  };

  const handleStartCall = async (conv: Conversation, callType: 'voice' | 'video') => {
    try {
      const recipientIds =
        conv.participants && conv.participants.length > 0
          ? conv.participants.map((p) => p.id)
          : conv.peer
            ? [conv.peer.id]
            : [];
      const started = await callService.startCall({
        initiatorId: currentUser.id,
        conversationId: conv.id,
        recipientIds,
        callType,
        isGroup: conv.is_group,
      });
      setActiveCall(started);
      showToast(`Starting ${callType} call...`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not start call');
    }
  };

  const unreadNotifCount = notifications.filter((n) => !n.is_read).length;
  const unreadMsgCount = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  const navItems: Array<{
    id: typeof activeNav;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'reels', label: 'Reels', icon: Clapperboard },
    { id: 'messages', label: 'Messages', icon: MessageCircle, badge: unreadMsgCount },
    { id: 'communities', label: 'Communities', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Heart, badge: unreadNotifCount },
    { id: 'create', label: 'Create', icon: PlusSquare },
    { id: 'saved', label: 'Saved', icon: Bookmark },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const activeProfile = viewedProfile || currentUser;
  const canViewActiveProfile =
    activeProfile.id === currentUser.id ||
    (!blockedSet.has(activeProfile.id) &&
      (!activeProfile.is_private || followingSet.has(activeProfile.id)));

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-zinc-50/40 dark:bg-black text-zinc-900 dark:text-zinc-100 flex flex-col md:flex-row">
        {toast && (
          <div className="fixed bottom-16 md:bottom-6 right-4 z-50 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* INCOMING CALL INVITATION BANNER */}
        {incomingCall && !activeCall && (
          <IncomingCallBanner
            call={incomingCall}
            onAccept={async (call) => {
              const accepted = await callService.respondToCall(
                call.id,
                currentUser.id,
                'accept'
              );
              setIncomingCall(null);
              if (accepted) setActiveCall(accepted);
            }}
            onDecline={async (call) => {
              await callService.respondToCall(call.id, currentUser.id, 'decline');
              setIncomingCall(null);
            }}
          />
        )}

        {/* ACTIVE VOICE / VIDEO CALL MODAL */}
        {activeCall && (
          <ActiveCallModal
            call={activeCall}
            currentUser={currentUser}
            onEndCall={async (call) => {
              await callService.endCall(call.id, currentUser.id, 'completed');
              setActiveCall(null);
              showToast('Call ended.');
            }}
          />
        )}

        {/* MOBILE TOP HEADER */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSelectedHashtag(null);
              setActiveNav('home');
            }}
            className="flex items-center gap-2 font-bold text-lg"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-700 flex items-center justify-center text-white">
              <Sparkles className="w-4 h-4" />
            </div>
            <span>VistaGram</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setThemeMode(darkMode ? 'light' : 'dark')}
              className="p-2"
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('communities')}
              className="p-2"
              aria-label="Communities"
            >
              <Users className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('notifications')}
              className="relative p-2"
            >
              <Heart className="w-5 h-5" />
              {unreadNotifCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadNotifCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('messages')}
              className="relative p-2"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadMsgCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#0095F6] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadMsgCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('settings')}
              className="p-2"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="hidden md:flex flex-col justify-between w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 px-3 py-5 sticky top-0 h-screen bg-white dark:bg-black">
          <div>
            <button
              type="button"
              onClick={() => {
                setSelectedHashtag(null);
                setActiveNav('home');
              }}
              className="flex items-center gap-3 px-3 py-2 mb-6 w-full text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-700 flex items-center justify-center text-white">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xl font-bold block leading-none">VistaGram</span>
                <span className="text-[10px] text-zinc-400">Ultimate v3.0</span>
              </div>
            </button>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'profile') setViewedProfile(currentUser);
                      if (item.id === 'home') setSelectedHashtag(null);
                      setActiveNav(item.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition ${
                      isActive
                        ? 'font-bold bg-zinc-100 dark:bg-zinc-900'
                        : 'font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge ? (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-500 text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar url={currentUser.avatar_url} username={currentUser.username} size="sm" />
                <div className="truncate">
                  <p className="text-xs font-bold truncate">@{currentUser.username}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{currentUser.display_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setThemeMode(darkMode ? 'light' : 'dark')}
                className="p-2"
              >
                {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                await authService.signOut();
                setCurrentUser(null);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* CENTRAL VIEWPORT */}
        <main className="flex-1 min-w-0 pb-20 md:pb-8">
          {activeNav === 'home' && (
            <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-4 md:pt-6 flex gap-8 justify-center">
              <div className="w-full max-w-[470px]">
                {selectedHashtag && (
                  <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1">
                      <Hash className="w-4 h-4 text-[#0095F6]" />
                      {selectedHashtag}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedHashtag(null)}
                      className="text-xs font-bold text-[#0095F6]"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <StoriesTray
                  currentUser={currentUser}
                  groups={storyGroups}
                  notes={notes}
                  onSelectGroup={(authorId) => setActiveStoryAuthorId(authorId)}
                  onAddStoryClick={() => {
                    setUploadInitialTab('story');
                    setActiveNav('create');
                  }}
                  onPublishNote={async (text) => {
                    const created = await socialService.publishNote(currentUser.id, text);
                    if (created) {
                      setNotes((prev) => [
                        created,
                        ...prev.filter((n) => n.author_id !== currentUser.id),
                      ]);
                      showToast('24h Note shared!');
                    }
                  }}
                />

                <div className="flex items-center justify-between mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFeedMode('following')}
                      className={`text-sm font-bold pb-1 ${
                        feedMode === 'following'
                          ? 'border-b-2 border-zinc-900 dark:border-white'
                          : 'text-zinc-400'
                      }`}
                    >
                      Following
                    </button>
                    <button
                      type="button"
                      onClick={() => setFeedMode('explore')}
                      className={`text-sm font-bold pb-1 ${
                        feedMode === 'explore'
                          ? 'border-b-2 border-zinc-900 dark:border-white'
                          : 'text-zinc-400'
                      }`}
                    >
                      For You / Discover
                    </button>
                  </div>
                </div>

                {fellBackToDiscover && feedMode === 'following' && (
                  <div className="mb-4 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
                    <p className="font-bold text-[#0095F6]">Welcome to VistaGram!</p>
                    <p className="text-zinc-600 dark:text-zinc-300 mt-0.5">
                      Showing recommended public posts while you build your following list.
                    </p>
                  </div>
                )}

                {posts.length === 0 ? (
                  <div className="p-8 text-center border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 space-y-4">
                    <div>
                      <p className="font-bold text-base">No Posts Published Yet</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Publish your first photo or video, or follow accounts below to populate your
                        feed.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadInitialTab('post');
                        setActiveNav('create');
                      }}
                      className="px-5 py-2.5 rounded-xl bg-[#0095F6] text-white text-xs font-bold"
                    >
                      Create First Post
                    </button>

                    {suggestedProfiles.length > 0 && (
                      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-left space-y-2.5">
                        <p className="text-xs font-bold text-zinc-500">Suggested Creators to Follow</p>
                        {suggestedProfiles.slice(0, 4).map((sug) => (
                          <div key={sug.id} className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleSelectProfile(sug.id)}
                              className="flex items-center gap-2.5"
                            >
                              <Avatar url={sug.avatar_url} username={sug.username} size="sm" />
                              <div>
                                <p className="text-xs font-bold">@{sug.username}</p>
                                <p className="text-[11px] text-zinc-500">{sug.display_name}</p>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFollowToggle(sug)}
                              className="px-3 py-1 rounded-lg bg-[#0095F6] text-white text-xs font-bold"
                            >
                              {followingSet.has(sug.id) ? 'Following' : 'Follow'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        currentUser={currentUser}
                        comments={commentsByPost[post.id] || []}
                        onToggleLike={async (p) => {
                          const res = await postService.toggleLike(
                            p.id,
                            currentUser.id,
                            p.author_id,
                            Boolean(p.is_liked)
                          );
                          setPosts((prev) =>
                            prev.map((item) =>
                              item.id === p.id
                                ? {
                                    ...item,
                                    is_liked: res.liked,
                                    likes_count: res.liked
                                      ? item.likes_count + 1
                                      : Math.max(0, item.likes_count - 1),
                                  }
                                : item
                            )
                          );
                        }}
                        onToggleSave={async (p) => {
                          const res = await postService.toggleSavePost(
                            p.id,
                            currentUser.id,
                            Boolean(p.is_saved),
                            collections[0]?.id
                          );
                          setPosts((prev) =>
                            prev.map((item) =>
                              item.id === p.id ? { ...item, is_saved: res.saved } : item
                            )
                          );
                          const updatedCols = await postService.getUserCollections(currentUser.id);
                          setCollections(updatedCols);
                          showToast(res.saved ? 'Post saved!' : 'Removed from saved.');
                        }}
                        onRepost={async (p) => {
                          const reposted = await postService.repostPost(currentUser.id, p);
                          setPosts((prev) => [reposted, ...prev]);
                          showToast('Reposted to your feed!');
                        }}
                        onAddComment={async (p, content, parentId) => {
                          const created = await postService.addComment(currentUser.id, p.author_id, {
                            postId: p.id,
                            parentId,
                            content,
                          });
                          setCommentsByPost((prev) => ({
                            ...prev,
                            [p.id]: [...(prev[p.id] || []), created],
                          }));
                        }}
                        onDeleteComment={async (commentId, postId) => {
                          await postService.deleteComment(commentId);
                          setCommentsByPost((prev) => ({
                            ...prev,
                            [postId]: (prev[postId] || []).filter((c) => c.id !== commentId),
                          }));
                        }}
                        onDeletePost={async (p) => {
                          await postService.deletePost(p.id, currentUser.id);
                          setPosts((prev) => prev.filter((item) => item.id !== p.id));
                          showToast('Post deleted.');
                        }}
                        onUpdateCaption={async (p, newCap) => {
                          await postService.updatePostCaption(p.id, currentUser.id, newCap);
                          setPosts((prev) =>
                            prev.map((item) =>
                              item.id === p.id ? { ...item, caption: newCap } : item
                            )
                          );
                          showToast('Caption updated.');
                        }}
                        onOpenDetail={(p) => setDetailPost(p)}
                        onSelectProfile={handleSelectProfile}
                        onSelectHashtag={(tag) => setSelectedHashtag(tag)}
                        onReportPost={async (postId) => {
                          await socialService.submitReport(currentUser.id, {
                            reportedPostId: postId,
                            reason: 'inappropriate',
                          });
                          showToast('Report submitted to moderation queue.');
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Right Suggestions Sidebar */}
              <div className="hidden lg:block w-80 shrink-0 pt-2">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Avatar url={currentUser.avatar_url} username={currentUser.username} size="md" />
                    <div>
                      <p className="text-sm font-bold">@{currentUser.username}</p>
                      <p className="text-xs text-zinc-500">{currentUser.display_name}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-zinc-500">Suggested Accounts</span>
                </div>

                <div className="space-y-3">
                  {suggestedProfiles.map((sug) => (
                    <div key={sug.id} className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleSelectProfile(sug.id)}
                        className="flex items-center gap-2.5 text-left"
                      >
                        <Avatar url={sug.avatar_url} username={sug.username} size="sm" />
                        <div>
                          <p className="text-xs font-bold">@{sug.username}</p>
                          <p className="text-[11px] text-zinc-500 truncate max-w-[140px]">
                            {sug.display_name}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartDirectChat(sug)}
                          className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                          title="Message"
                        >
                          Chat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFollowToggle(sug)}
                          className="text-xs font-bold text-[#0095F6]"
                        >
                          {followingSet.has(sug.id)
                            ? 'Following'
                            : requestedSet.has(sug.id)
                            ? 'Requested'
                            : 'Follow'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeNav === 'search' && (
            <SearchModule
              currentUser={currentUser}
              followingSet={followingSet}
              requestedSet={requestedSet}
              onSelectProfile={handleSelectProfile}
              onSelectHashtag={(tag) => {
                setSelectedHashtag(tag);
                setActiveNav('home');
              }}
              onSelectPost={(p) => setDetailPost(p)}
              onFollowToggle={handleFollowToggle}
              onStartDirectChat={handleStartDirectChat}
              onOpenCommunities={() => setActiveNav('communities')}
            />
          )}

          {activeNav === 'explore' && (
            <ExploreModule
              posts={posts}
              onSelectPost={(p) => setDetailPost(p)}
              onOpenSearch={() => setActiveNav('search')}
            />
          )}

          {activeNav === 'reels' && (
            <ReelsModule
              reels={reels}
              currentUser={currentUser}
              onToggleReelLike={async (reel) => {
                const res = await messageAndStoryService.toggleReelLike(
                  reel.id,
                  currentUser.id,
                  Boolean(reel.is_liked)
                );
                setReels((prev) =>
                  prev.map((r) =>
                    r.id === reel.id
                      ? {
                          ...r,
                          is_liked: res.liked,
                          likes_count: res.liked ? r.likes_count + 1 : Math.max(0, r.likes_count - 1),
                        }
                      : r
                  )
                );
              }}
              onAddReelComment={async (reelId, content) => {
                const created = await messageAndStoryService.addReelComment(
                  reelId,
                  currentUser.id,
                  content
                );
                setReels((prev) =>
                  prev.map((r) =>
                    r.id === reelId ? { ...r, comments: [...(r.comments || []), created] } : r
                  )
                );
              }}
              onSelectProfile={handleSelectProfile}
            />
          )}

          {activeNav === 'messages' && (
            <MessagingModule
              currentUser={currentUser}
              conversations={conversations}
              suggestedProfiles={suggestedProfiles}
              activeConversationId={activeConversationId}
              onSelectConversation={(id) => setActiveConversationId(id)}
              onStartDirectChat={handleStartDirectChat}
              onCreateGroupChat={async (title, memberIds) => {
                const convId = await messageAndStoryService.createGroupConversation(
                  currentUser.id,
                  title,
                  memberIds
                );
                const updated = await messageAndStoryService.fetchConversations(currentUser.id);
                setConversations(updated);
                setActiveConversationId(convId);
                showToast(`Group "${title}" created!`);
              }}
              onSelectProfile={handleSelectProfile}
              onConversationsUpdated={async () => {
                const updated = await messageAndStoryService.fetchConversations(currentUser.id);
                setConversations(updated);
              }}
              onStartCall={handleStartCall}
            />
          )}

          {activeNav === 'communities' && (
            <CommunitiesAndChannelsModule
              currentUser={currentUser}
              onSelectProfile={handleSelectProfile}
            />
          )}

          {activeNav === 'notifications' && (
            <NotificationsModule
              notifications={notifications}
              followRequests={incomingRequests}
              onMarkRead={async (id) => {
                await socialService.markNotificationRead(id, currentUser.id);
                setNotifications((prev) =>
                  prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
                );
              }}
              onMarkAllRead={async () => {
                await socialService.markAllNotificationsRead(currentUser.id);
                setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
              }}
              onRespondFollowRequest={async (reqId, accept) => {
                await socialService.respondToFollowRequest(reqId, accept);
                setIncomingRequests((prev) => prev.filter((r) => r.id !== reqId));
                showToast(accept ? 'Follow request accepted!' : 'Follow request removed.');
              }}
              onSelectProfile={handleSelectProfile}
            />
          )}

          {activeNav === 'create' && (
            <UploadModule
              initialTab={uploadInitialTab}
              onUploadPost={async (files, meta) => {
                const created = await postService.createPost(currentUser.id, files, meta);
                setPosts((prev) => [created, ...prev]);
                showToast('Post uploaded and verified in PostgreSQL!');
                setActiveNav('home');
              }}
              onUploadStory={async (file, caption, audience, overlay) => {
                const created = await messageAndStoryService.uploadStory(
                  currentUser.id,
                  file,
                  caption,
                  audience,
                  overlay
                );
                setStories((prev) => [...prev, created]);
                showToast('Story published for 24 hours!');
                setActiveNav('home');
              }}
              onUploadReel={async (file, caption, audioTrack) => {
                const created = await messageAndStoryService.uploadReel(
                  currentUser.id,
                  file,
                  caption,
                  audioTrack
                );
                setReels((prev) => [created, ...prev]);
                showToast('Reel published!');
                setActiveNav('reels');
              }}
            />
          )}

          {activeNav === 'saved' && (
            <SavedCollectionsModule
              collections={collections}
              allPosts={posts}
              onCreateCollection={async (name) => {
                const created = await postService.createCollection(currentUser.id, name);
                setCollections((prev) => [...prev, created]);
                showToast(`Collection "${name}" created.`);
              }}
              onDeleteCollection={async (id) => {
                await postService.deleteCollection(id, currentUser.id);
                setCollections((prev) => prev.filter((c) => c.id !== id));
              }}
              onRemoveFromSaved={async (p, colId) => {
                await postService.toggleSavePost(p.id, currentUser.id, true, colId);
                const updated = await postService.getUserCollections(currentUser.id);
                setCollections(updated);
              }}
              onSelectPost={(p) => setDetailPost(p)}
            />
          )}

          {activeNav === 'profile' && (
            <ProfileModule
              viewedProfile={activeProfile}
              currentUser={currentUser}
              posts={posts}
              reels={reels}
              highlights={highlights}
              isFollowing={followingSet.has(activeProfile.id)}
              isRequested={requestedSet.has(activeProfile.id)}
              isBlocked={blockedSet.has(activeProfile.id)}
              canViewContent={canViewActiveProfile}
              onFollowToggle={handleFollowToggle}
              onStartMessage={handleStartDirectChat}
              onBlockToggle={async (targetId) => {
                if (blockedSet.has(targetId)) {
                  await socialService.unblockUser(currentUser.id, targetId);
                  setBlockedSet((prev) => {
                    const next = new Set(prev);
                    next.delete(targetId);
                    return next;
                  });
                  showToast('Account unblocked.');
                } else {
                  await socialService.blockUser(currentUser.id, targetId);
                  setBlockedSet((prev) => new Set(prev).add(targetId));
                  showToast('Account blocked.');
                }
              }}
              onOpenSettings={() => setActiveNav('settings')}
              onOpenSaved={() => setActiveNav('saved')}
              onSelectPost={(p) => setDetailPost(p)}
              onOpenFollowList={async (mode) => {
                const list = await socialService.getFollowersOrFollowing(activeProfile.id, mode);
                setFollowModalState({ mode, users: list });
              }}
              onCreateHighlight={async (title) => {
                const created = await socialService.createStoryHighlight(
                  currentUser.id,
                  title,
                  currentUser.avatar_url || '',
                  []
                );
                setHighlights((prev) => [...prev, created]);
                showToast(`Highlight "${title}" added!`);
              }}
              onDeleteHighlight={async (id) => {
                await socialService.deleteStoryHighlight(id, currentUser.id);
                setHighlights((prev) => prev.filter((h) => h.id !== id));
              }}
            />
          )}

          {activeNav === 'settings' && (
            <SettingsModule
              currentUser={currentUser}
              settings={settings}
              blockedProfiles={blockedProfiles}
              suggestedProfiles={suggestedProfiles}
              closeFriendsSet={closeFriendsSet}
              userPosts={posts.filter((p) => p.author_id === currentUser.id)}
              userReels={reels.filter((r) => r.author_id === currentUser.id)}
              darkMode={darkMode}
              onSetThemeMode={setThemeMode}
              onSaveProfile={async (data, avatarFile) => {
                const updated = await socialService.updateProfile(
                  currentUser.id,
                  data,
                  avatarFile
                );
                setCurrentUser(updated);
                setViewedProfile(updated);
                showToast('Profile saved to PostgreSQL!');
              }}
              onUpdateSettings={async (patch) => {
                const updated = await socialService.updateUserSettings(currentUser.id, patch);
                setSettings(updated);
                showToast('Preferences saved!');
              }}
              onToggleCloseFriend={async (friendId) => {
                const added = await socialService.toggleCloseFriend(
                  currentUser.id,
                  friendId,
                  closeFriendsSet.has(friendId)
                );
                setCloseFriendsSet((prev) => {
                  const next = new Set(prev);
                  if (added) next.add(friendId);
                  else next.delete(friendId);
                  return next;
                });
              }}
              onChangePassword={async (newPass) => {
                await authService.updatePassword(newPass);
                showToast('Password updated!');
              }}
              onUnblockUser={async (targetId) => {
                await socialService.unblockUser(currentUser.id, targetId);
                setBlockedProfiles((prev) => prev.filter((p) => p.id !== targetId));
                showToast('Account unblocked.');
              }}
              onDeleteAccount={async () => {
                await authService.deleteOwnAccount();
                setCurrentUser(null);
              }}
            />
          )}
        </main>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-zinc-800 h-14 flex items-center justify-around px-2">
          {(['home', 'search', 'explore', 'reels', 'create', 'profile'] as const).map((id) => {
            const item = navItems.find((n) => n.id === id)!;
            const Icon = item.icon;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === 'profile') setViewedProfile(currentUser);
                  setActiveNav(id);
                }}
                className={`p-2 rounded-xl ${
                  activeNav === id ? 'text-[#0095F6]' : 'text-zinc-500'
                }`}
              >
                <Icon className="w-6 h-6" />
              </button>
            );
          })}
        </nav>

        {/* FULL-SCREEN STORY VIEWER MODAL */}
        {activeStoryAuthorId && (() => {
          const group = storyGroups.find((g) => g.author.id === activeStoryAuthorId);
          if (!group) return null;
          return (
            <StoryViewerModal
              group={group}
              currentUserId={currentUser.id}
              onClose={() => setActiveStoryAuthorId(null)}
              onDeleteStory={async (st) => {
                await messageAndStoryService.deleteStory(st.id, currentUser.id, st.storage_path);
                setStories((prev) => prev.filter((item) => item.id !== st.id));
                setActiveStoryAuthorId(null);
              }}
              onRecordView={async (storyId) => {
                await messageAndStoryService.recordStoryView(storyId, currentUser.id);
              }}
              onReactToStory={async (st, emoji) => {
                await messageAndStoryService.reactToStory(
                  st.id,
                  st.author_id,
                  currentUser.id,
                  emoji
                );
                showToast(`Sent ${emoji} to @${group.author.username}`);
              }}
              onReplyToStory={async (st, text) => {
                const convId = await messageAndStoryService.getOrCreateDirectConversation(
                  currentUser.id,
                  st.author_id
                );
                await messageAndStoryService.sendMessage(currentUser.id, st.author_id, {
                  conversationId: convId,
                  content: `Replied to your story: ${text}`,
                });
                showToast('Story reply sent via Direct Message!');
              }}
              onNavigateProfile={handleSelectProfile}
            />
          );
        })()}

        {/* FOLLOWERS / FOLLOWING LIST MODAL */}
        {followModalState && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 mb-3">
                <h3 className="font-bold text-sm capitalize">{followModalState.mode}</h3>
                <button type="button" onClick={() => setFollowModalState(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2.5 max-h-72 overflow-y-auto">
                {followModalState.users.length === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-6">
                    No {followModalState.mode} yet.
                  </p>
                ) : (
                  followModalState.users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setFollowModalState(null);
                          handleSelectProfile(u.id);
                        }}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar url={u.avatar_url} username={u.username} size="sm" />
                        <span className="font-bold">@{u.username}</span>
                      </button>
                      {followModalState.mode === 'followers' &&
                        activeProfile.id === currentUser.id && (
                          <button
                            type="button"
                            onClick={async () => {
                              await socialService.removeFollower(currentUser.id, u.id);
                              setFollowModalState((prev) =>
                                prev
                                  ? { ...prev, users: prev.users.filter((x) => x.id !== u.id) }
                                  : null
                              );
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 font-semibold"
                          >
                            Remove
                          </button>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* POST DETAIL MODAL */}
        {detailPost && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full max-h-[88vh] overflow-y-auto relative">
              <button
                type="button"
                onClick={() => setDetailPost(null)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/60 text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <PostCard
                post={detailPost}
                currentUser={currentUser}
                comments={commentsByPost[detailPost.id] || []}
                onToggleLike={async (p) => {
                  const res = await postService.toggleLike(
                    p.id,
                    currentUser.id,
                    p.author_id,
                    Boolean(p.is_liked)
                  );
                  setDetailPost({
                    ...p,
                    is_liked: res.liked,
                    likes_count: res.liked ? p.likes_count + 1 : Math.max(0, p.likes_count - 1),
                  });
                }}
                onToggleSave={async (p) => {
                  await postService.toggleSavePost(
                    p.id,
                    currentUser.id,
                    Boolean(p.is_saved),
                    collections[0]?.id
                  );
                }}
                onRepost={async (p) => {
                  const reposted = await postService.repostPost(currentUser.id, p);
                  setPosts((prev) => [reposted, ...prev]);
                  showToast('Reposted!');
                }}
                onAddComment={async (p, content, parentId) => {
                  const created = await postService.addComment(currentUser.id, p.author_id, {
                    postId: p.id,
                    parentId,
                    content,
                  });
                  setCommentsByPost((prev) => ({
                    ...prev,
                    [p.id]: [...(prev[p.id] || []), created],
                  }));
                }}
                onDeleteComment={async (cid, pid) => {
                  await postService.deleteComment(cid);
                  setCommentsByPost((prev) => ({
                    ...prev,
                    [pid]: (prev[pid] || []).filter((c) => c.id !== cid),
                  }));
                }}
                onDeletePost={async (p) => {
                  await postService.deletePost(p.id, currentUser.id);
                  setPosts((prev) => prev.filter((x) => x.id !== p.id));
                  setDetailPost(null);
                }}
                onUpdateCaption={async (p, cap) => {
                  await postService.updatePostCaption(p.id, currentUser.id, cap);
                }}
                onOpenDetail={() => {}}
                onSelectProfile={(uid) => {
                  setDetailPost(null);
                  handleSelectProfile(uid);
                }}
                onSelectHashtag={(tag) => {
                  setDetailPost(null);
                  setSelectedHashtag(tag);
                  setActiveNav('home');
                }}
                onReportPost={() => {}}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
