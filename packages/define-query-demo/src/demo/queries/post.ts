import { defineMutation } from 'define-query';
import { demoApi } from '../api';
import { postQuery, timelineInfiniteQuery } from './queries';

export { postQuery } from './queries';

export const renamePostMutation = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => demoApi.patchPost(id, { title }),
  draft: ({ data, input }) => ({ ...data, title: input }),
  sync: on => [
    on(timelineInfiniteQuery).mergeItem('items', {
      set: (_item, { input }) => ({ title: input }),
    }),
  ],
});

export const removePostMutation = defineMutation(postQuery, {
  name: 'remove',
  request: (id: string) => demoApi.deletePost(id),
  removes: true,
  sync: on => [on(timelineInfiniteQuery).removeItem('items')],
});
