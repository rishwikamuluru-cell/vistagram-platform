'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Film,
  Type,
  Palette,
  Smile,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { VisibilityType, StoryOverlayMeta } from '@/types/database';

const STORY_STICKERS = ['🔥', '❤️', '✨', '🎉', '🚀', '📸', '💯', '🌟'];
const STORY_BG_GRADIENTS: Array<[string, string]> = [
  ['#4F46E5', '#EC4899'],
  ['#0F172A', '#1D4ED8'],
  ['#064E3B', '#10B981'],
  ['#7C2D12', '#F59E0B'],
  ['#581C87', '#9333EA'],
];

export function UploadModule({
  initialTab = 'post',
  onUploadPost,
  onUploadStory,
  onUploadReel,
}: {
  initialTab?: 'post' | 'story' | 'reel';
  onUploadPost: (
    files: File[],
    meta: {
      caption: string;
      location: string;
      visibility: VisibilityType;
      tagged_usernames: string[];
    }
  ) => Promise<void>;
  onUploadStory: (
    file: File,
    caption: string,
    audience: 'everyone' | 'close_friends',
    overlay?: StoryOverlayMeta
  ) => Promise<void>;
  onUploadReel: (file: File, caption: string, audioTrack?: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'post' | 'story' | 'reel'>(initialTab);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tagged, setTagged] = useState('');
  const [visibility, setVisibility] = useState<VisibilityType>('public');
  const [storyAudience, setStoryAudience] = useState<'everyone' | 'close_friends'>('everyone');
  const [reelAudioTrack, setReelAudioTrack] = useState('Original Audio');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Story Studio Creator State (Part 6: Real HTML5 Canvas Composition)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [storyText, setStoryText] = useState('');
  const [storyTextColor, setStoryTextColor] = useState('#FFFFFF');
  const [storySticker, setStorySticker] = useState('✨');
  const [storyGradIdx, setStoryGradIdx] = useState(0);
  const [loadedStoryImg, setLoadedStoryImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);

    if (files[0] && files[0].type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => setLoadedStoryImg(img);
      img.src = urls[0];
    } else {
      setLoadedStoryImg(null);
    }

    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  // Render live Story Studio preview onto HTML5 <canvas>
  useEffect(() => {
    if (tab !== 'story' || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const w = 720;
    const h = 1280;
    const [c1, c2] = STORY_BG_GRADIENTS[storyGradIdx] || STORY_BG_GRADIENTS[0];

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    if (loadedStoryImg) {
      const scale = Math.min(w / loadedStoryImg.width, h / loadedStoryImg.height);
      const dw = loadedStoryImg.width * scale;
      const dh = loadedStoryImg.height * scale;
      ctx.drawImage(loadedStoryImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }

    if (storySticker) {
      ctx.font = '96px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(storySticker, w / 2, 260);
    }

    if (storyText.trim()) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(60, h / 2 - 70, w - 120, 130);
      ctx.font = 'bold 44px Inter, system-ui, sans-serif';
      ctx.fillStyle = storyTextColor;
      ctx.textAlign = 'center';
      ctx.fillText(storyText.trim().slice(0, 36), w / 2, h / 2 + 12);
    }
  }, [tab, loadedStoryImg, storyText, storyTextColor, storySticker, storyGradIdx]);

  const exportStoryCanvasToFile = (): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!canvasRef.current) {
        reject(new Error('Story studio canvas not ready'));
        return;
      }
      canvasRef.current.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to encode Story image'));
            return;
          }
          resolve(new File([blob], `story_${Date.now()}.png`, { type: 'image/png' }));
        },
        'image/png',
        0.92
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (tab === 'post') {
        if (files.length === 0) {
          throw new Error('Please select at least one photo or video to publish a post.');
        }
        const taggedList = tagged
          .split(',')
          .map((s) => s.trim().replace(/^@/, ''))
          .filter(Boolean);
        await onUploadPost(files, {
          caption,
          location,
          visibility,
          tagged_usernames: taggedList,
        });
      } else if (tab === 'story') {
        // If user uploaded a video story, upload the video directly; otherwise export the composited Story Studio PNG canvas!
        let storyFile: File;
        if (files[0] && files[0].type.startsWith('video/')) {
          storyFile = files[0];
        } else {
          storyFile = await exportStoryCanvasToFile();
        }
        await onUploadStory(storyFile, caption || storyText, storyAudience, {
          text: storyText,
          textColor: storyTextColor,
          sticker: storySticker,
        });
      } else if (tab === 'reel') {
        if (!files[0]) {
          throw new Error('Please select a vertical video file (MP4/WebM) for your Reel.');
        }
        await onUploadReel(files[0], caption, reelAudioTrack);
      }

      setFiles([]);
      setCaption('');
      setLocation('');
      setTagged('');
      setStoryText('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold">Create & Publish</h2>
        <p className="text-xs text-zinc-500">
          All media is uploaded to your Supabase Storage buckets and verified in PostgreSQL
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-2.5 mb-6">
        {(
          [
            { id: 'post', label: 'Feed Post', icon: ImageIcon },
            { id: 'story', label: 'Story Studio (24h)', icon: Sparkles },
            { id: 'reel', label: 'Vertical Reel', icon: Film },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setError('');
              }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition ${
                tab === item.id
                  ? 'bg-[#0095F6] text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-5 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Upload or Database Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-5 sm:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-5 bg-white dark:bg-zinc-950 shadow-sm"
      >
        <div>
          <label className="block text-xs font-bold mb-2">
            {tab === 'post'
              ? '1. Choose Photos or Videos (Carousel Multi-Select Supported)'
              : tab === 'story'
              ? '1. Optional Background Photo/Video (or design directly on the Story Studio Canvas below)'
              : '1. Choose Vertical Video (MP4 / WebM up to 50MB)'}
          </label>
          <input
            type="file"
            multiple={tab === 'post'}
            accept={
              tab === 'reel'
                ? 'video/mp4,video/webm'
                : 'image/jpeg,image/png,image/webp,video/mp4,video/webm'
            }
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="block w-full text-xs text-zinc-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#0095F6]/10 file:text-[#0095F6] hover:file:bg-[#0095F6]/20 cursor-pointer"
          />
        </div>

        {/* Multi-image preview for Feed Posts */}
        {tab === 'post' && previewUrls.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {previewUrls.map((url, idx) => (
              <div
                key={url}
                className="aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-200 dark:border-zinc-800 relative"
              >
                {files[idx]?.type.startsWith('video/') ? (
                  <video src={url} className="w-full h-full object-cover" />
                ) : (
                  <img src={url} alt="Preview" className="w-full h-full object-cover" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Interactive Story Studio Creator (Part 6) */}
        {tab === 'story' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-2">
            <div className="md:col-span-5 flex justify-center">
              <canvas
                ref={canvasRef}
                width={720}
                height={1280}
                className="w-52 aspect-[9/16] rounded-2xl border border-zinc-300 dark:border-zinc-700 shadow-md"
              />
            </div>

            <div className="md:col-span-7 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>Story Overlay Text (Baked into published image)</span>
                </label>
                <input
                  type="text"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  placeholder="Type text to overlay on your story..."
                  className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                />
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5" />
                    <span>Text Color</span>
                  </label>
                  <input
                    type="color"
                    value={storyTextColor}
                    onChange={(e) => setStoryTextColor(e.target.value)}
                    className="w-16 h-8 rounded cursor-pointer"
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">
                    Backdrop Gradient
                  </label>
                  <div className="flex gap-2">
                    {STORY_BG_GRADIENTS.map(([c1, c2], i) => (
                      <button
                        key={c1}
                        type="button"
                        onClick={() => setStoryGradIdx(i)}
                        className={`w-7 h-7 rounded-full border-2 ${
                          storyGradIdx === i ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                  <Smile className="w-3.5 h-3.5" />
                  <span>Sticker</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {STORY_STICKERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStorySticker(st)}
                      className={`px-2.5 py-1 rounded-lg text-sm border ${
                        storySticker === st
                          ? 'border-[#0095F6] bg-[#0095F6]/10'
                          : 'border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1">
                  Story Privacy Audience
                </label>
                <select
                  value={storyAudience}
                  onChange={(e) =>
                    setStoryAudience(e.target.value as 'everyone' | 'close_friends')
                  }
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                >
                  <option value="everyone">Everyone (Followers)</option>
                  <option value="close_friends">★ Close Friends Only</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Reel Audio & Video Preview */}
        {tab === 'reel' && (
          <div className="space-y-3">
            {previewUrls[0] && (
              <video
                src={previewUrls[0]}
                controls
                className="w-48 aspect-[9/16] rounded-2xl mx-auto bg-black object-cover"
              />
            )}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Audio Track Title
              </label>
              <input
                type="text"
                value={reelAudioTrack}
                onChange={(e) => setReelAudioTrack(e.target.value)}
                placeholder="Original Audio"
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            </div>
          </div>
        )}

        {/* Caption & Metadata */}
        <div>
          <label className="block text-xs font-semibold text-zinc-500 mb-1">
            Caption (Supports #hashtags and @mentions)
          </label>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption... e.g. Launching VistaGram 2.0! #nextjs #supabase"
            className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
          />
        </div>

        {tab === 'post' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Chennai, India"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Tag Users (comma-separated)
              </label>
              <input
                type="text"
                value={tagged}
                onChange={(e) => setTagged(e.target.value)}
                placeholder="arjun.captures, kabir.motion"
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as VisibilityType)}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
              >
                <option value="public">Public</option>
                <option value="followers">Followers Only</option>
                <option value="close_friends">★ Close Friends</option>
              </select>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-[#0095F6] hover:bg-[#1877F2] disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {submitting
              ? 'Uploading & Verifying in PostgreSQL...'
              : `Publish ${tab.toUpperCase()}`}
          </span>
        </button>
      </form>
    </div>
  );
}
