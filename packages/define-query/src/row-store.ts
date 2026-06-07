import { useSyncExternalStore } from 'react';
import { serializeKey } from './query-key';
import { readId } from './util';

export type RowStatus = 'pending' | 'failed';

export type RowRetry = (input?: unknown) => Promise<unknown>;

/** Per-row optimistic state surfaced to the UI. */
export type RowState = {
  status: 'ok' | 'pending' | 'failed';
  error?: string;
  retry?: RowRetry;
};

export type RowMeta = {
  status: RowStatus;
  /** Mutation `name` that owns this row. */
  mutation: string;
  message?: string;
  /** Re-run the owning mutation for this row (failed rows only). */
  retry?: RowRetry;
};

function entryKey(queryKey: readonly unknown[], id: string): string {
  return `${serializeKey(queryKey)}::${id}`;
}

/**
 * Sidecar store of per-row optimistic state (pending / failed) keyed by
 * (queryKey, itemId). Kept outside the query cache so list items never need to
 * carry metadata. Subscribable per query for `useSyncExternalStore`.
 * One instance per QueryClient — see `getRowStore` in `client-state.ts`.
 */
export class RowStore {
  private rows = new Map<string, RowMeta>();
  private listeners = new Map<string, Set<() => void>>();
  private versions = new Map<string, number>();

  private bump(queryKey: readonly unknown[]): void {
    const key = serializeKey(queryKey);
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    this.listeners.get(key)?.forEach(listener => listener());
  }

  subscribe(queryKey: readonly unknown[], listener: () => void): () => void {
    const key = serializeKey(queryKey);
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  version(queryKey: readonly unknown[]): number {
    return this.versions.get(serializeKey(queryKey)) ?? 0;
  }

  tagPending(queryKey: readonly unknown[], id: string, meta: { mutation: string }): void {
    this.rows.set(entryKey(queryKey, id), { status: 'pending', mutation: meta.mutation });
    this.bump(queryKey);
  }

  markFailed(
    queryKey: readonly unknown[],
    id: string,
    meta: { mutation: string; message: string; retry: RowRetry },
  ): void {
    this.rows.set(entryKey(queryKey, id), {
      status: 'failed',
      mutation: meta.mutation,
      message: meta.message,
      retry: meta.retry,
    });
    this.bump(queryKey);
  }

  /** Move a failed row back to pending before re-running its mutation. */
  clearForRetry(queryKey: readonly unknown[], id: string): void {
    const key = entryKey(queryKey, id);
    const current = this.rows.get(key);
    if (!current) return;
    this.rows.set(key, { ...current, status: 'pending', message: undefined });
    this.bump(queryKey);
  }

  clear(queryKey: readonly unknown[], id: string): void {
    if (this.rows.delete(entryKey(queryKey, id))) {
      this.bump(queryKey);
    }
  }

  get(queryKey: readonly unknown[], id: string | undefined): RowMeta | undefined {
    if (!id) return undefined;
    return this.rows.get(entryKey(queryKey, id));
  }

  statusOf(queryKey: readonly unknown[], id: string | undefined): RowStatus | 'ok' {
    return this.get(queryKey, id)?.status ?? 'ok';
  }

  /** Drop all row metadata for a query key (e.g. when the query is removed). */
  clearQuery(queryKey: readonly unknown[]): void {
    const prefix = `${serializeKey(queryKey)}::`;
    let changed = false;
    for (const key of [...this.rows.keys()]) {
      if (key.startsWith(prefix)) {
        this.rows.delete(key);
        changed = true;
      }
    }
    if (changed) this.bump(queryKey);
  }

  /** Test helper. */
  _reset(): void {
    const keys = [...this.listeners.keys()];
    this.rows.clear();
    this.versions.clear();
    for (const key of keys) this.listeners.get(key)?.forEach(listener => listener());
  }
}

/** Subscribe a component to row-state changes for a query key. */
export function useRowStoreVersion(store: RowStore, queryKey: readonly unknown[]): number {
  return useSyncExternalStore(
    listener => store.subscribe(queryKey, listener),
    () => store.version(queryKey),
    () => store.version(queryKey),
  );
}

/** Build the `RowState` for a list item from the sidecar store. */
export function buildRowState(store: RowStore, queryKey: readonly unknown[], item: unknown): RowState {
  const meta = store.get(queryKey, readId(item));
  if (!meta || meta.status !== 'failed') {
    return { status: meta?.status ?? 'ok' };
  }
  return { status: 'failed', error: meta.message, retry: meta.retry };
}
