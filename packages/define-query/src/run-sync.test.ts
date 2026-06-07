import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { defineQuery } from './define-query';
import { runSync } from './run-sync';
import { createOnBuilder, type SyncEvent, type SyncOp } from './sync';

type Event = SyncEvent<unknown, unknown, unknown>;
const on = createOnBuilder<Event>();
const run = (client: QueryClient, op: SyncOp<Event>, event: Event) =>
  runSync(client, [op] as readonly SyncOp<Event>[], event);

const postQuery = defineQuery({
  key: (id: string) => ['post', id],
  fetch: async (id: string) => ({ id, commentCount: 0 }),
});
const listQuery = defineQuery({
  key: (params: { q: string }) => ['list', params],
  fetch: async () => ({ items: [] as { id: string; title: string }[] }),
});

const event = (params: unknown): Event => ({ params, input: undefined, response: undefined });

describe('runSync', () => {
  it('bumps a numeric field (clamped at 0)', () => {
    const client = new QueryClient();
    client.setQueryData(['post', 'p1'], { id: 'p1', commentCount: 5 });
    run(client, on(postQuery).bump('commentCount', 1), event('p1'));
    expect(client.getQueryData(['post', 'p1'])).toMatchObject({ commentCount: 6 });

    run(client, on(postQuery).bump('commentCount', -100), event('p1'));
    expect(client.getQueryData(['post', 'p1'])).toMatchObject({ commentCount: 0 });
  });

  it('merges an item across param variants by name prefix', () => {
    const client = new QueryClient();
    client.setQueryData(['list', { q: '' }], { items: [{ id: 'p1', title: 'old' }] });
    run(
      client,
      on(listQuery).mergeItem<{ id: string; title: string }>('items', {
        id: () => 'p1',
        set: () => ({ title: 'new' }),
      }),
      event('p1'),
    );
    expect(client.getQueryData(['list', { q: '' }])).toEqual({ items: [{ id: 'p1', title: 'new' }] });
  });

  it('removes an item by id', () => {
    const client = new QueryClient();
    client.setQueryData(['list', { q: '' }], {
      items: [{ id: 'p1', title: 'a' }, { id: 'p2', title: 'b' }],
    });
    run(client, on(listQuery).removeItem('items', { id: () => 'p1' }), event('p1'));
    expect(client.getQueryData(['list', { q: '' }])).toEqual({ items: [{ id: 'p2', title: 'b' }] });
  });

  it('sets an exact query via params()', () => {
    const client = new QueryClient();
    run(
      client,
      on(postQuery).set(() => ({ id: 'p9', commentCount: 1 }), { params: () => 'p9' }),
      event('ignored'),
    );
    expect(client.getQueryData(['post', 'p9'])).toEqual({ id: 'p9', commentCount: 1 });
  });

  it('invalidates a query', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    run(client, on(postQuery).invalidate(), event('p1'));
    expect(spy).toHaveBeenCalledWith({ queryKey: ['post', 'p1'] });
  });
});
