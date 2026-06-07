import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: { id: string; text: string }[] }> => ({ items: [] }),
});

// @ts-expect-error — only one optimistic form allowed
defineMutation(commentsQuery, {
  name: 'bad',
  request: async () => ({ ok: true }),
  insert: 'items',
  update: 'items',
  draft: () => ({ id: 'x', text: 'y' }),
});
