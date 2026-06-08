import type { UseMutationOptions } from '@tanstack/react-query';
import type { MutationQueryRef } from './define-query';
import { warnDuplicateMutationName } from './dev-warnings';
import { DefineQueryMutationError, toDefineQueryMutationError } from './errors';
import { buildMutationKey } from './query-key';
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
  draft?: never;
  settle?: never;
  match?: never;
};

type InsertMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      update?: never;
      remove?: never;
      draft: (ctx: DraftCtx<TData, TInput>) => ListItem<TData>;
      settle?: (response: TResponse) => ListItem<TData>;
    } & (
      | { insert: MutationListFieldOf<TData>; prepend?: never }
      | { prepend: MutationListFieldOf<TData>; insert?: never }
    );

type UpdateMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      insert?: never;
      prepend?: never;
      remove?: never;
      update: MutationListFieldOf<TData>;
      match?: (item: ListItem<TData>, input: TInput) => boolean;
      draft: (ctx: DraftCtx<TData, TInput>) => Partial<ListItem<TData>>;
      settle?: (ctx: SettleCtx<TData, TInput, TResponse>) => Partial<ListItem<TData>>;
    };

type RemoveMutation<TParams, TData, TInput, TResponse> = MutationListFieldOf<TData> extends never
  ? never
  : Common<TParams, TData, TInput, TResponse> & {
      removes?: never;
      insert?: never;
      prepend?: never;
      update?: never;
      draft?: never;
      settle?: never;
      remove: MutationListFieldOf<TData>;
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
  match?: never;
  draft?: (ctx: DraftCtx<TData, TInput>) => TData;
  settle?: (ctx: SettleCtx<TData, TInput, TResponse>) => TData;
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
  | { kind: 'remove'; field: string; match?: (item: unknown, input: unknown) => boolean }
  | { kind: 'removeQuery' };

/** Structural config read by runtime normalization — not part of the public API. */
type RuntimeMutationConfig = {
  removes?: true;
  insert?: string;
  prepend?: string;
  update?: string;
  remove?: string;
  draft?: unknown;
  settle?: unknown;
  match?: unknown;
};

export type MutationPlan<TParams, TData, TInput, TResponse> = {
  name: string;
  query: { key: (params: TParams) => readonly unknown[] };
  request: (params: TParams, input?: TInput) => Promise<TResponse>;
  effect: Effect;
  validate?: (input: TInput) => void;
  remapInput: RemapInput<TInput>;
  sync?: Sync<TParams, TData, TInput, TResponse>;
};

/** Call with params to get TanStack `mutationOptions`: `useMutation(addComment(id))`. */
export type MutationFactory<TParams, TInput, TResponse> = {
  (params: TParams): UseMutationOptions<TResponse, DefineQueryMutationError, TInput, unknown>;
  /** Stable TanStack mutation key — `[...queryKey, name]`. */
  key: (params: TParams) => readonly unknown[];
  readonly __input?: TInput;
};

type MutationConfigWithRequest<
  TParams,
  TData,
  TInput,
  TResponse,
  TRest extends MutationRequestRest,
> = MutationConfig<TParams, TData, TInput, TResponse> & {
  request: (params: TParams, ...args: TRest) => Promise<TResponse>;
};

const mutationNamesByQuery = new WeakMap<object, Set<string>>();

function registerMutationName(query: object, name: string): void {
  if (!import.meta.env.DEV) return;
  let names = mutationNamesByQuery.get(query);
  if (!names) {
    names = new Set();
    mutationNamesByQuery.set(query, names);
  }
  if (names.has(name)) warnDuplicateMutationName(name);
  names.add(name);
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
    removes: 'removes' in config && config.removes ? true : undefined,
    insert: 'insert' in config ? config.insert : undefined,
    prepend: 'prepend' in config ? config.prepend : undefined,
    update: 'update' in config ? config.update : undefined,
    remove: 'remove' in config ? config.remove : undefined,
    draft: 'draft' in config ? config.draft : undefined,
    settle: 'settle' in config ? config.settle : undefined,
    match: 'match' in config ? config.match : undefined,
  };
}

function normalizeEffect(config: RuntimeMutationConfig): Effect {
  if (config.removes) return { kind: 'removeQuery' };

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

  if (config.remove !== undefined) {
    return {
      kind: 'remove',
      field: config.remove,
      match: config.match as ((item: unknown, input: unknown) => boolean) | undefined,
    };
  }

  return {
    kind: 'object',
    draft: config.draft as ((ctx: DraftCtx<unknown, unknown>) => unknown) | undefined,
    settle: config.settle as ((ctx: SettleCtx<unknown, unknown, unknown>) => unknown) | undefined,
  };
}

function assertSingleDraftForm(config: RuntimeMutationConfig): void {
  const hasListForm =
    config.removes
    || config.insert !== undefined
    || config.prepend !== undefined
    || config.update !== undefined
    || config.remove !== undefined;

  const forms = [
    config.removes ? 'removes' : undefined,
    config.insert !== undefined || config.prepend !== undefined ? 'insert' : undefined,
    config.update !== undefined ? 'update' : undefined,
    config.remove !== undefined ? 'remove' : undefined,
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
  queryRef: object,
  query: { key: (params: TParams) => readonly unknown[] },
  config: MutationConfigWithRequest<TParams, TData, TInput, TResponse, TRest>,
): MutationFactory<TParams, TInput, TResponse> {
  assertMutationName(config.name);
  registerMutationName(queryRef, config.name);

  const runtime = toRuntimeConfig(config);
  assertSingleDraftForm(runtime);
  const plan: MutationPlan<TParams, TData, TInput, TResponse> = {
    name: config.name,
    query,
    request: (params, input) =>
      input === undefined
        ? (config.request as (p: TParams) => Promise<TResponse>)(params)
        : (config.request as (p: TParams, i: TInput) => Promise<TResponse>)(params, input),
    effect: normalizeEffect(runtime),
    validate: config.validate,
    remapInput: config.remapInput ?? (['id'] as RemapInput<TInput>),
    sync: config.sync,
  };

  const mutationKeyFn = (params: TParams): readonly unknown[] =>
    buildMutationKey(query, plan.name, params);

  const factory = (params: TParams): UseMutationOptions<
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

  return Object.assign(factory, { key: mutationKeyFn });
}

/* ------------------------------------------------------------------ *
 * defineMutation — `TInput` / `TResponse` infer from `request` arity + return.
 * ------------------------------------------------------------------ */

export function defineMutation<
  const TQuery extends MutationQueryRef,
  TRest extends MutationRequestRest,
  TResponse,
>(
  query: TQuery,
  config: MutationConfig<
    QueryParams<TQuery>,
    QueryData<TQuery>,
    InferMutationInputFromRest<TRest>,
    TResponse
  > & {
    request: (params: QueryParams<TQuery>, ...args: TRest) => Promise<TResponse>;
  },
): MutationFactory<
  QueryParams<TQuery>,
  InferMutationInputFromRest<TRest>,
  TResponse
> {
  type TParams = QueryParams<TQuery>;
  const key = query.key as (params: TParams) => readonly unknown[];
  return makeFactory(query, { key: (params: TParams) => key(params) }, config);
}
