import { defineMutation } from 'define-query';
import { demoApi } from '../api';
import { postQuery, timelineInfiniteQuery } from './queries';

export { postQuery } from './queries';

export const renamePostMutation = defineMutation({ query: postQuery,
  name: 'rename',
  request: (id: string, title: string) => demoApi.patchPost(id, { title }),
  draft: ({ data, input }) => ({ ...data, title: input }),
  sync: on => [
    on(timelineInfiniteQuery).mergeItem('items', {
      set: (_item, { input }) => ({ title: input }),
    }),
  ],
});

export const removePostMutation = defineMutation({ query: postQuery,
  name: 'remove',
  request: (id: string) => demoApi.deletePost(id),
  removeQuery: true,
  sync: on => [on(timelineInfiniteQuery).removeItem('items')],
});

/** Thin mutation — no bound query; sync invalidates sibling cache after request. */
export const refreshPostMutation = defineMutation({
  name: 'refreshPost',
  request: (id: string) => demoApi.getPost(id),
  sync: on => [on(postQuery).invalidate({ params: ({ params }) => params })],
});
