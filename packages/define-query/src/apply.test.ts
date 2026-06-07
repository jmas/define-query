import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyOptimistic, applySettle, keepsOnFail, rollback } from './apply';
import { getRowStore } from './client-state';
import type { Effect } from './define-mutation';
import { isTempId } from './temp-id';

type Item = { id: string; text: string };
const qk = ['post', 'p1', 'comments'] as const;
const client = new QueryClient();
const ctx = { client, queryKey: qk, mutation: 'm' };
const rowStore = () => getRowStore(client);

afterEach(() => getRowStore(client)._reset());

describe('object effect', () => {
  const effect: Effect = {
    kind: 'object',
    optimistic: (data, input) => ({ ...(data as object), title: input }),
    settle: (data, response) => ({ ...(data as object), ...(response as object) }),
  };

  it('applies, settles, and rolls back to previous', () => {
    const previous = { title: 'old', n: 1 };
    const optimistic = applyOptimistic(effect, previous, 'new', ctx).next as Record<string, unknown>;
    expect(optimistic.title).toBe('new');

    const settled = applySettle(effect, optimistic, { n: 2 }, ctx) as Record<string, unknown>;
    expect(settled.n).toBe(2);

    expect(rollback(effect, optimistic, 'new', { ...ctx, previous })).toEqual(previous);
  });
});

describe('insert effect', () => {
  const effect: Effect = {
    kind: 'insert',
    field: 'items',
    position: 'end',
    draft: (input, tempId) => ({ id: tempId, text: input as string }),
    keepOnFail: true,
  };

  it('inserts a temp row, tags pending, then settles to the server id', () => {
    const data = { items: [] as Item[] };
    const result = applyOptimistic(effect, data, 'hi', ctx);
    expect(isTempId(result.tempId)).toBe(true);
    expect((result.next as { items: Item[] }).items[0].id).toBe(result.tempId);
    expect(rowStore().statusOf(qk, result.tempId)).toBe('pending');

    const onSettle = vi.fn();
    const settled = applySettle(effect, result.next, { id: 'srv1', text: 'hi' }, {
      ...ctx,
      tempId: result.tempId,
      onSettle,
    }) as { items: Item[] };
    expect(settled.items[0].id).toBe('srv1');
    expect(onSettle).toHaveBeenCalledWith(result.tempId, 'srv1');
    expect(rowStore().statusOf(qk, result.tempId)).toBe('ok');
  });

  it('rolls back by removing the temp row', () => {
    const data = { items: [] as Item[] };
    const result = applyOptimistic(effect, data, 'hi', ctx);
    const rolled = rollback(effect, result.next, 'hi', {
      ...ctx,
      previous: data,
      tempId: result.tempId,
    }) as { items: Item[] };
    expect(rolled.items).toHaveLength(0);
    expect(rowStore().statusOf(qk, result.tempId)).toBe('ok');
  });
});

describe('update effect', () => {
  const effect: Effect = {
    kind: 'update',
    field: 'items',
    match: (item, input) => (item as Item).id === (input as { id: string }).id,
    draft: input => ({ text: (input as { text: string }).text }),
    keepOnFail: true,
  };
  const data = { items: [{ id: '1', text: 'a' }] as Item[] };

  it('patches the matched row and tags it pending', () => {
    const result = applyOptimistic(effect, data, { id: '1', text: 'b' }, ctx);
    expect((result.next as { items: Item[] }).items[0].text).toBe('b');
    expect(result.rowId).toBe('1');
    expect(rowStore().statusOf(qk, '1')).toBe('pending');
  });

  it('rolls back to the previous item', () => {
    const optimistic = applyOptimistic(effect, data, { id: '1', text: 'b' }, ctx).next;
    const rolled = rollback(effect, optimistic, { id: '1', text: 'b' }, {
      ...ctx,
      previous: data,
      rowId: '1',
    }) as { items: Item[] };
    expect(rolled.items[0].text).toBe('a');
  });
});

describe('remove effect', () => {
  const effect: Effect = {
    kind: 'remove',
    field: 'items',
    match: (item, input) => (item as Item).id === input,
  };

  it('removes the matched row and rolls it back on failure', () => {
    const data = { items: [{ id: '1', text: 'a' }] as Item[] };
    const result = applyOptimistic(effect, data, '1', ctx);
    expect((result.next as { items: Item[] }).items).toHaveLength(0);
    expect(result.skipRequest).toBe(false);

    const rolled = rollback(effect, result.next, '1', {
      ...ctx,
      previous: data,
      rowId: '1',
    }) as { items: Item[] };
    expect(rolled.items.map(i => i.id)).toEqual(['1']);
  });

  it('skips the request when removing an un-persisted temp row', () => {
    const insert: Effect = {
      kind: 'insert',
      field: 'items',
      position: 'end',
      draft: (input, tempId) => ({ id: tempId, text: input as string }),
      keepOnFail: false,
    };
    const seeded = applyOptimistic(insert, { items: [] as Item[] }, 'x', ctx).next;
    const tempId = (seeded as { items: Item[] }).items[0].id;
    const result = applyOptimistic(effect, seeded, tempId, ctx);
    expect(result.skipRequest).toBe(true);
  });
});

describe('keepsOnFail', () => {
  it('only keeps insert/update rows that have an id', () => {
    const insert: Effect = {
      kind: 'insert',
      field: 'items',
      position: 'end',
      draft: () => ({}),
      keepOnFail: true,
    };
    expect(keepsOnFail(insert, 'tmp_1')).toBe(true);
    expect(keepsOnFail(insert, undefined)).toBe(false);
    expect(keepsOnFail({ kind: 'remove', field: 'items' }, '1')).toBe(false);
  });
});
