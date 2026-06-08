import { describe, expect, it } from 'vitest';
import {
  findItem,
  flattenInfiniteField,
  insertItem,
  mergeObject,
  removeItem,
  replaceItemById,
  updateItem,
} from './cache-ops';

type Item = { id: string; text: string };

const list = (items: Item[]) => ({ items });
const infinite = (...pages: Item[][]) => ({
  pages: pages.map(items => ({ items })),
  pageParams: pages.map((_, i) => i + 1),
});

describe('mergeObject', () => {
  it('shallow-merges plain objects', () => {
    expect(mergeObject({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });
  it('ignores non-object patches', () => {
    expect(mergeObject({ a: 1 }, 5)).toEqual({ a: 1 });
  });
});

describe('plain-object lists', () => {
  it('inserts at start and end immutably', () => {
    const data = list([{ id: '1', text: 'a' }]);
    const start = insertItem(data, 'items', { id: '0', text: 'z' }, 'start');
    const end = insertItem(data, 'items', { id: '2', text: 'b' }, 'end');
    expect(start.items.map(i => i.id)).toEqual(['0', '1']);
    expect(end.items.map(i => i.id)).toEqual(['1', '2']);
    expect(data.items).toHaveLength(1);
  });

  it('updates, removes, and replaces by id', () => {
    const data = list([
      { id: '1', text: 'a' },
      { id: '2', text: 'b' },
    ]);
    const updated = updateItem(data, 'items', i => (i as Item).id === '1', i => ({
      ...(i as Item),
      text: 'A',
    }));
    expect(updated.items[0].text).toBe('A');

    const removed = removeItem(data, 'items', i => (i as Item).id === '2');
    expect(removed.items.map(i => i.id)).toEqual(['1']);

    const replaced = replaceItemById(data, 'items', '2', { id: '2', text: 'B' });
    expect(replaced.items[1].text).toBe('B');
  });

  it('finds and flattens', () => {
    const data = list([{ id: '1', text: 'a' }]);
    expect(findItem(data, 'items', i => (i as Item).id === '1')).toEqual({ id: '1', text: 'a' });
    expect(flattenInfiniteField<Item>(data, 'items')).toHaveLength(1);
  });
});

describe('infinite-data lists', () => {
  it('bootstraps the first page when pages are empty', () => {
    const data = { pages: [] as { items: Item[] }[], pageParams: [] as number[] };
    const inserted = insertItem(data, 'items', { id: '1', text: 'a' }, 'end');
    expect(inserted.pages).toHaveLength(1);
    expect(inserted.pages[0].items).toEqual([{ id: '1', text: 'a' }]);
  });

  it('inserts at the first/last page', () => {
    const data = infinite([{ id: '1', text: 'a' }], [{ id: '2', text: 'b' }]);
    const start = insertItem(data, 'items', { id: '0', text: 'z' }, 'start');
    const end = insertItem(data, 'items', { id: '3', text: 'c' }, 'end');
    expect(start.pages[0].items.map(i => i.id)).toEqual(['0', '1']);
    expect(end.pages[1].items.map(i => i.id)).toEqual(['2', '3']);
  });

  it('updates/removes across pages and flattens all pages', () => {
    const data = infinite([{ id: '1', text: 'a' }], [{ id: '2', text: 'b' }]);
    const updated = updateItem(data, 'items', i => (i as Item).id === '2', i => ({
      ...(i as Item),
      text: 'B',
    }));
    expect(updated.pages[1].items[0].text).toBe('B');

    const removed = removeItem(data, 'items', i => (i as Item).id === '1');
    expect(flattenInfiniteField<Item>(removed, 'items').map(i => i.id)).toEqual(['2']);

    expect(findItem(data, 'items', i => (i as Item).id === '2')).toEqual({ id: '2', text: 'b' });
    expect(flattenInfiniteField<Item>(data, 'items')).toHaveLength(2);
  });
});
