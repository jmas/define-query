// Query definitions — factories that produce native TanStack query options.
// Use them with the native hooks: `useQuery(post(id))`, `useSuspenseQuery(...)`,
// `useInfiniteQuery(...)`, and `queryClient.prefetchQuery(post(id))`.
export { defineQuery, defineInfiniteQuery, getQueryKey } from './define-query';
export type {
  QueryFactory,
  InfiniteQueryFactory,
  QueryTanStackOptions,
  InfiniteTanStackOptions,
} from './define-query';

// Mutation definition — a factory producing native TanStack mutation options.
// Use it with the native hook: `useMutation(addComment(postId))`.
export { defineMutation } from './define-mutation';
export type { MutationConfig, MutationFactory, ListItem } from './define-mutation';

// Per-row optimistic state (pending / failed / retry) for list items.
export { useRowState } from './use-row-state';
export type { RowState } from './row-store';

// Sync builder types
export type { SyncEvent, SyncOp, OnBuilder, QuerySync } from './sync';

// Errors
export {
  fail,
  classify,
  fieldError,
  errorText,
  generalErrorText,
  isValidationError,
  isRowFailure,
  rowFailureId,
  RowFailure,
} from './errors';
export type { MutationError, ValidationFields } from './errors';

// Utilities
export { flattenInfiniteField } from './cache-ops';
export { isTempId } from './temp-id';
