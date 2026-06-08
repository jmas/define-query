import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type UnusedSkipTokenInfiniteOptions,
  type UnusedSkipTokenOptions,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { isDefineQuerySetup } from './client-state';
import { warnSetupRequired } from './dev-warnings';
import { buildDefineQueryMeta } from './query-fetch-sync';
import { getQueryKey } from './query-key';
import {
  createQueryOnBuilder,
  widenQuerySyncOps,
  type QueryFetchSyncEvent,
  type QueryOnBuilder,
  type QuerySyncOp,
} from './query-sync';

export type { QueryFetchSyncEvent } from './query-sync';

export type QueryTanStackOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

export type InfiniteTanStackOptions<TPage, TPageParam> = Omit<
  UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage>, readonly unknown[], TPageParam>,
  'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
>;

type QuerySync<TParams, TData> = (
  on: QueryOnBuilder<QueryFetchSyncEvent<TParams, TData>>,
) => readonly QuerySyncOp<QueryFetchSyncEvent<TParams, TData>>[];

export type QueryConfig<TParams, TData> = {
  key: (params: TParams) => readonly unknown[];
  fetch: (params: TParams) => Promise<TData>;
  options?: QueryTanStackOptions<TData>;
  sync?: QuerySync<TParams, TData>;
};

export type InfiniteQueryConfig<TParams, TPage, TPageParam> = {
  key: (params: TParams) => readonly unknown[];
  fetch: (params: TParams, page: TPageParam) => Promise<TPage>;
  initialPage: TPageParam;
  nextPage: (last: TPage, all: TPage[], params: TParams) => TPageParam | undefined | null;
  prevPage?: (first: TPage, all: TPage[], params: TParams) => TPageParam | undefined | null;
  options?: InfiniteTanStackOptions<TPage, TPageParam>;
  sync?: QuerySync<TParams, InfiniteData<TPage>>;
};

// The `queryFn`-as-function (non-skipToken) shapes — accepted by both
// `useQuery` and `useSuspenseQuery` / `useInfiniteQuery`.
type PlainQueryOptions<TData> = UnusedSkipTokenOptions<TData, Error, TData, readonly unknown[]>;

type InfiniteOptions<TPage, TPageParam> = UnusedSkipTokenInfiniteOptions<
  TPage,
  Error,
  InfiniteData<TPage>,
  readonly unknown[],
  TPageParam
>;

/** Call with params to get a TanStack `queryOptions` object: `useQuery(post(id))`. */
export type QueryFactory<TParams, TData> = {
  (params: TParams): PlainQueryOptions<TData>;
  /** Stable normalized query key — same as `query(params).queryKey`. */
  key: (params: TParams) => readonly unknown[];
  infinite: false;
  /** @internal Type inference hook for sync/mutation — do not set manually. */
  readonly __data?: TData;
};

export type InfiniteQueryFactory<TParams, TPage, TPageParam> = {
  (params: TParams): InfiniteOptions<TPage, TPageParam>;
  /** Stable normalized query key — same as `query(params).queryKey`. */
  key: (params: TParams) => readonly unknown[];
  infinite: true;
  /** @internal Type inference hook for sync/mutation — do not set manually. */
  readonly __data?: InfiniteData<TPage>;
};

export type AnyQuery =
  | QueryFactory<never, unknown>
  | InfiniteQueryFactory<never, unknown, unknown>;

/**
 * Structural bound for `defineMutation` — `key` + phantom `__data` only.
 * Avoids pulling in TanStack `queryOptions` variance from full `QueryFactory`.
 */
/** `TParams = never` on the bound side keeps concrete query factories assignable (contravariant `key`). */
export type MutationQueryRef<TParams = never, TData = unknown> = {
  key: (params: TParams) => readonly unknown[];
  readonly __data?: TData;
};

/** Defines a query once; returns a factory producing TanStack `queryOptions`. */
export function defineQuery<TParams, TData>(
  config: QueryConfig<TParams, TData>,
): QueryFactory<TParams, TData> {
  const syncOps = config.sync?.(createQueryOnBuilder<QueryFetchSyncEvent<TParams, TData>>()) ?? [];
  const hasSync = syncOps.length > 0;

  const keyFn = (params: TParams) => getQueryKey(config, params);

  const factory = (params: TParams) => {
    const { meta: optionsMeta, ...restOptions } = config.options ?? {};
    const meta = buildDefineQueryMeta(
      widenQuerySyncOps(syncOps),
      params,
      optionsMeta as Record<string, unknown> | undefined,
    );

    return queryOptions({
      queryKey: keyFn(params),
      queryFn: ctx => {
        if (hasSync && !isDefineQuerySetup(ctx.client)) warnSetupRequired();
        return config.fetch(params);
      },
      ...restOptions,
      ...(meta !== undefined ? { meta } : {}),
    });
  };

  return Object.assign(factory, {
    key: keyFn,
    infinite: false as const,
    __data: undefined as TData | undefined,
  }) as unknown as QueryFactory<TParams, TData>;
}

export function defineInfiniteQuery<TParams, TPage, TPageParam>(
  config: InfiniteQueryConfig<TParams, TPage, TPageParam>,
): InfiniteQueryFactory<TParams, TPage, TPageParam> {
  const syncOps =
    config.sync?.(createQueryOnBuilder<QueryFetchSyncEvent<TParams, InfiniteData<TPage>>>()) ?? [];
  const hasSync = syncOps.length > 0;

  const keyFn = (params: TParams) => getQueryKey(config, params);

  const factory = (params: TParams) => {
    const { meta: optionsMeta, ...restOptions } = config.options ?? {};
    const meta = buildDefineQueryMeta(
      widenQuerySyncOps(syncOps),
      params,
      optionsMeta as Record<string, unknown> | undefined,
    );

    return infiniteQueryOptions<TPage, Error, InfiniteData<TPage>, readonly unknown[], TPageParam>({
      queryKey: keyFn(params),
      queryFn: ctx => {
        if (hasSync && !isDefineQuerySetup(ctx.client)) warnSetupRequired();
        return config.fetch(params, ctx.pageParam as TPageParam);
      },
      initialPageParam: config.initialPage,
      getNextPageParam: (last, all) => config.nextPage(last, all, params),
      getPreviousPageParam: config.prevPage
        ? (first, all) => config.prevPage!(first, all, params)
        : undefined,
      ...restOptions,
      ...(meta !== undefined ? { meta } : {}),
    });
  };

  return Object.assign(factory, {
    key: keyFn,
    infinite: true as const,
    __data: undefined as InfiniteData<TPage> | undefined,
  }) as unknown as InfiniteQueryFactory<TParams, TPage, TPageParam>;
}
