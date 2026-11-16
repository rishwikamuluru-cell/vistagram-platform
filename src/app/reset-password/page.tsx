'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.updatePassword(newPassword);
      setSuccess(true);
      setTimeout(() => router.push('/'), 1500);
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : undefined) || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8">
        <div className="flex items-center gap-2.5 mb-4">
          <KeyRound className="w-6 h-6 text-[#0095F6]" />
          <h1 className="text-xl font-bold">Set a New Password</h1>
        </div>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 text-red-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
        {success ? (
          <div className="p-4 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Password updated! Redirecting to your feed...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New strong password (min 8 chars)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#0095F6] text-white font-semibold text-sm"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
