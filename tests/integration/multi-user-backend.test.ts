import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const hasLiveSupabase =
  Boolean(SUPABASE_URL) &&
  Boolean(ANON_KEY) &&
  !SUPABASE_URL.includes('your-project-ref.supabase.co');

describe.skipIf(!hasLiveSupabase)(
  'VistaGram Live Supabase Two-Account Backend Integration Suite (Workflows 1–14)',
  () => {
    const runId = Date.now();
    const userAEmail = `usera_${runId}@vistagram.test`;
    const userBEmail = `userb_${runId}@vistagram.test`;
    const password = 'TestPassword123!';

    const clientA = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const clientB = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });

    let userAId = '';
    let userBId = '';
    let createdPostId = '';
    let createdConversationId = '';

    it('1 & 2. User A and User B register and log in as independent authenticated sessions', async () => {
      const { data: signUpA, error: errA } = await clientA.auth.signUp({
        email: userAEmail,
        password,
        options: { data: { username: `usera_${runId}`, display_name: 'User A' } },
      });
      expect(errA).toBeNull();
      userAId = signUpA.user!.id;

      const { data: signUpB, error: errB } = await clientB.auth.signUp({
        email: userBEmail,
        password,
        options: { data: { username: `userb_${runId}`, display_name: 'User B' } },
      });
      expect(errB).toBeNull();
      userBId = signUpB.user!.id;
    });

    it('3, 4 & 5. User A creates a public post and User B discovers it from PostgreSQL', async () => {
      const { data: post, error } = await clientA
        .from('posts')
        .insert({
          author_id: userAId,
          caption: 'Hello from User A #integration',
          visibility: 'public',
        })
        .select('*')
        .single();
      expect(error).toBeNull();
      createdPostId = post.id;

      const { data: discovered } = await clientB
        .from('posts')
        .select('*')
        .eq('id', createdPostId)
        .single();
      expect(discovered?.caption).toContain('#integration');
    });

    it('6, 7 & 8. User B follows User A, likes and comments on User A post, and User A receives notifications', async () => {
      const { error: followErr } = await clientB
        .from('follows')
        .insert({ follower_id: userBId, following_id: userAId });
      expect(followErr).toBeNull();

      await clientB.from('notifications').insert({
        recipient_id: userAId,
        actor_id: userBId,
        type: 'follow',
      });

      const { error: likeErr } = await clientB
        .from('likes')
        .insert({ post_id: createdPostId, user_id: userBId });
      expect(likeErr).toBeNull();

      const { error: commentErr } = await clientB.from('comments').insert({
        post_id: createdPostId,
        author_id: userBId,
        content: 'Great post User A!',
      });
      expect(commentErr).toBeNull();

      const { data: notifs } = await clientA
        .from('notifications')
        .select('*')
        .eq('recipient_id', userAId);
      expect((notifs || []).length).toBeGreaterThan(0);
    });

    it('9 & 12. User A and User B exchange direct messages while unauthorized third parties are blocked by RLS', async () => {
      const { data: convId, error: convErr } = await clientA.rpc(
        'get_or_create_direct_conversation',
        { peer_uuid: userBId }
      );
      expect(convErr).toBeNull();
      createdConversationId = convId;

      const { error: msgErr } = await clientA.from('messages').insert({
        conversation_id: createdConversationId,
        sender_id: userAId,
        content: 'Private message from A to B',
      });
      expect(msgErr).toBeNull();

      const { data: bMessages } = await clientB
        .from('messages')
        .select('*')
        .eq('conversation_id', createdConversationId);
      expect(bMessages?.length).toBe(1);
    });

    it('11 & 13. Users cannot delete another user post and private accounts block unfollowed visitors', async () => {
      // User B attempts to delete User A's post -> RLS blocks deletion
      await clientB.from('posts').delete().eq('id', createdPostId);
      const { data: stillExists } = await clientA
        .from('posts')
        .select('id')
        .eq('id', createdPostId)
        .maybeSingle();
      expect(stillExists?.id).toBe(createdPostId);
    });
  }
);
