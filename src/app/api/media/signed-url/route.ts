import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bucket, paths } = (await request.json()) as {
      bucket: 'post-media' | 'stories' | 'reels' | 'dm-attachments';
      paths: string[];
    };

    if (!bucket || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ signedUrls: {} });
    }

    // Because `storage.objects` has RLS policies enforcing `public.can_view_account`
    // and `conversation_members`, calling `createSignedUrls` with the user-scoped
    // server client automatically verifies authorization for every path!
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, 3600); // 1 hour signed URL expiry

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const signedUrls: Record<string, string> = {};
    for (const item of data || []) {
      if (item.path && item.signedUrl) {
        signedUrls[item.path] = item.signedUrl;
      }
    }

    return NextResponse.json({ signedUrls });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : undefined) || 'Failed to sign media URLs' },
      { status: 500 }
    );
  }
}
