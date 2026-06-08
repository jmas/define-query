import type { QueryClient } from '@tanstack/react-query';
import type { AnyQuery } from './define-query';
import { flattenInfiniteField } from './cache-ops';
import { getQueryKey } from './query-key';
import type { SyncDataShape, SyncFieldItem, SyncListFieldOf } from './sync-list-types';

/** Data available to every query fetch sync op after a successful network fetch. */
export type QueryFetchSyncEvent<TParams, TData> = {
  params: TParams;
  data: TData;
};

type AnyQueryFetchEvent = QueryFetchSyncEvent<unknown, unknown>;

type ParamsOf<E> = (event: E) => unknown;

type SourceData<E> = E extends QueryFetchSyncEvent<unknown, infer D> ? D : never;

export type QuerySyncOp<E = AnyQueryFetchEvent> =
  | {
      kind: 'set';
      query: AnyQuery;
      updater: (current: unknown, event: E) => unknown;
      params?: ParamsOf<E>;
    }
  | {
      kind: 'setEach';
      query: AnyQuery;
      field: string;
      params: (event: E, item: unknown) => unknown;
      set: (item: unknown, event: E) => unknown;
    };

type ParamsOpt<E, TParams2> = { params?: (event: E) => TParams2 };

/** Chainable ops targeting one sibling query, bound to the fetch event `E`. */
export type QuerySyncBuilder<TData2, E, TParams2 = unknown> = {
  set: (
    updater: (current: TData2 | undefined, event: E) => TData2 | undefined,
    opts?: ParamsOpt<E, TParams2>,
  ) => QuerySyncOp<E>;
  setEach: <K extends SyncListFieldOf<SyncDataShape<SourceData<E>>>>(
    field: K,
    config: {
      params: (event: E, item: SyncFieldItem<SyncDataShape<SourceData<E>>, K>) => TParams2;
      set: (item: SyncFieldItem<SyncDataShape<SourceData<E>>, K>, event: E) => TData2;
    },
  ) => QuerySyncOp<E>;
};

/** Captures the target query's data + params types via its factory shape. */
type QueryRef<TData2, TParams2 = unknown> = {
  key: (params: TParams2) => readonly unknown[];
  readonly __data?: TData2;
};

export type QueryOnBuilder<E> = <TData2, TParams2 = unknown>(
  query: QueryRef<TData2, TParams2>,
) => QuerySyncBuilder<TData2, E, TParams2>;

function exactKey<E>(
  query: AnyQuery,
  event: E,
  params?: (event: E) => unknown,
  fallback?: unknown,
): readonly unknown[] {
  const target = params ? params(event) : fallback;
  return getQueryKey(query, target);
}

export function createQueryOnBuilder<E>(): QueryOnBuilder<E> {
  return <TData2, TParams2>(query: QueryRef<TData2, TParams2>): QuerySyncBuilder<TData2, E, TParams2> => {
    const target = query as unknown as AnyQuery;
    return {
      set: (updater, opts) => ({
        kind: 'set',
        query: target,
        updater: updater as (current: unknown, event: E) => unknown,
        params: opts?.params as ParamsOf<E> | undefined,
      }),
      setEach: (field, config) => ({
        kind: 'setEach',
        query: target,
        field,
        params: config.params as (event: E, item: unknown) => unknown,
        set: config.set as (item: unknown, event: E) => unknown,
      }),
    };
  };
}

/** Widen typed sync ops for storage in query meta (variance-safe). */
export function widenQuerySyncOps<TParams, TData>(
  ops: readonly QuerySyncOp<QueryFetchSyncEvent<TParams, TData>>[],
): readonly QuerySyncOp<AnyQueryFetchEvent>[] {
  return ops as readonly QuerySyncOp<AnyQueryFetchEvent>[];
}

export function runQuerySync<E extends AnyQueryFetchEvent>(
  client: QueryClient,
  ops: readonly QuerySyncOp<E>[],
  event: E,
): void {
  for (const op of ops) {
    switch (op.kind) {
      case 'set': {
        client.setQueryData(exactKey(op.query, event, op.params, event.params), current =>
          op.updater(current, event),
        );
        break;
      }

      case 'setEach': {
        const items = flattenInfiniteField<unknown>(event.data, op.field);
        for (const item of items) {
          const targetParams = op.params(event, item);
          client.setQueryData(getQueryKey(op.query, targetParams), op.set(item, event));
        }
        break;
      }
    }
  }
}

