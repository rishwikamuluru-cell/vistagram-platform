'use client';

import React from 'react';

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return `${Math.floor(diffDay / 7)}w`;
}

export function Avatar({
  url,
  username,
  size = 'md',
}: {
  url?: string;
  username: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-14 h-14 text-base'
      : size === 'xl'
      ? 'w-28 h-28 text-2xl'
      : 'w-10 h-10 text-sm';

  if (url) {
    return (
      <img
        src={url}
        alt={username}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-zinc-200 dark:border-zinc-800`}
      />
    );
  }

  const initials = (username || 'U').slice(0, 2).toUpperCase();
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-tr from-[#E1306C] via-[#F77737] to-[#833AB4] text-white font-bold flex items-center justify-center shrink-0`}
    >
      {initials}
    </div>
  );
}
