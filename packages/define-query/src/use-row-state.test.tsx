import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRowStore } from './client-state';
import { defineQuery } from './define-query';
import { getQueryKey } from './query-key';
import { useRowState } from './use-row-state';

const commentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'],
  fetch: async () => ({ items: [] as { id: string }[] }),
});

const client = new QueryClient();
const key = getQueryKey(commentsQuery, 'p1');

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  getRowStore(client)._reset();
});

describe('useRowState', () => {
  it('reflects pending and failed state and exposes retry', () => {
    const { result } = renderHook(() => useRowState(commentsQuery, 'p1'), { wrapper });
    expect(result.current({ id: 'c1' }).status).toBe('ok');

    act(() => getRowStore(client).tagPending(key, 'c1', { mutation: 'add' }));
    expect(result.current({ id: 'c1' }).status).toBe('pending');

    const retry = vi.fn(async () => undefined);
    act(() =>
      getRowStore(client).markFailed(key, 'c1', { mutation: 'add', message: 'offline', retry }),
    );
    const row = result.current({ id: 'c1' });
    expect(row.status).toBe('failed');
    expect(row.error).toBe('offline');

    row.retry?.();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('returns ok for rows without state', () => {
    const { result } = renderHook(() => useRowState(commentsQuery, 'p1'), { wrapper });
    expect(result.current({ id: 'unknown' })).toEqual({ status: 'ok' });
  });
});
