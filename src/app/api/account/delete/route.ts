import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminServiceClient } from '@/lib/supabase/server';

export async function DELETE() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminServiceClient();
    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Server error') || 'Server error' }, { status: 500 });
  }
}
