import { createClient } from '@/lib/supabase/client';
import { formatSupabaseError } from './storageService';
import type { CallSession, CallParticipant, Profile } from '@/types/database';

export const callService = {
  async startCall(params: {
    initiatorId: string;
    conversationId?: string | null;
    recipientIds: string[];
    callType: 'voice' | 'video';
    isGroup?: boolean;
  }): Promise<CallSession> {
    const supabase = createClient();
    const roomId = `vg_room_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const { data: callRow, error: callErr } = await supabase
      .from('calls')
      .insert({
        conversation_id: params.conversationId || null,
        initiator_id: params.initiatorId,
        room_id: roomId,
        call_type: params.callType,
        is_group: Boolean(params.isGroup || params.recipientIds.length > 1),
        status: 'ringing',
      })
      .select('*, initiator:profiles!calls_initiator_id_fkey(*)')
      .single();

    if (callErr || !callRow) {
      throw formatSupabaseError(
        callErr,
        'Starting call failed. Run 005_vistagram_ultimate_v3.sql in Supabase SQL Editor.'
      );
    }

    const participantPayloads = [
      {
        call_id: callRow.id,
        user_id: params.initiatorId,
        role: 'host',
        state: 'joined',
        mic_muted: false,
        camera_enabled: params.callType === 'video',
        joined_at: new Date().toISOString(),
      },
      ...Array.from(new Set(params.recipientIds))
        .filter((uid) => uid !== params.initiatorId)
        .map((uid) => ({
          call_id: callRow.id,
          user_id: uid,
          role: 'participant',
          state: 'ringing',
          mic_muted: false,
          camera_enabled: params.callType === 'video',
        })),
    ];

    await supabase.from('call_participants').insert(participantPayloads);
    await supabase.from('call_events').insert({
      call_id: callRow.id,
      actor_id: params.initiatorId,
      event_type: 'call_started',
      metadata: { call_type: params.callType, recipients: params.recipientIds },
    });

    // Notify recipients via notifications table
    for (const rid of params.recipientIds) {
      if (rid !== params.initiatorId) {
        await supabase.from('notifications').insert({
          recipient_id: rid,
          actor_id: params.initiatorId,
          type: 'message',
          conversation_id: params.conversationId || null,
        });
      }
    }

    return callRow as unknown as CallSession;
  },

  async respondToCall(
    callId: string,
    userId: string,
    decision: 'accept' | 'decline' | 'busy'
  ): Promise<CallSession | null> {
    const supabase = createClient();
    const nowIso = new Date().toISOString();

    if (decision === 'accept') {
      await supabase
        .from('call_participants')
        .update({ state: 'joined', joined_at: nowIso })
        .match({ call_id: callId, user_id: userId });

      const { data: updatedCall } = await supabase
        .from('calls')
        .update({ status: 'accepted', accepted_at: nowIso })
        .eq('id', callId)
        .select('*, initiator:profiles!calls_initiator_id_fkey(*)')
        .maybeSingle();

      await supabase.from('call_events').insert({
        call_id: callId,
        actor_id: userId,
        event_type: 'call_accepted',
      });

      return (updatedCall as unknown as CallSession) || null;
    } else {
      const nextParticipantState = decision === 'busy' ? 'busy' : 'declined';
      const nextCallStatus = decision === 'busy' ? 'busy' : 'declined';

      await supabase
        .from('call_participants')
        .update({ state: nextParticipantState, left_at: nowIso })
        .match({ call_id: callId, user_id: userId });

      const { data: updatedCall } = await supabase
        .from('calls')
        .update({
          status: nextCallStatus,
          ended_at: nowIso,
          end_reason: decision,
        })
        .eq('id', callId)
        .select('*, initiator:profiles!calls_initiator_id_fkey(*)')
        .maybeSingle();

      await supabase.from('call_events').insert({
        call_id: callId,
        actor_id: userId,
        event_type: `call_${decision}`,
      });

      return (updatedCall as unknown as CallSession) || null;
    }
  },

  async endCall(
    callId: string,
    userId: string,
    reason: 'completed' | 'cancelled' | 'missed' = 'completed'
  ): Promise<CallSession | null> {
    const supabase = createClient();
    const now = new Date();
    const nowIso = now.toISOString();

    const { data: existing } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    let durationSeconds = 0;
    let finalStatus: CallSession['status'] = 'ended';

    if (existing) {
      if (existing.accepted_at) {
        durationSeconds = Math.max(
          1,
          Math.round((now.getTime() - new Date(existing.accepted_at).getTime()) / 1000)
        );
        finalStatus = 'ended';
      } else {
        finalStatus = reason === 'missed' ? 'missed' : 'cancelled';
      }
    }

    await supabase
      .from('call_participants')
      .update({ state: 'left', left_at: nowIso })
      .match({ call_id: callId, user_id: userId });

    const { data: updated } = await supabase
      .from('calls')
      .update({
        status: finalStatus,
        ended_at: nowIso,
        duration_seconds: durationSeconds,
        end_reason: reason,
      })
      .eq('id', callId)
      .select('*, initiator:profiles!calls_initiator_id_fkey(*)')
      .maybeSingle();

    await supabase.from('call_events').insert({
      call_id: callId,
      actor_id: userId,
      event_type: 'call_ended',
      metadata: { duration_seconds: durationSeconds, reason },
    });

    return (updated as unknown as CallSession) || null;
  },

  async updateParticipantMediaState(
    callId: string,
    userId: string,
    patch: { mic_muted?: boolean; camera_enabled?: boolean }
  ) {
    const supabase = createClient();
    await supabase
      .from('call_participants')
      .update(patch)
      .match({ call_id: callId, user_id: userId });
  },

  async requestLiveKitToken(callId: string): Promise<{
    configured: boolean;
    wsUrl?: string;
    token?: string;
    roomId?: string;
    error?: string;
  }> {
    const res = await fetch('/api/calls/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 503) {
      throw new Error(data.error || 'Failed to authorize call token');
    }
    return data;
  },

  async fetchCallHistory(userId: string): Promise<CallSession[]> {
    try {
      const supabase = createClient();
      const { data: myPartRows } = await supabase
        .from('call_participants')
        .select('call_id')
        .eq('user_id', userId);

      const callIds = Array.from(
        new Set(((myPartRows || []) as Array<{ call_id: string }>).map((r) => r.call_id))
      );

      if (callIds.length === 0) return [];

      const { data: calls } = await supabase
        .from('calls')
        .select(
          `
          *,
          initiator:profiles!calls_initiator_id_fkey(*),
          participants:call_participants(*, profile:profiles!call_participants_user_id_fkey(*))
        `
        )
        .in('id', callIds)
        .order('created_at', { ascending: false })
        .limit(25);

      return (calls || []) as unknown as CallSession[];
    } catch {
      return [];
    }
  },

  subscribeToIncomingCalls(
    userId: string,
    onIncomingCall: (call: CallSession) => void,
    onCallUpdated: (call: CallSession) => void
  ) {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:calls:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_participants',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as CallParticipant;
          if (row.role === 'host') return;
          const { data: callData } = await supabase
            .from('calls')
            .select('*, initiator:profiles!calls_initiator_id_fkey(*)')
            .eq('id', row.call_id)
            .maybeSingle();
          if (callData && callData.status === 'ringing') {
            onIncomingCall(callData as unknown as CallSession);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
        },
        async (payload) => {
          const updated = payload.new as CallSession;
          const { data: initiator } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', updated.initiator_id)
            .maybeSingle();
          onCallUpdated({
            ...updated,
            initiator: (initiator as Profile | null) || undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
