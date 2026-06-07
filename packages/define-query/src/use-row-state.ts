import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getRowStore } from './client-state';
import { getQueryKey } from './query-key';
import { buildRowState, useRowStoreVersion, type RowState } from './row-store';

type QueryRef<TParams> = { key: (params: TParams) => readonly unknown[] };

/**
 * Per-row optimistic state for a list query. Returns `rowState(item)` which
 * reports `pending` / `failed` (with a `retry`) for an item, driven by the
 * sidecar store that mutations populate. Re-renders when row state changes.
 *
 * ```tsx
 * const rowState = useRowState(commentsQuery, postId);
 * const row = rowState(comment); // { status, error?, retry? }
 * ```
 */
export function useRowState<TParams>(
  query: QueryRef<TParams>,
  params: TParams,
): (item: unknown) => RowState {
  const client = useQueryClient();
  const store = getRowStore(client);
  const queryKey = useMemo(() => getQueryKey(query, params), [query, params]);
  useRowStoreVersion(store, queryKey);
  return useCallback((item: unknown): RowState => buildRowState(store, queryKey, item), [store, queryKey]);
}
