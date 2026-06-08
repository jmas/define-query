import type { QueryClient } from '@tanstack/react-query';
import {
  findItem,
  insertItem,
  mergeObject,
  removeItem,
  updateItem,
} from './cache-ops';
import type { DraftCtx, Effect } from './define-mutation';
import { createTempId, isTempId } from './temp-id';
import { isPlainObject, readId } from './util';

export type ApplyCtx = {
  client: QueryClient;
  queryKey: readonly unknown[];
  mutation: string;
};

export type DraftResult = {
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

function draftCtx(
  data: unknown,
  input: unknown,
  extra?: { tempId?: string; item?: unknown },
): DraftCtx<unknown, unknown> {
  return { data, input, ...extra };
}

/** Apply the draft update to a cache snapshot. Pure w.r.t. `data`. */
export function applyDraft(
  effect: Effect,
  data: unknown,
  input: unknown,
  _ctx: ApplyCtx,
): DraftResult {
  switch (effect.kind) {
    case 'object':
      return {
        next: effect.draft ? effect.draft(draftCtx(data, input)) : data,
      };

    case 'insert': {
      const tempId = createTempId();
      const item = effect.draft(draftCtx(data, input, { tempId }));
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
      const patch = effect.draft(draftCtx(data, input, { item: matched }));
      const next = updateItem(data, effect.field, match, item => mergeObject(item, patch));
      return { next, rowId };
    }

    case 'removeField': {
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

export type ApplySettleCtx = ApplyCtx & {
  input: unknown;
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
  ctx: ApplySettleCtx,
): unknown {
  const base = draftCtx(data, ctx.input, { item: ctx.rowId ? findItemByRowId(data, effect, ctx.rowId) : undefined });

  switch (effect.kind) {
    case 'object':
      if (effect.settle) {
        return effect.settle({ ...base, response });
      }
      return isPlainObject(response) ? mergeObject(data, response) : data;

    case 'insert': {
      if (!ctx.tempId) return data;
      const settled = effect.settle ? effect.settle(response) : response;
      const serverId = readId(settled);
      const next = updateItem(data, effect.field, item => readId(item) === ctx.tempId, () => settled);
      if (serverId && serverId !== ctx.tempId) ctx.onSettle?.(ctx.tempId, serverId);
      return next;
    }

    case 'update': {
      const patch = effect.settle
        ? effect.settle({ ...base, response })
        : isPlainObject(response)
          ? response
          : undefined;
      if (patch === undefined) return data;
      return updateItem(data, effect.field, item => readId(item) === ctx.rowId, item =>
        mergeObject(item, patch),
      );
    }

    case 'removeField':
      return data;

    case 'removeQuery':
      return data;
  }
}

function findItemByRowId(data: unknown, effect: Effect, rowId: string): unknown {
  if (effect.kind !== 'update' && effect.kind !== 'object') return undefined;
  if (effect.kind === 'object') return undefined;
  return findItem(data, effect.field, item => readId(item) === rowId);
}

export type RollbackCtx = ApplyCtx & {
  previous: unknown;
  rowId?: string;
  tempId?: string;
};

/** Revert a draft update on failure. Id-targeted so it is safe under concurrency. */
export function rollback(effect: Effect, current: unknown, input: unknown, ctx: RollbackCtx): unknown {
  switch (effect.kind) {
    case 'object':
      return ctx.previous;

    case 'insert': {
      if (!ctx.tempId) return current;
      return removeItem(current, effect.field, item => readId(item) === ctx.tempId);
    }

    case 'update': {
      const prevItem = findItem(ctx.previous, effect.field, item => readId(item) === ctx.rowId);
      if (prevItem === undefined) return current;
      return updateItem(current, effect.field, item => readId(item) === ctx.rowId, () => prevItem);
    }

    case 'removeField': {
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
