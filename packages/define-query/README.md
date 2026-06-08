# define-query

A thin, zero-dependency helper that lets you **define queries and mutations once** and use them with the **native** [TanStack Query](https://tanstack.com/query) hooks.

It does not wrap or replace `useQuery` / `useMutation`. Instead:

- `defineQuery` / `defineInfiniteQuery` → factories that return native `queryOptions` / `infiniteQueryOptions`.
- `defineMutation` → a factory that returns native `mutationOptions`, with draft cache writes, temp-id reconciliation, rollback, and cross-query sync wired in.

> [Українська](README.uk.md)

---

## Mental model

```
defineQuery(config)            →  (params) => queryOptions(...)
defineInfiniteQuery(config)    →  (params) => infiniteQueryOptions(...)
defineMutation(query, config)  →  (params) => mutationOptions(...)
```

You keep TanStack's full surface (`isPending`, `error`, `fetchStatus`, `mutate`, `mutateAsync`, …). This library only builds the option objects you pass to the native hooks.

| Layer | Responsibility |
|-------|----------------|
| **Query** | `key`, `fetch`, optional `options` (forwarded to TanStack) |
| **Mutation** | `request`, optional `validate`, one draft form, optional `sync` |
| **Draft form** | `object` (merge), `insert` / `prepend`, `update`, `remove`, or `removes` (drop the query) |
| **Sync** | Mutation sync after successful `request`; query fetch sync after successful network fetch |
| **UI state** | Native `useMutation` (`isPending`, `error`) and `useQuery` (draft data in cache) |

`defineMutation` infers `TInput` from the 2nd `request` argument and `TResponse` from its return type.

The first argument to `defineMutation` is the **query whose cache the mutation updates** — not necessarily the API endpoint. Bind `addComment` to `postCommentsQuery`, `renamePost` to `postQuery`, etc.

---

## Setup

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupDefineQuery } from 'define-query';

const queryClient = new QueryClient();
setupDefineQuery(queryClient); // required for query fetch sync

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

`setupDefineQuery` wires the `QueryCache` subscriber used by `sync` on `defineQuery` / `defineInfiniteQuery`. Mutations work without it; fetch sync does not.

**Reserved meta:** do not set `options.meta['define-query']` on query factories — that key is owned by the library.

---

## Quick start

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { defineMutation, defineQuery } from 'define-query';

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: (id) => api.getPost(id),
  options: { staleTime: 30_000 },
});

const renamePost = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => api.patchPost(id, { title }),
  draft: ({ data, input }) => ({ ...data, title: input }),
  sync: (on) => [
    on(timelineQuery).mergeItem('items', { set: (_item, { input }) => ({ title: input }) }),
  ],
});

function Post({ id }: { id: string }) {
  const { data } = useQuery(postQuery(id));
  const rename = useMutation(renamePost(id));

  if (!data) return null;
  return (
    <input
      defaultValue={data.title}
      onBlur={(e) => rename.mutate(e.target.value)}
    />
  );
}
```

---

## Keys

Use **`factory.key(params)`** — the normalized stable key for a query or mutation:

```tsx
postQuery.key(id);                    // same as postQuery(id).queryKey
addComment.key(postId);               // same as addComment(postId).mutationKey

queryClient.invalidateQueries({ queryKey: postQuery.key(id) });
useIsMutating({ mutationKey: addComment.key(postId) });
```

---

## Queries

### `defineQuery`

```tsx
const postCommentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: (postId) => api.getComments(postId),
  options: { staleTime: 30_000 },
});
```

Query params must be a **flat** one-level object (or a scalar). Nested objects and arrays collapse to `{}` with a **console warning** — use shallow fields only (e.g. `{ q: '' }`, not `{ filter: { tag: 'x' } }`).

`postCommentsQuery(postId)` returns a `queryOptions` object. Use it with any native hook:

```tsx
const { data } = useQuery(postCommentsQuery(postId));
const { data } = useSuspenseQuery(postCommentsQuery(postId));
queryClient.prefetchQuery(postCommentsQuery(postId));
queryClient.invalidateQueries({ queryKey: postCommentsQuery.key(postId) });
```

### `defineInfiniteQuery`

```tsx
const timelineQuery = defineInfiniteQuery({
  key: (params: { q: string }) => ['timeline', params] as const,
  fetch: (params, page: number) => api.getTimeline(params.q, page),
  initialPage: 1,
  nextPage: (lastPage) =>
    lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
});

const timeline = useInfiniteQuery(timelineQuery({ q: '' }));
const items = flattenInfiniteField(timeline.data, 'items');
```

To add per-call options (e.g. `enabled`, `placeholderData`), spread the factory:

```tsx
useInfiniteQuery({ ...timelineQuery(params), enabled, placeholderData: keepPreviousData });
```

### Query fetch sync — seed sibling caches after fetch

`sync: (on) => [...]` on `defineQuery` / `defineInfiniteQuery` runs **after a successful network fetch** (not after manual `setQueryData`). Requires `setupDefineQuery`.

| Op | Effect |
|----|--------|
| `on(query).set(updater, { params? })` | Upsert one sibling cache entry |
| `on(query).setEach(field, { params, set })` | For each item in `data[field]` — upsert a sibling entry |

**Mutation sync** (on `defineMutation`) is separate — it runs after a successful `request` and supports `bump`, `mergeItem`, `removeItem`, `set`, `setEach`, `invalidate`. Same `on(query)` syntax, different triggers and ops.

Refetch / prefetch / invalidate re-run fetch sync. Failed fetches and `initialData` without a network round-trip do not.

---

## Mutations

`defineMutation(query, config)` returns `(params) => mutationOptions`. Pick **one** draft form. Each mutation requires a unique **`name`**: `[...queryKey, name]`.

### `DraftCtx` — unified draft API

All `draft` callbacks receive a single context object:

```ts
type DraftCtx<TData, TInput> = {
  data: TData;    // current cached data for the mutation's query
  input: TInput;
  tempId?: string; // insert/prepend only — generated before draft runs
  item?: TItem;    // update only — matched list row, when found
};
```

| Form | `draft` | `settle` |
|------|---------|----------|
| object | `(ctx) => TData` | `(ctx & { response }) => TData` — optional; default shallow merge |
| insert / prepend | `(ctx) => TItem` | `(response) => TItem` |
| update | `(ctx) => Partial<TItem>` | `(ctx & { response }) => Partial<TItem>` — optional; default shallow merge response |
| remove / removes | — | — |

### Object form — merge into a single cached object

```tsx
const renamePost = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => api.patchPost(id, { title }),
  draft: ({ data, input }) => ({ ...data, title: input }),
  settle: ({ data, response }) => ({ ...data, ...response }),
});
```

### Insert / prepend — add a list item

```tsx
const addComment = defineMutation(postCommentsQuery, {
  name: 'add',
  request: (postId: string, text: string) => api.addComment(postId, text),
  insert: 'items',
  draft: ({ input, tempId }) => ({ id: tempId!, text: input }),
  settle: (response) => response.comment,
  sync: (on) => [on(postQuery).bump('commentCount', 1)],
});
```

Temp ids are reconciled on success; `remapInput` (default `['id']`) remaps temp → server ids in mutation input before `request`.

> **Infinite queries:** `insert` writes to the **last** page, `prepend` to the **first**. If `pages` is empty, the first page is **bootstrapped** with the new item. For plain queries the item goes to the start/end of the single list.

> **No cached data:** if the target query has no cache entry yet, the draft is skipped (with a console warning) and only `request` runs.

### Update — patch a matching list item

```tsx
const editComment = defineMutation(postCommentsQuery, {
  name: 'edit',
  remapInput: ['commentId'],
  request: (postId: string, { commentId, text }) => api.updateComment(postId, commentId, text),
  update: 'items',
  match: (item, input) => item.id === input.commentId,
  draft: ({ input }) => ({ text: input.text }),
});
```

### Remove — drop a matching list item

```tsx
const removeComment = defineMutation(postCommentsQuery, {
  name: 'remove',
  request: (postId: string, commentId: string) => api.deleteComment(postId, commentId),
  remove: 'items',
  match: (item, commentId) => item.id === commentId,
  sync: (on) => [on(postQuery).bump('commentCount', -1)],
});
```

Removing an un-persisted temp row skips the network request automatically.

### `removes` — drop the whole query

```tsx
const removePost = defineMutation(postQuery, {
  name: 'removePost',
  request: (id: string) => api.deletePost(id),
  removes: true,
  sync: (on) => [on(timelineQuery).removeItem('items')],
});
```

### Using a mutation

```tsx
const add = useMutation(addComment(postId));

add.mutate('Hello');
await add.mutateAsync('Hello');
add.isPending;
add.error;   // DefineQueryMutationError when failed
add.reset();
```

```tsx
import { useIsMutating } from '@tanstack/react-query';

const isAdding = useIsMutating({ mutationKey: addComment.key(postId) });
```

`validate(input)` runs **before** the draft; throw `fail.validation(...)` to surface a form error without touching the cache.

### Concurrency

Overlapping mutations on the same list are safe: rollback is **id-targeted** (`rowId` / `tempId`). When two edits of the same row are in flight, the **last successful response wins** on settle.

---

## Errors

Throw classified failures from `request` (or `validate`):

```tsx
import { fail } from 'define-query';

if (!text.trim()) throw fail.validation({ text: ['Cannot be empty'] });
if (offline) throw fail.network('Offline');
if (status >= 500) throw fail.server('Something went wrong');
```

Failures are normalized to **`DefineQueryMutationError`** on `mutation.error`:

```tsx
add.error?.field('text');  // per-field validation message, or null
add.error?.banner();       // network / server / generic message, or null for validation
```

Use `isMutationError(error)` only when handling `unknown` (e.g. a shared error helper).

| `fail.*` | Use for |
|----------|---------|
| `fail.validation(fields)` | Client or 422-style field errors |
| `fail.network(message?)` | Offline / transport failures |
| `fail.server(message?)` | Explicit 5xx / server errors |

---

## Mutation sync

`sync: (on) => [...]` runs **after a successful `request`**.

| Op | Effect |
|----|--------|
| `on(query).bump(field, by, { params? })` | `field += by` (clamped at 0) |
| `on(query).mergeItem(field, { id?, set }, { params? })` | Shallow-merge into a matching list item |
| `on(query).removeItem(field, { id? }, { params? })` | Remove a matching list item |
| `on(query).set(updater, { params? })` | Arbitrary `setQueryData` on the sibling |
| `on(query).invalidate({ params? })` | Invalidate / refetch the sibling |

---

## Utilities

| Export | Purpose |
|--------|---------|
| `setupDefineQuery(client)` | Wire query fetch sync (call once per `QueryClient`) |
| `factory.key(params)` | Stable normalized query / mutation key |
| `flattenInfiniteField(data, field)` | Flatten a list field across infinite pages (typed from `data`) |
| `isTempId(id)` / `createTempId()` | Temp draft id helpers |
| `isMutationError(error)` | Type guard for `DefineQueryMutationError` |
| `fail` | Throw validation / network / server errors |

---

## Module layout

```
define-query.ts     defineQuery, defineInfiniteQuery
define-mutation.ts  defineMutation, DraftCtx, type inference
run-mutation.ts     draft → request → settle / rollback + sync
query-sync.ts       query fetch sync ops + runQuerySync
query-fetch-sync.ts QueryCache subscriber + reserved meta
client-state.ts     setupDefineQuery, per-QueryClient settledIds
errors.ts           fail, DefineQueryMutationError, isMutationError
query-key.ts        key normalization (internal)
cache-ops.ts        list/object ops (plain + InfiniteData)
```

Live examples: [`../define-query-demo/src/demo/queries/`](../define-query-demo/src/demo/queries/) and [`../define-query-demo/src/demo/panels/`](../define-query-demo/src/demo/panels/).
