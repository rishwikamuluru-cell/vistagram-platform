/**
 * VistaGram 2.0 — Development-Only Database Seed Script (`npm run db:seed`)
 * Explicitly blocked in production (`NODE_ENV === 'production'`).
 * Creates 3 clearly labelled [DEV TEST] accounts and seeds sample public posts,
 * media, hashtags, and an active 24h story so new accounts immediately have
 * rich public content to discover, like, comment on, and message!
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

import { createClient } from '@supabase/supabase-js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run development seed script in production.');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function svgDataUri(title: string, subtitle: string, c1: string, c2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <circle cx="620" cy="180" r="180" fill="rgba(255,255,255,0.12)"/>
    <rect x="60" y="580" width="680" height="150" rx="24" fill="rgba(0,0,0,0.55)"/>
    <text x="96" y="645" fill="#ffffff" font-family="sans-serif" font-weight="bold" font-size="34">${title}</text>
    <text x="96" y="692" fill="#e4e4e7" font-family="sans-serif" font-size="22">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEV_ACCOUNTS = [
  {
    email: 'user.a@vistagram.local',
    password: 'TestPassword123!',
    username: 'arjun.captures',
    display_name: 'Arjun Verma [DEV TEST A]',
    bio: 'Architectural & golden-hour street photography across India | Sony A7IV',
    is_private: false,
  },
  {
    email: 'user.b@vistagram.local',
    password: 'TestPassword123!',
    username: 'kabir.motion',
    display_name: 'Kabir Studio [DEV TEST B]',
    bio: '3D WebGL Shaders, Motion Reels & Creative Coding',
    is_private: false,
  },
  {
    email: 'user.private@vistagram.local',
    password: 'TestPassword123!',
    username: 'meera.designs',
    display_name: 'Meera Nair [DEV PRIVATE]',
    bio: 'Private Design Systems & Minimalist UI Journal 🔒',
    is_private: true,
  },
];

async function seed() {
  console.log('Seeding VistaGram 2.0 development accounts and sample content...');
  const userIdsByUsername: Record<string, string> = {};

  for (const acc of DEV_ACCOUNTS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: {
        username: acc.username,
        display_name: acc.display_name,
      },
    });

    let uid = data?.user?.id;
    if (error && error.message.includes('already been registered')) {
      const { data: existingProf } = await admin
        .from('profiles')
        .select('id')
        .eq('username', acc.username)
        .maybeSingle();
      uid = existingProf?.id;
    } else if (error) {
      console.error(`Error creating ${acc.username}:`, error.message);
      continue;
    }

    if (uid) {
      userIdsByUsername[acc.username] = uid;
      await admin
        .from('profiles')
        .upsert({
          id: uid,
          username: acc.username,
          display_name: acc.display_name,
          bio: acc.bio,
          is_private: acc.is_private,
        });
      console.log(`Account ready: @${acc.username} (${acc.email} / ${acc.password})`);
    }
  }

  const arjunId = userIdsByUsername['arjun.captures'];
  const kabirId = userIdsByUsername['kabir.motion'];

  if (arjunId && kabirId) {
    const { data: existingPosts } = await admin
      .from('posts')
      .select('id')
      .in('author_id', [arjunId, kabirId])
      .limit(1);

    if (!existingPosts || existingPosts.length === 0) {
      const { data: post1 } = await admin
        .from('posts')
        .insert({
          author_id: arjunId,
          caption:
            'Golden hour reflections along the Marina coastline! #photography #goldenhour #vistagram',
          location: 'Chennai, India',
          visibility: 'public',
        })
        .select('id')
        .single();

      if (post1) {
        await admin.from('post_media').insert({
          post_id: post1.id,
          media_url: svgDataUri(
            'Golden Hour Coastline',
            'Shot by @arjun.captures • 35mm f/1.8',
            '#0F172A',
            '#1D4ED8'
          ),
          media_type: 'image',
          position: 0,
        });
      }

      const { data: post2 } = await admin
        .from('posts')
        .insert({
          author_id: kabirId,
          caption:
            'Real-time WebGL particle core running at 60fps in VistaGram 2.0! #webgl #nextjs #supabase',
          location: 'Bengaluru Tech Hub',
          visibility: 'public',
        })
        .select('id')
        .single();

      if (post2) {
        await admin.from('post_media').insert({
          post_id: post2.id,
          media_url: svgDataUri(
            'WebGL Particle Core 60FPS',
            'Published by @kabir.motion • VistaGram 2.0',
            '#064E3B',
            '#047857'
          ),
          media_type: 'image',
          position: 0,
        });
      }

      await admin.from('stories').insert({
        author_id: arjunId,
        media_url: svgDataUri(
          'Late Night Street Walk',
          'Active 24h Story • @arjun.captures',
          '#4C1D95',
          '#831843'
        ),
        media_type: 'image',
        caption: 'Evening street photography session 📸',
        duration_seconds: 5,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });

      console.log('Seeded sample public posts and active 24h story for development accounts.');
    }
  }

  console.log('VistaGram 2.0 development seed completed successfully!');
}

seed();
