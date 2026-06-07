import { defineMutation } from 'define-query';
import { demoApi } from '../api';
import type { Comment, Post } from '../api/types';
import { postCommentsQuery, postQuery, timelineInfiniteQuery, timelineQuery } from './queries';

export { postCommentsQuery } from './queries';

export const addCommentMutation = defineMutation(postCommentsQuery, {
  name: 'add',
  request: (postId: string, text: string) => demoApi.addComment(postId, text),
  insert: 'items',
  draft: (text, id): Comment => ({
    id,
    text,
    createdAt: new Date().toISOString(),
  }),
  from: response => response.comment,
  keepOnFail: true,
  sync: on => [
    on(postQuery).bump('commentCount', 1),
    on(timelineInfiniteQuery).mergeItem<Post>('items', {
      set: item => ({ commentCount: item.commentCount + 1 }),
    }),
    on(timelineQuery).mergeItem<Post>('items', {
      set: item => ({ commentCount: item.commentCount + 1 }),
    }),
  ],
});

export const editCommentMutation = defineMutation(postCommentsQuery, {
  name: 'edit',
  remapInput: ['commentId'],
  request: async (postId: string, { commentId, text }: { commentId: string; text: string }) => {
    const { comment } = await demoApi.updateComment(postId, commentId, text);
    return comment;
  },
  update: 'items',
  match: (item, input) => item.id === input.commentId,
  draft: (input: { commentId: string; text: string }) => ({ text: input.text }),
  keepOnFail: true,
});

export const removeCommentMutation = defineMutation(postCommentsQuery, {
  name: 'remove',
  request: (postId: string, commentId: string) => demoApi.deleteComment(postId, commentId),
  remove: 'items',
  match: (item, commentId) => item.id === commentId,
  sync: on => [
    on(postQuery).bump('commentCount', -1),
    on(timelineInfiniteQuery).mergeItem<Post>('items', {
      set: item => ({ commentCount: Math.max(0, item.commentCount - 1) }),
    }),
    on(timelineQuery).mergeItem<Post>('items', {
      set: item => ({ commentCount: Math.max(0, item.commentCount - 1) }),
    }),
  ],
});
