import { createClient } from '@/lib/supabase/client';
import {
  createPostSchema,
  createCommentSchema,
  extractHashtags,
  extractMentions,
} from '@/lib/validations/schemas';
import { storageService, formatSupabaseError } from './storageService';
import type { Post, Comment, Collection } from '@/types/database';

export const postService = {
  async getFeedPosts(params: {
    viewerId: string;
    mode: 'following' | 'explore' | 'recommended';
    cursor?: string;
    limit?: number;
    hashtag?: string | null;
    authorId?: string;
  }): Promise<{ posts: Post[]; fellBackToDiscover: boolean }> {
    const supabase = createClient();
    const limit = params.limit || 12;
    let fellBackToDiscover = false;

    let followingIds: string[] = [];
    if (params.mode === 'following' && !params.authorId && !params.hashtag) {
      const { data: followRows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', params.viewerId);
      const followedOthers = (followRows || []).map(
        (r: { following_id: string }) => r.following_id
      );
      followingIds = [params.viewerId, ...followedOthers];
    }

    let query = supabase
      .from('posts')
      .select(
        `
        *,
        author:profiles!posts_author_id_fkey(*),
        media:post_media(*)
      `
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (params.authorId) {
      query = query.eq('author_id', params.authorId);
    } else if (params.hashtag) {
      query = query.ilike('caption', `%#${params.hashtag}%`);
    } else if (params.mode === 'following' && followingIds.length > 0) {
      query = query.in('author_id', followingIds);
    }

    if (params.cursor) {
      query = query.lt('created_at', params.cursor);
    }

    const { data: initialData, error } = await query;
    if (error) throw formatSupabaseError(error, 'Loading feed posts failed');

    let rawPosts = (initialData || []) as Post[];

    // BUG 4 FIX: If the user's Following feed has 0 posts (new user following nobody yet),
    // automatically load public discovery posts so the home feed is never a dead end!
    if (
      rawPosts.length === 0 &&
      params.mode === 'following' &&
      !params.authorId &&
      !params.hashtag &&
      !params.cursor
    ) {
      const { data: discoverData } = await supabase
        .from('posts')
        .select(
          `
          *,
          author:profiles!posts_author_id_fkey(*),
          media:post_media(*)
        `
        )
        .eq('visibility', 'public')
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (discoverData && discoverData.length > 0) {
        rawPosts = discoverData as Post[];
        fellBackToDiscover = true;
      }
    }

    if (rawPosts.length === 0) {
      return { posts: [], fellBackToDiscover };
    }

    const storagePaths: string[] = [];
    for (const p of rawPosts) {
      for (const m of p.media || []) {
        if (m.storage_path) storagePaths.push(m.storage_path);
      }
    }
    const signedMap = await storageService.resolveSignedUrls('post-media', storagePaths);

    const postIds = rawPosts.map((p) => p.id);
    const [{ data: likedRows }, { data: savedRows }] = await Promise.all([
      supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', params.viewerId)
        .in('post_id', postIds),
      supabase
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', params.viewerId)
        .in('post_id', postIds),
    ]);

    const likedSet = new Set((likedRows || []).map((r: { post_id: string }) => r.post_id));
    const savedSet = new Set((savedRows || []).map((r: { post_id: string }) => r.post_id));

    const hydrated = rawPosts.map((post) => ({
      ...post,
      tagged_usernames:
        post.tagged_usernames ||
        ((post as unknown as { Tagged_usernames?: string[] }).Tagged_usernames ?? []),
      is_liked: likedSet.has(post.id),
      is_saved: savedSet.has(post.id),
      media: (post.media || [])
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          ...m,
          media_url:
            m.storage_path && signedMap[m.storage_path]
              ? signedMap[m.storage_path]
              : m.media_url,
        })),
    }));

    return { posts: hydrated, fellBackToDiscover };
  },

  /**
   * BUG 3 FIX: Uploads media to Supabase Storage, inserts post & post_media rows with
   * automatic schema compatibility fallback if legacy v1 column names are encountered,
   * and verifies that both the post record and media rows exist in PostgreSQL before returning.
   */
  async createPost(userId: string, files: File[], metadata: unknown): Promise<Post> {
    const parsed = createPostSchema.parse(metadata);
    const supabase = createClient();

    if (!files || files.length === 0) {
      throw new Error('Please select at least one image or video file to upload.');
    }

    // 1. Upload every media file to `post-media` bucket and verify path
    const uploadedItems: Array<{
      storagePath: string;
      signedUrl: string;
      mediaType: 'image' | 'video';
      position: number;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const uploaded = await storageService.uploadPrivateMedia('post-media', userId, files[i]);
      uploadedItems.push({ ...uploaded, position: i });
    }

    // 2. Insert row into `public.posts` (with fallback if database still has v1 column names)
    let postRow: Post | null = null;
    const { data: primaryPost, error: primaryPostErr } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        caption: parsed.caption,
        location: parsed.location,
        visibility: parsed.visibility,
        comments_disabled: parsed.comments_disabled,
        hide_like_count: parsed.hide_like_count,
        tagged_usernames: parsed.tagged_usernames,
      })
      .select('*, author:profiles!posts_author_id_fkey(*)')
      .single();

    if (primaryPostErr) {
      // Fallback for unmigrated v1 schema where `tagged_usernames` was `"Tagged_usernames"`
      const { data: fallbackPost, error: fallbackErr } = await supabase
        .from('posts')
        .insert({
          author_id: userId,
          caption: parsed.caption,
          location: parsed.location,
          visibility: parsed.visibility,
          comments_disabled: parsed.comments_disabled,
          hide_like_count: parsed.hide_like_count,
        })
        .select('*, author:profiles!posts_author_id_fkey(*)')
        .single();

      if (fallbackErr || !fallbackPost) {
        throw formatSupabaseError(primaryPostErr, 'Creating post record in PostgreSQL failed');
      }
      postRow = fallbackPost as Post;
    } else {
      postRow = primaryPost as Post;
    }

    // 3. Insert media rows into `public.post_media` and verify
    let mediaRows = null;
    const { data: insertedMedia, error: mediaErr } = await supabase
      .from('post_media')
      .insert(
        uploadedItems.map((m) => ({
          post_id: postRow!.id,
          storage_bucket: 'post-media',
          storage_path: m.storagePath,
          media_url: m.signedUrl,
          media_type: m.mediaType,
          position: m.position,
        }))
      )
      .select('*');

    if (mediaErr) {
      // Fallback if `storage_bucket` / `storage_path` columns were not yet added via migration 004
      const { data: fallbackMedia, error: fallbackMediaErr } = await supabase
        .from('post_media')
        .insert(
          uploadedItems.map((m) => ({
            post_id: postRow!.id,
            media_url: m.signedUrl,
            media_type: m.mediaType,
            position: m.position,
          }))
        )
        .select('*');

      if (fallbackMediaErr || !fallbackMedia || fallbackMedia.length === 0) {
        // Rollback orphan post row so we never leave an incomplete post
        await supabase.from('posts').delete().eq('id', postRow.id);
        throw formatSupabaseError(mediaErr, 'Saving post media metadata failed');
      }
      mediaRows = fallbackMedia;
    } else {
      mediaRows = insertedMedia;
    }

    // 4. Index hashtags & create mention notifications (non-blocking)
    const hashtags = extractHashtags(parsed.caption);
    for (const tag of hashtags) {
      const { data: hRow } = await supabase
        .from('hashtags')
        .upsert({ name: tag }, { onConflict: 'name' })
        .select('id')
        .maybeSingle();
      if (hRow) {
        await supabase
          .from('post_hashtags')
          .upsert({ post_id: postRow.id, hashtag_id: hRow.id });
      }
    }

    const mentions = Array.from(
      new Set([
        ...extractMentions(parsed.caption),
        ...parsed.tagged_usernames.map((u) => u.toLowerCase()),
      ])
    );
    if (mentions.length > 0) {
      const { data: mentionedProfiles } = await supabase
        .from('profiles')
        .select('id')
        .in('username', mentions);
      const notifyPayloads = (mentionedProfiles || [])
        .filter((p: { id: string }) => p.id !== userId)
        .map((p: { id: string }) => ({
          recipient_id: p.id,
          actor_id: userId,
          type: 'mention',
          post_id: postRow!.id,
        }));
      if (notifyPayloads.length > 0) {
        await supabase.from('notifications').insert(notifyPayloads);
      }
    }

    return {
      ...postRow,
      media: mediaRows || [],
      is_liked: false,
      is_saved: false,
    };
  },

  async repostPost(userId: string, originalPost: Post): Promise<Post> {
    const supabase = createClient();
    const originalAuthor = originalPost.author?.username || 'creator';
    const repostCaption = `🔄 Reposted from @${originalAuthor}: ${originalPost.caption}`.slice(
      0,
      2200
    );

    const { data: newPost, error } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        caption: repostCaption,
        location: originalPost.location,
        visibility: 'public',
      })
      .select('*, author:profiles!posts_author_id_fkey(*)')
      .single();

    if (error || !newPost) throw formatSupabaseError(error, 'Repost failed');

    const origMedia = originalPost.media || [];
    if (origMedia.length > 0) {
      const { data: clonedMedia } = await supabase
        .from('post_media')
        .insert(
          origMedia.map((m, idx) => ({
            post_id: newPost.id,
            media_url: m.media_url,
            media_type: m.media_type,
            position: idx,
          }))
        )
        .select('*');
      return { ...(newPost as Post), media: clonedMedia || [], is_liked: false, is_saved: false };
    }

    return { ...(newPost as Post), media: [], is_liked: false, is_saved: false };
  },

  async updatePostCaption(postId: string, authorId: string, caption: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('posts')
      .update({ caption, updated_at: new Date().toISOString() })
      .match({ id: postId, author_id: authorId })
      .select('*')
      .single();
    if (error) throw formatSupabaseError(error, 'Updating post caption failed');
    return data as Post;
  },

  async deletePost(postId: string, authorId: string) {
    const supabase = createClient();
    const { data: mediaRows } = await supabase
      .from('post_media')
      .select('storage_path')
      .eq('post_id', postId);

    const { error } = await supabase
      .from('posts')
      .delete()
      .match({ id: postId, author_id: authorId });
    if (error) throw formatSupabaseError(error, 'Deleting post failed');

    const paths = (mediaRows || [])
      .map((m: { storage_path?: string }) => m.storage_path || '')
      .filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from('post-media').remove(paths);
    }
  },

  async toggleLike(postId: string, userId: string, postAuthorId: string, isCurrentlyLiked: boolean) {
    const supabase = createClient();
    if (isCurrentlyLiked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .match({ post_id: postId, user_id: userId });
      if (error) throw formatSupabaseError(error, 'Unliking post failed');
      return { liked: false };
    } else {
      const { error } = await supabase
        .from('likes')
        .insert({ post_id: postId, user_id: userId });
      if (error) throw formatSupabaseError(error, 'Liking post failed');

      if (postAuthorId !== userId) {
        await supabase.from('notifications').insert({
          recipient_id: postAuthorId,
          actor_id: userId,
          type: 'like',
          post_id: postId,
        });
      }
      return { liked: true };
    }
  },

  async getPostComments(postId: string): Promise<Comment[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('comments')
      .select('*, author:profiles!comments_author_id_fkey(*)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw formatSupabaseError(error, 'Loading comments failed');
    return (data || []) as Comment[];
  },

  async addComment(userId: string, postAuthorId: string, input: unknown): Promise<Comment> {
    const parsed = createCommentSchema.parse(input);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: parsed.postId,
        author_id: userId,
        parent_id: parsed.parentId ?? null,
        content: parsed.content,
      })
      .select('*, author:profiles!comments_author_id_fkey(*)')
      .single();

    if (error) throw formatSupabaseError(error, 'Posting comment failed');

    if (postAuthorId !== userId) {
      await supabase.from('notifications').insert({
        recipient_id: postAuthorId,
        actor_id: userId,
        type: parsed.parentId ? 'reply' : 'comment',
        post_id: parsed.postId,
        comment_id: data.id,
      });
    }

    return data as Comment;
  },

  async toggleCommentLike(commentId: string, userId: string, isLiked: boolean) {
    const supabase = createClient();
    if (isLiked) {
      await supabase.from('comment_likes').delete().match({ comment_id: commentId, user_id: userId });
      return { liked: false };
    } else {
      await supabase
        .from('comment_likes')
        .upsert({ comment_id: commentId, user_id: userId }, { onConflict: 'comment_id,user_id' });
      return { liked: true };
    }
  },

  async deleteComment(commentId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) throw formatSupabaseError(error, 'Deleting comment failed');
  },

  async getUserCollections(userId: string): Promise<Collection[]> {
    const supabase = createClient();
    const [{ data: cols, error: colErr }, { data: saved }] = await Promise.all([
      supabase
        .from('collections')
        .select('*, collection_posts(post_id)')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
      supabase
        .from('saved_posts')
        .select('post_id')
        .eq('user_id', userId),
    ]);

    if (colErr) throw formatSupabaseError(colErr, 'Loading saved collections failed');
    const allSavedIds = (saved || []).map((s: { post_id: string }) => s.post_id);

    interface RawColRow {
      id: string;
      user_id: string;
      name: string;
      cover_image_url: string;
      created_at: string;
      collection_posts?: Array<{ post_id: string }>;
    }
    const list = ((cols || []) as RawColRow[]).map((c) => ({
      id: c.id,
      user_id: c.user_id,
      name: c.name,
      cover_image_url: c.cover_image_url,
      created_at: c.created_at,
      post_ids:
        c.name === 'All Saved Posts'
          ? Array.from(
              new Set([
                ...allSavedIds,
                ...(c.collection_posts || []).map((cp: { post_id: string }) => cp.post_id),
              ])
            )
          : (c.collection_posts || []).map((cp: { post_id: string }) => cp.post_id),
    }));

    if (list.length === 0) {
      return [
        {
          id: 'default_saved',
          user_id: userId,
          name: 'All Saved Posts',
          cover_image_url: '',
          created_at: new Date().toISOString(),
          post_ids: allSavedIds,
        },
      ];
    }
    return list;
  },

  async createCollection(userId: string, name: string): Promise<Collection> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: userId, name: name.trim() })
      .select('*')
      .single();
    if (error) throw formatSupabaseError(error, 'Creating collection failed');
    return { ...(data as Omit<Collection, 'post_ids'>), post_ids: [] };
  },

  async renameCollection(collectionId: string, userId: string, newName: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('collections')
      .update({ name: newName.trim(), updated_at: new Date().toISOString() })
      .match({ id: collectionId, user_id: userId });
    if (error) throw formatSupabaseError(error, 'Renaming collection failed');
  },

  async deleteCollection(collectionId: string, userId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('collections')
      .delete()
      .match({ id: collectionId, user_id: userId });
    if (error) throw formatSupabaseError(error, 'Deleting collection failed');
  },

  async toggleSavePost(
    postId: string,
    userId: string,
    isCurrentlySaved: boolean,
    collectionId?: string
  ) {
    const supabase = createClient();
    if (isCurrentlySaved) {
      const { error } = await supabase
        .from('saved_posts')
        .delete()
        .match({ post_id: postId, user_id: userId });
      if (error) throw formatSupabaseError(error, 'Unsaving post failed');
      if (collectionId && collectionId !== 'default_saved') {
        await supabase
          .from('collection_posts')
          .delete()
          .match({ collection_id: collectionId, post_id: postId });
      }
      return { saved: false };
    } else {
      const { error } = await supabase
        .from('saved_posts')
        .upsert({ post_id: postId, user_id: userId }, { onConflict: 'user_id,post_id' });
      if (error) throw formatSupabaseError(error, 'Saving post failed');
      if (collectionId && collectionId !== 'default_saved') {
        await supabase
          .from('collection_posts')
          .upsert(
            { collection_id: collectionId, post_id: postId },
            { onConflict: 'collection_id,post_id' }
          );
      }
      return { saved: true };
    }
  },
};
