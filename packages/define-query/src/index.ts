// Query definitions — factories that produce native TanStack query options.
// Use them with the native hooks: `useQuery(post(id))`, `useSuspenseQuery(...)`,
// `useInfiniteQuery(...)`, and `queryClient.prefetchQuery(post(id))`.
export { defineQuery, defineInfiniteQuery } from './define-query';
export type {
  QueryFactory,
  InfiniteQueryFactory,
  MutationQueryRef,
  QueryTanStackOptions,
  InfiniteTanStackOptions,
  QueryFetchSyncEvent,
} from './define-query';

// Mutation definition — a factory producing native TanStack mutation options.
// Use it with the native hook: `useMutation(addComment(postId))`.
export { defineMutation } from './define-mutation';
export type {
  MutationConfig,
  ThinMutationConfig,
  MutationFactory,
  DraftCtx,
  SettleCtx,
  ListItem,
  ParamsFromRequest,
  InferMutationInputFromRest,
  InferMutationInput,
  InferMutationResponse,
} from './define-mutation';

// Sync builder types
export type { SyncEvent, SyncOp, OnBuilder, QuerySync } from './sync';

// Errors
export { fail, DefineQueryMutationError, isMutationError } from './errors';
export type { MutationError, ValidationFields } from './errors';

// Utilities
export { flattenInfiniteField } from './cache-ops';
export { isTempId, createTempId } from './temp-id';
export type { SyncListFieldOf, SyncFieldItem, SyncDataShape } from './sync-list-types';
