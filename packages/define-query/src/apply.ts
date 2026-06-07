import type { QueryClient } from '@tanstack/react-query';
import {
  findItem,
  insertItem,
  mergeObject,
  removeItem,
  updateItem,
} from './cache-ops';
import { getRowStore } from './client-state';
import type { Effect } from './define-mutation';
import { createTempId, isTempId } from './temp-id';
import { isPlainObject, readId } from './util';

export type ApplyCtx = {
  client: QueryClient;
  queryKey: readonly unknown[];
  mutation: string;
};

export type OptimisticResult = {
  next: unknown;
  rowId?: string;
  tempId?: string;
  /** Remove of an un-persisted (temp) item — skip the network request + sync. */
  skipRequest?: boolean;
};

function inputId(input: unknown): string | undefined {
  if (typeof input === 'string') return input;
  if (isPlainObject(input) && typeof input.id === 'string') return input.id;
  return undefined;
}

function matcher(
  effectMatch: ((item: unknown, input: unknown) => boolean) | undefined,
  input: unknown,
): (item: unknown) => boolean {
  if (effectMatch) return item => effectMatch(item, input);
  const id = inputId(input);
  return item => id !== undefined && readId(item) === id;
}

/** Apply the optimistic update to a cache snapshot. Pure w.r.t. `data`; tags the row store. */
export function applyOptimistic(
  effect: Effect,
  data: unknown,
  input: unknown,
  ctx: ApplyCtx,
): OptimisticResult {
  switch (effect.kind) {
    case 'object':
      return { next: effect.optimistic ? effect.optimistic(data, input) : data };

    case 'insert': {
      const tempId = createTempId();
      const item = effect.draft(input, tempId);
      getRowStore(ctx.client).tagPending(ctx.queryKey, tempId, { mutation: ctx.mutation });
      return {
        next: insertItem(data, effect.field, item, effect.position),
        rowId: tempId,
        tempId,
      };
    }

    case 'update': {
      const match = matcher(effect.match, input);
      const matched = findItem(data, effect.field, match);
      const rowId = readId(matched);
      const patch = effect.draft(input);
      const next = updateItem(data, effect.field, match, item => mergeObject(item, patch));
      if (rowId) {
        getRowStore(ctx.client).tagPending(ctx.queryKey, rowId, { mutation: ctx.mutation });
      }
      return { next, rowId };
    }

    case 'remove': {
      const match = matcher(effect.match, input);
      const matched = findItem(data, effect.field, match);
      const rowId = readId(matched);
      return {
        next: removeItem(data, effect.field, match),
        rowId,
        skipRequest: matched !== undefined && isTempId(rowId),
      };
    }

    case 'removeQuery':
      return { next: data };
  }
}

export type SettleCtx = ApplyCtx & {
  rowId?: string;
  tempId?: string;
  /** Record a temp id that settled to a server id (for later edits/removes). */
  onSettle?: (tempId: string, serverId: string) => void;
};

/** Apply the server response on success. */
export function applySettle(
  effect: Effect,
  data: unknown,
  response: unknown,
  ctx: SettleCtx,
): unknown {
  switch (effect.kind) {
    case 'object':
      if (effect.settle) return effect.settle(data, response);
      return isPlainObject(response) ? mergeObject(data, response) : data;

    case 'insert': {
      if (!ctx.tempId) return data;
      const settled = effect.from ? effect.from(response) : response;
      const serverId = readId(settled);
      const next = updateItem(data, effect.field, item => readId(item) === ctx.tempId, () => settled);
      if (serverId && serverId !== ctx.tempId) ctx.onSettle?.(ctx.tempId, serverId);
      getRowStore(ctx.client).clear(ctx.queryKey, ctx.tempId);
      return next;
    }

    case 'update': {
      if (ctx.rowId) getRowStore(ctx.client).clear(ctx.queryKey, ctx.rowId);
      if (!isPlainObject(response)) return data;
      return updateItem(data, effect.field, item => readId(item) === ctx.rowId, item =>
        mergeObject(item, response),
      );
    }

    case 'remove':
      if (ctx.rowId) getRowStore(ctx.client).clear(ctx.queryKey, ctx.rowId);
      return data;

    case 'removeQuery':
      return data;
  }
}

export type RollbackCtx = ApplyCtx & {
  previous: unknown;
  rowId?: string;
  tempId?: string;
};

/** Revert an optimistic update on failure. Id-targeted so it is safe under concurrency. */
export function rollback(effect: Effect, current: unknown, input: unknown, ctx: RollbackCtx): unknown {
  switch (effect.kind) {
    case 'object':
      return ctx.previous;

    case 'insert': {
      if (ctx.tempId) getRowStore(ctx.client).clear(ctx.queryKey, ctx.tempId);
      if (!ctx.tempId) return current;
      return removeItem(current, effect.field, item => readId(item) === ctx.tempId);
    }

    case 'update': {
      if (ctx.rowId) getRowStore(ctx.client).clear(ctx.queryKey, ctx.rowId);
      const prevItem = findItem(ctx.previous, effect.field, item => readId(item) === ctx.rowId);
      if (prevItem === undefined) return current;
      return updateItem(current, effect.field, item => readId(item) === ctx.rowId, () => prevItem);
    }

    case 'remove': {
      const match = matcher(effect.match, input);
      const prevItem = findItem(ctx.previous, effect.field, match);
      if (prevItem === undefined) return current;
      const stillThere = findItem(current, effect.field, item => readId(item) === readId(prevItem));
      if (stillThere !== undefined) return current;
      return insertItem(current, effect.field, prevItem, 'end');
    }

    case 'removeQuery':
      return current;
  }
}

/** Whether this effect keeps a failed row in place (with retry) instead of rolling back. */
export function keepsOnFail(effect: Effect, rowId: string | undefined): boolean {
  return (
    (effect.kind === 'insert' || effect.kind === 'update')
    && effect.keepOnFail
    && rowId !== undefined
  );
}
