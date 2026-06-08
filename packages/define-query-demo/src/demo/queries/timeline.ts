import { defineMutation, fail } from 'define-query';
import { demoApi } from '../api';
import type { Post } from '../api/types';
import { postCommentsQuery, postQuery, timelineInfiniteQuery } from './queries';

export { timelineInfiniteQuery } from './queries';

export const createTimelinePostMutation = defineMutation(timelineInfiniteQuery, {
  name: 'create',
  request: (_params: { q: string }, { title, body }: { title: string; body: string }) =>
    demoApi.createPost({ title, body }),
  validate: ({ title, body }) => {
    if (!title.trim()) throw fail.validation({ title: ['Title cannot be empty'] });
    if (!body.trim()) throw fail.validation({ body: ['Body cannot be empty'] });
  },
  prepend: 'items',
  draft: ({ input, tempId }): Post => ({
    id: tempId!,
    title: input.title.trim(),
    body: input.body.trim(),
    commentCount: 0,
  }),
  settle: response => response,
  sync: on => [
    on(postQuery).set((_current, { response }) => response, {
      params: ({ response }) => response.id,
    }),
    on(postCommentsQuery).set(() => ({ items: [] }), {
      params: ({ response }) => response.id,
    }),
  ],
});
