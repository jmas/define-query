import { defineMutation } from 'define-query';
import { demoApi } from '../api';
import type { Comment } from '../api/types';
import { commentQuery, postCommentsQuery, postQuery, timelineInfiniteQuery } from './queries';

export { commentQuery, postCommentsQuery } from './queries';

export const addCommentMutation = defineMutation(postCommentsQuery, {
  name: 'add',
  request: (postId: string, text: string) => demoApi.addComment(postId, text),
  insert: 'items',
  draft: ({ input, tempId }): Comment => ({
    id: tempId!,
    text: input,
    createdAt: new Date().toISOString(),
  }),
  settle: response => response.comment,
  sync: on => [
    on(commentQuery).setEach('items', {
      params: (event, item) => ({ postId: event.params, commentId: item.id }),
      set: item => item,
    }),
    on(postQuery).bump('commentCount', 1),
    on(timelineInfiniteQuery).mergeItem('items', {
      set: item => ({ commentCount: item.commentCount + 1 }),
    }),
  ],
});

export const editCommentMutation = defineMutation(postCommentsQuery, {
  name: 'edit',
  remapInput: ['commentId'],
  request: (postId: string, { commentId, text }: { commentId: string; text: string }) =>
    demoApi.updateComment(postId, commentId, text),
  update: 'items',
  match: (item, input) => item.id === input.commentId,
  draft: ({ input }) => ({ text: input.text }),
});

export const removeCommentMutation = defineMutation(postCommentsQuery, {
  name: 'remove',
  remapInput: ['commentId'],
  request: (postId: string, commentId: string) => demoApi.deleteComment(postId, commentId),
  remove: 'items',
  match: (item, commentId) => item.id === commentId,
  sync: on => [
    on(postQuery).bump('commentCount', -1, { params: ({ params }) => params }),
    on(timelineInfiniteQuery).mergeItem('items', {
      id: ({ params }) => params,
      set: item => ({ commentCount: Math.max(0, item.commentCount - 1) }),
    }),
  ],
});
