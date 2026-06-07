import type { QueryClient } from '@tanstack/react-query';
import { applyOptimistic, applySettle, keepsOnFail, rollback } from './apply';
import {
  clearRowStoreForQuery,
  forgetSettledId,
  forgetSettledIdsFromData,
  getRowStore,
  getSettledIds,
} from './client-state';
import type { MutationPlan, RemapInput } from './define-mutation';
import { classify, errorMessage, rowFailure } from './errors';
import { getQueryKey } from './query-key';
import { runSync } from './run-sync';
import { createOnBuilder, type SyncEvent, type SyncOp } from './sync';
import { isPlainObject } from './util';

const DEFAULT_REMAP_INPUT = ['id'] as const;

function remapString(
  settledIds: ReadonlyMap<string, string>,
  value: string,
): string {
  return settledIds.get(value) ?? value;
}

function remapPlainObject<T extends Record<string, unknown>>(
  settledIds: ReadonlyMap<string, string>,
  value: T,
  keys: readonly string[],
): T {
  let result: T = value;
  for (const key of keys) {
    const field = value[key];
    if (typeof field !== 'string') continue;
    const mapped = remapString(settledIds, field);
    if (mapped !== field) {
      result = { ...result, [key]: mapped };
    }
  }
  return result;
}

/** Remap settled temp ids in mutation input — only configured fields, not arbitrary strings. */
export function remapIds(client: QueryClient, value: string): string;
export function remapIds<T extends Record<string, unknown>>(
  client: QueryClient,
  value: T,
  remapInput?: RemapInput<T>,
): T;
export function remapIds<T>(
  client: QueryClient,
  value: T,
  remapInput?: RemapInput<T>,
): T;
export function remapIds(
  client: QueryClient,
  value: unknown,
  remapInput: RemapInput<unknown> = DEFAULT_REMAP_INPUT,
): unknown {
  const settledIds = getSettledIds(client);
  if (settledIds.size === 0 || value === undefined) return value;
  if (typeof value === 'string') return remapString(settledIds, value);
  if (typeof remapInput === 'function') {
    return remapInput(value, id => remapString(settledIds, id));
  }
  if (isPlainObject(value)) return remapPlainObject(settledIds, value, remapInput);
  return value;
}

type RunOptions = { retryRowId?: string };

/**
 * The orchestration that powers a mutation: optimistic update -> request ->
 * settle / rollback / keep-failed, then sync siblings. Resolves with the server
 * response on success; rethrows on failure so the native `useMutation` surfaces
 * it. Row-scoped failures (`keepOnFail`) rethrow as `RowFailure` after tagging
 * the sidecar store.
 */
export async function runMutation<TParams, TInput, TResponse>(
  client: QueryClient,
  plan: MutationPlan<TParams, TInput, TResponse>,
  params: TParams,
  input: TInput | undefined,
  opts: RunOptions = {},
): Promise<TResponse | undefined> {
  const effect = plan.effect;
  const queryKey = getQueryKey(plan.query, params);
  const ctx = { client, queryKey, mutation: plan.name };
  const rowStore = getRowStore(client);

  if (!opts.retryRowId && plan.validate && input !== undefined) {
    plan.validate(input);
  }

  // Apply the optimistic update synchronously so the UI reflects it on `mutate`,
  // then cancel in-flight fetches so a refetch cannot clobber it.
  const previous = client.getQueryData(queryKey);

  let rowId: string | undefined;
  let tempId: string | undefined;
  let skipRequest = false;
  // Whether we actually mutated the cache (so a refetch could clobber us).
  let didOptimisticWrite = false;

  if (opts.retryRowId) {
    rowStore.clearForRetry(queryKey, opts.retryRowId);
    rowId = opts.retryRowId;
    if (effect.kind === 'insert') tempId = opts.retryRowId;
    didOptimisticWrite = true; // the row is already in the cache being retried
  } else if (previous !== undefined && effect.kind !== 'removeQuery') {
    const optimistic = applyOptimistic(effect, previous, input, ctx);
    rowId = optimistic.rowId;
    tempId = optimistic.tempId;
    skipRequest = optimistic.skipRequest ?? false;
    // An object mutation without `optimistic` returns the same reference — no
    // write happened, so there is nothing to protect against a refetch.
    if (optimistic.next !== undefined && optimistic.next !== previous) {
      client.setQueryData(queryKey, optimistic.next);
      didOptimisticWrite = true;
    }
  }

  // Only cancel in-flight fetches when we wrote (or when we are about to remove
  // the query), so a no-op object mutation does not churn the query.
  if (didOptimisticWrite || effect.kind === 'removeQuery') {
    await client.cancelQueries({ queryKey });
  }

  const runSyncOps = (response: TResponse | undefined) => {
    if (!plan.sync || skipRequest) return;
    const event: SyncEvent<TParams, TInput, TResponse> = {
      params,
      input: input as TInput,
      response: response as TResponse,
    };
    const ops = plan.sync(createOnBuilder<SyncEvent<TParams, TInput, TResponse>>());
    runSync(
      client,
      ops as readonly SyncOp<SyncEvent<unknown, unknown, unknown>>[],
      event as SyncEvent<unknown, unknown, unknown>,
    );
  };

  try {
    const remappedInput =
      input === undefined ? undefined : remapIds(client, input, plan.remapInput);
    const response = skipRequest ? undefined : await plan.request(params, remappedInput);

    if (effect.kind === 'removeQuery') {
      // Run sync first (siblings drop the row), then defer the cache removal a
      // microtask so the mutation promise resolves and `onSuccess` callbacks
      // (e.g. navigating away) run before the query disappears. Removing it
      // synchronously here would tear the cache out from under a component that
      // is still rendering with this query.
      runSyncOps(response);
      clearRowStoreForQuery(client, queryKey);
      forgetSettledIdsFromData(client, client.getQueryData(queryKey));
      queueMicrotask(() => client.removeQueries({ queryKey }));
      return response;
    }

    const current = client.getQueryData(queryKey);
    if (current !== undefined) {
      const next = applySettle(effect, current, response, {
        ...ctx,
        rowId,
        tempId,
        onSettle: (from, to) => getSettledIds(client).set(from, to),
      });
      client.setQueryData(queryKey, next);

      if (effect.kind === 'remove' && rowId) {
        forgetSettledId(client, rowId);
      }
    }

    runSyncOps(response);
    return response;
  } catch (caught) {
    const failure = classify(caught);

    if (keepsOnFail(effect, rowId)) {
      rowStore.markFailed(queryKey, rowId!, {
        mutation: plan.name,
        message: errorMessage(failure),
        retry: (override?: unknown) =>
          runMutation(client, plan, params, (override ?? input) as TInput | undefined, {
            retryRowId: rowId,
          }),
      });
      throw rowFailure(caught, rowId!, plan.name);
    }

    const current = client.getQueryData(queryKey);
    if (effect.kind === 'object') {
      if (previous !== undefined) client.setQueryData(queryKey, previous);
    } else if (current !== undefined) {
      client.setQueryData(
        queryKey,
        rollback(effect, current, input, { ...ctx, previous, rowId, tempId }),
      );
    }
    throw caught;
  }
}
