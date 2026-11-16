'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Image as ImageIcon,
  Plus,
  Users,
  Pin,
  BellOff,
  Reply,
  ChevronLeft,
  X,
  CheckCheck,
  Trash2,
  Phone,
  Video,
  Mic,
  Square,
  Edit3,
  Search,
} from 'lucide-react';
import type { Profile, Conversation, Message } from '@/types/database';
import { messageAndStoryService } from '@/services/messageAndStoryService';
import { socialService } from '@/services/socialService';
import { Avatar, formatRelativeTime } from '@/components/common/Avatar';

const QUICK_REACTIONS = ['❤️', '🔥', '👏', '😂', '😮'];

export function MessagingModule({
  currentUser,
  conversations,
  suggestedProfiles,
  activeConversationId,
  onSelectConversation,
  onStartDirectChat,
  onCreateGroupChat,
  onSelectProfile,
  onConversationsUpdated,
  onStartCall,
}: {
  currentUser: Profile;
  conversations: Conversation[];
  suggestedProfiles: Profile[];
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onStartDirectChat: (peer: Profile) => Promise<void>;
  onCreateGroupChat: (title: string, memberIds: string[]) => Promise<void>;
  onSelectProfile: (userId: string) => void;
  onConversationsUpdated: () => Promise<void>;
  onStartCall?: (conv: Conversation, callType: 'voice' | 'video') => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');

  // Voice Note Recording State (MediaRecorder API)
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // New Chat / Group Modal State with Full-Directory Member Search
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [searchedRecipients, setSearchedRecipients] = useState<Profile[]>(suggestedProfiles);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [recipientSearchError, setRecipientSearchError] = useState<string | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId) || null;

  // Debounced full-directory member search inside New Message modal (Part 5 requirement)
  useEffect(() => {
    if (!newChatModalOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingRecipients(true);
      setRecipientSearchError(null);
      try {
        const res = await socialService.searchMembersDirectory(
          recipientQuery,
          currentUser.id,
          30
        );
        if (cancelled) return;
        setSearchedRecipients(
          res.members.filter((m) => m.id !== currentUser.id)
        );
        if (res.error) setRecipientSearchError(res.error);
      } catch (err: unknown) {
        if (!cancelled) {
          setRecipientSearchError(
            (err instanceof Error ? err.message : undefined) || 'Member search failed'
          );
        }
      } finally {
        if (!cancelled) setSearchingRecipients(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newChatModalOpen, recipientQuery, currentUser.id]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    messageAndStoryService
      .fetchMessages(activeConversationId, currentUser.id)
      .then((list) => {
        if (mounted) setMessages(list);
      })
      .catch(() => {});

    const unsubscribe = messageAndStoryService.subscribeToConversationMessages(
      activeConversationId,
      (incoming, eventType) => {
        setMessages((prev) => {
          if (eventType === 'UPDATE') {
            return prev.map((m) => (m.id === incoming.id ? incoming : m));
          }
          if (prev.some((m) => m.id === incoming.id)) return prev;
          return [...prev, incoming];
        });
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [activeConversationId, currentUser.id]);

  // Voice Note timer
  useEffect(() => {
    if (!recordingVoice) return;
    const interval = setInterval(() => {
      setVoiceSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [recordingVoice]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const voiceFile = new File([blob], `voice_${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        if (activeConv && blob.size > 0) {
          setSending(true);
          try {
            const created = await messageAndStoryService.sendMessage(
              currentUser.id,
              activeConv.peer?.id,
              {
                conversationId: activeConv.id,
                content: '🎤 Voice Note',
                attachmentFile: voiceFile,
                voiceDurationSeconds: Math.max(1, voiceSeconds),
              }
            );
            setMessages((prev) =>
              prev.some((m) => m.id === created.id) ? prev : [...prev, created]
            );
            await onConversationsUpdated();
          } finally {
            setSending(false);
            setVoiceSeconds(0);
          }
        }
      };
      mediaRecorderRef.current = recorder;
      setVoiceSeconds(0);
      setRecordingVoice(true);
      recorder.start();
    } catch {
      alert('Microphone permission is required to record a voice note.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecordingVoice(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || (!text.trim() && !attachmentFile)) return;
    setSending(true);
    try {
      if (editingMessage) {
        const updated = await messageAndStoryService.editMessage(
          editingMessage.id,
          currentUser.id,
          text
        );
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setEditingMessage(null);
        setText('');
        return;
      }

      const created = await messageAndStoryService.sendMessage(
        currentUser.id,
        activeConv.peer?.id,
        {
          conversationId: activeConv.id,
          content: text,
          attachmentFile,
          replyToId: replyingTo?.id || null,
        }
      );
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      setText('');
      setAttachmentFile(null);
      setReplyingTo(null);
      await onConversationsUpdated();
    } finally {
      setSending(false);
    }
  };

  const handleReaction = async (msg: Message, emoji: string) => {
    const updatedReactions = await messageAndStoryService.reactToMessage(
      msg.id,
      currentUser.id,
      emoji,
      msg.reactions || {}
    );
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reactions: updatedReactions } : m))
    );
  };

  const handleUnsend = async (msgId: string) => {
    await messageAndStoryService.unsendMessage(msgId, currentUser.id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, content: '', attachment_url: '', is_unsent: true } : m
      )
    );
  };

  const filteredConversations = conversations.filter((c) => {
    if (!inboxSearch.trim()) return true;
    const q = inboxSearch.toLowerCase();
    return (
      (c.title || '').toLowerCase().includes(q) ||
      (c.peer?.username || '').toLowerCase().includes(q) ||
      (c.peer?.display_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-4 pt-0 sm:pt-4">
      <div className="bg-white dark:bg-zinc-950 border-y sm:border border-zinc-200 dark:border-zinc-800 sm:rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100vh-7rem)] sm:h-[78vh]">
        {/* LEFT CONVERSATION INBOX LIST */}
        <div
          className={`md:col-span-4 border-r border-zinc-200 dark:border-zinc-800 flex flex-col ${
            activeConv ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">@{currentUser.username}</h2>
                <p className="text-[11px] text-zinc-500">Direct & Group Messages</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsGroupMode(false);
                  setSelectedUserIds([]);
                  setGroupTitle('');
                  setRecipientQuery('');
                  setNewChatModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0095F6] hover:bg-[#1877F2] text-white text-xs font-bold transition"
                title="Start New Conversation"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Chat</span>
              </button>
            </div>

            {/* Conversation Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inboxSearch}
                onChange={(e) => setInboxSearch(e.target.value)}
                placeholder="Filter inbox conversations..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-zinc-500">
                  No active conversations yet. Search any member or pick a suggested account below:
                </p>
                <div className="space-y-2 text-left">
                  {suggestedProfiles.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => onStartDirectChat(u)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar url={u.avatar_url} username={u.username} size="sm" />
                        <div>
                          <p className="text-xs font-bold">@{u.username}</p>
                          <p className="text-[10px] text-zinc-500">{u.display_name}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[#0095F6]">Message</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full p-3.5 flex items-center gap-3 text-left transition ${
                    activeConversationId === conv.id
                      ? 'bg-zinc-100 dark:bg-zinc-900'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                  }`}
                >
                  <Avatar
                    url={conv.peer?.avatar_url}
                    username={conv.title || conv.peer?.username || 'chat'}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold truncate flex items-center gap-1">
                        {conv.is_group && <Users className="w-3 h-3 text-[#0095F6]" />}
                        <span>{conv.title || `@${conv.peer?.username || 'user'}`}</span>
                        {conv.is_pinned && <Pin className="w-3 h-3 text-amber-500" />}
                        {conv.is_muted && <BellOff className="w-3 h-3 text-zinc-400" />}
                      </p>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {formatRelativeTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {conv.last_message?.is_unsent
                        ? 'Message unsent'
                        : conv.last_message?.content ||
                          (conv.last_message?.attachment_url
                            ? conv.last_message?.attachment_type === 'voice'
                              ? '🎤 Voice note'
                              : '📷 Sent media'
                            : 'Tap to chat')}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#0095F6] text-white text-[10px] font-bold">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT ACTIVE CHAT PANEL */}
        <div
          className={`md:col-span-8 flex flex-col h-full ${
            activeConv ? 'flex' : 'hidden md:flex'
          }`}
        >
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full border-2 border-zinc-300 dark:border-zinc-700 flex items-center justify-center mb-3">
                <MessageCircle className="w-8 h-8 text-zinc-400" />
              </div>
              <h3 className="text-base font-bold">Your VistaGram Messages</h3>
              <p className="text-xs text-zinc-500 max-w-xs mt-1 mb-4">
                Send real-time private messages, voice notes, photos, or start a LiveKit voice/video call with any member.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRecipientQuery('');
                  setNewChatModalOpen(true);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#0095F6] hover:bg-[#1877F2] text-white text-xs font-bold"
              >
                Send Message
              </button>
            </div>
          ) : (
            <>
              {/* Active Chat Header with Voice Call & Video Call Controls */}
              <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSelectConversation(null)}
                    className="md:hidden p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => activeConv.peer && onSelectProfile(activeConv.peer.id)}
                    className="flex items-center gap-2.5 text-left"
                  >
                    <Avatar
                      url={activeConv.peer?.avatar_url}
                      username={activeConv.title || activeConv.peer?.username || 'chat'}
                      size="sm"
                    />
                    <div>
                      <p className="text-xs font-bold">
                        {activeConv.title || `@${activeConv.peer?.username}`}
                      </p>
                      <p className="text-[10px] text-emerald-500">
                        {activeConv.is_group
                          ? `${(activeConv.participants?.length || 0) + 1} members`
                          : 'Active'}
                      </p>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {onStartCall && (
                    <>
                      <button
                        type="button"
                        onClick={() => onStartCall(activeConv, 'voice')}
                        className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-emerald-500 hover:text-white transition"
                        title="Start Voice Call"
                        aria-label="Start Voice Call"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartCall(activeConv, 'video')}
                        className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-[#0095F6] hover:text-white transition"
                        title="Start Video Call"
                        aria-label="Start Video Call"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await messageAndStoryService.toggleConversationFlag(
                        activeConv.id,
                        currentUser.id,
                        'is_pinned',
                        !activeConv.is_pinned
                      );
                      await onConversationsUpdated();
                    }}
                    className={`p-2 rounded-lg text-xs ${
                      activeConv.is_pinned ? 'text-amber-500 bg-amber-500/10' : 'text-zinc-400'
                    }`}
                    title="Pin Conversation"
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await messageAndStoryService.toggleConversationFlag(
                        activeConv.id,
                        currentUser.id,
                        'is_muted',
                        !activeConv.is_muted
                      );
                      await onConversationsUpdated();
                    }}
                    className={`p-2 rounded-lg text-xs ${
                      activeConv.is_muted ? 'text-red-500 bg-red-500/10' : 'text-zinc-400'
                    }`}
                    title="Mute Notifications"
                  >
                    <BellOff className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Message History Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-center text-xs text-zinc-400 py-12">
                    No messages yet. Say hello below!
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === currentUser.id;
                    const repliedMsg = msg.reply_to_id
                      ? messages.find((m) => m.id === msg.reply_to_id)
                      : null;
                    const reactionEntries = Object.entries(msg.reactions || {}).filter(
                      ([, uids]) => uids && uids.length > 0
                    );

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        {repliedMsg && (
                          <div className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1 rounded-t-lg border-l-2 border-[#0095F6] mb-0.5 max-w-xs truncate">
                            Replying to: {repliedMsg.content || 'Media attachment'}
                          </div>
                        )}

                        <div
                          className={`group relative max-w-[78%] sm:max-w-md rounded-2xl px-3.5 py-2.5 text-xs ${
                            msg.is_unsent
                              ? 'italic text-zinc-400 border border-zinc-200 dark:border-zinc-800'
                              : isMine
                                ? 'bg-[#0095F6] text-white'
                                : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          {msg.is_unsent ? (
                            <span>Message unsent</span>
                          ) : (
                            <>
                              {msg.attachment_url && msg.attachment_type === 'voice' ? (
                                <div className="mb-1.5">
                                  <audio
                                    controls
                                    src={msg.attachment_url}
                                    className="h-8 max-w-[220px]"
                                  />
                                </div>
                              ) : msg.attachment_url && msg.attachment_type === 'video' ? (
                                <video
                                  controls
                                  src={msg.attachment_url}
                                  className="rounded-xl max-h-56 mb-2 object-cover"
                                />
                              ) : msg.attachment_url ? (
                                <img
                                  src={msg.attachment_url}
                                  alt="Attachment"
                                  className="rounded-xl max-h-56 mb-2 object-cover"
                                />
                              ) : null}

                              {msg.content && (
                                <p className="leading-relaxed break-words">
                                  {msg.content}
                                  {msg.is_edited && (
                                    <span className="ml-1.5 text-[10px] opacity-75">(edited)</span>
                                  )}
                                </p>
                              )}
                            </>
                          )}

                          {!msg.is_unsent && (
                            <div className="hidden group-hover:flex items-center gap-1 absolute -top-7 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full px-2 py-0.5 shadow-md z-10">
                              {QUICK_REACTIONS.map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => handleReaction(msg, em)}
                                  className="hover:scale-125 transition text-xs"
                                >
                                  {em}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setReplyingTo(msg)}
                                className="text-zinc-500 hover:text-[#0095F6] ml-1"
                                title="Reply"
                              >
                                <Reply className="w-3 h-3" />
                              </button>
                              {isMine && !msg.attachment_url && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessage(msg);
                                    setText(msg.content);
                                  }}
                                  className="text-zinc-500 hover:text-amber-500 ml-1"
                                  title="Edit Message"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              {isMine && (
                                <button
                                  type="button"
                                  onClick={() => handleUnsend(msg.id)}
                                  className="text-red-500 ml-1"
                                  title="Unsend"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {reactionEntries.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {reactionEntries.map(([em, uids]) => (
                              <span
                                key={em}
                                className="px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px]"
                              >
                                {em} {uids.length}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-zinc-400">
                          <span>{formatRelativeTime(msg.created_at)}</span>
                          {isMine && !msg.is_unsent && (
                            <span className="flex items-center gap-0.5">
                              <CheckCheck
                                className={`w-3 h-3 ${
                                  msg.is_read ? 'text-[#0095F6]' : 'text-zinc-400'
                                }`}
                              />
                              <span>{msg.is_read ? 'Seen' : 'Sent'}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply / Edit Banner */}
              {(replyingTo || editingMessage) && (
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                  <span className="truncate text-zinc-500">
                    {editingMessage ? (
                      <>
                        Editing message: <strong>{editingMessage.content}</strong>
                      </>
                    ) : (
                      <>
                        Replying to: <strong>{replyingTo?.content || 'Media'}</strong>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(null);
                      setEditingMessage(null);
                      setText('');
                    }}
                    className="text-zinc-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Message Composer with Image/Video Upload & Voice Note Recorder */}
              <form
                onSubmit={handleSend}
                className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2"
              >
                <label
                  className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer text-zinc-500"
                  title="Attach photo or video"
                >
                  <ImageIcon className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                {recordingVoice ? (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Stop ({voiceSeconds}s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500"
                    title="Record Voice Note"
                    aria-label="Record Voice Note"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}

                {attachmentFile && (
                  <span className="text-[11px] bg-[#0095F6]/10 text-[#0095F6] px-2 py-1 rounded-lg truncate max-w-[110px]">
                    {attachmentFile.name}
                  </span>
                )}

                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={editingMessage ? 'Edit your message...' : 'Message...'}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || (!text.trim() && !attachmentFile)}
                  className="px-4 py-2.5 rounded-xl bg-[#0095F6] disabled:opacity-40 text-white text-xs font-bold"
                >
                  {sending ? '...' : editingMessage ? 'Save' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* NEW DIRECT / GROUP CONVERSATION MODAL WITH REAL MEMBER DIRECTORY SEARCH */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold">New Message</h3>
              <button type="button" onClick={() => setNewChatModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsGroupMode(false);
                  setSelectedUserIds([]);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  !isGroupMode
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}
              >
                1-to-1 Direct Chat
              </button>
              <button
                type="button"
                onClick={() => setIsGroupMode(true)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold ${
                  isGroupMode
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}
              >
                Group Chat
              </button>
            </div>

            {isGroupMode && (
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group Chat Name (e.g. Weekend Creators)..."
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            )}

            {/* Full-Directory Member Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={recipientQuery}
                onChange={(e) => setRecipientQuery(e.target.value)}
                placeholder="Search any VistaGram member by @username or name..."
                aria-label="Search member directory for messaging"
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#0095F6]"
              />
              {recipientQuery && (
                <button
                  type="button"
                  onClick={() => setRecipientQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {recipientSearchError && (
              <p className="text-[11px] text-red-500">{recipientSearchError}</p>
            )}

            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchingRecipients ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  Searching member directory...
                </p>
              ) : searchedRecipients.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center">
                  No members found matching &ldquo;{recipientQuery}&rdquo;.
                </p>
              ) : (
                searchedRecipients.map((u) => {
                  const selected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar url={u.avatar_url} username={u.username} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">@{u.username}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{u.display_name}</p>
                        </div>
                      </div>
                      {isGroupMode ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedUserIds((prev) =>
                              selected ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                            )
                          }
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            selected
                              ? 'bg-[#0095F6] text-white'
                              : 'bg-zinc-100 dark:bg-zinc-800'
                          }`}
                        >
                          {selected ? 'Selected' : 'Select'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            setNewChatModalOpen(false);
                            await onStartDirectChat(u);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#0095F6] text-white text-xs font-bold"
                        >
                          Chat
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {isGroupMode && (
              <button
                type="button"
                disabled={selectedUserIds.length === 0}
                onClick={async () => {
                  setNewChatModalOpen(false);
                  await onCreateGroupChat(groupTitle || 'Group Chat', selectedUserIds);
                }}
                className="w-full py-2.5 rounded-xl bg-[#0095F6] disabled:opacity-40 text-white text-xs font-bold"
              >
                Create Group ({selectedUserIds.length} selected)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
