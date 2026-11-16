'use client';

import React, { useState } from 'react';
import { Sparkles, AlertCircle, CheckCircle2, Database } from 'lucide-react';
import { authService } from '@/services/authService';
import { getSupabasePublicConfig } from '@/lib/supabase/client';

export function AuthView({
  initialMode = 'login',
  onAuthenticated,
}: {
  initialMode?: 'login' | 'signup' | 'reset';
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const { isConfigured } = getSupabasePublicConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await authService.signIn({ identifier, password });
        onAuthenticated();
      } else if (mode === 'signup') {
        const res = await authService.signUp({
          email,
          username,
          displayName,
          password,
        });
        if (res.session) {
          onAuthenticated();
        } else {
          setNotice(
            'Account created! Please check your email inbox to click the verification link before signing in.'
          );
          setMode('login');
        }
      } else if (mode === 'reset') {
        await authService.resetPasswordForEmail(email);
        setNotice('Password recovery link sent! Check your email inbox.');
      }
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : undefined) || 'Authentication request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-700 flex items-center justify-center text-white shadow-md mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VistaGram</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Sign in with your Supabase account
          </p>
        </div>

        {!isConfigured && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Database className="w-4 h-4 shrink-0" />
              <span>Supabase Environment Variables Required</span>
            </div>
            <p>
              Copy <code>.env.example</code> to <code>.env.local</code> and add your{' '}
              <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>,
              and <code>SUPABASE_SERVICE_ROLE_KEY</code> per <code>SETUP.md</code>.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'login' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Username or Email
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username or email@example.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !isConfigured}
                className="w-full py-2.5 rounded-lg bg-[#0095F6] hover:bg-[#1877F2] disabled:opacity-50 text-white font-semibold text-sm transition"
              >
                {loading ? 'Signing in...' : 'Log In'}
              </button>
            </>
          )}

          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Full Name"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username_handle"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Password (min 8 chars, uppercase, lowercase, number)
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="StrongPass123"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !isConfigured}
                className="w-full py-2.5 rounded-lg bg-[#0095F6] hover:bg-[#1877F2] disabled:opacity-50 text-white font-semibold text-sm transition"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-600 dark:text-zinc-400">
                  Registered Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !isConfigured}
                className="w-full py-2.5 rounded-lg bg-[#0095F6] hover:bg-[#1877F2] disabled:opacity-50 text-white font-semibold text-sm transition"
              >
                {loading ? 'Sending...' : 'Send Password Recovery Email'}
              </button>
            </>
          )}
        </form>

        {process.env.NEXT_PUBLIC_ENABLE_GOOGLE_OAUTH === 'true' && mode !== 'reset' && (
          <button
            type="button"
            onClick={() => authService.signInWithGoogle()}
            className="w-full mt-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
          >
            Continue with Google
          </button>
        )}

        <div className="mt-5 flex justify-between text-xs text-[#0095F6]">
          {mode !== 'login' ? (
            <button type="button" onClick={() => setMode('login')} className="hover:underline">
              Back to Log In
            </button>
          ) : (
            <button type="button" onClick={() => setMode('reset')} className="hover:underline">
              Forgot password?
            </button>
          )}
          {mode !== 'signup' && (
            <button type="button" onClick={() => setMode('signup')} className="font-semibold hover:underline">
              Sign up for VistaGram
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
