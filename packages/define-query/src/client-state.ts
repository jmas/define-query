import type { QueryClient } from '@tanstack/react-query';
import { RowStore } from './row-store';
import { isInfiniteData, isPlainObject, readId } from './util';

const rowStores = new WeakMap<QueryClient, RowStore>();
const settledIdsByClient = new WeakMap<QueryClient, Map<string, string>>();
const subscribedClients = new WeakSet<QueryClient>();

/** Subscribe to cache removal + ensure per-client maps exist. */
function ensureClientState(client: QueryClient): void {
  ensureCacheCleanup(client);
}

/** Per-client row metadata store (pending / failed / retry). */
export function getRowStore(client: QueryClient): RowStore {
  ensureClientState(client);
  let store = rowStores.get(client);
  if (!store) {
    store = new RowStore();
    rowStores.set(client, store);
  }
  return store;
}

/** Per-client tempId → serverId map for in-flight optimistic reconciliation. */
export function getSettledIds(client: QueryClient): Map<string, string> {
  ensureClientState(client);
  let map = settledIdsByClient.get(client);
  if (!map) {
    map = new Map();
    settledIdsByClient.set(client, map);
  }
  return map;
}

/** Drop temp→server mapping when an item leaves the cache. */
export function forgetSettledId(client: QueryClient, id: string): void {
  const map = settledIdsByClient.get(client);
  if (!map) return;
  map.delete(id);
  for (const [temp, server] of map) {
    if (server === id) map.delete(temp);
  }
}

/** Drop all row metadata for a query key. */
export function clearRowStoreForQuery(client: QueryClient, queryKey: readonly unknown[]): void {
  getRowStore(client).clearQuery(queryKey);
}

/** Forget settled-id mappings for every list item id found in cached query data. */
export function forgetSettledIdsFromData(client: QueryClient, data: unknown): void {
  for (const id of collectItemIds(data)) forgetSettledId(client, id);
}

function collectItemIds(data: unknown): string[] {
  const ids: string[] = [];
  const visit = (value: unknown): void => {
    if (isInfiniteData(value)) {
      for (const page of value.pages) visit(page);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const id = readId(item);
        if (id) ids.push(id);
      }
      return;
    }
    if (isPlainObject(value)) {
      const id = readId(value);
      if (id) ids.push(id);
      for (const field of Object.values(value)) visit(field);
    }
  };
  visit(data);
  return ids;
}

function ensureCacheCleanup(client: QueryClient): void {
  if (subscribedClients.has(client)) return;
  subscribedClients.add(client);
  client.getQueryCache().subscribe(event => {
    if (event.type !== 'removed') return;
    const queryKey = event.query.queryKey;
    clearRowStoreForQuery(client, queryKey);
    forgetSettledIdsFromData(client, event.query.state.data);
  });
}
