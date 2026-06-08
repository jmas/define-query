import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { setupDefineQuery } from './client-state';
import { defineInfiniteQuery, defineQuery } from './define-query';
import {
  createQueryOnBuilder,
  runQuerySync,
  type QueryFetchSyncEvent,
  type QuerySyncOp,
} from './query-sync';

type Comment = { id: string; text: string };
type Post = { id: string; title: string };

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: async (id: string) => ({ id, title: `Post ${id}` }),
});

const commentQuery = defineQuery({
  key: ({ postId, commentId }: { postId: string; commentId: string }) =>
    ['post', postId, 'comment', commentId] as const,
  fetch: async ({ postId, commentId }) => ({ id: commentId, text: `${postId}:${commentId}` }),
});

const postCommentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: async () => ({
    items: [
      { id: 'c1', text: 'one' },
      { id: 'c2', text: 'two' },
    ] as Comment[],
  }),
  sync: on => [
    on(commentQuery).setEach('items', {
      params: (event, item) => ({ postId: event.params, commentId: item.id }),
      set: item => item,
    }),
  ],
});

const postDetailQuery = defineQuery({
  key: (id: string) => ['post', id, 'detail'] as const,
  fetch: async (id: string) => ({
    id,
    title: `Detail ${id}`,
    body: 'body',
    commentCount: 3,
  }),
  sync: on => [
    on(postQuery).set((_current, { data }) => ({
      id: data.id,
      title: data.title,
    })),
  ],
});

const timelineInfiniteQuery = defineInfiniteQuery({
  key: (params: { q: string }) => ['timeline-infinite', params] as const,
  fetch: async (_params, page: number) => ({
    items: [{ id: `p${page}`, title: `Page ${page}` }] as Post[],
    page,
    total: 2,
    pageSize: 1,
  }),
  initialPage: 1,
  nextPage: last => (last.page < 2 ? last.page + 1 : undefined),
  sync: on => [
    on(postQuery).setEach('items', {
      params: (_event, post) => post.id,
      set: post => post,
    }),
  ],
});

const plainListQuery = defineQuery({
  key: (scope: 'plain') => ['plain-list', scope] as const,
  fetch: async () => ({ items: [{ id: 'x', title: 'X' }] as Post[] }),
});

type CommentsListEvent = QueryFetchSyncEvent<string, { items: Comment[] }>;
type PostPayloadEvent = QueryFetchSyncEvent<unknown, { post: Post }>;

const run = <E extends QueryFetchSyncEvent<unknown, unknown>>(
  client: QueryClient,
  op: QuerySyncOp<E>,
  event: E,
) => runQuerySync(client, [op], event);

async function tick(): Promise<void> {
  await new Promise<void>(resolve => queueMicrotask(resolve));
}

describe('runQuerySync', () => {
  it('set upserts one sibling cache entry', () => {
    const client = new QueryClient();
    const onBuilder = createQueryOnBuilder<QueryFetchSyncEvent<string, Post>>();
    run(
      client,
      onBuilder(postQuery).set((_current, { data }) => data),
      { params: 'p1', data: { id: 'p1', title: 'Synced' } },
    );
    expect(client.getQueryData(['post', 'p1'])).toEqual({ id: 'p1', title: 'Synced' });
  });

  it('set uses explicit params()', () => {
    const client = new QueryClient();
    const onBuilder = createQueryOnBuilder<PostPayloadEvent>();
    run(
      client,
      onBuilder(postQuery).set((_current, { data }) => data.post, {
        params: ({ data }) => data.post.id,
      }),
      { params: 'ignored', data: { post: { id: 'p9', title: 'Nine' } } },
    );
    expect(client.getQueryData(['post', 'p9'])).toEqual({ id: 'p9', title: 'Nine' });
  });

  it('setEach seeds a cache entry per list item', () => {
    const client = new QueryClient();
    const onBuilder = createQueryOnBuilder<CommentsListEvent>();
    run(
      client,
      onBuilder(commentQuery).setEach('items', {
        params: (e, item) => ({ postId: e.params, commentId: item.id }),
        set: item => item,
      }),
      {
        params: 'p1',
        data: {
          items: [
            { id: 'c1', text: 'one' },
            { id: 'c2', text: 'two' },
          ],
        },
      },
    );
    expect(client.getQueryData(['post', 'p1', 'comment', 'c1'])).toEqual({ id: 'c1', text: 'one' });
    expect(client.getQueryData(['post', 'p1', 'comment', 'c2'])).toEqual({ id: 'c2', text: 'two' });
  });
});

describe('defineQuery sync via QueryCache', () => {
  it('runs setEach after a successful fetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(client);
    await client.fetchQuery(postCommentsQuery('p1'));
    await tick();

    expect(client.getQueryData(['post', 'p1', 'comment', 'c1'])).toEqual({ id: 'c1', text: 'one' });
    expect(client.getQueryData(['post', 'p1', 'comment', 'c2'])).toEqual({ id: 'c2', text: 'two' });
  });

  it('runs set after a successful fetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(client);
    await client.fetchQuery(postDetailQuery('p1'));
    await tick();

    expect(client.getQueryData(['post', 'p1'])).toEqual({ id: 'p1', title: 'Detail p1' });
  });

  it('does not run sync on manual setQueryData', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'setQueryData');

    client.setQueryData(postCommentsQuery('p1').queryKey, {
      items: [{ id: 'c9', text: 'manual' }],
    });
    await tick();

    const commentCalls = spy.mock.calls.filter(([key]) =>
      Array.isArray(key) && key[0] === 'post' && key[2] === 'comment',
    );
    expect(commentCalls).toHaveLength(0);
    expect(client.getQueryData(['post', 'p1', 'comment', 'c9'])).toBeUndefined();
  });

  it('does not run sync for queries without sync config', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(client);
    await client.fetchQuery(plainListQuery('plain'));
    await tick();

    expect(client.getQueryData(['post', 'x'])).toBeUndefined();
  });

  it('runs sync again on refetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(client);
    await client.fetchQuery(postCommentsQuery('p1'));
    await tick();

    client.setQueryData(['post', 'p1', 'comment', 'c1'], { id: 'c1', text: 'stale' });
    await client.refetchQueries({ queryKey: postCommentsQuery('p1').queryKey });
    await tick();

    expect(client.getQueryData(['post', 'p1', 'comment', 'c1'])).toEqual({ id: 'c1', text: 'one' });
  });

  it('isolates sync between QueryClients', async () => {
    const clientA = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const clientB = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(clientA);
    setupDefineQuery(clientB);

    await clientA.fetchQuery(postCommentsQuery('p1'));
    await tick();

    expect(clientA.getQueryData(['post', 'p1', 'comment', 'c1'])).toBeDefined();
    expect(clientB.getQueryData(['post', 'p1', 'comment', 'c1'])).toBeUndefined();
  });
});

describe('defineInfiniteQuery sync via QueryCache', () => {
  it('setEach flattens infinite pages after fetchNextPage', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setupDefineQuery(client);
    const observer = new InfiniteQueryObserver(client, timelineInfiniteQuery({ q: '' }));

    await observer.fetchNextPage();
    await tick();

    expect(client.getQueryData(['post', 'p1'])).toEqual({ id: 'p1', title: 'Page 1' });

    await observer.fetchNextPage();
    await tick();

    expect(client.getQueryData(['post', 'p1'])).toEqual({ id: 'p1', title: 'Page 1' });
    expect(client.getQueryData(['post', 'p2'])).toEqual({ id: 'p2', title: 'Page 2' });
  });
});
