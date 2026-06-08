import type { QueryCacheNotifyEvent, QueryClient } from '@tanstack/react-query';
import { warnUserMetaConflict } from './dev-warnings';
import { runQuerySync, type QueryFetchSyncEvent, type QuerySyncOp } from './query-sync';

/** Reserved TanStack query `meta` key — do not set manually on define-query factories. */
export const DEFINE_QUERY_META_KEY = 'define-query';

type AnyQuerySyncOp = QuerySyncOp<QueryFetchSyncEvent<unknown, unknown>>;

export type DefineQuerySyncMeta = {
  syncOps: readonly AnyQuerySyncOp[];
  params: unknown;
};

export function buildDefineQueryMeta(
  syncOps: readonly QuerySyncOp<QueryFetchSyncEvent<unknown, unknown>>[],
  params: unknown,
  existingMeta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (syncOps.length === 0) return existingMeta;
  if (existingMeta?.[DEFINE_QUERY_META_KEY] !== undefined) {
    warnUserMetaConflict();
  }
  return {
    ...existingMeta,
    [DEFINE_QUERY_META_KEY]: { syncOps, params } satisfies DefineQuerySyncMeta,
  };
}

export function readDefineQuerySyncMeta(meta: unknown): DefineQuerySyncMeta | undefined {
  if (meta === null || typeof meta !== 'object') return undefined;
  const entry = (meta as Record<string, unknown>)[DEFINE_QUERY_META_KEY];
  if (entry === null || typeof entry !== 'object') return undefined;
  const { syncOps, params } = entry as DefineQuerySyncMeta;
  if (!Array.isArray(syncOps)) return undefined;
  return { syncOps, params };
}

export function handleQueryFetchSync(client: QueryClient, event: QueryCacheNotifyEvent): void {
  if (event.type !== 'updated') return;

  const { action, query } = event;
  if (action.type !== 'success' || action.manual) return;

  const meta = readDefineQuerySyncMeta(query.meta);
  if (!meta?.syncOps.length) return;

  const data = action.data ?? query.state.data;
  if (data === undefined) return;

  const syncEvent: QueryFetchSyncEvent<unknown, unknown> = {
    params: meta.params,
    data,
  };

  try {
    runQuerySync(client, meta.syncOps, syncEvent);
  } catch (error) {
    console.error('[define-query] query sync failed', error);
  }
}
