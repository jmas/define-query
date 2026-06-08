import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { defineMutation } from './define-mutation';
import { defineInfiniteQuery } from './define-query';
import { fail } from './errors';
import { isTempId } from './temp-id';

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
  draft: ({ input, tempId }): Post => ({ id: tempId!, title: input.title }),
  settle: response => response,
});

const params = { q: '' };
const timelineKey = timelineInfiniteQuery.key(params);

const emptyInfinite: InfiniteData<TimelinePage> = {
  pages: [{ items: [], total: 0, page: 1, pageSize: 10 }],
  pageParams: [1],
};

function TimelineCreate() {
  const timeline = useInfiniteQuery(timelineInfiniteQuery(params));
  const create = useMutation(createPost(params));
  const items = timeline.data?.pages[0]?.items ?? [];

  return (
    <div>
      <ul>
        {items.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button type="button" onClick={() => create.mutate({ title: 'New post' })}>
        create
      </button>
      <button type="button" onClick={() => create.mutate({ title: 'boom' })}>
        create-fail
      </button>
      {create.error && <span data-testid="error">{(create.error as Error).message}</span>}
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
});

describe('infinite prepend mutation', () => {
  it('prepends to pages[0], settles to the server id', async () => {
    renderWithClient(<TimelineCreate />);

    act(() => screen.getByText('create').click());

    await screen.findByText('New post');

    await waitFor(() => expect(createPromise).toBeDefined());
    const during = testClient.getQueryData<InfiniteData<TimelinePage>>(timelineKey)!;
    expect(during.pages[0].items).toHaveLength(1);
    expect(isTempId(during.pages[0].items[0].id)).toBe(true);

    resolveCreate!({ id: 'srv-1', title: 'New post' });
    await waitFor(() => {
      const settled = testClient.getQueryData<InfiniteData<TimelinePage>>(timelineKey)!;
      expect(settled.pages[0].items[0].id).toBe('srv-1');
    });
  });

  it('rolls back the draft row and surfaces mutation.error on failure', async () => {
    renderWithClient(<TimelineCreate />);

    act(() => screen.getByText('create-fail').click());

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('offline');
    });

    const data = testClient.getQueryData<InfiniteData<TimelinePage>>(timelineKey)!;
    expect(data.pages[0].items).toHaveLength(0);
  });
});
