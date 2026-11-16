export type MediaType = 'image' | 'video';
export type VisibilityType = 'public' | 'followers' | 'close_friends';
export type FollowRequestStatus = 'pending' | 'accepted' | 'rejected';
export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accepted'
  | 'like'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'story_view'
  | 'message';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  website: string;
  avatar_url: string;
  avatar_storage_path?: string;
  account_type?: 'personal' | 'creator' | 'business' | 'community_admin';
  is_private: boolean;
  is_verified: boolean;
  is_admin?: boolean;
  posts_count: number;
  followers_count: number;
  following_count: number;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  accent_color?: string;
  ui_density?: 'comfortable' | 'compact';
  feed_preference?: 'chronological' | 'recommended' | 'following';
  autoplay_videos?: boolean;
  read_receipts_enabled?: boolean;
  chat_theme?: string;
  message_privacy?: 'everyone' | 'followers';
  reduced_motion?: boolean;
  text_scale?: 'small' | 'normal' | 'large';
  allow_comments: 'everyone' | 'followers' | 'nobody';
  allow_mentions: 'everyone' | 'followers';
  show_activity_status: boolean;
  notify_likes: boolean;
  notify_comments: boolean;
  notify_follows: boolean;
  notify_messages: boolean;
  restricted_user_ids?: string[];
  updated_at: string;
}

export interface PostMedia {
  id: string;
  post_id: string;
  storage_bucket?: string;
  storage_path?: string;
  media_url: string;
  media_type: MediaType;
  filter_name: string;
  aspect_ratio: string;
  alt_text?: string;
  position: number;
  created_at?: string;
}

export interface PollOption {
  text: string;
  votes_count: number;
}

export interface Post {
  id: string;
  author_id: string;
  caption: string;
  location: string;
  visibility: VisibilityType;
  tagged_usernames: string[];
  repost_of_id?: string | null;
  quote_comment?: string;
  poll_question?: string;
  poll_options?: PollOption[];
  user_poll_vote?: number | null;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  reposts_count?: number;
  views_count?: number;
  hide_like_count?: boolean;
  comments_disabled?: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
  media?: PostMedia[];
  is_liked?: boolean;
  is_saved?: boolean;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  likes_count: number;
  created_at: string;
  author?: Profile;
}

export interface StoryOverlayMeta {
  text?: string;
  textColor?: string;
  bgGradient?: string;
  sticker?: string;
}

export interface Story {
  id: string;
  author_id: string;
  storage_bucket?: string;
  storage_path?: string;
  media_url: string;
  media_type: MediaType;
  caption: string;
  audience?: 'everyone' | 'close_friends';
  overlay_json?: StoryOverlayMeta;
  duration_seconds: number;
  views_count: number;
  likes_count?: number;
  expires_at: string;
  created_at: string;
  author?: Profile;
  viewer_ids?: string[];
  viewers?: Profile[];
}

export interface StoryHighlight {
  id: string;
  user_id: string;
  title: string;
  cover_url?: string;
  cover_image_url?: string;
  story_ids: string[];
  created_at: string;
}

export interface UserNote {
  id: string;
  author_id: string;
  content: string;
  emoji: string;
  expires_at: string;
  created_at: string;
  author?: Profile;
}

export interface ReelComment {
  id: string;
  reel_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: Profile;
}

export interface Reel {
  id: string;
  author_id: string;
  storage_bucket?: string;
  storage_path?: string;
  video_url: string;
  thumbnail_url: string;
  caption: string;
  audio_track_name: string;
  duration_seconds?: number;
  watch_time_seconds?: number;
  likes_count: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  author?: Profile;
  is_liked?: boolean;
  comments?: ReelComment[];
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  cover_url?: string;
  cover_image_url?: string;
  created_at: string;
  post_ids: string[];
}

export interface Conversation {
  id: string;
  is_group: boolean;
  title: string;
  last_message_at: string;
  peer?: Profile;
  participants?: Profile[];
  is_pinned?: boolean;
  is_muted?: boolean;
  unread_count: number;
  last_message?: Message | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  storage_path?: string;
  attachment_url: string;
  attachment_type: '' | 'image' | 'video' | 'voice' | 'file';
  voice_duration_seconds?: number;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]>;
  delivery_status?: 'sent' | 'delivered' | 'seen';
  is_read: boolean;
  is_unsent: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  created_at: string;
}

export interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  role: 'host' | 'participant';
  state: 'invited' | 'ringing' | 'joined' | 'declined' | 'left' | 'missed' | 'busy';
  mic_muted: boolean;
  camera_enabled: boolean;
  joined_at?: string | null;
  left_at?: string | null;
  profile?: Profile;
}

export interface CallSession {
  id: string;
  conversation_id?: string | null;
  initiator_id: string;
  room_id: string;
  call_type: 'voice' | 'video';
  is_group: boolean;
  status: 'ringing' | 'accepted' | 'declined' | 'cancelled' | 'missed' | 'busy' | 'ended' | 'failed';
  started_at: string;
  accepted_at?: string | null;
  ended_at?: string | null;
  duration_seconds: number;
  end_reason: string;
  initiator?: Profile;
  participants?: CallParticipant[];
}

export interface Community {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  avatar_url: string;
  is_private: boolean;
  members_count: number;
  created_at: string;
  owner?: Profile;
  is_member?: boolean;
}

export interface CommunityMessage {
  id: string;
  community_id: string;
  channel_name: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: Profile;
}

export interface BroadcastChannel {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  subscribers_count: number;
  created_at: string;
  creator?: Profile;
  is_subscribed?: boolean;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  reactions: Record<string, string[]>;
  created_at: string;
  sender?: Profile;
}

export interface FollowRequestRecord {
  id: string;
  requester_id: string;
  target_id: string;
  status: FollowRequestStatus;
  created_at: string;
  requester?: Profile;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  post_id: string | null;
  comment_id: string | null;
  story_id: string | null;
  reel_id?: string | null;
  conversation_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: Profile;
}

export interface SearchResultsBundle {
  accounts: Profile[];
  hashtags: Array<{ name: string; posts_count: number }>;
  posts: Post[];
  communities: Community[];
  channels: BroadcastChannel[];
  error?: string | null;
}

