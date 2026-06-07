import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { getRowStore } from './client-state';
import { defineMutation } from './define-mutation';
import { defineInfiniteQuery } from './define-query';
import { fail } from './errors';
import { getQueryKey } from './query-key';
import { isTempId } from './temp-id';
import { useRowState } from './use-row-state';

type Post = { id: string; title: string };

type TimelinePage = { items: Post[]; total: number; page: number; pageSize: number };

const timelineInfiniteQuery = defineInfiniteQuery({
  key: (params: { q: string }) => ['timeline-infinite', params] as const,
  fetch: async (): Promise<TimelinePage> => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  }),
  initialPage: 1,
  nextPage: () => undefined,
});

let resolveCreate: ((value: Post) => void) | undefined;
let createPromise: Promise<Post> | undefined;

const createPost = defineMutation(timelineInfiniteQuery, {
  name: 'create',
  request: async (_params: { q: string }, { title }: { title: string }) => {
    if (title === 'boom') throw fail.network('offline');
    createPromise = new Promise<Post>(resolve => {
      resolveCreate = resolve;
    });
    return createPromise;
  },
  prepend: 'items',
  draft: (input: { title: string }, id: string): Post => ({ id, title: input.title }),
  from: response => response,
  keepOnFail: true,
});

const params = { q: '' };
const timelineKey = getQueryKey(timelineInfiniteQuery, params);

const emptyInfinite: InfiniteData<TimelinePage> = {
  pages: [{ items: [], total: 0, page: 1, pageSize: 10 }],
  pageParams: [1],
};

function TimelineCreate() {
  const timeline = useInfiniteQuery(timelineInfiniteQuery(params));
  const create = useMutation(createPost(params));
  const rowState = useRowState(timelineInfiniteQuery, params);
  const items = timeline.data?.pages[0]?.items ?? [];

  return (
    <div>
      <ul>
        {items.map(post => (
          <li key={post.id} data-status={rowState(post).status}>
            {post.title}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => create.mutate({ title: 'New post' })}>
        create
      </button>
      <button type="button" onClick={() => create.mutate({ title: 'boom' })}>
        create-fail
      </button>
    </div>
  );
}

let testClient: QueryClient;

function renderWithClient(node: ReactNode) {
  testClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  testClient.setQueryData(timelineKey, emptyInfinite);
  return render(<QueryClientProvider client={testClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  resolveCreate = undefined;
  createPromise = undefined;
  if (testClient) getRowStore(testClient)._reset();
});

describe('infinite prepend mutation', () => {
  it('prepends to pages[0], settles to the server id', async () => {
    renderWithClient(<TimelineCreate />);

    act(() => screen.getByText('create').click());

    const optimistic = await screen.findByText('New post');
    expect(optimistic.getAttribute('data-status')).toBe('pending');

    await waitFor(() => expect(createPromise).toBeDefined());
    const during = testClient.getQueryData<InfiniteData<TimelinePage>>(timelineKey)!;
    expect(during.pages[0].items).toHaveLength(1);
    expect(isTempId(during.pages[0].items[0].id)).toBe(true);

    resolveCreate!({ id: 'srv-1', title: 'New post' });
    await waitFor(() => {
      expect(screen.getByText('New post').getAttribute('data-status')).toBe('ok');
    });

    const settled = testClient.getQueryData<InfiniteData<TimelinePage>>(timelineKey)!;
    expect(settled.pages[0].items[0].id).toBe('srv-1');
  });

  it('keeps a failed prepend row with keepOnFail', async () => {
    renderWithClient(<TimelineCreate />);

    act(() => screen.getByText('create-fail').click());

    await waitFor(() => {
      expect(screen.getByText('boom').getAttribute('data-status')).toBe('failed');
    });
  });
});
