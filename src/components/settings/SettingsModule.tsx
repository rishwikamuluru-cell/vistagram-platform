'use client';

import React, { useState } from 'react';
import {
  User,
  Palette,
  Sliders,
  Shield,
  BarChart3,
  KeyRound,
  Lock,
  Check,
  Sparkles,
  Eye,
  Heart,
  MessageCircle,
  Film,
  Users,
  Trash2,
} from 'lucide-react';
import type { Profile, UserSettings, Post, Reel } from '@/types/database';
import { Avatar } from '@/components/common/Avatar';

const ACCENT_PRESETS = [
  { name: 'Vista Blue', hex: '#0095F6' },
  { name: 'Electric Rose', hex: '#E1306C' },
  { name: 'Royal Violet', hex: '#8B5CF6' },
  { name: 'Emerald Pulse', hex: '#10B981' },
  { name: 'Sunset Amber', hex: '#F59E0B' },
];

export function SettingsModule({
  currentUser,
  settings,
  blockedProfiles,
  suggestedProfiles,
  closeFriendsSet,
  userPosts,
  userReels,
  darkMode,
  onSetThemeMode,
  onSaveProfile,
  onUpdateSettings,
  onToggleCloseFriend,
  onChangePassword,
  onUnblockUser,
  onDeleteAccount,
}: {
  currentUser: Profile;
  settings: UserSettings;
  blockedProfiles: Profile[];
  suggestedProfiles: Profile[];
  closeFriendsSet: Set<string>;
  userPosts: Post[];
  userReels: Reel[];
  darkMode: boolean;
  onSetThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  onSaveProfile: (
    data: {
      username: string;
      display_name: string;
      bio: string;
      website: string;
      is_private: boolean;
    },
    avatarFile?: File | null
  ) => Promise<void>;
  onUpdateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  onToggleCloseFriend: (friendId: string) => Promise<void>;
  onChangePassword: (newPassword: string) => Promise<void>;
  onUnblockUser: (targetId: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<
    'profile' | 'appearance' | 'feed' | 'privacy' | 'analytics' | 'security'
  >('profile');

  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [website, setWebsite] = useState(currentUser.website || '');
  const [isPrivate, setIsPrivate] = useState(Boolean(currentUser.is_private));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Real Creator Analytics computed strictly from actual PostgreSQL records (Part 13)
  const totalPostLikes = userPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
  const totalPostComments = userPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const totalReelViews = userReels.reduce((sum, r) => sum + (r.views_count || 0), 0);
  const totalReelLikes = userReels.reduce((sum, r) => sum + (r.likes_count || 0), 0);

  const tabs: Array<{
    id: typeof activeTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'profile', label: 'Edit Profile', icon: User },
    { id: 'appearance', label: 'Appearance & Theme', icon: Palette },
    { id: 'feed', label: 'Feed & Accessibility', icon: Sliders },
    { id: 'privacy', label: 'Privacy & Messaging', icon: Shield },
    { id: 'analytics', label: 'Creator & Close Friends', icon: BarChart3 },
    { id: 'security', label: 'Security & Account', icon: KeyRound },
  ];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 pt-4 md:pt-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Settings & Customization</h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Personalize your VistaGram profile, theme, privacy controls, and creator tools
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Settings Sub-Navigation */}
        <div className="md:col-span-4 flex md:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-2 md:pb-0">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold shrink-0 transition text-left ${
                  active
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                    : 'bg-zinc-100/80 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Active Settings Panel */}
        <div className="md:col-span-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm">
          {/* TAB 1: EDIT PROFILE */}
          {activeTab === 'profile' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                try {
                  await onSaveProfile(
                    {
                      username,
                      display_name: displayName,
                      bio,
                      website,
                      is_private: isPrivate,
                    },
                    avatarFile
                  );
                } finally {
                  setSaving(false);
                }
              }}
              className="space-y-5"
            >
              <div className="flex items-center gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <Avatar url={currentUser.avatar_url} username={currentUser.username} size="lg" />
                <div className="flex-1">
                  <p className="text-sm font-bold">@{currentUser.username}</p>
                  <label className="inline-block mt-1 text-xs font-bold text-[#0095F6] cursor-pointer hover:underline">
                    Change profile photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  {avatarFile && (
                    <p className="text-[11px] text-emerald-500 mt-0.5">
                      Selected: {avatarFile.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">
                  Biography ({bio.length}/150)
                </label>
                <textarea
                  rows={3}
                  maxLength={150}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell your followers about yourself..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">Website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourportfolio.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>

              <label className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 cursor-pointer">
                <div>
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                    Private Account
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    When private, only approved followers can view your posts, stories, and reels.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-[#0095F6]"
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0095F6] hover:bg-[#1877F2] text-white text-xs font-bold transition"
              >
                {saving ? 'Saving to PostgreSQL...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {/* TAB 2: APPEARANCE & THEME CUSTOMIZATION */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold mb-1">Theme Mode</h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Choose between crisp Light mode, OLED Dark mode, or automatic System sync
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        onSetThemeMode(mode);
                        onUpdateSettings({ theme: mode });
                      }}
                      className={`p-3.5 rounded-xl border text-xs font-bold capitalize transition ${
                        (mode === 'dark' && darkMode) || (mode === 'light' && !darkMode)
                          ? 'border-[#0095F6] bg-[#0095F6]/10 text-[#0095F6]'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {mode} Mode
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold mb-1">Accent Color</h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Customize primary buttons, active badges, and highlight rings
                </p>
                <div className="flex flex-wrap gap-3">
                  {ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => onUpdateSettings({ accent_color: preset.hex })}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold"
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: preset.hex }}
                      >
                        {settings.accent_color === preset.hex && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold mb-1">Interface Density</h3>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {(['comfortable', 'compact'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onUpdateSettings({ ui_density: d })}
                      className={`p-3 rounded-xl border text-xs font-bold capitalize ${
                        (settings.ui_density || 'comfortable') === d
                          ? 'border-[#0095F6] bg-[#0095F6]/10 text-[#0095F6]'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {d} Layout
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FEED & ACCESSIBILITY */}
          {activeTab === 'feed' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold mb-2">Default Feed Ordering</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(['chronological', 'recommended'] as const).map((pref) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => onUpdateSettings({ feed_preference: pref })}
                      className={`p-3 rounded-xl border text-xs font-bold capitalize ${
                        (settings.feed_preference || 'chronological') === pref
                          ? 'border-[#0095F6] bg-[#0095F6]/10 text-[#0095F6]'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {pref} Feed
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900">
                <div>
                  <p className="text-xs font-bold">Autoplay Videos & Reels</p>
                  <p className="text-[11px] text-zinc-500">
                    Automatically play videos when visible in viewport
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoplay_videos ?? true}
                  onChange={(e) => onUpdateSettings({ autoplay_videos: e.target.checked })}
                  className="w-4 h-4 accent-[#0095F6]"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900">
                <div>
                  <p className="text-xs font-bold">Reduced Motion (Accessibility)</p>
                  <p className="text-[11px] text-zinc-500">
                    Minimize decorative animations and transitions
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.reduced_motion)}
                  onChange={(e) => onUpdateSettings({ reduced_motion: e.target.checked })}
                  className="w-4 h-4 accent-[#0095F6]"
                />
              </label>
            </div>
          )}

          {/* TAB 4: PRIVACY, NOTIFICATIONS & MESSAGING */}
          {activeTab === 'privacy' && (
            <div className="space-y-5">
              <div className="space-y-2.5">
                <h3 className="text-sm font-bold">Notification & Messaging Preferences</h3>
                {(
                  [
                    ['notify_likes', 'Likes on your posts and reels'],
                    ['notify_comments', 'Comments, replies, and mentions'],
                    ['notify_follows', 'New followers and follow requests'],
                    ['notify_messages', 'Direct messages and story replies'],
                    ['show_activity_status', 'Show online activity status'],
                    ['read_receipts_enabled', 'Send read receipts ("Seen") in Direct Messages'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 text-xs"
                  >
                    <span className="font-medium">{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key] ?? true)}
                      onChange={(e) => onUpdateSettings({ [key]: e.target.checked })}
                      className="w-4 h-4 accent-[#0095F6]"
                    />
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold mb-2">
                  Blocked Accounts ({blockedProfiles.length})
                </h3>
                {blockedProfiles.length === 0 ? (
                  <p className="text-xs text-zinc-500">You have not blocked any accounts.</p>
                ) : (
                  <div className="space-y-2">
                    {blockedProfiles.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs"
                      >
                        <span className="font-bold">@{b.username}</span>
                        <button
                          type="button"
                          onClick={() => onUnblockUser(b.id)}
                          className="text-[#0095F6] font-bold"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CREATOR ANALYTICS & CLOSE FRIENDS (Part 13: Real Database Metrics Only) */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-[#0095F6]" />
                  <span>Real Creator Analytics</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-3">
                  100% live metrics calculated directly from your PostgreSQL records
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                      <Heart className="w-3.5 h-3.5 text-pink-500" />
                      <span>Post Likes</span>
                    </div>
                    <p className="text-lg font-bold">{totalPostLikes.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                      <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                      <span>Comments</span>
                    </div>
                    <p className="text-lg font-bold">{totalPostComments.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                      <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Reel Views</span>
                    </div>
                    <p className="text-lg font-bold">{totalReelViews.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1">
                      <Film className="w-3.5 h-3.5 text-purple-500" />
                      <span>Reel Likes</span>
                    </div>
                    <p className="text-lg font-bold">{totalReelLikes.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-emerald-500" />
                  <span>Close Friends List ({closeFriendsSet.size})</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-3">
                  Select accounts who can view your Close Friends stories and posts
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {suggestedProfiles.map((p) => {
                    const isClose = closeFriendsSet.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar url={p.avatar_url} username={p.username} size="sm" />
                          <div>
                            <p className="text-xs font-bold">@{p.username}</p>
                            <p className="text-[11px] text-zinc-500">{p.display_name}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleCloseFriend(p.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            isClose
                              ? 'bg-emerald-500 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          {isClose ? '★ Close Friend' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SECURITY & ACCOUNT DELETION */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold mb-2">Change Password</h3>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New strong password (min 8 chars, upper, lower, number)..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onChangePassword(newPassword);
                      setNewPassword('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold"
                  >
                    Update
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">
                      Delete Account Permanently
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Deletes your Supabase Auth account and cascades across all PostgreSQL tables.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                {confirmDeleteOpen && (
                  <div className="mt-4 pt-3 border-t border-red-500/20 flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-500">
                      Are you sure? This cannot be undone.
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteOpen(false)}
                        className="px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={onDeleteAccount}
                        className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-bold"
                      >
                        Confirm Permanent Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
