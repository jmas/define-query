import type { UseMutationOptions } from '@tanstack/react-query';
import type { MutationQueryRef } from './define-query';
import { warnDuplicateMutationName } from './dev-warnings';
import { DefineQueryMutationError, toDefineQueryMutationError } from './errors';
import { buildMutationKey, buildNameMutationKey, getQueryKey } from './query-key';
import { runMutation } from './run-mutation';
import type { OnBuilder, SyncEvent, SyncOp } from './sync';
import type { ListItem, SyncListFieldOf } from './sync-list-types';

/* ------------------------------------------------------------------ *
 * Type inference helpers
 * ------------------------------------------------------------------ */

type QueryParams<Q extends MutationQueryRef> =
  Q extends { key: (params: infer P) => readonly unknown[] } ? P : never;

type QueryData<Q extends MutationQueryRef> =
  Q extends { readonly __data?: infer D } ? D : never;

/** First `request` argument when no `query` is bound. */
export type ParamsFromRequest<TRequest> =
  TRequest extends (params: infer P, ...rest: infer Rest) => Promise<unknown>
    ? Rest extends MutationRequestRest
      ? P
      : never
    : TRequest extends () => Promise<unknown>
      ? void
      : never;

type MutationListFieldOf<TData> = SyncListFieldOf<TData>;

/** Supported `request` rest arity after `params`: none or exactly one `input`. */
type MutationRequestRest = [] | [unknown];

/** `TInput` from `request` rest tuple — `[]` → `void`, `[I]` → `I`. */
export type InferMutationInputFromRest<TRest extends MutationRequestRest> =
  TRest extends [] ? void : TRest extends [infer I] ? I : never;

/** @deprecated Use `InferMutationInputFromRest` — kept for advanced typing utilities. */
export type InferMutationInput<TRequest, TParams> = InferMutationInputFromRest<
  TRequest extends (params: TParams, ...rest: infer Rest) => Promise<unknown>
    ? Rest extends MutationRequestRest
      ? Rest
      : never
    : never
>;

export type InferMutationResponse<TRequest> =
  TRequest extends (...args: never[]) => infer R ? Awaited<R> : never;

export type { ListItem } from './sync-list-types';

/* ------------------------------------------------------------------ *
 * Draft context — unified across all mutation forms
 * ------------------------------------------------------------------ */

type DefaultListItem<TData> = [ListItem<TData>] extends [never] ? unknown : ListItem<TData>;

export type DraftCtx<TData, TInput, TItem = DefaultListItem<TData>> = {
  /** Current cached data for the mutation's query. */
  data: TData;
  input: TInput;
  /** Insert/prepend — generated before `draft` runs. */
  tempId?: string;
  /** Update — the matched list row, when found. */
  item?: TItem;
};

export type SettleCtx<
  TData,
  TInput,
  TResponse,
  TItem = DefaultListItem<TData>,
> = DraftCtx<TData, TInput, TItem> & {
  response: TResponse;
};

/* ------------------------------------------------------------------ *
 * Public config
 * ------------------------------------------------------------------ */

type Sync<TParams, TData, TInput, TResponse> = (
  on: OnBuilder<SyncEvent<TParams, TInput, TResponse, TData>>,
) => readonly SyncOp<SyncEvent<TParams, TInput, TResponse, TData>>[];

/** Remap temp ids to server ids in mutation input before `request`. Default: `['id']`. */
export type RemapInput<TInput> =
  | readonly string[]
  | ((input: TInput, remap: (id: string) => string) => TInput);

type Common<TParams, TData, TInput, TResponse> = {
  /** Query whose cache this mutation updates — required for draft forms. */
  query: MutationQueryRef<TParams, TData>;
  /** Stable mutation name for `mutationKey` — must be unique per query. */
  name: string;
  /** Client-side checks — throw `fail.validation(...)`. Runs before the draft update. */
  validate?: (input: TInput) => void;
  /** Which input fields to remap from temp to server id. Default: `['id']`. */
  remapInput?: RemapInput<TInput>;
  sync?: Sync<TParams, TData, TInput, TResponse>;
  /** @internal forces TData into inference */
  readonly __data?: TData;
};

type RemoveQueryMutation<TParams, TData, TInput, TResponse> = Common<
  TParams,
  TData,
  TInput,
  TResponse
> & {
  removeQuery: true;
  insert?: never;
  prepend?: never;
  update?: never;
  removeField?: never;
  draft?: never;
  settle?: never;
  match?: never;
};

type InsertMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removeQuery?: never;
      update?: never;
      removeField?: never;
      draft: (ctx: DraftCtx<TData, TInput>) => ListItem<TData>;
      settle?: (response: TResponse) => ListItem<TData>;
    } & (
      | { insert: MutationListFieldOf<TData>; prepend?: never }
      | { prepend: MutationListFieldOf<TData>; insert?: never }
    );

type UpdateMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removeQuery?: never;
      insert?: never;
      prepend?: never;
      removeField?: never;
      update: MutationListFieldOf<TData>;
      match?: (item: ListItem<TData>, input: TInput) => boolean;
      draft: (ctx: DraftCtx<TData, TInput>) => Partial<ListItem<TData>>;
      settle?: (ctx: SettleCtx<TData, TInput, TResponse>) => Partial<ListItem<TData>>;
    };

type RemoveFieldMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removeQuery?: never;
      insert?: never;
      prepend?: never;
      update?: never;
      draft?: never;
      settle?: never;
      removeField: MutationListFieldOf<TData>;
      match?: (item: ListItem<TData>, input: TInput) => boolean;
    };

type ObjectMutation<TParams, TData, TInput, TResponse> = Common<
  TParams,
  TData,
  TInput,
  TResponse
> & {
  removeQuery?: never;
  insert?: never;
  prepend?: never;
  update?: never;
  removeField?: never;
  match?: never;
  draft?: (ctx: DraftCtx<TData, TInput>) => TData;
  settle?: (ctx: SettleCtx<TData, TInput, TResponse>) => TData;
};

export type MutationConfig<TParams, TData, TInput, TResponse> =
  | RemoveQueryMutation<TParams, TData, TInput, TResponse>
  | InsertMutation<TParams, TData, TInput, TResponse>
  | UpdateMutation<TParams, TData, TInput, TResponse>
  | RemoveFieldMutation<TParams, TData, TInput, TResponse>
  | ObjectMutation<TParams, TData, TInput, TResponse>;

/** Mutation without a bound query — `request` + optional `sync` only. */
export type ThinMutationConfig<TParams, TInput, TResponse> = {
  query?: never;
  name: string;
  validate?: (input: TInput) => void;
  remapInput?: RemapInput<TInput>;
  sync?: Sync<TParams, unknown, TInput, TResponse>;
  removeQuery?: never;
  insert?: never;
  prepend?: never;
  update?: never;
  removeField?: never;
  draft?: never;
  settle?: never;
  match?: never;
};

/* ------------------------------------------------------------------ *
 * Normalized runtime plan
 * ------------------------------------------------------------------ */

export type Effect =
  | {
      kind: 'object';
      draft?: (ctx: DraftCtx<unknown, unknown>) => unknown;
      settle?: (ctx: SettleCtx<unknown, unknown, unknown>) => unknown;
    }
  | {
      kind: 'insert';
      field: string;
      position: 'start' | 'end';
      draft: (ctx: DraftCtx<unknown, unknown>) => unknown;
      settle?: (response: unknown) => unknown;
    }
  | {
      kind: 'update';
      field: string;
      match?: (item: unknown, input: unknown) => boolean;
      draft: (ctx: DraftCtx<unknown, unknown>) => unknown;
      settle?: (ctx: SettleCtx<unknown, unknown, unknown>) => unknown;
    }
  | { kind: 'removeField'; field: string; match?: (item: unknown, input: unknown) => boolean }
  | { kind: 'removeQuery' };

/** Structural config read by runtime normalization — not part of the public API. */
type RuntimeMutationConfig = {
  removeQuery?: true;
  insert?: string;
  prepend?: string;
  update?: string;
  removeField?: string;
  draft?: unknown;
  settle?: unknown;
  match?: unknown;
};

export type MutationPlan<TParams, TData, TInput, TResponse> = {
  name: string;
  query?: { key: (params: TParams) => readonly unknown[] };
  request: (params: TParams, input?: TInput) => Promise<TResponse>;
  effect: Effect;
  validate?: (input: TInput) => void;
  remapInput: RemapInput<TInput>;
  sync?: Sync<TParams, TData, TInput, TResponse>;
};

type MutationFactoryWithParams<TParams, TInput, TResponse> = {
  (params: TParams): UseMutationOptions<TResponse, DefineQueryMutationError, TInput, unknown>;
  /** Stable TanStack mutation key — `[...queryKey, name]` or `[name, params]`. */
  key: (params: TParams) => readonly unknown[];
  readonly __input?: TInput;
};

type MutationFactoryNoParams<TInput, TResponse> = {
  (): UseMutationOptions<TResponse, DefineQueryMutationError, TInput, unknown>;
  /** Stable TanStack mutation key — `[name]` when `request` has no params. */
  key: () => readonly unknown[];
  readonly __input?: TInput;
};

/** Call with params to get TanStack `mutationOptions`: `useMutation(addComment(id))`. */
export type MutationFactory<TParams, TInput, TResponse> = [TParams] extends [void]
  ? MutationFactoryNoParams<TInput, TResponse>
  : MutationFactoryWithParams<TParams, TInput, TResponse>;

type MutationConfigWithRequest<
  TParams,
  TData,
  TInput,
  TResponse,
  TRest extends MutationRequestRest,
> = (MutationConfig<TParams, TData, TInput, TResponse> | ThinMutationConfig<TParams, TInput, TResponse>) & {
  request: (params: TParams, ...args: TRest) => Promise<TResponse>;
};

const mutationNamesByQuery = new WeakMap<object, Set<string>>();
const globalMutationNames = new Set<string>();

function registerMutationName(queryRef: object | undefined, name: string): void {
  if (!import.meta.env.DEV) return;
  if (queryRef) {
    let names = mutationNamesByQuery.get(queryRef);
    if (!names) {
      names = new Set();
      mutationNamesByQuery.set(queryRef, names);
    }
    if (names.has(name)) warnDuplicateMutationName(name, 'query');
    names.add(name);
    return;
  }
  if (globalMutationNames.has(name)) warnDuplicateMutationName(name, 'global');
  globalMutationNames.add(name);
}

function toRuntimeConfig<
  TParams,
  TData,
  TInput,
  TResponse,
  TRest extends MutationRequestRest,
>(
  config: MutationConfigWithRequest<TParams, TData, TInput, TResponse, TRest>,
): RuntimeMutationConfig {
  return {
    removeQuery: 'removeQuery' in config && config.removeQuery ? true : undefined,
    insert: 'insert' in config ? config.insert : undefined,
    prepend: 'prepend' in config ? config.prepend : undefined,
    update: 'update' in config ? config.update : undefined,
    removeField: 'removeField' in config ? config.removeField : undefined,
    draft: 'draft' in config ? config.draft : undefined,
    settle: 'settle' in config ? config.settle : undefined,
    match: 'match' in config ? config.match : undefined,
  };
}

function normalizeEffect(config: RuntimeMutationConfig): Effect {
  if (config.removeQuery) return { kind: 'removeQuery' };

  if (config.insert !== undefined || config.prepend !== undefined) {
    const field = config.insert ?? config.prepend ?? '';
    return {
      kind: 'insert',
      field,
      position: config.prepend !== undefined ? 'start' : 'end',
      draft: (config.draft ?? (() => undefined)) as (ctx: DraftCtx<unknown, unknown>) => unknown,
      settle: config.settle as ((response: unknown) => unknown) | undefined,
    };
  }

  if (config.update !== undefined) {
    return {
      kind: 'update',
      field: config.update,
      match: config.match as ((item: unknown, input: unknown) => boolean) | undefined,
      draft: (config.draft ?? (() => undefined)) as (ctx: DraftCtx<unknown, unknown>) => unknown,
      settle: config.settle as ((ctx: SettleCtx<unknown, unknown, unknown>) => unknown) | undefined,
    };
  }

  if (config.removeField !== undefined) {
    return {
      kind: 'removeField',
      field: config.removeField,
      match: config.match as ((item: unknown, input: unknown) => boolean) | undefined,
    };
  }

  return {
    kind: 'object',
    draft: config.draft as ((ctx: DraftCtx<unknown, unknown>) => unknown) | undefined,
    settle: config.settle as ((ctx: SettleCtx<unknown, unknown, unknown>) => unknown) | undefined,
  };
}

function runtimeRequiresQuery(config: RuntimeMutationConfig): boolean {
  return Boolean(
    config.removeQuery
    || config.insert !== undefined
    || config.prepend !== undefined
    || config.update !== undefined
    || config.removeField !== undefined
    || config.draft !== undefined
    || config.settle !== undefined,
  );
}

function assertSingleDraftForm(config: RuntimeMutationConfig): void {
  const hasListForm =
    config.removeQuery
    || config.insert !== undefined
    || config.prepend !== undefined
    || config.update !== undefined
    || config.removeField !== undefined;

  const forms = [
    config.removeQuery ? 'removeQuery' : undefined,
    config.insert !== undefined || config.prepend !== undefined ? 'insert' : undefined,
    config.update !== undefined ? 'update' : undefined,
    config.removeField !== undefined ? 'removeField' : undefined,
    !hasListForm && (config.draft !== undefined || config.settle !== undefined) ? 'object' : undefined,
  ].filter((form): form is string => form !== undefined);

  if (forms.length > 1) {
    throw new Error(
      `[define-query] defineMutation: pick one draft form, got ${forms.join(' + ')}`,
    );
  }
}

function assertMutationName(name: string | undefined): asserts name is string {
  if (!name) {
    throw new Error('[define-query] defineMutation: `name` is required');
  }
}

function makeFactory<
  TParams,
  TData,
  TInput,
  TResponse,
  TRest extends MutationRequestRest,
>(
  queryRef: MutationQueryRef<TParams, TData> | undefined,
  config: MutationConfigWithRequest<TParams, TData, TInput, TResponse, TRest>,
): MutationFactory<TParams, TInput, TResponse> {
  assertMutationName(config.name);
  registerMutationName(queryRef, config.name);

  const runtime = toRuntimeConfig(config);
  assertSingleDraftForm(runtime);

  if (!queryRef && runtimeRequiresQuery(runtime)) {
    throw new Error('[define-query] defineMutation: `query` is required when using a draft form');
  }

  const plan: MutationPlan<TParams, TData, TInput, TResponse> = {
    name: config.name,
    query: queryRef
      ? { key: (params: TParams) => getQueryKey(queryRef, params) }
      : undefined,
    request: (params, input) => {
      if (input !== undefined) {
        return (config.request as (p: TParams, i: TInput) => Promise<TResponse>)(params, input);
      }
      if (config.request.length === 0) {
        return (config.request as () => Promise<TResponse>)();
      }
      return (config.request as (p: TParams) => Promise<TResponse>)(params);
    },
    effect: normalizeEffect(runtime),
    validate: config.validate,
    remapInput: config.remapInput ?? (['id'] as RemapInput<TInput>),
    sync: config.sync as Sync<TParams, TData, TInput, TResponse> | undefined,
  };

  const mutationKeyFn = (params: TParams): readonly unknown[] =>
    queryRef
      ? buildMutationKey(queryRef, plan.name, params)
      : buildNameMutationKey(plan.name, params);

  const buildOptions = (params: TParams): UseMutationOptions<
    TResponse,
    DefineQueryMutationError,
    TInput,
    unknown
  > => ({
    mutationKey: mutationKeyFn(params),
    mutationFn: async (input: TInput, ctx) => {
      try {
        const result = await runMutation(ctx.client, plan, params, input);
        return result as TResponse;
      } catch (caught) {
        throw toDefineQueryMutationError(caught);
      }
    },
  });

  const factory = (params?: TParams) => buildOptions(params as TParams);
  const key = (params?: TParams) => mutationKeyFn(params as TParams);

  return Object.assign(factory, { key }) as MutationFactory<TParams, TInput, TResponse>;
}

/* ------------------------------------------------------------------ *
 * defineMutation — `TInput` / `TResponse` infer from `request` arity + return.
 * ------------------------------------------------------------------ */

export function defineMutation<
  const TQuery extends MutationQueryRef,
  TRest extends MutationRequestRest,
  TResponse,
>(
  config: MutationConfig<
    QueryParams<TQuery>,
    QueryData<TQuery>,
    InferMutationInputFromRest<TRest>,
    TResponse
  > & {
    query: TQuery;
    request: (params: QueryParams<TQuery>, ...args: TRest) => Promise<TResponse>;
  },
): MutationFactory<
  QueryParams<TQuery>,
  InferMutationInputFromRest<TRest>,
  TResponse
>;

export function defineMutation<TResponse>(
  config: ThinMutationConfig<void, void, TResponse> & {
    request: () => Promise<TResponse>;
  },
): MutationFactory<void, void, TResponse>;

export function defineMutation<
  TParams,
  TRest extends MutationRequestRest,
  TResponse,
>(
  config: ThinMutationConfig<TParams, InferMutationInputFromRest<TRest>, TResponse> & {
    request: (params: TParams, ...args: TRest) => Promise<TResponse>;
  },
): MutationFactory<TParams, InferMutationInputFromRest<TRest>, TResponse>;

// Implementation signature — overloads above provide the public types.
export function defineMutation(config: {
  query?: MutationQueryRef;
  name: string;
  request: ((...args: never[]) => Promise<unknown>) | (() => Promise<unknown>);
  [key: string]: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const query = config.query as MutationQueryRef | undefined;
  return makeFactory(query, config as never);
}
