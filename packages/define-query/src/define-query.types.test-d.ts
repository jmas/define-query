import { assertType } from 'vitest';
import { defineQuery } from './define-query';

type Comment = { id: string; text: string };

const commentQuery = defineQuery({
  key: ({ postId, commentId }: { postId: string; commentId: string }) =>
    ['post', postId, 'comment', commentId] as const,
  fetch: async ({ postId, commentId }) => ({ id: commentId, text: `${postId}:${commentId}` }),
});

defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fetch: async (_postId: string) => ({ items: [{ id: 'c1', text: 'a' }] as Comment[] }),
  sync: on => [
    on(commentQuery).setEach('items', {
      params: (event, item) => {
        assertType<string>(event.params);
        assertType<Comment>(item);
        return { postId: event.params, commentId: item.id };
      },
      set: item => {
        assertType<Comment>(item);
        return item;
      },
    }),
  ],
});

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: async (id: string) => ({ id, title: `Post ${id}` }),
});

defineQuery({
  key: (id: string) => ['post', id, 'detail'] as const,
  fetch: async (id: string) => ({
    id,
    title: `Detail ${id}`,
    body: 'body',
    commentCount: 3,
  }),
  sync: on => [
    on(postQuery).set((_current, { data }) => {
      assertType<string>(data.id);
      assertType<string>(data.title);
      return { id: data.id, title: data.title };
    }),
    on(postQuery).set((_current, { data }) => data, {
      params: ({ data }) => data.id,
    }),
  ],
});
