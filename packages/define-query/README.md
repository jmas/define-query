# define-query

A thin, zero-dependency helper that lets you **define queries and mutations once** and use them with the **native** [TanStack Query](https://tanstack.com/query) hooks.

It does not wrap or replace `useQuery` / `useMutation`. Instead:

- `defineQuery` / `defineInfiniteQuery` → factories that return native `queryOptions` / `infiniteQueryOptions`.
- `defineMutation` → a factory that returns native `mutationOptions`, with optimistic updates, temp-id reconciliation, rollback, and cross-query sync wired in.
- `useRowState` → the one small hook this library adds, for per-row `pending` / `failed` / `retry` state on list items (TanStack has no equivalent).

> [Українська](README.uk.md)

---

## Mental model

```
defineQuery(config)            →  (params) => queryOptions(...)
defineInfiniteQuery(config)    →  (params) => infiniteQueryOptions(...)
defineMutation(query, config)  →  (params) => mutationOptions(...)
useRowState(query, params)     →  (item) => { status, error?, retry? }
```

You keep TanStack's full surface (`isPending`, `error`, `fetchStatus`, `mutate`, `mutateAsync`, …). This library only builds the option objects you pass to the native hooks.

| Layer | Responsibility |
|-------|----------------|
| **Query** | `key`, `fetch`, optional `options` (forwarded to TanStack) |
| **Mutation** | `request`, optional `validate`, one optimistic form, optional `sync` |
| **Optimistic form** | `object` (merge), `insert` / `prepend`, `update`, `remove`, or `removes` (drop the query) |
| **Sync** | Runs after a successful `request`; propagates to sibling queries |
| **Row state** | `useRowState` exposes per-item pending / failed / retry |

`defineMutation` infers `TInput` from the 2nd `request` argument and `TResponse` from its return type.

---

## Setup

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

---

## Quick start

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { defineMutation, defineQuery } from 'define-query';

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: (id) => api.getPost(id),
  options: { staleTime: 30_000 }, // forwarded to TanStack
});

const renamePost = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => api.patchPost(id, { title }),
  optimistic: (post, title) => ({ ...post, title }),
  sync: (on) => [
    on(timelineQuery).mergeItem<Post>('items', { set: (_item, { input }) => ({ title: input }) }),
  ],
});

function Post({ id }: { id: string }) {
  const { data } = useQuery(postQuery(id));           // native hook
  const rename = useMutation(renamePost(id));         // no queryClient needed

  if (!data) return null;
  return (
    <input
      defaultValue={data.title}
      onBlur={(e) => rename.mutate(e.target.value)}   // native mutate
    />
  );
}
```

---

## Queries

### `defineQuery`

```tsx
const postCommentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: (postId) => api.getComments(postId),
  options: { staleTime: 30_000 }, // optional, forwarded to TanStack
});
```

Query params must be a **flat** one-level object (or a scalar). Nested objects and arrays collapse to `{}` in dev with a console warning — use shallow fields only (e.g. `{ q: '' }`, not `{ filter: { tag: 'x' } }`).

`postCommentsQuery(postId)` returns a `queryOptions` object. Use it with any native hook:

```tsx
const { data } = useQuery(postCommentsQuery(postId));
const { data } = useSuspenseQuery(postCommentsQuery(postId));
queryClient.prefetchQuery(postCommentsQuery(postId));
queryClient.invalidateQueries({ queryKey: postCommentsQuery(postId).queryKey });
```

### `defineInfiniteQuery`

```tsx
const timelineQuery = defineInfiniteQuery({
  key: (params: { q: string }) => ['timeline', params] as const,
  fetch: (params, page: number) => api.getTimeline(params.q, page),
  initialPage: 1,
  nextPage: (lastPage) =>
    lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
  // prevPage?: (firstPage, allPages, params) => ...
});

const timeline = useInfiniteQuery(timelineQuery({ q: '' }));
const items = flattenInfiniteField<Post>(timeline.data, 'items');
```

To add per-call options (e.g. `enabled`, `placeholderData`), spread the factory:

```tsx
useInfiniteQuery({ ...timelineQuery(params), enabled, placeholderData: keepPreviousData });
```

---

## Mutations

`defineMutation(query, config)` returns `(params) => mutationOptions`. Pick **one** optimistic form. The active `QueryClient` is read from TanStack's mutation context, so you never thread it yourself.

### Object form — merge into a single cached object

```tsx
const renamePost = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => api.patchPost(id, { title }),
  optimistic: (post, title) => ({ ...post, title }), // applied immediately
  settle: (post, response) => ({ ...post, ...response }), // optional; defaults to a shallow merge
});
```

### Insert / prepend — add a list item

```tsx
const addComment = defineMutation(postCommentsQuery, {
  name: 'add',
  request: (postId: string, text: string) => api.addComment(postId, text),
  insert: 'items',                              // or `prepend: 'items'`
  draft: (text, tempId) => ({ id: tempId, text }), // optimistic row (temp id)
  from: (response) => response.comment,         // server row → replaces the temp row
  keepOnFail: true,                             // keep failed row in place with retry
  sync: (on) => [on(postQuery).bump('commentCount', 1)],
});
```

A temp id is generated for the optimistic row; on success it is reconciled to the server id (later edits/removes of that row use the real id automatically). Before `request`, configured `remapInput` fields (default: `id`) are remapped from temp to server id — other string fields (e.g. `text`, `title`) are never touched.

> **Infinite queries:** `insert` writes to the **last** page and `prepend` to the **first** page (`pages[0]`) — not a global sort position. If the cache has no pages yet, the insert is a no-op (let the first fetch populate it). For plain (non-infinite) queries the item goes to the start/end of the single list.

### Update — patch a matching list item

```tsx
const editComment = defineMutation(postCommentsQuery, {
  name: 'edit',
  remapInput: ['commentId'],
  request: (postId: string, { commentId, text }: { commentId: string; text: string }) =>
    api.updateComment(postId, commentId, text),
  update: 'items',
  match: (item, input) => item.id === input.commentId,
  draft: (input) => ({ text: input.text }), // partial patch
  keepOnFail: true,
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

Removing an item that is still an un-persisted temp row skips the network request automatically.

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
const add = useMutation(addComment(postId)); // native useMutation, no queryClient

add.mutate('Hello');             // fire-and-forget; errors land on add.error / the row
await add.mutateAsync('Hello');  // rejects on a rolled-back failure (validation/network)
add.isPending;                   // native
add.error;                       // native — raw thrown error (classify with the helpers below)
add.reset();                     // native
```

Add native callbacks freely — e.g. close a panel after a `removes` mutation:

```tsx
const remove = useMutation({ ...removePost(postId), onSuccess: onClose });
```

`validate(input)` runs **before** the optimistic update; throw `fail.validation(...)` to surface a form error without touching the cache.

---

## Errors

Throw classified failures from `request` (or `validate`):

```tsx
import { fail } from 'define-query';

if (!text.trim()) throw fail.validation({ text: ['Cannot be empty'] });
if (offline) throw fail.network('Offline');
```

Every failure lands on the native `mutation.error`. Read it with the helpers:

| Helper | Returns |
|--------|---------|
| `fieldError(error, 'title')` | First message for a validation field, or `null` |
| `errorText(error)` | User-visible message (validation field or network/server), or `null` |
| `generalErrorText(error)` | Like `errorText`, but `null` for row-scoped and validation failures |
| `isValidationError(error)` | `true` for a field-validation failure |
| `isRowFailure(error)` | `true` when a `keepOnFail` list row failed |
| `rowFailureId(error)` | Affected row id from a row-scoped failure, or `null` |
| `classify(error)` | `{ kind: 'validation' \| 'network' \| 'error', … }` |

**Where to show it in UI:**

1. **Per field** — `fieldError(mutation.error, key)` (validation only; runs before optimistic work).
2. **Component-level** (banner, toast, alert) — `generalErrorText(mutation.error)`.
3. **Inline on a list row** — `useRowState(item)` (`status`, `error`, `retry`).

With `keepOnFail`, the mutation **rejects** as `RowFailure` (so `mutation.error` is set and `onError` fires). The same message is mirrored in `useRowState` for inline display. Use `isRowFailure(error)` in global handlers to skip toasts when the row already shows the error.

```tsx
import {
  fieldError,
  generalErrorText,
  isRowFailure,
  useRowState,
} from 'define-query';
import { useMutation } from '@tanstack/react-query';

const addComment = defineMutation(postCommentsQuery, {
  name: 'add',
  insert: 'items',
  draft: (text, id) => ({ id, text }),
  keepOnFail: true,
  request: (postId, text) => api.addComment(postId, text),
});

function Comments({ postId }: { postId: string }) {
  const add = useMutation(addComment(postId));
  const rowState = useRowState(postCommentsQuery, postId);

  return (
    <ul>
      {data.items.map((comment) => {
        const row = rowState(comment);
        return (
          <li key={comment.id}>
            {comment.text}
            {row.status === 'failed' && (
              <>
                <span>{row.error}</span>
                <button onClick={() => row.retry?.()}>Retry</button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Create with validate + keepOnFail — fields from mutation.error, banner skips row failures:
const titleError = fieldError(create.error, 'title');
const bannerError = generalErrorText(create.error);
```

---


## Sync — propagate success to sibling queries

`sync: (on) => [...]` runs **after a successful `request`**. Each op targets another query by reference.

| Op | Effect |
|----|--------|
| `on(query).bump(field, by, { params? })` | `field += by` (clamped at 0) — e.g. a comment count |
| `on(query).mergeItem(field, { id?, set }, { params? })` | Shallow-merge into a matching list item across param variants |
| `on(query).removeItem(field, { id? }, { params? })` | Remove a matching list item |
| `on(query).set(updater, { params? })` | Arbitrary `setQueryData` on the sibling |
| `on(query).invalidate({ params? })` | Invalidate / refetch the sibling |

By default the target key is derived from the mutation's `params`. For `bump` / `mergeItem` / `removeItem` without `params`, the item id defaults to the mutation params when it is a string id; otherwise pass `id: (event) => …`. The `event` carries `{ params, input, response }`.

```tsx
sync: (on) => [
  // rename → update the post inside the timeline list
  on(timelineQuery).mergeItem<Post>('items', { set: (_item, { input }) => ({ title: input }) }),
  // create → seed the freshly-created post's own query
  on(postQuery).set((_current, { response }) => response, { params: ({ response }) => response.id }),
]
```

---

## Per-row optimistic state

`useRowState(query, params)` returns `rowState(item)` for any item in that list query. It is driven by a sidecar store mutations populate, so list items never carry metadata.

```tsx
const rowState = useRowState(postCommentsQuery, postId);

{data.items.map((comment) => {
  const row = rowState(comment);
  return (
    <li className={row.status === 'pending' ? 'opacity-75' : undefined}>
      <input disabled={row.status !== 'ok'} defaultValue={comment.text} />
      {row.status === 'failed' && (
        <>
          <span>{row.error}</span>
          {row.retry && <button onClick={() => row.retry?.()}>Retry</button>}
        </>
      )}
    </li>
  );
})}
```

`rowState(item)` returns:

| Field | Meaning |
|-------|---------|
| `status` | `'ok'` \| `'pending'` \| `'failed'` |
| `error` | Row error message when failed |
| `retry(input?)` | Re-run the owning mutation for this row (failed rows only); pass an input to override |

Only `insert` / `update` mutations with `keepOnFail: true` produce `failed` rows; all optimistic list rows show `pending` until they settle.

---

## Utilities

| Export | Purpose |
|--------|---------|
| `getQueryKey(query, params)` | Stable key (same as `query(params).queryKey`) |
| `flattenInfiniteField(data, field)` | Flatten a list field across infinite pages (or a plain object) |
| `isTempId(id)` | Whether an id is an un-persisted optimistic placeholder |

---

## Module layout

```
define-query.ts     defineQuery, defineInfiniteQuery, getQueryKey
define-mutation.ts  defineMutation (+ normalized Effect, type inference)
run-mutation.ts     optimistic → request → settle / rollback / keep-failed + sync (the mutationFn)
run-sync.ts         executes sync ops against the QueryClient
sync.ts             on(query).* builder + op types
apply.ts            pure optimistic / settle / rollback over a cache snapshot
cache-ops.ts        immutable list/object ops (plain + InfiniteData)
client-state.ts     per-QueryClient rowStore + settledIds (WeakMap, GC with client)
row-store.ts        RowStore class + useRowStoreVersion / buildRowState helpers
use-row-state.ts    useRowState
errors.ts           fail, classify, fieldError, errorText, generalErrorText, isValidationError, isRowFailure, rowFailureId, RowFailure
query-key.ts        key normalization / sanitization / serialization
temp-id.ts          createTempId, isTempId
util.ts             small runtime guards
```

Row metadata and temp-id reconciliation live in a **per-`QueryClient` sidecar** (`client-state.ts`), not in module globals. When a `QueryClient` is discarded, its sidecar state is collected with it. Optimistic row state does **not** survive SSR dehydrate/rehydrate yet.

Live examples: [`../define-query-demo/src/demo/queries/`](../define-query-demo/src/demo/queries/) and [`../define-query-demo/src/demo/panels/`](../define-query-demo/src/demo/panels/).
