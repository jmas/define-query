import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { getSettledIds } from './client-state';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { getQueryKey } from './query-key';

type Comment = { id: string; text: string };

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: Comment[] }> => ({ items: [] }),
});

const postQuery = defineQuery({
  key: (id: string) => ['post', id],
  fetch: async (id: string) => ({ id, title: 'T', commentCount: 0 }),
});

const call = (
  client: QueryClient,
  options: { mutationFn?: unknown },
  input?: unknown,
): Promise<unknown> =>
  (options.mutationFn as (i: unknown, ctx: { client: QueryClient }) => Promise<unknown>)(input, {
    client,
  });

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('per-QueryClient isolation', () => {
  it('settledIds in client A do not affect client B', () => {
    const clientA = new QueryClient();
    const clientB = new QueryClient();

    getSettledIds(clientA).set('tmp_a', 'srv_a');

    expect(getSettledIds(clientA).get('tmp_a')).toBe('srv_a');
    expect(getSettledIds(clientB).get('tmp_a')).toBeUndefined();
  });
});

describe('lifecycle cleanup', () => {
  it('forgetSettledId drops temp→server mapping after remove', async () => {
    const client = new QueryClient();
    const key = getQueryKey(commentsQuery, 'p1');
    client.setQueryData(key, { items: [] });

    let capturedId: string | undefined;
    const addComment = defineMutation(commentsQuery, {
      name: 'add',
      request: async (_postId: string, text: string) => ({ comment: { id: 'srv1', text } }),
      insert: 'items',
      draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
      settle: response => response.comment,
    });

    await call(client, addComment('p1'), 'hi');
    const tempId = [...getSettledIds(client).keys()][0];
    expect(tempId).toBeDefined();
    expect(getSettledIds(client).size).toBe(1);

    const removeComment = defineMutation(commentsQuery, {
      name: 'remove',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _commentId: string) => ({ ok: true }),
      removeField: 'items',
      match: (item, commentId) => item.id === commentId,
    });

    await call(client, removeComment('p1'), 'srv1');
    expect(getSettledIds(client).size).toBe(0);

    const editComment = defineMutation(commentsQuery, {
      name: 'edit',
      request: async (_postId: string, input: { commentId: string }) => {
        capturedId = input.commentId;
        return { text: 'x' };
      },
      update: 'items',
      match: (item, input) => item.id === input.commentId,
      draft: () => ({ text: 'x' }),
    });

    client.setQueryData(key, { items: [{ id: 'srv1', text: 'hi' }] });
    await call(client, editComment('p1'), { commentId: tempId });
    expect(capturedId).toBe(tempId);
    expect(capturedId).not.toBe('srv1');
  });

  it('removeQuery clears settledIds for the query', async () => {
    const client = new QueryClient();
    const key = getQueryKey(postQuery, 'p1');
    client.setQueryData(key, { id: 'p1', title: 'T', commentCount: 0 });

    const removePost = defineMutation(postQuery, {
      name: 'removePost',
      request: async () => ({ ok: true }),
      removeQuery: true,
    });

    getSettledIds(client).set('tmp_p1', 'p1');

    await call(client, removePost('p1'));
    await tick();

    expect(getSettledIds(client).size).toBe(0);
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it('QueryCache removed event clears settledIds for externally removed queries', async () => {
    const client = new QueryClient();
    const key = getQueryKey(commentsQuery, 'p1');
    client.setQueryData(key, { items: [] });

    const noopMutation = defineMutation(commentsQuery, {
      name: 'noop',
      request: async () => ({ ok: true }),
      draft: ({ data }) => data,
    });
    await call(client, noopMutation('p1'));

    client.setQueryData(key, { items: [{ id: 'c1', text: 'a' }] });
    getSettledIds(client).set('tmp_c1', 'c1');
    expect(getSettledIds(client).size).toBe(1);

    client.removeQueries({ queryKey: key });
    await tick();

    expect(getSettledIds(client).size).toBe(0);
  });
});
