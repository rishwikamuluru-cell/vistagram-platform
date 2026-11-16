'use client';

import React, { useState } from 'react';
import { Clapperboard, Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Eye } from 'lucide-react';
import type { Reel, Profile } from '@/types/database';
import { Avatar } from '@/components/common/Avatar';

export function ReelsModule({
  reels,
  currentUser,
  onToggleReelLike,
  onAddReelComment,
  onSelectProfile,
}: {
  reels: Reel[];
  currentUser: Profile;
  onToggleReelLike: (reel: Reel) => void;
  onAddReelComment: (reelId: string, content: string) => void;
  onSelectProfile: (userId: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [commentInput, setCommentInput] = useState('');

  if (reels.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 pt-12 text-center">
        <Clapperboard className="w-12 h-12 mx-auto text-zinc-400 mb-3" />
        <h3 className="font-bold text-base">No Reels Uploaded Yet</h3>
        <p className="text-xs text-zinc-500 mt-1">
          Use the Create tab to upload your first vertical short video to Supabase Storage.
        </p>
      </div>
    );
  }

  const currentReel = reels[index] || reels[0];
  const author = currentReel.author || currentUser;

  return (
    <div className="max-w-md mx-auto px-2 pt-4">
      <div className="relative rounded-3xl overflow-hidden bg-zinc-950 text-white border border-zinc-800 shadow-xl aspect-[9/16] max-h-[78vh] mx-auto flex flex-col justify-between">
        <video
          src={currentReel.video_url}
          poster={currentReel.thumbnail_url || undefined}
          autoPlay={playing}
          loop
          playsInline
          muted={muted}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/85 pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between p-4">
          <span className="font-bold text-base flex items-center gap-1.5">
            <Clapperboard className="w-5 h-5" />
            Reels
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              className="p-2 rounded-full bg-black/50"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              className="p-2 rounded-full bg-black/50"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="relative z-10 p-4 flex items-end justify-between gap-4">
          <div className="flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onSelectProfile(author.id)}
              className="flex items-center gap-2 mb-2"
            >
              <Avatar url={author.avatar_url} username={author.username} size="sm" />
              <span className="font-bold text-sm">@{author.username}</span>
            </button>
            <p className="text-xs mb-2 line-clamp-2">{currentReel.caption}</p>
            <p className="text-[11px] text-zinc-300 truncate">🎵 {currentReel.audio_track_name}</p>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Comment on this Reel..."
                className="flex-1 px-3 py-1.5 rounded-full bg-white/15 text-xs placeholder:text-zinc-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!commentInput.trim()) return;
                  onAddReelComment(currentReel.id, commentInput);
                  setCommentInput('');
                }}
                className="text-xs font-bold text-[#0095F6]"
              >
                Send
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => onToggleReelLike(currentReel)}
              className="flex flex-col items-center gap-1"
            >
              <Heart className={`w-6 h-6 ${currentReel.is_liked ? 'text-red-500 fill-red-500' : ''}`} />
              <span className="text-xs font-bold">{currentReel.likes_count}</span>
            </button>
            <div className="flex flex-col items-center gap-1">
              <MessageCircle className="w-6 h-6" />
              <span className="text-xs font-bold">{(currentReel.comments || []).length}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Eye className="w-5 h-5 text-zinc-300" />
              <span className="text-[11px]">{currentReel.views_count}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 px-4">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold disabled:opacity-40"
        >
          ↑ Previous
        </button>
        <span className="text-xs text-zinc-500">
          {index + 1} / {reels.length}
        </span>
        <button
          type="button"
          disabled={index + 1 >= reels.length}
          onClick={() => setIndex((i) => Math.min(reels.length - 1, i + 1))}
          className="px-4 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs font-semibold disabled:opacity-40"
        >
          Next ↓
        </button>
      </div>
    </div>
  );
}
