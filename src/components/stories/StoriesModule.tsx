'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  X,
  Eye,
  Send,
  MessageSquarePlus,
} from 'lucide-react';
import type { Profile, Story, UserNote } from '@/types/database';
import { Avatar, formatRelativeTime } from '@/components/common/Avatar';

export interface StoryGroup {
  author: Profile;
  stories: Story[];
  allViewed: boolean;
}

const STORY_REACTIONS = ['❤️', '🔥', '👏', '😂', '😮', '🎉'];

export function StoriesTray({
  currentUser,
  groups,
  notes,
  onSelectGroup,
  onAddStoryClick,
  onPublishNote,
}: {
  currentUser: Profile;
  groups: StoryGroup[];
  notes: UserNote[];
  onSelectGroup: (authorId: string) => void;
  onAddStoryClick: () => void;
  onPublishNote: (text: string) => Promise<void>;
}) {
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');

  const myNote = notes.find((n) => n.author_id === currentUser.id);

  return (
    <div className="mb-5 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-3 shadow-sm">
      {/* Top Notes Row (Instagram-inspired 60-char status bubbles) */}
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-1">
        <button
          type="button"
          onClick={() => setNoteModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 text-xs font-medium shrink-0 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
        >
          <MessageSquarePlus className="w-3.5 h-3.5 text-[#0095F6]" />
          <span>{myNote ? `Your note: "${myNote.content}"` : 'Leave a 24h note...'}</span>
        </button>

        {notes
          .filter((n) => n.author_id !== currentUser.id)
          .map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs shrink-0"
            >
              <span className="font-bold">@{n.author?.username || 'friend'}:</span>
              <span className="text-zinc-600 dark:text-zinc-300">
                {n.emoji} {n.content}
              </span>
            </div>
          ))}
      </div>

      {/* Stories Rings Row */}
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pt-1">
        <button
          type="button"
          onClick={onAddStoryClick}
          className="flex flex-col items-center gap-1 shrink-0"
        >
          <div className="relative w-16 h-16 rounded-full p-0.5 border-2 border-dashed border-[#0095F6] flex items-center justify-center">
            <Avatar url={currentUser.avatar_url} username={currentUser.username} size="lg" />
            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#0095F6] text-white flex items-center justify-center text-xs font-bold border-2 border-white dark:border-black">
              +
            </span>
          </div>
          <span className="text-[11px] font-medium truncate w-16 text-center">Your story</span>
        </button>

        {groups.map((group) => {
          const hasCloseFriendsStory = group.stories.some(
            (s) => s.audience === 'close_friends'
          );
          return (
            <button
              key={group.author.id}
              type="button"
              onClick={() => onSelectGroup(group.author.id)}
              className="flex flex-col items-center gap-1 shrink-0"
            >
              <div
                className={`w-16 h-16 rounded-full p-[2.5px] flex items-center justify-center ${
                  group.allViewed
                    ? 'bg-zinc-300 dark:bg-zinc-700'
                    : hasCloseFriendsStory
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-700'
                }`}
              >
                <Avatar url={group.author.avatar_url} username={group.author.username} size="lg" />
              </div>
              <span className="text-[11px] font-medium truncate w-16 text-center">
                {group.author.username}
              </span>
            </button>
          );
        })}
      </div>

      {/* Leave a Note Modal */}
      {noteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Share a 24-Hour Note</h3>
              <button type="button" onClick={() => setNoteModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              maxLength={60}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="What's on your mind? (max 60 chars)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
            />
            <button
              type="button"
              disabled={!noteDraft.trim()}
              onClick={async () => {
                await onPublishNote(noteDraft.trim());
                setNoteDraft('');
                setNoteModalOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-[#0095F6] text-white text-xs font-bold disabled:opacity-40"
            >
              Share Note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StoryViewerModal({
  group,
  currentUserId,
  onClose,
  onDeleteStory,
  onRecordView,
  onReactToStory,
  onReplyToStory,
  onNavigateProfile,
}: {
  group: StoryGroup;
  currentUserId: string;
  onClose: () => void;
  onDeleteStory: (story: Story) => void;
  onRecordView: (storyId: string) => void;
  onReactToStory: (story: Story, emoji: string) => void;
  onReplyToStory: (story: Story, text: string) => Promise<void>;
  onNavigateProfile: (userId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [replyText, setReplyText] = useState('');

  const currentStory = group.stories[index];

  useEffect(() => {
    if (currentStory) {
      onRecordView(currentStory.id);
    }
  }, [currentStory?.id]);

  useEffect(() => {
    if (!currentStory || paused || showViewers) return;
    const intervalMs = 100;
    const step = 100 / (((currentStory.duration_seconds || 5) * 1000) / intervalMs);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          if (index + 1 < group.stories.length) {
            setIndex((i) => i + 1);
            return 0;
          } else {
            onClose();
            return 0;
          }
        }
        return prev + step;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentStory, index, paused, showViewers, group.stories.length]);

  if (!currentStory) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 flex flex-col justify-between">
        {currentStory.media_type === 'video' ? (
          <video
            src={currentStory.media_url}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <img
            src={currentStory.media_url}
            alt={currentStory.caption}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />

        {/* Top Progress Bars & Header */}
        <div className="relative z-10 p-3 space-y-2.5">
          <div className="flex gap-1">
            {group.stories.map((st, idx) => (
              <div key={st.id} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-100"
                  style={{
                    width: idx < index ? '100%' : idx === index ? `${progress}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-white">
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateProfile(group.author.id);
              }}
              className="flex items-center gap-2"
            >
              <Avatar url={group.author.avatar_url} username={group.author.username} size="sm" />
              <span className="text-xs font-bold">{group.author.username}</span>
              <span className="text-[11px] text-zinc-300">
                {formatRelativeTime(currentStory.created_at)}
              </span>
              {currentStory.audience === 'close_friends' && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-bold">
                  ★ Close Friends
                </span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaused(!paused)}
                className="p-1.5 rounded-full bg-black/40"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              {group.author.id === currentUserId && (
                <button
                  type="button"
                  onClick={() => onDeleteStory(currentStory)}
                  className="p-1.5 rounded-full bg-black/40 text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={onClose} className="p-1.5 rounded-full bg-black/40">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Prev / Next Navigation */}
        <div className="relative z-10 flex justify-between px-2">
          <button
            type="button"
            onClick={() => {
              if (index > 0) {
                setIndex(index - 1);
                setProgress(0);
              }
            }}
            className="p-2 rounded-full bg-black/40 text-white"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (index + 1 < group.stories.length) {
                setIndex(index + 1);
                setProgress(0);
              } else {
                onClose();
              }
            }}
            className="p-2 rounded-full bg-black/40 text-white"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Footer Caption, Quick Reactions & Direct Message Reply */}
        <div className="relative z-10 p-4 text-white space-y-2.5">
          {currentStory.caption && <p className="text-xs">{currentStory.caption}</p>}

          {group.author.id === currentUserId ? (
            <>
              <button
                type="button"
                onClick={() => setShowViewers(!showViewers)}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-200 hover:underline"
              >
                <Eye className="w-4 h-4" />
                <span>Viewed by {(currentStory.viewer_ids || []).length} accounts</span>
              </button>
              {showViewers && (
                <div className="mt-2 p-3 rounded-xl bg-zinc-900/95 border border-zinc-700 max-h-36 overflow-y-auto space-y-1.5">
                  {(currentStory.viewers || []).map((v) => (
                    <div key={v.id} className="text-xs flex items-center gap-2">
                      <span>@{v.username}</span>
                      <span className="text-zinc-400">({v.display_name})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-center gap-3">
                {STORY_REACTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => onReactToStory(currentStory, em)}
                    className="text-lg hover:scale-125 transition"
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to @${group.author.username}...`}
                  className="flex-1 px-3.5 py-2 rounded-full bg-white/15 text-xs text-white placeholder:text-zinc-300 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!replyText.trim()}
                  onClick={async () => {
                    await onReplyToStory(currentStory, replyText.trim());
                    setReplyText('');
                  }}
                  className="p-2 rounded-full bg-[#0095F6] text-white disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
