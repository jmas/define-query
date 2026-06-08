import { fail } from 'define-query';
import * as db from './mock-db';
import type { Comment, Post, TimelinePage } from './types';

/** Toggle in the demo UI — default ~400ms so loading/Suspense states are visible. */
export const mockLatencyMs = { value: 400 };

/** Comments panel chaos — random API failures for testing error UI. */
export const mockCommentChaos = {
  enabled: false,
  /** 0–100: chance each comment API call fails when enabled. */
  rate: 35,
};

type CommentChaosScope = 'query' | 'add' | 'edit' | 'remove';

const CHAOS_NETWORK_ERRORS = [
  'Failed to fetch',
  'The network connection was lost.',
  'Request timed out',
  'Unable to reach the server. Check your connection.',
  'Service temporarily unavailable',
] as const;

const CHAOS_VALIDATION_ERRORS: Record<'text' | '_', readonly string[]> = {
  text: [
    'Text must be between 1 and 2000 characters.',
    'Comments cannot contain links in this thread.',
    'You are posting too quickly. Wait a moment.',
    'This comment contains prohibited content.',
    'Duplicate comment — you already posted this.',
  ],
  _: [
    'You do not have permission to perform this action.',
    'This post is locked and no longer accepts comments.',
    'Comment was already deleted.',
  ],
};

const CHAOS_SERVER_ERRORS = [
  'An unexpected error occurred. Try again later.',
  '502 Bad Gateway',
  'Comment service unavailable (503)',
  'Upstream request failed',
  'Could not persist comment — storage write failed',
] as const;

let commentChaosSeq = 0;

function maybeThrowCommentChaos(scope: CommentChaosScope): void {
  const { enabled, rate } = mockCommentChaos;
  if (!enabled || rate <= 0) return;
  if (Math.random() * 100 >= rate) return;

  const roll = commentChaosSeq++;
  const phase = roll % 3;

  if (phase === 0) {
    throw fail.network(CHAOS_NETWORK_ERRORS[roll % CHAOS_NETWORK_ERRORS.length]);
  }
  if (phase === 1) {
    const field = scope === 'add' || scope === 'edit' ? 'text' : '_';
    const pool = CHAOS_VALIDATION_ERRORS[field];
    throw fail.validation({ [field]: [pool[roll % pool.length]] });
  }
  throw new Error(CHAOS_SERVER_ERRORS[roll % CHAOS_SERVER_ERRORS.length]);
}

function wait(): Promise<void> {
  const ms = mockLatencyMs.value;
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulate<T>(run: () => T): Promise<T> {
  await wait();
  return run();
}

export const demoApi = {
  getPost(id: string): Promise<Post> {
    return simulate(() => {
      const post = db.getPost(id);
      if (!post) throw new Error('Post not found');
      return post;
    });
  },

  createPost(body: { title: string; body: string }): Promise<Post> {
    return simulate(() => {
      const result = db.createPost(body.title, body.body);
      if ('error' in result) throw fail.validation(result.error);
      return result;
    });
  },

  patchPost(id: string, body: { title?: string; body?: string }): Promise<Post> {
    return simulate(() => {
      const post = db.updatePost(id, body);
      if (!post) throw new Error('Post not found');
      return post;
    });
  },

  deletePost(id: string): Promise<void> {
    return simulate(() => {
      if (!db.deletePost(id)) throw new Error('Post not found');
    });
  },

  getComments(postId: string): Promise<{ items: Comment[] }> {
    return simulate(() => {
      maybeThrowCommentChaos('query');
      return { items: db.getComments(postId) };
    });
  },

  getComment(postId: string, commentId: string): Promise<Comment> {
    return simulate(() => {
      maybeThrowCommentChaos('query');
      const comment = db.getComment(postId, commentId);
      if (!comment) throw fail.validation({ text: ['Comment not found'] });
      return comment;
    });
  },

  addComment(postId: string, text: string): Promise<{ comment: Comment }> {
    return simulate(() => {
      maybeThrowCommentChaos('add');
      const trimmed = text.trim();
      if (trimmed.toLowerCase().startsWith('fail ')) {
        throw fail.network('Failed to fetch');
      }
      const result = db.addComment(postId, trimmed);
      if ('error' in result) throw fail.validation(result.error);
      return result;
    });
  },

  updateComment(postId: string, commentId: string, text: string): Promise<{ comment: Comment }> {
    return simulate(() => {
      maybeThrowCommentChaos('edit');
      const comment = db.updateComment(postId, commentId, text);
      if (!comment) throw fail.validation({ text: ['Comment not found'] });
      return { comment };
    });
  },

  deleteComment(postId: string, commentId: string): Promise<{ comment: Comment }> {
    return simulate(() => {
      maybeThrowCommentChaos('remove');
      if (!db.removeComment(postId, commentId)) throw new Error('Comment not found');
      const comment = db.getComment(postId, commentId);
      if (!comment) throw new Error('Comment not found');
      return { comment };
    });
  },

  getTimeline(q: string, page: number): Promise<TimelinePage> {
    return simulate(() => db.searchTimeline(q, page));
  },
};

export type { Comment, Post, TimelinePage } from './types';
