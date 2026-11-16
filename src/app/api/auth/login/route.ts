import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminServiceClient } from '@/lib/supabase/server';
import { loginSchema } from '@/lib/validations/schemas';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'local';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a minute and try again.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.parse(body);
    let email = parsed.identifier.trim();

    if (!email.includes('@')) {
      try {
        const adminClient = createAdminServiceClient();
        const { data: resolvedEmail, error: rpcErr } = await adminClient.rpc(
          'get_email_by_username',
          { uname: email.toLowerCase() }
        );

        if (!rpcErr && resolvedEmail) {
          email = resolvedEmail;
        } else {
          const { data: profileRow } = await adminClient
            .from('profiles')
            .select('id')
            .ilike('username', email.toLowerCase())
            .maybeSingle();

          if (profileRow?.id) {
            const { data: userData } = await adminClient.auth.admin.getUserById(profileRow.id);
            if (userData?.user?.email) {
              email = userData.user.email;
            } else {
              return NextResponse.json(
                { error: 'Invalid username/email or password' },
                { status: 401 }
              );
            }
          } else {
            return NextResponse.json(
              { error: 'Invalid username/email or password' },
              { status: 401 }
            );
          }
        }
      } catch {
        return NextResponse.json(
          { error: 'Please sign in using your email address.' },
          { status: 401 }
        );
      }
    }

    const supabase = createServerSupabaseClient();
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.password,
    });

    if (error && error.message?.toLowerCase().includes('email not confirmed')) {
      try {
        const adminClient = createAdminServiceClient();
        const { data: listData } = await adminClient.auth.admin.listUsers();
        const target = listData?.users?.find(
          (u: { id: string; email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (target) {
          await adminClient.auth.admin.updateUserById(target.id, { email_confirm: true });
          const retry = await supabase.auth.signInWithPassword({
            email,
            password: parsed.password,
          });
          data = retry.data;
          error = retry.error;
        }
      } catch {
        return NextResponse.json(
          { error: 'Email not confirmed. Turn OFF "Confirm email" in Supabase Auth Providers.' },
          { status: 401 }
        );
      }
    }

    if (error || !data.user || !data.session) {
      return NextResponse.json(
        { error: error?.message || 'Invalid username/email or password' },
        { status: 401 }
      );
    }

    // Ensure profile row exists in PostgreSQL using service_role so RLS or missing triggers never cause a login loop
    let ensuredProfile = null;
    try {
      const adminClient = createAdminServiceClient();
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (existingProfile) {
        ensuredProfile = existingProfile;
      } else {
        const fallbackUsername =
          data.user.user_metadata?.username ||
          `${(data.user.email || 'user').split('@')[0].replace(/[^a-zA-Z0-9._]/g, '').toLowerCase()}_${data.user.id.slice(0, 4)}`;
        const fallbackDisplayName =
          data.user.user_metadata?.display_name || fallbackUsername;

        const { data: createdProfile } = await adminClient
          .from('profiles')
          .upsert({
            id: data.user.id,
            username: fallbackUsername,
            display_name: fallbackDisplayName,
            avatar_url: data.user.user_metadata?.avatar_url || '',
          })
          .select('*')
          .single();
        ensuredProfile = createdProfile;
      }
    } catch {
      // Non-fatal if service_role is not configured
    }

    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      profile: ensuredProfile,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : undefined) || 'Authentication failed' },
      { status: 400 }
    );
  }
}
