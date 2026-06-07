import type { InfiniteData, UseMutationOptions } from '@tanstack/react-query';
import type { InfiniteQueryFactory, QueryFactory } from './define-query';
import { buildMutationKey } from './query-key';
import { runMutation } from './run-mutation';
import type { OnBuilder, SyncEvent, SyncOp } from './sync';

/* ------------------------------------------------------------------ *
 * Type inference helpers
 * ------------------------------------------------------------------ */

type ArrayElem<T> = T extends (infer E)[] ? E : never;
type ItemUnion<O> = O extends Record<string, unknown> ? ArrayElem<O[keyof O]> : unknown;

type ListFieldOf<T> = {
  [K in keyof T]: T[K] extends readonly unknown[] ? K : never;
}[keyof T];

/** Element type of the query's list field(s). Works for plain + infinite data. */
export type ListItem<TData> = TData extends InfiniteData<infer Page>
  ? ItemUnion<Page>
  : ItemUnion<TData>;

/* ------------------------------------------------------------------ *
 * Public config
 * ------------------------------------------------------------------ */

type Sync<TParams, TInput, TResponse> = (
  on: OnBuilder<SyncEvent<TParams, TInput, TResponse>>,
) => readonly SyncOp<SyncEvent<TParams, TInput, TResponse>>[];

/** Remap temp ids to server ids in mutation input before `request`. Default: `['id']`. */
export type RemapInput<TInput> =
  | readonly string[]
  | ((input: TInput, remap: (id: string) => string) => TInput);

type Common<TParams, TData, TInput, TResponse> = {
  /** Routes per-row retry. Defaults to `'mutation'`. */
  name?: string;
  /** Client-side checks — throw `fail.validation(...)`. Runs before the optimistic update. */
  validate?: (input: TInput) => void;
  /** Which input fields to remap from temp to server id. Default: `['id']`. */
  remapInput?: RemapInput<TInput>;
  sync?: Sync<TParams, TInput, TResponse>;
  /** @internal forces TData into inference */
  readonly __data?: TData;
};

type RemovesMutation<TParams, TData, TInput, TResponse> = Common<
  TParams,
  TData,
  TInput,
  TResponse
> & {
  removes: true;
  insert?: never;
  prepend?: never;
  update?: never;
  remove?: never;
  optimistic?: never;
  settle?: never;
  draft?: never;
  from?: never;
  match?: never;
  keepOnFail?: never;
};

type InsertMutation<TParams, TData, TInput, TResponse> = ListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      update?: never;
      remove?: never;
      optimistic?: never;
      settle?: never;
      draft: (input: TInput, tempId: string) => ListItem<TData>;
      from?: (response: TResponse) => ListItem<TData>;
      keepOnFail?: boolean;
    } & ({ insert: string; prepend?: never } | { prepend: string; insert?: never });

type UpdateMutation<TParams, TData, TInput, TResponse> = ListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      insert?: never;
      prepend?: never;
      remove?: never;
      optimistic?: never;
      settle?: never;
      from?: never;
      update: string;
      match?: (item: ListItem<TData>, input: TInput) => boolean;
      draft: (input: TInput) => Partial<ListItem<TData>>;
      keepOnFail?: boolean;
    };

type RemoveMutation<TParams, TData, TInput, TResponse> = ListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      insert?: never;
      prepend?: never;
      update?: never;
      optimistic?: never;
      settle?: never;
      draft?: never;
      from?: never;
      keepOnFail?: never;
      remove: string;
      match?: (item: ListItem<TData>, input: TInput) => boolean;
    };

type ObjectMutation<TParams, TData, TInput, TResponse> = Common<
  TParams,
  TData,
  TInput,
  TResponse
> & {
  removes?: never;
  insert?: never;
  prepend?: never;
  update?: never;
  remove?: never;
  draft?: never;
  from?: never;
  match?: never;
  keepOnFail?: never;
  optimistic?: (data: TData, input: TInput) => TData;
  settle?: (data: TData, response: TResponse) => TData;
};

export type MutationConfig<TParams, TData, TInput, TResponse> =
  | RemovesMutation<TParams, TData, TInput, TResponse>
  | InsertMutation<TParams, TData, TInput, TResponse>
  | UpdateMutation<TParams, TData, TInput, TResponse>
  | RemoveMutation<TParams, TData, TInput, TResponse>
  | ObjectMutation<TParams, TData, TInput, TResponse>;

/* ------------------------------------------------------------------ *
 * Normalized runtime plan
 * ------------------------------------------------------------------ */

export type Effect =
  | {
      kind: 'object';
      optimistic?: (data: unknown, input: unknown) => unknown;
      settle?: (data: unknown, response: unknown) => unknown;
    }
  | {
      kind: 'insert';
      field: string;
      position: 'start' | 'end';
      draft: (input: unknown, tempId: string) => unknown;
      from?: (response: unknown) => unknown;
      keepOnFail: boolean;
    }
  | {
      kind: 'update';
      field: string;
      match?: (item: unknown, input: unknown) => boolean;
      draft: (input: unknown) => unknown;
      keepOnFail: boolean;
    }
  | { kind: 'remove'; field: string; match?: (item: unknown, input: unknown) => boolean }
  | { kind: 'removeQuery' };

export type MutationPlan<TParams, TInput, TResponse> = {
  name: string;
  query: { key: (params: TParams) => readonly unknown[] };
  request: (params: TParams, input?: TInput) => Promise<TResponse>;
  effect: Effect;
  validate?: (input: TInput) => void;
  remapInput: RemapInput<TInput>;
  sync?: Sync<TParams, TInput, TResponse>;
};

/** Call with params to get TanStack `mutationOptions`: `useMutation(addComment(id))`. */
export type MutationFactory<TParams, TInput, TResponse> = {
  (params: TParams): UseMutationOptions<TResponse, Error, TInput, unknown>;
  /** Stable TanStack mutation key — `[...queryKey, name]`. */
  key: (params: TParams) => readonly unknown[];
  readonly __input?: TInput;
};

type AnyConfig = {
  name?: string;
  request: (...args: never[]) => Promise<unknown>;
  validate?: (input: unknown) => void;
  remapInput?: RemapInput<unknown>;
  sync?: Sync<unknown, unknown, unknown>;
  optimistic?: (data: unknown, input: unknown) => unknown;
  settle?: (data: unknown, response: unknown) => unknown;
  insert?: string;
  prepend?: string;
  update?: string;
  remove?: string;
  removes?: boolean;
  draft?: (...args: never[]) => unknown;
  from?: (response: unknown) => unknown;
  match?: (item: unknown, input: unknown) => boolean;
  keepOnFail?: boolean;
};

function normalizeEffect(config: AnyConfig): Effect {
  if (config.removes) return { kind: 'removeQuery' };

  if (config.insert !== undefined || config.prepend !== undefined) {
    return {
      kind: 'insert',
      field: (config.insert ?? config.prepend) as string,
      position: config.prepend !== undefined ? 'start' : 'end',
      draft: config.draft as (input: unknown, tempId: string) => unknown,
      from: config.from,
      keepOnFail: config.keepOnFail ?? false,
    };
  }

  if (config.update !== undefined) {
    return {
      kind: 'update',
      field: config.update,
      match: config.match,
      draft: config.draft as (input: unknown) => unknown,
      keepOnFail: config.keepOnFail ?? false,
    };
  }

  if (config.remove !== undefined) {
    return { kind: 'remove', field: config.remove, match: config.match };
  }

  return { kind: 'object', optimistic: config.optimistic, settle: config.settle };
}

function assertSingleOptimisticForm(config: AnyConfig): void {
  const forms = [
    config.removes ? 'removes' : undefined,
    config.insert !== undefined || config.prepend !== undefined ? 'insert' : undefined,
    config.update !== undefined ? 'update' : undefined,
    config.remove !== undefined ? 'remove' : undefined,
    config.optimistic !== undefined || config.settle !== undefined ? 'object' : undefined,
  ].filter((form): form is string => form !== undefined);

  if (forms.length > 1) {
    throw new Error(
      `[define-query] defineMutation: pick one optimistic form, got ${forms.join(' + ')}`,
    );
  }
}

function makeFactory<TParams, TInput, TResponse>(
  query: { key: (params: TParams) => readonly unknown[] },
  config: AnyConfig,
): MutationFactory<TParams, TInput, TResponse> {
  assertSingleOptimisticForm(config);
  const plan: MutationPlan<TParams, TInput, TResponse> = {
    name: config.name ?? 'mutation',
    query,
    request: config.request as (params: TParams, input?: TInput) => Promise<TResponse>,
    effect: normalizeEffect(config),
    validate: config.validate as ((input: TInput) => void) | undefined,
    remapInput: (config.remapInput ?? ['id']) as RemapInput<TInput>,
    sync: config.sync as Sync<TParams, TInput, TResponse> | undefined,
  };

  const mutationKeyFn = (params: TParams): readonly unknown[] =>
    buildMutationKey(query, plan.name, params);

  const factory = (params: TParams): UseMutationOptions<
    TResponse,
    Error,
    TInput,
    unknown
  > => ({
    mutationKey: mutationKeyFn(params),
    // TanStack passes the active QueryClient as `ctx.client`, so callers never
    // thread it themselves: `useMutation(addComment(id))`.
    mutationFn: (input: TInput, ctx) =>
      runMutation(ctx.client, plan, params, input) as Promise<TResponse>,
  });

  return Object.assign(factory, { key: mutationKeyFn }) as MutationFactory<TParams, TInput, TResponse>;
}

/* ------------------------------------------------------------------ *
 * defineMutation — overloaded so TInput / TResponse infer from `request`.
 * A 2-arg request takes `(params, input)`; a 1-arg request takes `(params)`
 * with `void` input.
 * ------------------------------------------------------------------ */

type WithRequest2<TParams, TInput, TResponse> = {
  request: (params: TParams, input: TInput) => Promise<TResponse>;
};
type WithRequest1<TParams, TResponse> = {
  request: (params: TParams) => Promise<TResponse>;
};

// plain query, 1-arg request (void input) — checked first so 2-arg requests,
// which are not assignable to a 1-arg signature, fall through to the 2-arg form.
export function defineMutation<TParams, TData, TResponse>(
  query: QueryFactory<TParams, TData>,
  config: MutationConfig<TParams, TData, void, TResponse> & WithRequest1<TParams, TResponse>,
): MutationFactory<TParams, void, TResponse>;
// plain query, 2-arg request
export function defineMutation<TParams, TData, TInput, TResponse>(
  query: QueryFactory<TParams, TData>,
  config: MutationConfig<TParams, TData, TInput, TResponse> & WithRequest2<TParams, TInput, TResponse>,
): MutationFactory<TParams, TInput, TResponse>;
// infinite query, 1-arg request (void input)
export function defineMutation<TParams, TPage, TPageParam, TResponse>(
  query: InfiniteQueryFactory<TParams, TPage, TPageParam>,
  config: MutationConfig<TParams, InfiniteData<TPage>, void, TResponse>
    & WithRequest1<TParams, TResponse>,
): MutationFactory<TParams, void, TResponse>;
// infinite query, 2-arg request
export function defineMutation<TParams, TPage, TPageParam, TInput, TResponse>(
  query: InfiniteQueryFactory<TParams, TPage, TPageParam>,
  config: MutationConfig<TParams, InfiniteData<TPage>, TInput, TResponse>
    & WithRequest2<TParams, TInput, TResponse>,
): MutationFactory<TParams, TInput, TResponse>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function defineMutation(query: any, config: any): any {
  return makeFactory(query as { key: (params: unknown) => readonly unknown[] }, config as AnyConfig);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
