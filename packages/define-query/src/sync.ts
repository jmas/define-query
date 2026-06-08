import type { AnyQuery } from './define-query';
import type { SyncDataShape, SyncFieldItem, SyncListFieldOf } from './sync-list-types';

/** Data available to every sync op after a mutation. */
export type SyncEvent<TParams, TInput, TResponse, TData = unknown> = {
  params: TParams;
  input: TInput;
  response: TResponse;
  /** Mutation query cache after the draft write or settle. */
  data?: TData;
  /** Affected list row — when set, `setEach` seeds only this item. */
  item?: unknown;
};

type ParamsOf<E> = (event: E) => unknown;

type SourceData<E> = E extends SyncEvent<unknown, unknown, unknown, infer D> ? D : never;

export type SyncOp<E = SyncEvent<unknown, unknown, unknown, unknown>> =
  | { kind: 'bump'; query: AnyQuery; field: string; by: number; params?: ParamsOf<E> }
  | {
      kind: 'mergeItem';
      query: AnyQuery;
      field: string;
      id?: (event: E) => string;
      set: (item: unknown, event: E) => unknown;
      params?: ParamsOf<E>;
    }
  | { kind: 'removeItem'; query: AnyQuery; field: string; id?: (event: E) => string; params?: ParamsOf<E> }
  | { kind: 'set'; query: AnyQuery; updater: (current: unknown, event: E) => unknown; params?: ParamsOf<E> }
  | {
      kind: 'setEach';
      query: AnyQuery;
      field: string;
      params: (event: E, item: unknown) => unknown;
      set: (item: unknown, event: E) => unknown;
    }
  | { kind: 'invalidate'; query: AnyQuery; params?: ParamsOf<E> };

type ParamsOpt<E, TParams2> = { params?: (event: E) => TParams2 };

/** Chainable ops targeting one sibling query, bound to the mutation's event `E`. */
export type QuerySync<TData2, E, TParams2 = unknown> = {
  bump: (field: NumericKey<TData2>, by: number, opts?: ParamsOpt<E, unknown>) => SyncOp<E>;
  mergeItem: <K extends SyncListFieldOf<SyncDataShape<TData2>>>(
    field: K,
    config: {
      id?: (event: E) => string;
      set: (
        item: SyncFieldItem<SyncDataShape<TData2>, K>,
        event: E,
      ) => Partial<SyncFieldItem<SyncDataShape<TData2>, K>>;
    },
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  removeItem: <K extends SyncListFieldOf<SyncDataShape<TData2>>>(
    field: K,
    config?: { id?: (event: E) => string },
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  set: (
    updater: (current: TData2 | undefined, event: E) => TData2 | undefined,
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  setEach: <K extends SyncListFieldOf<SyncDataShape<SourceData<E>>>>(
    field: K,
    config: {
      params: (event: E, item: SyncFieldItem<SyncDataShape<SourceData<E>>, K>) => TParams2;
      set: (item: SyncFieldItem<SyncDataShape<SourceData<E>>, K>, event: E) => TData2;
    },
  ) => SyncOp<E>;
  invalidate: (opts?: ParamsOpt<E, unknown>) => SyncOp<E>;
};

type NumericKey<TData2> = TData2 extends Record<string, unknown>
  ? Extract<{ [K in keyof TData2]: TData2[K] extends number ? K : never }[keyof TData2], string>
  : string;

/** Captures the target query's data type via its `__data` phantom. */
type QueryRef<TData2, TParams2 = unknown> = {
  key: (params: TParams2) => readonly unknown[];
  readonly __data?: TData2;
};

export type OnBuilder<E> = <TData2, TParams2 = unknown>(
  query: QueryRef<TData2, TParams2>,
) => QuerySync<TData2, E, TParams2>;

export function createOnBuilder<E>(): OnBuilder<E> {
  return <TData2, TParams2>(query: QueryRef<TData2, TParams2>): QuerySync<TData2, E, TParams2> => {
    const target = query as unknown as AnyQuery;
    return {
      bump: (field, by, opts) => ({
        kind: 'bump',
        query: target,
        field: field as string,
        by,
        params: opts?.params,
      }),
      mergeItem: (field, config, opts) => ({
        kind: 'mergeItem',
        query: target,
        field,
        id: config.id,
        set: config.set as (item: unknown, event: E) => unknown,
        params: opts?.params,
      }),
      removeItem: (field, config, opts) => ({
        kind: 'removeItem',
        query: target,
        field,
        id: config?.id,
        params: opts?.params,
      }),
      set: (updater, opts) => ({
        kind: 'set',
        query: target,
        updater: updater as (current: unknown, event: E) => unknown,
        params: opts?.params,
      }),
      setEach: (field, config) => ({
        kind: 'setEach',
        query: target,
        field,
        params: config.params as (event: E, item: unknown) => unknown,
        set: config.set as (item: unknown, event: E) => unknown,
      }),
      invalidate: opts => ({ kind: 'invalidate', query: target, params: opts?.params }),
    };
  };
}
