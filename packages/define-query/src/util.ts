/** Shared tiny runtime guards. Internal. */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type InfiniteShape = {
  pages: unknown[];
  pageParams: unknown[];
};

/** TanStack infinite cache shape: `{ pages, pageParams }`. */
export function isInfiniteData(value: unknown): value is InfiniteShape {
  return (
    isPlainObject(value)
    && Array.isArray((value as { pages?: unknown }).pages)
    && Array.isArray((value as { pageParams?: unknown }).pageParams)
  );
}

export function readId(value: unknown): string | undefined {
  if (isPlainObject(value) && typeof value.id === 'string') return value.id;
  return undefined;
}
