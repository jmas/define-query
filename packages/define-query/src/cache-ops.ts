import { isInfiniteData, isPlainObject, readId } from './util';

export type ListPosition = 'start' | 'end';

function getArray(obj: unknown, field: string): unknown[] {
  if (!isPlainObject(obj)) return [];
  const value = obj[field];
  return Array.isArray(value) ? value : [];
}

/** Shallow-merge `patch` into `data` when both are plain objects. */
export function mergeObject<T>(data: T, patch: unknown): T {
  if (!isPlainObject(data) || !isPlainObject(patch)) return data;
  return { ...data, ...patch } as T;
}

/**
 * Apply `mapItems` to the array at `field`. Handles both a plain object holding
 * the list and a TanStack `InfiniteData` (mapping the field across every page).
 */
export function mapField<T>(data: T, field: string, mapItems: (items: unknown[]) => unknown[]): T {
  if (isInfiniteData(data)) {
    return {
      ...data,
      pages: data.pages.map(page =>
        isPlainObject(page) && Array.isArray(page[field])
          ? { ...page, [field]: mapItems(page[field] as unknown[]) }
          : page,
      ),
    } as T;
  }
  if (isPlainObject(data)) {
    return { ...data, [field]: mapItems(getArray(data, field)) } as T;
  }
  return data;
}

export function insertItem<T>(data: T, field: string, item: unknown, position: ListPosition): T {
  if (isInfiniteData(data)) {
    if (data.pages.length === 0) return data;
    const pageIndex = position === 'start' ? 0 : data.pages.length - 1;
    return {
      ...data,
      pages: data.pages.map((page, index) => {
        if (index !== pageIndex || !isPlainObject(page) || !Array.isArray(page[field])) return page;
        const items = page[field] as unknown[];
        return {
          ...page,
          [field]: position === 'start' ? [item, ...items] : [...items, item],
        };
      }),
    } as T;
  }
  return mapField(data, field, items =>
    position === 'start' ? [item, ...items] : [...items, item],
  );
}

export function updateItem<T>(
  data: T,
  field: string,
  match: (item: unknown) => boolean,
  toNext: (item: unknown) => unknown,
): T {
  return mapField(data, field, items =>
    items.map(item => (match(item) ? toNext(item) : item)),
  );
}

export function removeItem<T>(data: T, field: string, match: (item: unknown) => boolean): T {
  return mapField(data, field, items => items.filter(item => !match(item)));
}

export function replaceItemById<T>(data: T, field: string, id: string, next: unknown): T {
  return updateItem(data, field, item => readId(item) === id, () => next);
}

export function findItem(data: unknown, field: string, match: (item: unknown) => boolean): unknown {
  if (isInfiniteData(data)) {
    for (const page of data.pages) {
      const found = getArray(page, field).find(match);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return getArray(data, field).find(match);
}

/** Flatten a list field across all pages of an infinite query (or a plain object). */
export function flattenInfiniteField<TItem>(data: unknown, field: string): TItem[] {
  if (isInfiniteData(data)) {
    return data.pages.flatMap(page => getArray(page, field) as TItem[]);
  }
  return getArray(data, field) as TItem[];
}
