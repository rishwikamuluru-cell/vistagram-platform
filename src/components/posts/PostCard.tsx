'use client';

import React, { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Trash2,
  Flag,
  ChevronLeft,
  ChevronRight,
  MapPin,
  CheckCircle2,
  AtSign,
  Edit3,
  Repeat2,
} from 'lucide-react';
import type { Post, Profile, Comment } from '@/types/database';
import { Avatar, formatRelativeTime } from '@/components/common/Avatar';

export function PostCard({
  post,
  currentUser,
  comments,
  onToggleLike,
  onToggleSave,
  onRepost,
  onAddComment,
  onDeleteComment,
  onDeletePost,
  onUpdateCaption,
  onOpenDetail,
  onSelectProfile,
  onSelectHashtag,
  onReportPost,
}: {
  post: Post;
  currentUser: Profile;
  comments: Comment[];
  onToggleLike: (post: Post) => void;
  onToggleSave: (post: Post) => void;
  onRepost: (post: Post) => void;
  onAddComment: (post: Post, content: string, parentId?: string | null) => void;
  onDeleteComment: (commentId: string, postId: string) => void;
  onDeletePost: (post: Post) => void;
  onUpdateCaption: (post: Post, newCaption: string) => void;
  onOpenDetail: (post: Post) => void;
  onSelectProfile: (userId: string) => void;
  onSelectHashtag: (tag: string) => void;
  onReportPost: (postId: string) => void;
}) {
  const [mediaIdx, setMediaIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(post.caption);

  const author = post.author || currentUser;
  const mediaList = post.media || [];
  const currentMedia = mediaList[mediaIdx] || mediaList[0];

  const renderCaptionTokens = (text: string) => {
    return text.split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9._]+)/g).map((part, i) => {
      if (part.startsWith('#')) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelectHashtag(part.slice(1).toLowerCase())}
            className="text-[#0095F6] hover:underline font-medium mr-0.5"
          >
            {part}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <article className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onSelectProfile(author.id)}>
            <Avatar url={author.avatar_url} username={author.username} size="sm" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSelectProfile(author.id)}
                className="text-sm font-bold hover:underline"
              >
                {author.username}
              </button>
              {author.is_verified && <CheckCircle2 className="w-3.5 h-3.5 text-[#0095F6]" />}
              <span className="text-xs text-zinc-400">• {formatRelativeTime(post.created_at)}</span>
            </div>
            {post.location && (
              <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {post.location}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {post.author_id === currentUser.id ? (
            <>
              <button
                type="button"
                onClick={() => setEditingCaption(!editingCaption)}
                className="p-1.5 text-zinc-400 hover:text-[#0095F6] rounded-lg"
                title="Edit caption"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDeletePost(post)}
                className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg"
                title="Delete post"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onReportPost(post.id)}
              className="p-1.5 text-zinc-400 hover:text-amber-500 rounded-lg"
              title="Report post"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {currentMedia && (
        <div
          className="relative bg-zinc-900 aspect-square select-none"
          onDoubleClick={() => {
            if (!post.is_liked) onToggleLike(post);
          }}
        >
          {currentMedia.media_type === 'video' ? (
            <video
              src={currentMedia.media_url}
              controls
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={currentMedia.media_url}
              alt={currentMedia.alt_text || post.caption}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          )}

          {mediaList.length > 1 && (
            <>
              {mediaIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setMediaIdx(mediaIdx - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {mediaIdx + 1 < mediaList.length && (
                <button
                  type="button"
                  onClick={() => setMediaIdx(mediaIdx + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {mediaList.map((m, idx) => (
                  <span
                    key={m.id || idx}
                    className={`w-1.5 h-1.5 rounded-full ${
                      idx === mediaIdx ? 'bg-[#0095F6]' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => onToggleLike(post)}
              aria-label={post.is_liked ? 'Unlike post' : 'Like post'}
            >
              <Heart
                className={`w-6 h-6 transition active:scale-125 ${
                  post.is_liked ? 'text-red-500 fill-red-500' : 'hover:text-zinc-500'
                }`}
              />
            </button>
            <button type="button" onClick={() => onOpenDetail(post)} aria-label="Comments">
              <MessageCircle className="w-6 h-6 hover:text-zinc-500" />
            </button>
            <button
              type="button"
              onClick={() => onRepost(post)}
              title="Repost to your feed"
              aria-label="Repost"
            >
              <Repeat2 className="w-6 h-6 hover:text-emerald-500 transition" />
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/?post=${post.id}`);
              }}
              aria-label="Share post"
            >
              <Share2 className="w-6 h-6 hover:text-zinc-500" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onToggleSave(post)}
            aria-label={post.is_saved ? 'Unsave post' : 'Save post'}
          >
            <Bookmark
              className={`w-6 h-6 ${
                post.is_saved ? 'fill-zinc-900 dark:fill-white' : 'hover:text-zinc-500'
              }`}
            />
          </button>
        </div>

        {!post.hide_like_count && (
          <p className="text-sm font-bold mb-1.5">
            {post.likes_count.toLocaleString()} {post.likes_count === 1 ? 'like' : 'likes'}
          </p>
        )}

        {editingCaption ? (
          <div className="flex gap-2 my-2">
            <input
              type="text"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
            />
            <button
              type="button"
              onClick={() => {
                onUpdateCaption(post, captionDraft);
                setEditingCaption(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0095F6] text-white text-xs font-bold"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="text-sm leading-relaxed">
            <button
              type="button"
              onClick={() => onSelectProfile(author.id)}
              className="font-bold mr-2 hover:underline"
            >
              {author.username}
            </button>
            {post.caption.length > 120 && !expanded ? (
              <>
                <span>{renderCaptionTokens(post.caption.slice(0, 120))}... </span>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs text-zinc-400"
                >
                  more
                </button>
              </>
            ) : (
              <span>{renderCaptionTokens(post.caption)}</span>
            )}
          </div>
        )}

        {(post.tagged_usernames || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.tagged_usernames.map((uname) => (
              <span
                key={uname}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-500"
              >
                <AtSign className="w-3 h-3" />
                {uname}
              </span>
            ))}
          </div>
        )}

        {comments.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {comments.length > 3 && (
              <button
                type="button"
                onClick={() => onOpenDetail(post)}
                className="text-xs text-zinc-500 hover:underline"
              >
                View all {comments.length} comments
              </button>
            )}
            {comments.slice(-3).map((c) => (
              <div key={c.id} className="flex items-start justify-between text-xs gap-2">
                <div>
                  <span className="font-bold mr-1.5">{c.author?.username || 'user'}</span>
                  <span>{c.content}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setReplyTo({ id: c.id, username: c.author?.username || 'user' })
                    }
                    className="ml-2 text-[11px] text-zinc-400 hover:underline"
                  >
                    Reply
                  </button>
                </div>
                {(c.author_id === currentUser.id || post.author_id === currentUser.id) && (
                  <button
                    type="button"
                    onClick={() => onDeleteComment(c.id, post.id)}
                    className="text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!post.comments_disabled && (
          <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-900">
            {replyTo && (
              <div className="flex items-center justify-between text-[11px] text-[#0095F6] mb-1">
                <span>Replying to @{replyTo.username}</span>
                <button type="button" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    onAddComment(post, commentText, replyTo?.id || null);
                    setCommentText('');
                    setReplyTo(null);
                  }
                }}
                placeholder="Add a comment..."
                className="flex-1 bg-transparent text-xs focus:outline-none"
              />
              <button
                type="button"
                disabled={!commentText.trim()}
                onClick={() => {
                  onAddComment(post, commentText, replyTo?.id || null);
                  setCommentText('');
                  setReplyTo(null);
                }}
                className="text-xs font-bold text-[#0095F6] disabled:opacity-40"
              >
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
