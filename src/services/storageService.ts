import { createClient } from '@/lib/supabase/client';
import { validateMediaUpload } from '@/lib/validations/schemas';

export type PrivateBucket = 'post-media' | 'stories' | 'reels' | 'dm-attachments';

export function formatSupabaseError(err: unknown, context: string): Error {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string; hint?: string };
    const codePart = e.code ? `[Code ${e.code}] ` : '';
    const msgPart = e.message || 'Database or storage operation failed';
    const hintPart = e.hint ? ` (Hint: ${e.hint})` : '';
    if (
      e.code === '42703' ||
      e.code === '42P01' ||
      e.code === 'PGRST204' ||
      msgPart.includes('schema cache') ||
      msgPart.includes('column')
    ) {
      return new Error(
        `${context}: ${codePart}${msgPart}${hintPart}. Please run supabase/migrations/004_vistagram_v2_schema_repair.sql and 005_vistagram_ultimate_v3.sql in your Supabase SQL Editor.`
      );
    }
    return new Error(`${context}: ${codePart}${msgPart}${hintPart}`);
  }
  return new Error(`${context}: ${String(err)}`);
}

export const storageService = {
  async uploadAvatar(
    userId: string,
    file: File
  ): Promise<{ publicUrl: string; storagePath: string }> {
    const check = validateMediaUpload(file, 'image');
    if (!check.valid) throw new Error(check.error!);

    const supabase = createClient();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const storagePath = `${userId}/avatar_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('avatars').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) throw formatSupabaseError(error, 'Avatar upload failed');

    const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    return { publicUrl: data.publicUrl, storagePath };
  },

  async uploadPrivateMedia(
    bucket: PrivateBucket,
    ownerFolderPrefix: string,
    file: File
  ): Promise<{
    storagePath: string;
    signedUrl: string;
    mediaType: 'image' | 'video';
  }> {
    const isAudio = file.type.startsWith('audio/');
    const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    const check = validateMediaUpload(file, isAudio ? 'audio' : mediaType);
    if (!check.valid) throw new Error(check.error!);

    const supabase = createClient();
    const ext =
      file.name.split('.').pop()?.toLowerCase() ||
      (isAudio ? 'webm' : mediaType === 'image' ? 'jpg' : 'mp4');
    const safeRandom = Math.random().toString(36).slice(2, 8);
    const storagePath = `${ownerFolderPrefix}/${Date.now()}_${safeRandom}.${ext}`;

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr || !uploadData?.path) {
      throw formatSupabaseError(uploadErr, `Storage upload to "${bucket}" failed`);
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);

    if (signErr || !signedData?.signedUrl) {
      const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      if (pubData?.publicUrl) {
        return { storagePath, signedUrl: pubData.publicUrl, mediaType };
      }
      throw formatSupabaseError(signErr, `Signed URL generation for "${bucket}" failed`);
    }

    return {
      storagePath,
      signedUrl: signedData.signedUrl,
      mediaType,
    };
  },

  async resolveSignedUrls(
    bucket: PrivateBucket,
    paths: string[]
  ): Promise<Record<string, string>> {
    const cleanPaths = Array.from(new Set(paths.filter(Boolean)));
    if (cleanPaths.length === 0) return {};

    const supabase = createClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(cleanPaths, 3600);
    if (error || !data) return {};

    const map: Record<string, string> = {};
    for (const row of data) {
      if (row.path && row.signedUrl) {
        map[row.path] = row.signedUrl;
      }
    }
    return map;
  },
};
