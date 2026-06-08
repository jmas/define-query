import { describe, expect, it } from 'vitest';
import { defineInfiniteQuery, defineQuery } from './define-query';

describe('defineQuery factory', () => {
  const postQuery = defineQuery({
    key: (id: string) => ['post', id],
    fetch: async (id: string) => ({ id, title: 'T' }),
    options: { staleTime: 4_000 },
  });

  it('produces a TanStack queryOptions object', async () => {
    const opts = postQuery('p1');
    expect(opts.queryKey).toEqual(['post', 'p1']);
    expect(opts.staleTime).toBe(4_000);
    await expect((opts.queryFn as () => Promise<unknown>)()).resolves.toEqual({ id: 'p1', title: 'T' });
  });

  it('exposes normalized key + infinite metadata', () => {
    expect(postQuery.infinite).toBe(false);
    expect(postQuery.key('p1')).toEqual(['post', 'p1']);
    expect(postQuery.key('p1')).toEqual(postQuery('p1').queryKey);
  });
});

describe('defineInfiniteQuery factory', () => {
  const timeline = defineInfiniteQuery({
    key: (params: { q: string }) => ['timeline', params],
    fetch: async (_params, page: number) => ({ page, items: [], total: 30, pageSize: 10 }),
    initialPage: 1,
    nextPage: last => (last.page < 3 ? last.page + 1 : undefined),
  });

  it('produces infiniteQueryOptions with page-param wiring', () => {
    const opts = timeline({ q: '' });
    expect(opts.queryKey).toEqual(['timeline', { q: '' }]);
    expect(opts.initialPageParam).toBe(1);
    expect(opts.getNextPageParam({ page: 1, items: [], total: 30, pageSize: 10 }, [], 1, [])).toBe(2);
    expect(opts.getNextPageParam({ page: 3, items: [], total: 30, pageSize: 10 }, [], 3, [])).toBeUndefined();
    expect(timeline.infinite).toBe(true);
  });
});
