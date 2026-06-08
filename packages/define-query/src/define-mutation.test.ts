import { describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: async () => ({ id: 'p1', title: 'T' }),
});

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
        draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
      }),
    ).not.toThrow();
  });

  it('requires a mutation name', () => {
    expect(() =>
      defineMutation(postQuery, {
        name: 'test',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        request: async (_id: string) => ({ id: 'p1', title: 'T' }),
        draft: ({ data }) => data,
      }),
    ).toThrow(/`name` is required/);
  });
});

describe('defineMutation mutationKey', () => {
  it('generates scoped mutationKey as [...queryKey, name]', () => {
    const rename = defineMutation(postQuery, {
      name: 'rename',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_id: string, _title: string) => ({ id: 'p1', title: 'New' }),
      draft: ({ data, input }) => ({ ...data, title: input }),
    });

    expect(rename('p1').mutationKey).toEqual(['post', 'p1', 'rename']);
    expect(rename.key('p1')).toEqual(['post', 'p1', 'rename']);
  });

  it('distinguishes mutations on the same query by name', () => {
    const add = defineMutation(commentsQuery, {
      name: 'add',
      request: async (_postId: string, text: string) => ({ id: '1', text }),
      insert: 'items',
      draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
    });
    const edit = defineMutation(commentsQuery, {
      name: 'edit',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _input: { commentId: string; text: string }) => ({
        id: '1',
        text: 'x',
      }),
      update: 'items',
      match: (item, input) => item.id === input.commentId,
      draft: ({ input }) => ({ text: input.text }),
    });

    expect(add('p1').mutationKey).toEqual(['post', 'p1', 'comments', 'add']);
    expect(edit('p1').mutationKey).toEqual(['post', 'p1', 'comments', 'edit']);
  });
});
