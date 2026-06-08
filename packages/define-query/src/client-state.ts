import type { QueryClient } from '@tanstack/react-query';
import { handleQueryFetchSync } from './query-fetch-sync';
import { isInfiniteData, isPlainObject, readId } from './util';

const settledIdsByClient = new WeakMap<QueryClient, Map<string, string>>();
const subscribedClients = new WeakSet<QueryClient>();

/**
 * Wire define-query into a QueryClient — idempotent, called automatically on
 * first sync fetch or mutation.
 */
export function ensureDefineQuery(client: QueryClient): void {
  ensureCacheCleanup(client);
}

/** Whether the QueryCache subscriber is active for this client. */
export function isDefineQuerySetup(client: QueryClient): boolean {
  return subscribedClients.has(client);
}

/** Per-client tempId → serverId map for in-flight draft reconciliation. */
export function getSettledIds(client: QueryClient): Map<string, string> {
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
    if (event.type === 'removed') {
      forgetSettledIdsFromData(client, event.query.state.data);
      return;
    }

    handleQueryFetchSync(client, event);
  });
}
