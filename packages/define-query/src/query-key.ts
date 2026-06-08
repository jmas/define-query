import { warnCollapsedParams } from './dev-warnings';
import { isPlainObject } from './util';

/** Anything that owns a `key(params)` builder (queries + mutations). */
export type KeyRef = { key: (params: never) => readonly unknown[] };

function isKeyPrimitive(value: unknown): value is string | number | boolean | null | bigint {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  );
}

function toKeyValue(value: unknown): string | number | boolean | null | bigint | undefined {
  if (isKeyPrimitive(value)) return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function isShallowKeyObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && !(value instanceof Date);
}

/** One-level object: sorted keys, primitives + Date (as ISO). Keeps keys stable. */
function shallowKeyObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of Object.keys(obj).sort()) {
    const value = toKeyValue(obj[field]);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/** Warning when params cannot be stably keyed. Exported for tests. */
export function warnIfParamsCollapsed(params: unknown): void {
  warnCollapsedParams(params);
}

/** Normalize params before keying. Scalars pass through; one-level objects get sorted. */
export function normalizeParams<T>(params: T): T {
  if (params === undefined || params === null) return params;
  if (params instanceof Date) return params.toISOString() as T;
  if (isShallowKeyObject(params)) return shallowKeyObject(params) as T;
  if (typeof params === 'object') {
    warnIfParamsCollapsed(params);
    return {} as T;
  }
  return params;
}

function sanitizeKey(key: readonly unknown[]): readonly unknown[] {
  const out: unknown[] = [];
  for (const segment of key) {
    if (isShallowKeyObject(segment)) {
      out.push(shallowKeyObject(segment));
      continue;
    }
    const value = toKeyValue(segment);
    if (value !== undefined) out.push(value);
  }
  return out;
}

/** Build the stable TanStack query key for a query + params. */
export function getQueryKey<TParams>(ref: KeyRef, params: TParams): readonly unknown[] {
  const keyFn = ref.key as (p: TParams) => readonly unknown[];
  return sanitizeKey(keyFn(normalizeParams(params)));
}

/** Build the stable TanStack mutation key: `[...queryKey, name]`. */
export function buildMutationKey<TParams>(
  query: KeyRef,
  name: string,
  params: TParams,
): readonly unknown[] {
  return [...getQueryKey(query, params), name];
}

/** Stable mutation key (same as `mutation(params).mutationKey`). */
export function getMutationKey<TParams>(
  mutation: { key: (params: TParams) => readonly unknown[] },
  params: TParams,
): readonly unknown[] {
  return mutation.key(normalizeParams(params));
}

/** Stable string form of a key — used to index the row store. */
export function serializeKey(queryKey: readonly unknown[]): string {
  try {
    return JSON.stringify(queryKey);
  } catch {
    return String(queryKey);
  }
}
