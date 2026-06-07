import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMutationKey,
  getMutationKey,
  getQueryKey,
  normalizeParams,
  serializeKey,
  warnIfParamsCollapsed,
} from './query-key';

describe('normalizeParams', () => {
  it('passes scalars through', () => {
    expect(normalizeParams('abc')).toBe('abc');
    expect(normalizeParams(42)).toBe(42);
    expect(normalizeParams(null)).toBeNull();
    expect(normalizeParams(undefined)).toBeUndefined();
  });

  it('serializes Date to ISO', () => {
    const date = new Date('2020-01-01T00:00:00.000Z');
    expect(normalizeParams(date)).toBe('2020-01-01T00:00:00.000Z');
  });

  it('sorts object keys for stability', () => {
    expect(normalizeParams({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
  });

  it('drops non-key values from objects', () => {
    expect(normalizeParams({ a: 1, fn: () => 0, nested: { x: 1 } })).toEqual({ a: 1 });
  });

  it('warns when non-shallow params collapse to {}', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(normalizeParams([1, 2, 3])).toEqual({});
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('normalizeParams'),
      [1, 2, 3],
    );
    spy.mockRestore();
  });
});

describe('warnIfParamsCollapsed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs a dev warning with the original params', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const params = { filter: { tag: 'x' } };
    warnIfParamsCollapsed(params);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('normalizeParams'), params);
  });
});

describe('getQueryKey', () => {
  const ref = { key: (id: string) => ['post', id] as const };

  it('builds a sanitized key', () => {
    expect(getQueryKey(ref, 'p1')).toEqual(['post', 'p1']);
  });

  it('produces equal keys for differently-ordered object params', () => {
    const objRef = { key: (p: { a: number; b: number }) => ['t', p] as const };
    expect(getQueryKey(objRef, { a: 1, b: 2 })).toEqual(getQueryKey(objRef, { b: 2, a: 1 }));
  });
});

describe('buildMutationKey', () => {
  const query = { key: (p: { q: string }) => ['timeline', p] as const };

  it('appends the mutation name after the query key', () => {
    expect(buildMutationKey(query, 'add', { q: 'hello' })).toEqual([
      'timeline',
      { q: 'hello' },
      'add',
    ]);
  });

  it('normalizes object params before keying', () => {
    expect(buildMutationKey(query, 'add', { q: 'x' })).toEqual(
      buildMutationKey(query, 'add', { q: 'x' }),
    );
  });
});

describe('getMutationKey', () => {
  it('reads the key from a mutation factory', () => {
    const mutation = { key: (id: string) => ['post', id, 'rename'] as const };
    expect(getMutationKey(mutation, 'p1')).toEqual(['post', 'p1', 'rename']);
  });
});

describe('serializeKey', () => {
  it('is stable and round-trippable for equal keys', () => {
    expect(serializeKey(['post', '1'])).toBe(serializeKey(['post', '1']));
    expect(serializeKey(['post', '1'])).not.toBe(serializeKey(['post', '2']));
  });
});
