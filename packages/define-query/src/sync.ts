import type { AnyQuery } from './define-query';

/** Data available to every sync op after a successful mutation. */
export type SyncEvent<TParams, TInput, TResponse> = {
  params: TParams;
  input: TInput;
  response: TResponse;
};

type ParamsOf<E> = (event: E) => unknown;

export type SyncOp<E = SyncEvent<unknown, unknown, unknown>> =
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
  | { kind: 'invalidate'; query: AnyQuery; params?: ParamsOf<E> };

type ParamsOpt<E, TParams2> = { params?: (event: E) => TParams2 };

/** Chainable ops targeting one sibling query, bound to the mutation's event `E`. */
export type QuerySync<TData2, E> = {
  bump: (field: NumericKey<TData2>, by: number, opts?: ParamsOpt<E, unknown>) => SyncOp<E>;
  mergeItem: <TItem = unknown>(
    field: string,
    config: { id?: (event: E) => string; set: (item: TItem, event: E) => Partial<TItem> },
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  removeItem: (
    field: string,
    config?: { id?: (event: E) => string },
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  set: (
    updater: (current: TData2 | undefined, event: E) => TData2 | undefined,
    opts?: ParamsOpt<E, unknown>,
  ) => SyncOp<E>;
  invalidate: (opts?: ParamsOpt<E, unknown>) => SyncOp<E>;
};

type NumericKey<TData2> = TData2 extends Record<string, unknown>
  ? Extract<{ [K in keyof TData2]: TData2[K] extends number ? K : never }[keyof TData2], string>
  : string;

/** Captures the target query's data type via its `__data` phantom. */
type QueryRef<TData2> = { key: (params: never) => readonly unknown[]; readonly __data?: TData2 };

export type OnBuilder<E> = <TData2>(query: QueryRef<TData2>) => QuerySync<TData2, E>;

export function createOnBuilder<E>(): OnBuilder<E> {
  return <TData2>(query: QueryRef<TData2>): QuerySync<TData2, E> => {
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
      invalidate: opts => ({ kind: 'invalidate', query: target, params: opts?.params }),
    };
  };
}
