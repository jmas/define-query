import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { getQueryKey } from './query-key';

type Comment = { id: string; text: string };

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: Comment[] }> => ({ items: [] }),
});

const commentsKey = getQueryKey(commentsQuery, 'p1');

const call = (client: QueryClient, options: { mutationFn?: unknown }, input?: unknown): Promise<unknown> =>
  (options.mutationFn as (i: unknown, ctx: { client: QueryClient }) => Promise<unknown>)(input, {
    client,
  });

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function controllable<TResult>() {
  const calls: { args: unknown[]; deferred: Deferred<TResult> }[] = [];
  const fn = (...args: unknown[]) => {
    const d = deferred<TResult>();
    calls.push({ args, deferred: d });
    return d.promise;
  };
  return { fn, calls };
}

function items(client: QueryClient): Comment[] {
  return client.getQueryData<{ items: Comment[] }>(commentsKey)?.items ?? [];
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('overlapping mutations on one list query', () => {
  it('two edits of the same row settle to the last response', async () => {
    const client = new QueryClient();
    client.setQueryData(commentsKey, { items: [{ id: 'c1', text: 'a' }] });

    const server = controllable<Comment>();
    const editComment = defineMutation({ query: commentsQuery,
      name: 'edit',
      request: (postId: string, input: { commentId: string; text: string }) =>
        server.fn(postId, input),
      update: 'items',
      match: (item, input) => item.id === input.commentId,
      draft: ({ input }) => ({ text: input.text }),
    });

    const p1 = call(client, editComment('p1'), { commentId: 'c1', text: 'A' });
    expect(items(client)[0].text).toBe('A');
    const p2 = call(client, editComment('p1'), { commentId: 'c1', text: 'B' });
    expect(items(client)[0].text).toBe('B');

    await tick();
    server.calls[0].deferred.resolve({ id: 'c1', text: 'A' });
    server.calls[1].deferred.resolve({ id: 'c1', text: 'B' });
    await Promise.all([p1, p2]);

    expect(items(client)).toEqual([{ id: 'c1', text: 'B' }]);
  });

  it('an add while a remove is pending keeps both effects isolated', async () => {
    const client = new QueryClient();
    client.setQueryData(commentsKey, { items: [{ id: 'c1', text: 'a' }] });

    const removeServer = controllable<{ ok: true }>();
    const removeComment = defineMutation({ query: commentsQuery,
      name: 'remove',
      request: (postId: string, commentId: string) => removeServer.fn(postId, commentId),
      removeField: 'items',
      match: (item, commentId) => item.id === commentId,
    });

    const addServer = controllable<{ comment: Comment }>();
    const addComment = defineMutation({ query: commentsQuery,
      name: 'add',
      request: (postId: string, text: string) => addServer.fn(postId, text),
      insert: 'items',
      draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
      settle: response => response.comment,
    });

    const removePromise = call(client, removeComment('p1'), 'c1');
    expect(items(client).map(i => i.id)).toEqual([]);

    const addPromise = call(client, addComment('p1'), 'hi');
    expect(items(client)).toHaveLength(1);

    await tick();
    removeServer.calls[0].deferred.resolve({ ok: true });
    addServer.calls[0].deferred.resolve({ comment: { id: 'srv-hi', text: 'hi' } });
    await Promise.all([removePromise, addPromise]);

    expect(items(client)).toEqual([{ id: 'srv-hi', text: 'hi' }]);
  });

  it('two parallel inserts each reconcile to their own server id', async () => {
    const client = new QueryClient();
    client.setQueryData(commentsKey, { items: [] });

    const server = controllable<{ comment: Comment }>();
    const addComment = defineMutation({ query: commentsQuery,
      name: 'add',
      request: (postId: string, text: string) => server.fn(postId, text),
      insert: 'items',
      draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
      settle: response => response.comment,
    });

    const p1 = call(client, addComment('p1'), 'x');
    const p2 = call(client, addComment('p1'), 'y');
    expect(items(client)).toHaveLength(2);

    await tick();
    server.calls[1].deferred.resolve({ comment: { id: 'srv-y', text: 'y' } });
    server.calls[0].deferred.resolve({ comment: { id: 'srv-x', text: 'x' } });
    await Promise.all([p1, p2]);

    expect(items(client).map(i => i.id).sort()).toEqual(['srv-x', 'srv-y']);
  });
});
