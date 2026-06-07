import { defineMutation, fail } from 'define-query';
import { demoApi } from '../api';
import type { Post } from '../api/types';
import { postCommentsQuery, postQuery, timelineInfiniteQuery, timelineQuery } from './queries';

export { timelineInfiniteQuery, timelineQuery } from './queries';

export const createTimelinePostMutation = defineMutation(timelineInfiniteQuery, {
  name: 'create',
  request: (_params: { q: string }, { title, body }: { title: string; body: string }) =>
    demoApi.createPost({ title, body }),
  validate: ({ title, body }) => {
    if (!title.trim()) throw fail.validation({ title: ['Title cannot be empty'] });
    if (!body.trim()) throw fail.validation({ body: ['Body cannot be empty'] });
  },
  prepend: 'items',
  draft: (input, id): Post => ({
    id,
    title: input.title.trim(),
    body: input.body.trim(),
    commentCount: 0,
  }),
  from: response => response,
  keepOnFail: true,
  sync: on => [
    on(timelineQuery).set(
      (current, { response }) => {
        if (!current) return { items: [response], total: 1, page: 1, pageSize: 10 };
        const index = current.items.findIndex(item => item.id === response.id);
        const items =
          index >= 0
            ? current.items.map(item => (item.id === response.id ? { ...item, ...response } : item))
            : [response, ...current.items];
        return { ...current, items };
      },
      { params: () => ({ q: '', page: 1 }) },
    ),
    on(postQuery).set((_current, { response }) => response, {
      params: ({ response }) => response.id,
    }),
    on(postCommentsQuery).set(() => ({ items: [] }), {
      params: ({ response }) => response.id,
    }),
  ],
});
