import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
  type UnusedSkipTokenInfiniteOptions,
  type UnusedSkipTokenOptions,
  type UseInfiniteQueryOptions,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { getQueryKey } from './query-key';

export type QueryTanStackOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, readonly unknown[]>,
  'queryKey' | 'queryFn'
>;

export type InfiniteTanStackOptions<TPage, TPageParam> = Omit<
  UseInfiniteQueryOptions<TPage, Error, InfiniteData<TPage>, readonly unknown[], TPageParam>,
  'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
>;

export type QueryConfig<TParams, TData> = {
  key: (params: TParams) => readonly unknown[];
  fetch: (params: TParams) => Promise<TData>;
  options?: QueryTanStackOptions<TData>;
};

export type InfiniteQueryConfig<TParams, TPage, TPageParam> = {
  key: (params: TParams) => readonly unknown[];
  fetch: (params: TParams, page: TPageParam) => Promise<TPage>;
  initialPage: TPageParam;
  nextPage: (last: TPage, all: TPage[], params: TParams) => TPageParam | undefined | null;
  prevPage?: (first: TPage, all: TPage[], params: TParams) => TPageParam | undefined | null;
  options?: InfiniteTanStackOptions<TPage, TPageParam>;
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
  key: (params: TParams) => readonly unknown[];
  infinite: false;
  readonly __data?: TData;
};

export type InfiniteQueryFactory<TParams, TPage, TPageParam> = {
  (params: TParams): InfiniteOptions<TPage, TPageParam>;
  key: (params: TParams) => readonly unknown[];
  infinite: true;
  readonly __data?: InfiniteData<TPage>;
};

export type AnyQuery =
  | QueryFactory<never, unknown>
  | InfiniteQueryFactory<never, unknown, unknown>;

/** Defines a query once; returns a factory producing TanStack `queryOptions`. */
export function defineQuery<TParams, TData>(
  config: QueryConfig<TParams, TData>,
): QueryFactory<TParams, TData> {
  const factory = (params: TParams) =>
    queryOptions({
      queryKey: getQueryKey(config, params),
      queryFn: () => config.fetch(params),
      ...config.options,
    });
  return Object.assign(factory, {
    key: config.key,
    infinite: false as const,
  }) as unknown as QueryFactory<TParams, TData>;
}

export function defineInfiniteQuery<TParams, TPage, TPageParam>(
  config: InfiniteQueryConfig<TParams, TPage, TPageParam>,
): InfiniteQueryFactory<TParams, TPage, TPageParam> {
  const factory = (params: TParams) =>
    infiniteQueryOptions<TPage, Error, InfiniteData<TPage>, readonly unknown[], TPageParam>({
      queryKey: getQueryKey(config, params),
      queryFn: ({ pageParam }) => config.fetch(params, pageParam as TPageParam),
      initialPageParam: config.initialPage,
      getNextPageParam: (last, all) => config.nextPage(last, all, params),
      getPreviousPageParam: config.prevPage
        ? (first, all) => config.prevPage!(first, all, params)
        : undefined,
      ...config.options,
    });
  return Object.assign(factory, {
    key: config.key,
    infinite: true as const,
  }) as unknown as InfiniteQueryFactory<TParams, TPage, TPageParam>;
}

export { getQueryKey };
