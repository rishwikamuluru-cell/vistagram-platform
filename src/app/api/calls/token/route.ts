import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates an RFC-7519 compliant LiveKit Access Token (JWT HS256) strictly on the server
 * so LIVEKIT_API_SECRET is never exposed to client-side code.
 */
function signLiveKitAccessToken(params: {
  apiKey: string;
  apiSecret: string;
  participantIdentity: string;
  participantName: string;
  roomName: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (params.ttlSeconds ?? 3600);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: params.apiKey,
    sub: params.participantIdentity,
    name: params.participantName,
    nbf: now - 5,
    exp,
    jti: `${params.participantIdentity}_${now}`,
    video: {
      roomJoin: true,
      room: params.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', params.apiSecret).update(signingInput).digest()
  );

  return `${signingInput}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the real authenticated Supabase user
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Authentication required to request a call token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const callId = typeof body?.callId === 'string' ? body.callId.trim() : '';

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    // 2. Verify the call exists in PostgreSQL
    const { data: callRow, error: callErr } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    if (callErr || !callRow) {
      return NextResponse.json({ error: 'Call session not found' }, { status: 404 });
    }

    // 3. Check call status (reject ended, declined, cancelled, or failed calls)
    if (['ended', 'declined', 'cancelled', 'failed', 'missed'].includes(callRow.status)) {
      return NextResponse.json(
        { error: `Call is no longer active (status: ${callRow.status})` },
        { status: 409 }
      );
    }

    // 4. Verify the authenticated user is an authorized participant
    const { data: participantRow } = await supabase
      .from('call_participants')
      .select('id, role, state')
      .match({ call_id: callId, user_id: user.id })
      .maybeSingle();

    let isAuthorized = Boolean(participantRow) || callRow.initiator_id === user.id;

    if (!isAuthorized && callRow.conversation_id) {
      const { data: convMember } = await supabase
        .from('conversation_members')
        .select('user_id')
        .match({ conversation_id: callRow.conversation_id, user_id: user.id })
        .maybeSingle();
      isAuthorized = Boolean(convMember);
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: you are not an authorized participant of this call' },
        { status: 403 }
      );
    }

    // Fetch display handle (opaque UUID is used as LiveKit identity; never email/phone)
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();

    const livekitUrl = (process.env.NEXT_PUBLIC_LIVEKIT_URL || '').trim().replace(/^["']|["']$/g, '');
    const apiKey = (process.env.LIVEKIT_API_KEY || '').trim().replace(/^["']|["']$/g, '');
    const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim().replace(/^["']|["']$/g, '');

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        {
          configured: false,
          roomId: callRow.room_id,
          participantIdentity: user.id,
          error:
            'LiveKit Cloud credentials (NEXT_PUBLIC_LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) are not yet configured in environment variables.',
        },
        { status: 503 }
      );
    }

    // 5. Generate restricted short-lived LiveKit access token
    const token = signLiveKitAccessToken({
      apiKey,
      apiSecret,
      participantIdentity: user.id,
      participantName: profile?.username || user.id.slice(0, 8),
      roomName: callRow.room_id,
      ttlSeconds: 3600,
    });

    // 6. Return only the required client connection details
    return NextResponse.json({
      configured: true,
      wsUrl: livekitUrl,
      token,
      roomId: callRow.room_id,
      callId: callRow.id,
      callType: callRow.call_type,
      participantIdentity: user.id,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : undefined) || 'Failed to issue call token' },
      { status: 500 }
    );
  }
}
