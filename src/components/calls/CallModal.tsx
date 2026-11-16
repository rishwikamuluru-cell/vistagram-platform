'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  Minimize2,
  Maximize2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type { CallSession, Profile } from '@/types/database';
import { callService } from '@/services/callService';
import { Avatar } from '@/components/common/Avatar';

export function IncomingCallBanner({
  call,
  onAccept,
  onDecline,
}: {
  call: CallSession;
  onAccept: (call: CallSession) => Promise<void>;
  onDecline: (call: CallSession) => Promise<void>;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 w-80 bg-zinc-900 text-white border border-zinc-700 rounded-2xl p-4 shadow-2xl animate-bounce">
      <div className="flex items-center gap-3 mb-3">
        <Avatar
          url={call.initiator?.avatar_url}
          username={call.initiator?.username || 'caller'}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate">
            @{call.initiator?.username || 'Incoming Caller'}
          </p>
          <p className="text-[11px] text-emerald-400">
            Incoming {call.call_type === 'video' ? 'Video' : 'Voice'} Call...
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDecline(call)}
          className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          <span>Decline</span>
        </button>
        <button
          type="button"
          onClick={() => onAccept(call)}
          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold flex items-center justify-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Accept</span>
        </button>
      </div>
    </div>
  );
}

export function ActiveCallModal({
  call,
  currentUser,
  onEndCall,
}: {
  call: CallSession;
  currentUser: Profile;
  onEndCall: (call: CallSession) => Promise<void>;
}) {
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(call.call_type === 'video');
  const [screenSharing, setScreenSharing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [livekitState, setLivekitState] = useState<{
    configured: boolean;
    roomId?: string;
    wsUrl?: string;
    error?: string;
  } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // 1. Request server-side LiveKit token via POST /api/calls/token
  useEffect(() => {
    let active = true;
    callService
      .requestLiveKitToken(call.id)
      .then((res) => {
        if (active) setLivekitState(res);
      })
      .catch((err: unknown) => {
        if (active) {
          setLivekitState({
            configured: false,
            error: err instanceof Error ? err.message : 'Token authorization failed',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [call.id]);

  // 2. Acquire real browser Camera / Microphone stream
  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: call.call_type === 'video',
      })
      .then((stream) => {
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setMediaError(
            err instanceof Error
              ? err.message
              : 'Camera/Microphone permission was denied by the browser.'
          );
        }
      });

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [call.call_type]);

  // 3. Call Duration Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMic = async () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
    await callService.updateParticipantMediaState(call.id, currentUser.id, {
      mic_muted: nextMuted,
    });
  };

  const toggleCamera = async () => {
    const nextCam = !cameraOn;
    setCameraOn(nextCam);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = nextCam;
      });
    }
    await callService.updateParticipantMediaState(call.id, currentUser.id, {
      camera_enabled: nextCam,
    });
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      setScreenSharing(false);
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenSharing(true);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = displayStream;
      }
      displayStream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
      };
    } catch {
      // User cancelled screen share picker
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (minimized) {
    return (
      <div className="fixed bottom-16 right-4 z-50 w-64 bg-zinc-900 text-white border border-zinc-700 rounded-2xl p-3 shadow-2xl flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">Active {call.call_type} call</p>
          <p className="text-[11px] text-emerald-400">{formatTimer(elapsedSeconds)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEndCall(call)}
            className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden text-white shadow-2xl flex flex-col">
        {/* Call Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-xs font-bold">
                VistaGram {call.is_group ? 'Group' : '1-to-1'}{' '}
                {call.call_type === 'video' ? 'Video' : 'Voice'} Call
              </p>
              <p className="text-[11px] text-zinc-400">
                Room: {call.room_id} · Status: {call.status} · {formatTimer(elapsedSeconds)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400"
            title="Minimize to Picture-in-Picture bar"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Video / Avatar Stage */}
        <div className="relative h-80 sm:h-96 bg-zinc-900 flex items-center justify-center overflow-hidden">
          {call.call_type === 'video' && cameraOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Avatar
                url={currentUser.avatar_url}
                username={currentUser.username}
                size="xl"
              />
              <p className="text-sm font-bold">@{currentUser.username}</p>
              <span className="px-3 py-1 rounded-full bg-zinc-800 text-emerald-400 text-xs font-semibold">
                {call.status === 'accepted' ? 'Connected' : 'Ringing participant...'}
              </span>
            </div>
          )}

          {/* Status & Configuration Banner */}
          <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5">
            {mediaError && (
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[11px] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mediaError}</span>
              </div>
            )}
            {livekitState && !livekitState.configured && (
              <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700 text-zinc-300 text-[11px]">
                <strong>LiveKit Signaling Ready:</strong> Call state & PostgreSQL history are active. To stream multi-device WebRTC relays via LiveKit Cloud, add{' '}
                <code>NEXT_PUBLIC_LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code>, and{' '}
                <code>LIVEKIT_API_SECRET</code> in <code>.env.local</code> / Vercel.
              </div>
            )}
          </div>
        </div>

        {/* Call Control Bar */}
        <div className="p-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={toggleMic}
            className={`p-3.5 rounded-full transition ${
              micMuted ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
            }`}
            title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {call.call_type === 'video' && (
            <button
              type="button"
              onClick={toggleCamera}
              className={`p-3.5 rounded-full transition ${
                !cameraOn ? 'bg-red-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
              }`}
              title={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
              {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-full transition ${
              screenSharing
                ? 'bg-[#0095F6] text-white'
                : 'bg-zinc-800 hover:bg-zinc-700 text-white'
            }`}
            title="Share Screen"
          >
            <Monitor className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onEndCall(call)}
            className="px-6 py-3.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-2 transition"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
