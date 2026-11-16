import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { signUpSchema, loginSchema, passwordSchema } from '@/lib/validations/schemas';
import type { Profile } from '@/types/database';

function buildSynthesizedProfile(user: User): Profile {
  const fallbackUsername =
    user.user_metadata?.username ||
    `${(user.email || 'user').split('@')[0].replace(/[^a-zA-Z0-9._]/g, '').toLowerCase()}_${user.id.slice(0, 4)}`;
  const fallbackDisplayName =
    user.user_metadata?.display_name || fallbackUsername;

  return {
    id: user.id,
    username: fallbackUsername,
    display_name: fallbackDisplayName,
    bio: '',
    website: '',
    avatar_url: user.user_metadata?.avatar_url || '',
    is_private: false,
    is_verified: false,
    posts_count: 0,
    followers_count: 0,
    following_count: 0,
    last_seen_at: new Date().toISOString(),
    created_at: user.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export const authService = {
  async getCurrentSessionAndProfile(): Promise<{ user: User | null; profile: Profile | null }> {
    const supabase = createClient();

    let user: User | null = null;
    const { data: userData } = await supabase.auth.getUser();
    user = userData?.user || null;

    if (!user) {
      const { data: sessionData } = await supabase.auth.getSession();
      user = sessionData?.session?.user || null;
    }

    if (!user) {
      return { user: null, profile: null };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profile) {
      return { user, profile: profile as Profile };
    }

    // Fallback: create profile row if trigger did not run yet
    const synthesized = buildSynthesizedProfile(user);
    const { data: createdProfile } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        username: synthesized.username,
        display_name: synthesized.display_name,
        avatar_url: synthesized.avatar_url,
      })
      .select('*')
      .maybeSingle();

    try {
      await supabase.from('user_settings').upsert({ user_id: user.id });
      await supabase
        .from('collections')
        .upsert({ user_id: user.id, name: 'All Saved Posts' }, { onConflict: 'user_id,name' });
    } catch {
      // Ignore if optional tables are still initializing
    }

    // Guarantee a non-null Profile whenever `user` is authenticated so the UI never loops on the login screen
    return {
      user,
      profile: (createdProfile as Profile | null) || synthesized,
    };
  },

  async signUp(input: unknown) {
    const parsed = signUpSchema.parse(input);
    const supabase = createClient();
    const cleanUsername = parsed.username.toLowerCase();

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      throw new Error('That username is already taken. Please choose another handle.');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email.trim().toLowerCase(),
      password: parsed.password,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
        data: {
          username: cleanUsername,
          display_name: parsed.displayName.trim(),
        },
      },
    });

    if (error) throw error;

    // If Confirm Email is enabled in Supabase and session wasn't immediately returned,
    // attempt server-side auto-confirmation via /api/auth/login so user can log in right away
    if (!data.session) {
      try {
        await this.signIn({
          identifier: parsed.email.trim().toLowerCase(),
          password: parsed.password,
        });
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session) {
          return { user: data.user, session: currentSession.session };
        }
      } catch {
        // Fall through to standard email notice if server service_role is not configured
      }
    }

    return data;
  },

  async signIn(input: unknown) {
    const parsed = loginSchema.parse(input);
    const supabase = createClient();
    const identifier = parsed.identifier.trim();

    // 1. Call server login endpoint (handles username resolution + auto-confirm + profile upsert)
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });

    const result = await response.json();

    if (response.ok && result.session?.access_token && result.session?.refresh_token) {
      await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      return result;
    }

    // 2. Fallback: if user typed an email address, also try direct browser signInWithPassword
    if (identifier.includes('@')) {
      const { data: directData, error: directErr } = await supabase.auth.signInWithPassword({
        email: identifier,
        password: parsed.password,
      });
      if (!directErr && directData.user && directData.session) {
        return {
          user: { id: directData.user.id, email: directData.user.email },
          session: {
            access_token: directData.session.access_token,
            refresh_token: directData.session.refresh_token,
          },
        };
      }
    }

    throw new Error(result.error || 'Invalid username/email or password');
  },

  async signInWithGoogle() {
    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl}/auth/callback`,
      },
    });
    if (error) throw error;
    return data;
  },

  async resetPasswordForEmail(email: string) {
    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${appUrl}/reset-password`,
    });
    if (error) throw error;
  },

  async updatePassword(newPassword: string) {
    const validPassword = passwordSchema.parse(newPassword);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: validPassword });
    if (error) throw error;
  },

  async signOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async deleteOwnAccount() {
    const res = await fetch('/api/account/delete', { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || 'Failed to delete account');
    }
    return body;
  },
};
