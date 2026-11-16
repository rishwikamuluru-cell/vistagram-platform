import { describe, it, expect } from 'vitest';
import {
  signUpSchema,
  createCommentSchema,
  validateMediaUpload,
  extractHashtags,
  extractMentions,
  sendMessageSchema,
} from '@/lib/validations/schemas';
import {
  sanitizeSearchQuery,
  rankSearchedProfiles,
} from '@/services/socialService';
import type { Profile } from '@/types/database';

describe('VistaGram Ultimate 3.0 — Validation, Search & Security Unit Tests', () => {
  it('validates registration email, username format (including dots and underscores), and strong password rules', () => {
    const valid = signUpSchema.safeParse({
      email: 'arjun@vistagram.local',
      username: 'arjun.captures_01',
      displayName: 'Arjun Verma',
      password: 'StrongPassword123',
    });
    expect(valid.success).toBe(true);

    const weakPass = signUpSchema.safeParse({
      email: 'arjun@vistagram.local',
      username: 'arjun',
      displayName: 'Arjun',
      password: 'weak',
    });
    expect(weakPass.success).toBe(false);
  });

  it('rejects empty comments and enforces 1000-char limit', () => {
    const empty = createCommentSchema.safeParse({
      postId: '550e8400-e29b-41d4-a716-446655440000',
      content: '   ',
    });
    expect(empty.success).toBe(false);
  });

  it('validates image (10MB), video (50MB), and voice note audio (15MB) MIME types and file size boundaries', () => {
    expect(validateMediaUpload({ type: 'image/jpeg', size: 2 * 1024 * 1024 }, 'image').valid).toBe(
      true
    );
    expect(
      validateMediaUpload({ type: 'image/jpeg', size: 12 * 1024 * 1024 }, 'image').valid
    ).toBe(false);
    expect(validateMediaUpload({ type: 'video/mp4', size: 25 * 1024 * 1024 }, 'video').valid).toBe(
      true
    );
    expect(
      validateMediaUpload({ type: 'audio/webm;codecs=opus', size: 512 * 1024 }, 'audio').valid
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        content: '🎤 Voice Note',
        attachmentUrl: 'https://xaxbiahsazyibsnirwet.supabase.co/storage/v1/object/sign/dm-attachments/voice.webm',
        attachmentType: 'voice',
      }).success
    ).toBe(true);
  });

  it('accurately parses hashtags and @mentions from post captions', () => {
    const caption = 'Sunset in #Kanyakumari with @arjun.captures and @kabir_motion #travel #coding';
    expect(extractHashtags(caption)).toEqual(['kanyakumari', 'travel', 'coding']);
    expect(extractMentions(caption)).toEqual(['arjun.captures', 'kabir_motion']);
  });

  it('safely normalizes and escapes member search queries (@username, #hashtag, dots, underscores, wildcards)', () => {
    const q1 = sanitizeSearchQuery('@arjun.captures_99');
    expect(q1.isUsernameQuery).toBe(true);
    expect(q1.clean).toBe('arjun.captures_99');
    expect(q1.escapedLike).toBe('arjun.captures\\_99');

    const q2 = sanitizeSearchQuery('#travel_2026%');
    expect(q2.isHashtagQuery).toBe(true);
    expect(q2.clean).toBe('travel_2026%');
    expect(q2.escapedLike).toBe('travel\\_2026\\%');
  });

  it('ranks exact username > prefix username > display name > partial match', () => {
    const baseProfile: Omit<Profile, 'id' | 'username' | 'display_name' | 'followers_count'> = {
      bio: '',
      website: '',
      avatar_url: '',
      is_private: false,
      is_verified: false,
      posts_count: 0,
      following_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const candidates: Profile[] = [
      { ...baseProfile, id: '1', username: 'photo_rishi_fan', display_name: 'Fan', followers_count: 500 },
      { ...baseProfile, id: '2', username: 'rishi.dev', display_name: 'Rishi Kumar', followers_count: 50 },
      { ...baseProfile, id: '3', username: 'rishi', display_name: 'Rishi Official', followers_count: 10 },
    ];

    const ranked = rankSearchedProfiles(candidates, 'rishi');
    expect(ranked.map((p) => p.username)).toEqual(['rishi', 'rishi.dev', 'photo_rishi_fan']);
  });
});
