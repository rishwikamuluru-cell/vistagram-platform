'use client';

import React from 'react';
import type { NotificationItem, FollowRequestRecord } from '@/types/database';
import { Avatar, formatRelativeTime } from '@/components/common/Avatar';

export function NotificationsModule({
  notifications,
  followRequests,
  onMarkRead,
  onMarkAllRead,
  onRespondFollowRequest,
  onSelectProfile,
}: {
  notifications: NotificationItem[];
  followRequests: FollowRequestRecord[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRespondFollowRequest: (requestId: string, accept: boolean) => void;
  onSelectProfile: (userId: string) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
      {followRequests.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-3">
            Incoming Follow Requests ({followRequests.length})
          </h3>
          <div className="space-y-2.5">
            {followRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => req.requester && onSelectProfile(req.requester.id)}
                  className="flex items-center gap-2.5 font-bold"
                >
                  <Avatar
                    url={req.requester?.avatar_url}
                    username={req.requester?.username || 'user'}
                    size="sm"
                  />
                  <span>@{req.requester?.username}</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRespondFollowRequest(req.id, true)}
                    className="px-3 py-1 rounded-lg bg-[#0095F6] text-white font-semibold"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondFollowRequest(req.id, false)}
                    className="px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 font-semibold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Notifications</h2>
            <p className="text-xs text-zinc-500">Live updates via Supabase Realtime</p>
          </div>
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-xs font-bold text-[#0095F6] hover:underline"
          >
            Mark all as read
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="p-10 text-center border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-500">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  onMarkRead(n.id);
                  if (n.actor_id) onSelectProfile(n.actor_id);
                }}
                className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition ${
                  n.is_read
                    ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950'
                    : 'border-blue-500/40 bg-blue-500/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    url={n.actor?.avatar_url}
                    username={n.actor?.username || 'user'}
                    size="sm"
                  />
                  <div className="text-xs">
                    <span className="font-bold">@{n.actor?.username || 'user'}</span>{' '}
                    {n.type === 'like' && 'liked your post.'}
                    {n.type === 'comment' && 'commented on your post.'}
                    {n.type === 'reply' && 'replied to your comment.'}
                    {n.type === 'mention' && 'mentioned you in a post.'}
                    {n.type === 'follow' && 'started following you.'}
                    {n.type === 'follow_request' && 'requested to follow you.'}
                    {n.type === 'follow_accepted' && 'accepted your follow request.'}
                    {n.type === 'message' && 'sent you a direct message.'}
                    <span className="text-zinc-400 ml-2">{formatRelativeTime(n.created_at)}</span>
                  </div>
                </div>
                {!n.is_read && <span className="w-2.5 h-2.5 rounded-full bg-[#0095F6]" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
