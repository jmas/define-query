import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineQuery } from './define-query';
import { fail } from './errors';
import { getQueryKey } from './query-key';

type Post = { id: string; title: string; commentCount: number };
type Comment = { id: string; text: string };

const postQuery = defineQuery({
  key: (id: string) => ['post', id],
  fetch: async (id: string): Promise<Post> => ({ id, title: 'T', commentCount: 0 }),
});
const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async (): Promise<{ items: Comment[] }> => ({ items: [] }),
});
const commentQuery = defineQuery({
  key: (params: { postId: string; commentId: string }) =>
    ['post', params.postId, 'comment', params.commentId] as const,
  fetch: async (): Promise<Comment> => ({ id: 'c1', text: 'x' }),
});

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const call = (
  client: QueryClient,
  options: { mutationFn?: unknown },
  input?: unknown,
): Promise<unknown> =>
  (options.mutationFn as (i: unknown, ctx: { client: QueryClient }) => Promise<unknown>)(input, {
    client,
  });

describe('object mutation', () => {
  const rename = defineMutation(postQuery, {
    name: 'rename',
    request: async (id: string, title: string) => ({ id, title }),
    draft: ({ data, input }) => ({ ...data, title: input }),
  });

  it('applies draft then settles with the response', async () => {
    const client = new QueryClient();
    const key = getQueryKey(postQuery, 'p1');
    client.setQueryData(key, { id: 'p1', title: 'old', commentCount: 2 });

    const options = rename('p1');
    const promise = call(client, options, 'new');
    expect(client.getQueryData<Post>(key)?.title).toBe('new');

    await promise;
    expect(client.getQueryData<Post>(key)).toMatchObject({ title: 'new', commentCount: 2 });
  });

  it('rolls back to previous data when the request rejects', async () => {
    const client = new QueryClient();
    const key = getQueryKey(postQuery, 'p1');
    const previous = { id: 'p1', title: 'old', commentCount: 2 };
    client.setQueryData(key, previous);

    const failing = defineMutation(postQuery, {
      name: 'rename',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_id: string, _title: string) => {
        throw fail.network('offline');
      },
      draft: ({ data, input }) => ({ ...data, title: input }),
    });

    await expect(call(client, failing('p1'), 'new')).rejects.toThrow();
    expect(client.getQueryData<Post>(key)).toEqual(previous);
  });
});

describe('insert mutation', () => {
  const addComment = defineMutation(commentsQuery, {
    name: 'add',
    request: async (_postId: string, text: string) => ({ comment: { id: 'srv1', text } }),
    insert: 'items',
    draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
    settle: response => response.comment,
    sync: on => [
      on(commentQuery).setEach('items', {
        params: (event, item) => ({ postId: event.params, commentId: item.id }),
        set: item => item,
      }),
      on(postQuery).bump('commentCount', 1),
    ],
  });

  it('inserts a temp row, reconciles the server id, and bumps the sibling', async () => {
    const client = new QueryClient();
    const commentsKey = getQueryKey(commentsQuery, 'p1');
    const postKey = getQueryKey(postQuery, 'p1');
    client.setQueryData(commentsKey, { items: [] });
    client.setQueryData(postKey, { id: 'p1', title: 'T', commentCount: 0 });

    const promise = call(client, addComment('p1'), 'hello');
    const drafted = client.getQueryData<{ items: Comment[] }>(commentsKey)!;
    expect(drafted.items).toHaveLength(1);
    const tempId = drafted.items[0].id;
    expect(client.getQueryData(getQueryKey(commentQuery, { postId: 'p1', commentId: tempId }))).toEqual({
      id: tempId,
      text: 'hello',
    });

    await promise;
    const settled = client.getQueryData<{ items: Comment[] }>(commentsKey)!;
    expect(settled.items[0].id).toBe('srv1');
    expect(client.getQueryData<Post>(postKey)?.commentCount).toBe(1);
    expect(client.getQueryData(getQueryKey(commentQuery, { postId: 'p1', commentId: 'srv1' }))).toEqual({
      id: 'srv1',
      text: 'hello',
    });
  });

  it('rolls back the temp row when the request fails', async () => {
    const client = new QueryClient();
    const commentsKey = getQueryKey(commentsQuery, 'p1');
    client.setQueryData(commentsKey, { items: [] });
    client.setQueryData(getQueryKey(postQuery, 'p1'), { id: 'p1', title: 'T', commentCount: 0 });

    const flaky = defineMutation(commentsQuery, {
      name: 'add',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      request: async (_postId: string, _text: string): Promise<{ comment: Comment }> => {
        throw fail.network('offline');
      },
      insert: 'items',
      draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
      settle: response => response.comment,
    });

    await expect(call(client, flaky('p1'), 'hello')).rejects.toThrow();
    expect(client.getQueryData<{ items: Comment[] }>(commentsKey)?.items).toHaveLength(0);
  });
});

describe('remove mutations', () => {
  const removeComment = defineMutation(commentsQuery, {
    name: 'remove',
    request: async (postId: string, commentId: string) => ({ ok: true, postId, commentId }),
    remove: 'items',
    match: (item, commentId) => item.id === commentId,
  });

  it('removes the matched row', async () => {
    const client = new QueryClient();
    const key = getQueryKey(commentsQuery, 'p1');
    client.setQueryData(key, { items: [{ id: 'c1', text: 'a' }, { id: 'c2', text: 'b' }] });

    await call(client, removeComment('p1'), 'c1');
    expect(client.getQueryData<{ items: Comment[] }>(key)?.items.map(i => i.id)).toEqual(['c2']);
  });

  it('removes the whole query for a `removes` mutation', async () => {
    const client = new QueryClient();
    const key = getQueryKey(postQuery, 'p1');
    client.setQueryData(key, { id: 'p1', title: 'T', commentCount: 0 });

    const removePost = defineMutation(postQuery, {
      name: 'removePost',
      request: async (id: string) => ({ ok: true, id }),
      removes: true,
    });

    await call(client, removePost('p1'));
    await tick();
    expect(client.getQueryData(key)).toBeUndefined();
  });
});

describe('validation', () => {
  const create = defineMutation(commentsQuery, {
    name: 'add',
    request: async (_postId: string, text: string) => ({ comment: { id: 'srv1', text } }),
    validate: text => {
      if (!text.trim()) throw fail.validation({ text: 'Required' });
    },
    insert: 'items',
    draft: ({ input, tempId }): Comment => ({ id: tempId!, text: input }),
  });

  it('rejects before touching the cache when validate throws', async () => {
    const client = new QueryClient();
    const key = getQueryKey(commentsQuery, 'p1');
    client.setQueryData(key, { items: [] });

    await expect(call(client, create('p1'), '   ')).rejects.toMatchObject({
      name: 'DefineQueryMutationError',
      kind: 'validation',
    });
    expect(client.getQueryData<{ items: Comment[] }>(key)?.items).toHaveLength(0);
  });
});
