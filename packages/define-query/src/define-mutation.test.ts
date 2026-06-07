import { describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: { id: string; text: string }[] }> => ({ items: [] }),
});

describe('defineMutation guards', () => {
  it('allows a single list insert form', () => {
    expect(() =>
      defineMutation(commentsQuery, {
        name: 'add',
        request: async (_postId: string, text: string) => ({ id: '1', text }),
        insert: 'items',
        draft: (text, id) => ({ id, text }),
      }),
    ).not.toThrow();
  });
});
