import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username cannot exceed 30 characters')
  .regex(/^[a-zA-Z0-9._]+$/, 'Username can only contain letters, numbers, periods, and underscores');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number');

export const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  username: usernameSchema,
  displayName: z.string().min(1, 'Display name is required').max(60, 'Display name cannot exceed 60 characters'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  identifier: z.string().min(3, 'Enter your email or username'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  username: usernameSchema,
  display_name: z.string().min(1, 'Display name is required').max(60),
  bio: z.string().max(150, 'Bio cannot exceed 150 characters').optional().default(''),
  website: z
    .string()
    .max(255)
    .refine((val) => !val || /^https?:\/\//i.test(val), 'Website must start with http:// or https://')
    .optional()
    .default(''),
  is_private: z.boolean().default(false),
});

export const createPostSchema = z.object({
  caption: z.string().max(2200, 'Caption cannot exceed 2,200 characters').default(''),
  location: z.string().max(100, 'Location cannot exceed 100 characters').default(''),
  visibility: z.enum(['public', 'followers', 'close_friends']).default('public'),
  comments_disabled: z.boolean().default(false),
  hide_like_count: z.boolean().default(false),
  tagged_usernames: z.array(usernameSchema).max(20).default([]),
});

export const createCommentSchema = z.object({
  postId: z.string().uuid(),
  parentId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1, 'Comment cannot be empty').max(1000, 'Comment cannot exceed 1,000 characters'),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().max(2000, 'Message cannot exceed 2,000 characters'),
  attachmentUrl: z.string().url().optional().or(z.literal('')),
  attachmentType: z.enum(['', 'image', 'video', 'voice', 'file', 'post_share']).default(''),
}).refine((data) => data.content.length > 0 || Boolean(data.attachmentUrl), {
  message: 'Message must contain text or an attachment',
});

export const reportSchema = z.object({
  reportedUserId: z.string().uuid().optional(),
  reportedPostId: z.string().uuid().optional(),
  reason: z.enum([
    'spam',
    'inappropriate',
    'harassment',
    'hate_speech',
    'impersonation',
    'intellectual_property',
    'other',
  ]),
  details: z.string().max(1000).optional().default(''),
});

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'];
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/mpeg',
];

export function validateMediaUpload(
  file: { type: string; size: number },
  kind: 'image' | 'video' | 'audio'
) {
  const maxBytes =
    kind === 'image'
      ? 10 * 1024 * 1024
      : kind === 'audio'
        ? 15 * 1024 * 1024
        : 50 * 1024 * 1024;
  const allowed =
    kind === 'image'
      ? ALLOWED_IMAGE_MIME_TYPES
      : kind === 'audio'
        ? ALLOWED_AUDIO_MIME_TYPES
        : ALLOWED_VIDEO_MIME_TYPES;

  const baseType = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!allowed.includes(baseType)) {
    return {
      valid: false,
      error: `Unsupported ${kind} format (${file.type}). Allowed: ${allowed.join(', ')}`,
    };
  }
  if (file.size <= 0 || file.size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${
        kind === 'image' ? '10MB' : kind === 'audio' ? '15MB' : '50MB'
      }`,
    };
  }
  return { valid: true, error: null };
}

export function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_]+)/g) || [];
  return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase())));
}

export function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9._]{3,30})/g) || [];
  return Array.from(new Set(matches.map((mention) => mention.slice(1).toLowerCase())));
}
