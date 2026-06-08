import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { fail } from './errors';

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
      defineMutation({ query: commentsQuery,
        name: 'add',
        request: async (_postId: string, text: string) => ({ id: '1', text }),
        insert: 'items',
        draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
      }),
    ).not.toThrow();
  });

  it('requires a mutation name', () => {
    expect(() =>
      defineMutation({ query: postQuery,
        name: '',
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        request: async (_id: string) => ({ id: 'p1', title: 'T' }),
        draft: ({ data }) => data,
      }),
    ).toThrow(/`name` is required/);
  });
});

describe('defineMutation mutationKey', () => {
  it('generates scoped mutationKey as [...queryKey, name]', () => {
    const rename = defineMutation({ query: postQuery,
      name: 'rename',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_id: string, _title: string) => ({ id: 'p1', title: 'New' }),
      draft: ({ data, input }) => ({ ...data, title: input }),
    });

    expect(rename('p1').mutationKey).toEqual(['post', 'p1', 'rename']);
    expect(rename.key('p1')).toEqual(['post', 'p1', 'rename']);
  });

  it('distinguishes mutations on the same query by name', () => {
    const add = defineMutation({ query: commentsQuery,
      name: 'add',
      request: async (_postId: string, text: string) => ({ id: '1', text }),
      insert: 'items',
      draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
    });
    const edit = defineMutation({ query: commentsQuery,
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

  it('generates name-only mutationKey when query is omitted', () => {
    const reportSpam = defineMutation({
      name: 'reportSpam',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _reason: string) => undefined,
    });

    expect(reportSpam('p1').mutationKey).toEqual(['reportSpam', 'p1']);
    expect(reportSpam.key('p1')).toEqual(['reportSpam', 'p1']);
  });

  it('uses name only when request has no params', () => {
    const logout = defineMutation({
      name: 'logout',
      request: async () => undefined,
    });

    expect(logout().mutationKey).toEqual(['logout']);
    expect(logout.key()).toEqual(['logout']);
  });
});

describe('defineMutation without query', () => {
  it('runs request and sync without touching a primary cache', async () => {
    const postQuery = defineQuery({
      key: (id: string) => ['post', id] as const,
      fetch: async () => ({ id: 'p1', title: 'T', commentCount: 0 }),
    });

    const client = new QueryClient();
    const postKey = postQuery.key('p1');
    client.setQueryData(postKey, { id: 'p1', title: 'T', commentCount: 0 });

    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');

    const reportSpam = defineMutation({
      name: 'reportSpam',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _reason: string) => ({ ok: true }),
      sync: on => [on(postQuery).invalidate({ params: ({ params }) => params })],
    });

    const options = reportSpam('p1');
    await (options.mutationFn as (input: string, ctx: { client: QueryClient }) => Promise<unknown>)(
      'spam',
      { client },
    );

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: postKey });
    invalidateSpy.mockRestore();
  });

  it('supports validate without query', async () => {
    const client = new QueryClient();
    const reportSpam = defineMutation({
      name: 'reportSpam',
      validate: reason => {
        if (!reason.trim()) throw fail.validation({ reason: ['Required'] });
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _reason: string) => ({ ok: true }),
    });

    const options = reportSpam('p1');
    await expect(
      (options.mutationFn as (input: string, ctx: { client: QueryClient }) => Promise<unknown>)(
        '  ',
        { client },
      ),
    ).rejects.toThrow();
  });

  it('throws at definition time when a draft form is used without query', () => {
    expect(() =>
      defineMutation({
        name: 'add',
        request: async (_postId: string, text: string) => ({ id: '1', text }),
        insert: 'items',
        draft: ({ input, tempId }: { input: string; tempId?: string }) => ({
          id: tempId!,
          text: input,
        }),
      } as never),
    ).toThrow(/`query` is required when using a draft form/);
  });
});
