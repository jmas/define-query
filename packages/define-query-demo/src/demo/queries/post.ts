import { defineMutation } from 'define-query';
import { demoApi } from '../api';
import type { Post } from '../api/types';
import { postQuery, timelineInfiniteQuery, timelineQuery } from './queries';

export { postQuery } from './queries';

export const renamePostMutation = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => demoApi.patchPost(id, { title }),
  optimistic: (post, title) => ({ ...post, title }),
  sync: on => [
    on(timelineInfiniteQuery).mergeItem<Post>('items', {
      set: (_item, { input }) => ({ title: input }),
    }),
    on(timelineQuery).mergeItem<Post>('items', {
      set: (_item, { input }) => ({ title: input }),
    }),
  ],
});

export const removePostMutation = defineMutation(postQuery, {
  name: 'remove',
  request: (id: string) => demoApi.deletePost(id),
  removes: true,
  sync: on => [
    on(timelineInfiniteQuery).removeItem('items'),
    on(timelineQuery).removeItem('items'),
  ],
});
