import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { applyDraft, applySettle, rollback } from './apply';
import type { Effect } from './define-mutation';
import { isTempId } from './temp-id';

type Item = { id: string; text: string };
const qk = ['post', 'p1', 'comments'] as const;
const client = new QueryClient();
const ctx = { client, queryKey: qk, mutation: 'm' };

describe('object effect', () => {
  const effect: Effect = {
    kind: 'object',
    draft: ({ data, input }) => ({ ...(data as object), title: input }),
    settle: ({ data, response }) => ({ ...(data as object), ...(response as object) }),
  };

  it('applies, settles, and rolls back to previous', () => {
    const previous = { title: 'old', n: 1 };
    const drafted = applyDraft(effect, previous, 'new', ctx).next as Record<string, unknown>;
    expect(drafted.title).toBe('new');

    const settled = applySettle(effect, drafted, { n: 2 }, { ...ctx, input: 'new' }) as Record<string, unknown>;
    expect(settled.n).toBe(2);

    expect(rollback(effect, drafted, 'new', { ...ctx, previous })).toEqual(previous);
  });
});

describe('insert effect', () => {
  const effect: Effect = {
    kind: 'insert',
    field: 'items',
    position: 'end',
    draft: ({ input, tempId }) => ({ id: tempId!, text: input as string }),
  };

  it('inserts a temp row then settles to the server id', () => {
    const data = { items: [] as Item[] };
    const result = applyDraft(effect, data, 'hi', ctx);
    expect(isTempId(result.tempId)).toBe(true);
    expect((result.next as { items: Item[] }).items[0].id).toBe(result.tempId);

    const onSettle = vi.fn();
    const settled = applySettle(effect, result.next, { id: 'srv1', text: 'hi' }, {
      ...ctx,
      input: 'hi',
      tempId: result.tempId,
      onSettle,
    }) as { items: Item[] };
    expect(settled.items[0].id).toBe('srv1');
    expect(onSettle).toHaveBeenCalledWith(result.tempId, 'srv1');
  });

  it('rolls back by removing the temp row', () => {
    const data = { items: [] as Item[] };
    const result = applyDraft(effect, data, 'hi', ctx);
    const rolled = rollback(effect, result.next, 'hi', {
      ...ctx,
      previous: data,
      tempId: result.tempId,
    }) as { items: Item[] };
    expect(rolled.items).toHaveLength(0);
  });
});

describe('update effect', () => {
  const effect: Effect = {
    kind: 'update',
    field: 'items',
    match: (item, input) => (item as Item).id === (input as { id: string }).id,
    draft: ({ input }) => ({ text: (input as { text: string }).text }),
  };
  const data = { items: [{ id: '1', text: 'a' }] as Item[] };

  it('patches the matched row', () => {
    const result = applyDraft(effect, data, { id: '1', text: 'b' }, ctx);
    expect((result.next as { items: Item[] }).items[0].text).toBe('b');
    expect(result.rowId).toBe('1');
  });

  it('rolls back to the previous item', () => {
    const drafted = applyDraft(effect, data, { id: '1', text: 'b' }, ctx).next;
    const rolled = rollback(effect, drafted, { id: '1', text: 'b' }, {
      ...ctx,
      previous: data,
      rowId: '1',
    }) as { items: Item[] };
    expect(rolled.items[0].text).toBe('a');
  });
});

describe('remove effect', () => {
  const effect: Effect = {
    kind: 'removeField',
    field: 'items',
    match: (item, input) => (item as Item).id === input,
  };

  it('removes the matched row and rolls it back on failure', () => {
    const data = { items: [{ id: '1', text: 'a' }] as Item[] };
    const result = applyDraft(effect, data, '1', ctx);
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
      draft: ({ input, tempId }) => ({ id: tempId!, text: input as string }),
    };
    const seeded = applyDraft(insert, { items: [] as Item[] }, 'x', ctx).next;
    const tempId = (seeded as { items: Item[] }).items[0].id;
    const result = applyDraft(effect, seeded, tempId, ctx);
    expect(result.skipRequest).toBe(true);
  });
});
