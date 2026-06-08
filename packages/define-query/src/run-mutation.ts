import type { QueryClient } from '@tanstack/react-query';
import { applyDraft, applySettle, rollback } from './apply';
import { findItem } from './cache-ops';
import {
  ensureDefineQuery,
  forgetSettledId,
  forgetSettledIdsFromData,
  getSettledIds,
} from './client-state';
import type { MutationPlan, RemapInput } from './define-mutation';
import { warnMutateWithoutCache } from './dev-warnings';
import { getQueryKey } from './query-key';
import { runSync } from './run-sync';
import { createOnBuilder, type SyncEvent, type SyncOp } from './sync';
import { readId } from './util';

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
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return remapPlainObject(settledIds, value as Record<string, unknown>, remapInput);
  }
  return value;
}

function runSyncOps<TParams, TData, TInput, TResponse>(
  client: QueryClient,
  plan: MutationPlan<TParams, TData, TInput, TResponse>,
  params: TParams,
  input: TInput | undefined,
  response: TResponse | undefined,
  data?: unknown,
  item?: unknown,
  skipRequest = false,
): void {
  if (!plan.sync || skipRequest) return;
  const event: SyncEvent<TParams, TInput, TResponse, TData> = {
    params,
    input: input as TInput,
    response: response as TResponse,
    data: data as TData | undefined,
    item,
  };
  const ops = plan.sync(createOnBuilder<SyncEvent<TParams, TInput, TResponse, TData>>());
  runSync(
    client,
    ops as readonly SyncOp<SyncEvent<unknown, unknown, unknown>>[],
    event as SyncEvent<unknown, unknown, unknown>,
  );
}

/**
 * The orchestration that powers a mutation: draft -> request ->
 * settle / rollback, then sync siblings. Resolves with the server response on
 * success; rethrows on failure so the native `useMutation` surfaces it.
 */
export async function runMutation<TParams, TData, TInput, TResponse>(
  client: QueryClient,
  plan: MutationPlan<TParams, TData, TInput, TResponse>,
  params: TParams,
  input: TInput | undefined,
): Promise<TResponse | undefined> {
  ensureDefineQuery(client);

  if (plan.validate && input !== undefined) {
    plan.validate(input);
  }

  if (!plan.query) {
    const remappedInput =
      input === undefined ? undefined : remapIds(client, input, plan.remapInput);
    const response = await plan.request(params, remappedInput);
    runSyncOps(client, plan, params, input, response);
    return response;
  }

  const effect = plan.effect;
  const queryKey = getQueryKey(plan.query, params);
  const ctx = { client, queryKey, mutation: plan.name };

  const runSetEachSync = (data: unknown, item: unknown, response?: TResponse) => {
    if (!plan.sync || item === undefined) return;
    const event: SyncEvent<TParams, TInput, TResponse, TData> = {
      params,
      input: input as TInput,
      response: response as TResponse,
      data: data as TData | undefined,
      item,
    };
    const ops = plan.sync(createOnBuilder<SyncEvent<TParams, TInput, TResponse, TData>>()).filter(
      op => op.kind === 'setEach',
    );
    if (ops.length === 0) return;
    runSync(
      client,
      ops as readonly SyncOp<SyncEvent<unknown, unknown, unknown>>[],
      event as SyncEvent<unknown, unknown, unknown>,
    );
  };

  // Apply the draft synchronously so the UI reflects it on `mutate`, then cancel
  // in-flight fetches so a refetch cannot clobber it.
  const previous = client.getQueryData(queryKey);

  let rowId: string | undefined;
  let tempId: string | undefined;
  let skipRequest = false;
  // Whether we actually mutated the cache (so a refetch could clobber us).
  let didDraftWrite = false;

  if (previous === undefined && effect.kind !== 'removeQuery') {
    warnMutateWithoutCache(plan.name);
  }

  if (previous !== undefined && effect.kind !== 'removeQuery') {
    const drafted = applyDraft(effect, previous, input, ctx);
    rowId = drafted.rowId;
    tempId = drafted.tempId;
    skipRequest = drafted.skipRequest ?? false;
    // An object mutation without `draft` returns the same reference — no write
    // happened, so there is nothing to protect against a refetch.
    if (drafted.next !== undefined && drafted.next !== previous) {
      client.setQueryData(queryKey, drafted.next);
      didDraftWrite = true;
      if (effect.kind === 'insert' && tempId) {
        const inserted = findItem(drafted.next, effect.field, row => readId(row) === tempId);
        runSetEachSync(drafted.next, inserted);
      }
    }
  }

  // Only cancel in-flight fetches when we wrote (or when we are about to remove
  // the query), so a no-op object mutation does not churn the query.
  if (didDraftWrite || effect.kind === 'removeQuery') {
    await client.cancelQueries({ queryKey });
  }

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
      runSyncOps(client, plan, params, input, response, undefined, undefined, skipRequest);
      forgetSettledIdsFromData(client, client.getQueryData(queryKey));
      queueMicrotask(() => client.removeQueries({ queryKey }));
      return response;
    }

    const current = client.getQueryData(queryKey);
    let settledItem: unknown;
    if (current !== undefined) {
      const next = applySettle(effect, current, response, {
        ...ctx,
        input,
        rowId,
        tempId,
        onSettle: (from, to) => getSettledIds(client).set(from, to),
      });
      client.setQueryData(queryKey, next);

      if (effect.kind === 'insert' && tempId) {
        settledItem =
          effect.settle !== undefined && response !== undefined
            ? effect.settle(response)
            : findItem(next, effect.field, row => readId(row) !== tempId);
      }

      if (effect.kind === 'removeField' && rowId) {
        forgetSettledId(client, rowId);
      }
    }

    runSyncOps(
      client,
      plan,
      params,
      input,
      response,
      current !== undefined ? client.getQueryData(queryKey) : undefined,
      settledItem,
      skipRequest,
    );
    return response;
  } catch (caught) {
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
