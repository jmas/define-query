# define-query

Тонкий хелпер без залежностей, який дозволяє **визначити запити й мутації один раз** і використовувати їх із **рідними** хуками [TanStack Query](https://tanstack.com/query).

Він не обгортає й не підміняє `useQuery` / `useMutation`. Натомість:

- `defineQuery` / `defineInfiniteQuery` → фабрики, що повертають рідні `queryOptions` / `infiniteQueryOptions`.
- `defineMutation` → фабрика, що повертає рідні `mutationOptions` із вшитими optimistic-апдейтами, звіркою temp-id, rollback і синхронізацією сусідніх запитів.
- `useRowState` → єдиний власний хук цієї ліби: per-row стан `pending` / `failed` / `retry` для елементів списку (у TanStack аналога немає).

> [English](README.md)

---

## Ментальна модель

```
defineQuery(config)            →  (params) => queryOptions(...)
defineInfiniteQuery(config)    →  (params) => infiniteQueryOptions(...)
defineMutation(query, config)  →  (params) => mutationOptions(...)
useRowState(query, params)     →  (item) => { status, error?, retry? }
```

Уся поверхня TanStack лишається твоєю (`isPending`, `error`, `fetchStatus`, `mutate`, `mutateAsync`, …). Ліба лише будує об'єкти опцій, які ти передаєш у рідні хуки.


| Шар                  | Відповідальність                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Query**            | `key`, `fetch`, опційні `options` (проксяться в TanStack)                                 |
| **Mutation**         | `request`, опційний `validate`, одна optimistic-форма, опційний `sync`                    |
| **Optimistic-форма** | `object` (merge), `insert` / `prepend`, `update`, `remove` або `removes` (видалити запит) |
| **Sync**             | Виконується після успішного `request`; розповсюджує зміни на сусідні запити               |
| **Row state**        | `useRowState` дає per-item pending / failed / retry                                       |


`defineMutation` виводить `TInput` із 2-го аргументу `request`, а `TResponse` — із його типу повернення.

---

## Налаштування

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

---

## Швидкий старт

```tsx
import { useMutation, useQuery } from '@tanstack/react-query';
import { defineMutation, defineQuery } from 'define-query';

const postQuery = defineQuery({
  key: (id: string) => ['post', id] as const,
  fetch: (id) => api.getPost(id),
  options: { staleTime: 30_000 }, // прокситься в TanStack
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
  const { data } = useQuery(postQuery(id));           // рідний хук
  const rename = useMutation(renamePost(id));         // queryClient не потрібен

  if (!data) return null;
  return (
    <input
      defaultValue={data.title}
      onBlur={(e) => rename.mutate(e.target.value)}   // рідний mutate
    />
  );
}
```

---

## Запити

### `defineQuery`

```tsx
const postCommentsQuery = defineQuery({
  key: (postId: string) => ['post', postId, 'comments'] as const,
  fetch: (postId) => api.getComments(postId),
  options: { staleTime: 30_000 }, // опційно, прокситься в TanStack
});
```

Params запиту мають бути **плоским** однорівневим об'єктом (або скаляром). Вкладені об'єкти й масиви в dev згортаються в `{}` з console warning — використовуй лише shallow-поля (напр. `{ q: '' }`, не `{ filter: { tag: 'x' } }`).

`postCommentsQuery(postId)` повертає об'єкт `queryOptions`. Використовуй із будь-яким рідним хуком:

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

Щоб додати опції на конкретний виклик (`enabled`, `placeholderData`), розгорни фабрику:

```tsx
useInfiniteQuery({ ...timelineQuery(params), enabled, placeholderData: keepPreviousData });
```

---

## Мутації

`defineMutation(query, config)` повертає `(params) => mutationOptions`. Обери **одну** optimistic-форму. Активний `QueryClient` береться з mutation-контексту TanStack, тож передавати його вручну не треба.

Кожна мутація автоматично отримує стабільний **`mutationKey`**: `[...queryKey, name]`. Задавай унікальний `name` для кожної мутації на одному query (також потрібен для per-row retry). Для глобального спостереження використовуй `getMutationKey(mutation, params)` з `useIsMutating` / `useMutationState`.

### Object-форма — merge в один кешований об'єкт

```tsx
const renamePost = defineMutation(postQuery, {
  name: 'rename',
  request: (id: string, title: string) => api.patchPost(id, { title }),
  optimistic: (post, title) => ({ ...post, title }), // застосовується одразу
  settle: (post, response) => ({ ...post, ...response }), // опційно; за замовч. — поверхневий merge
});
```

### Insert / prepend — додати елемент списку

```tsx
const addComment = defineMutation(postCommentsQuery, {
  name: 'add',
  request: (postId: string, text: string) => api.addComment(postId, text),
  insert: 'items',                                 // або `prepend: 'items'`
  draft: (text, tempId) => ({ id: tempId, text }), // optimistic-рядок (temp id)
  from: (response) => response.comment,            // серверний рядок → замінює temp-рядок
  keepOnFail: true,                                // лишити failed-рядок на місці з retry
  sync: (on) => [on(postQuery).bump('commentCount', 1)],
});
```

Для optimistic-рядка генерується temp id; при успіху він звіряється з серверним id (подальші edit/remove цього рядка автоматично використовують реальний id). Перед `request` у input ремапляться поля з `remapInput` (дефолт: `id`) з temp на server id — інші рядки (напр. `text`, `title`) не чіпаються.

> **Infinite-запити:** `insert` пише в **останню** сторінку, а `prepend` — у **першу** (`pages[0]`), а не в глобальну позицію сортування. Якщо сторінок ще немає — insert є no-op (хай перший fetch наповнить кеш). Для звичайних (не-infinite) запитів елемент іде на початок/кінець єдиного списку.

### Update — пропатчити елемент списку, що збігається

```tsx
const editComment = defineMutation(postCommentsQuery, {
  name: 'edit',
  remapInput: ['commentId'],
  request: (postId: string, { commentId, text }: { commentId: string; text: string }) =>
    api.updateComment(postId, commentId, text),
  update: 'items',
  match: (item, input) => item.id === input.commentId,
  draft: (input) => ({ text: input.text }), // частковий патч
  keepOnFail: true,
});
```

### Remove — видалити елемент списку

```tsx
const removeComment = defineMutation(postCommentsQuery, {
  name: 'remove',
  request: (postId: string, commentId: string) => api.deleteComment(postId, commentId),
  remove: 'items',
  match: (item, commentId) => item.id === commentId,
  sync: (on) => [on(postQuery).bump('commentCount', -1)],
});
```

Видалення ще не збереженого temp-рядка автоматично пропускає мережевий запит.

### `removes` — видалити весь запит

```tsx
const removePost = defineMutation(postQuery, {
  name: 'removePost',
  request: (id: string) => api.deletePost(id),
  removes: true,
  sync: (on) => [on(timelineQuery).removeItem('items')],
});
```

### Використання мутації

```tsx
const add = useMutation(addComment(postId)); // рідний useMutation, без queryClient

add.mutate('Привіт');             // fire-and-forget; помилки — на add.error / на рядку
await add.mutateAsync('Привіт');  // реджектиться на rollback-помилці (validation/network)
add.isPending;                    // рідне
add.error;                        // рідне — сире кинуте значення (класифікуй хелперами нижче)
add.reset();                      // рідне
```

```tsx
import { useIsMutating } from '@tanstack/react-query';
import { getMutationKey } from 'define-query';

const isAdding = useIsMutating({ mutationKey: getMutationKey(addComment, postId) });
```

Додавай рідні колбеки вільно — напр. закрити панель після `removes`-мутації:

```tsx
const remove = useMutation({ ...removePost(postId), onSuccess: onClose });
```

`validate(input)` виконується **перед** optimistic-апдейтом; кидай `fail.validation(...)`, щоб показати помилку форми, не чіпаючи кеш.

---

## Помилки

Кидай класифіковані збої з `request` (або `validate`):

```tsx
import { fail } from 'define-query';

if (!text.trim()) throw fail.validation({ text: ['Cannot be empty'] });
if (offline) throw fail.network('Offline');
```

Будь-який збій потрапляє в нативний `mutation.error`. Читай через helpers:

| Helper | Повертає |
|--------|----------|
| `fieldError(error, 'title')` | Перше повідомлення для поля валідації, або `null` |
| `errorText(error)` | Повідомлення для користувача (поле валідації або network/server), або `null` |
| `generalErrorText(error)` | Як `errorText`, але `null` для row-scoped і validation failures |
| `isValidationError(error)` | `true` для збою валідації по полях |
| `isRowFailure(error)` | `true`, коли failed рядок списку з `keepOnFail` |
| `rowFailureId(error)` | Id рядка з row-scoped failure, або `null` |
| `classify(error)` | `{ kind: 'validation' \| 'network' \| 'error', … }` |

**Де показувати в UI:**

1. **По полю** — `fieldError(mutation.error, key)` (тільки validation; виконується до optimistic).
2. **На рівні компонента** (banner, toast, alert) — `generalErrorText(mutation.error)`.
3. **Inline на рядку списку** — `useRowState(item)` (`status`, `error`, `retry`).

З `keepOnFail` мутація **reject** як `RowFailure` (`mutation.error` заповнений, `onError` спрацьовує). Те саме повідомлення дзеркалиться в `useRowState` для inline UI. У global handlers використовуй `isRowFailure(error)`, щоб не дублювати toast, коли рядок уже показує помилку.

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

// Create з validate + keepOnFail — поля з mutation.error, banner пропускає row failures:
const titleError = fieldError(create.error, 'title');
const bannerError = generalErrorText(create.error);
```

---


## Sync — розповсюдити успіх на сусідні запити

`sync: (on) => [...]` виконується **після успішного `request`**. Кожна операція таргетить інший запит за посиланням.


| Операція                                                | Ефект                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `on(query).bump(field, by, { params? })`                | `field += by` (обрізається на 0) — напр. лічильник коментарів           |
| `on(query).mergeItem(field, { id?, set }, { params? })` | Поверхневий merge у відповідний елемент списку по всіх варіантах params |
| `on(query).removeItem(field, { id? }, { params? })`     | Видалити відповідний елемент списку                                     |
| `on(query).set(updater, { params? })`                   | Довільний `setQueryData` на сусідньому запиті                           |
| `on(query).invalidate({ params? })`                     | Invalidate / refetch сусіда                                             |


За замовчуванням ключ цілі виводиться з `params` мутації. Для `bump` / `mergeItem` / `removeItem` без `params` id елемента дорівнює params мутації, якщо це рядковий id; інакше передай `id: (event) => …`. `event` містить `{ params, input, response }`.

```tsx
sync: (on) => [
  // rename → оновити пост усередині списку timeline
  on(timelineQuery).mergeItem<Post>('items', { set: (_item, { input }) => ({ title: input }) }),
  // create → засіяти власний запит щойно створеного поста
  on(postQuery).set((_current, { response }) => response, { params: ({ response }) => response.id }),
]
```

---

## Per-row optimistic-стан

`useRowState(query, params)` повертає `rowState(item)` для будь-якого елемента цього списку. Він живиться sidecar-сховищем, яке наповнюють мутації, тож елементи списку не несуть метаданих.

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
          {row.retry && <button onClick={() => row.retry?.()}>Повторити</button>}
        </>
      )}
    </li>
  );
})}
```

`rowState(item)` повертає:


| Поле            | Значення                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `status`        | `'ok'` | `'pending'` | `'failed'`                                                              |
| `error`         | Повідомлення рядка при failed                                                                  |
| `retry(input?)` | Перезапустити мутацію-власника для цього рядка (лише failed); передай input, щоб перевизначити |


Лише `insert` / `update` із `keepOnFail: true` дають `failed`-рядки; усі optimistic-рядки списку показують `pending`, доки не завершаться.

---

## Утиліти


| Експорт                             | Призначення                                                            |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `getQueryKey(query, params)`        | Стабільний ключ (те саме, що `query(params).queryKey`)                 |
| `getMutationKey(mutation, params)`  | Стабільний mutation key (те саме, що `mutation(params).mutationKey`) |
| `flattenInfiniteField(data, field)` | Сплющити поле-список по всіх infinite-сторінках (або по plain-об'єкту) |
| `isTempId(id)`                      | Чи є id ще не збереженим optimistic-плейсхолдером                      |


---

## Структура модулів

```
define-query.ts     defineQuery, defineInfiniteQuery, getQueryKey
define-mutation.ts  defineMutation (+ нормалізований Effect, виведення типів)
run-mutation.ts     optimistic → request → settle / rollback / keep-failed + sync (це mutationFn)
run-sync.ts         виконує sync-операції над QueryClient
sync.ts             білдер on(query).* + типи операцій
apply.ts            чисті optimistic / settle / rollback над знімком кешу
cache-ops.ts        незмінні операції зі списками/об'єктами (plain + InfiniteData)
client-state.ts     per-QueryClient rowStore + settledIds (WeakMap, GC разом із клієнтом)
row-store.ts        клас RowStore + хелпери useRowStoreVersion / buildRowState
use-row-state.ts    useRowState
errors.ts           fail, classify, fieldError, errorText, generalErrorText, isValidationError, isRowFailure, rowFailureId, RowFailure
query-key.ts        нормалізація / санітизація / серіалізація ключів
temp-id.ts          createTempId, isTempId
util.ts             дрібні рантайм-гарди
```

Метадані рядків і temp-id reconciliation живуть у **sidecar на кожен `QueryClient`** (`client-state.ts`), а не в глобалах модуля. Коли `QueryClient` знищується, його sidecar збирається GC разом із ним. Optimistic row state **ще не переживає** SSR dehydrate/rehydrate.

Живі приклади: [`../define-query-demo/src/demo/queries/`](../define-query-demo/src/demo/queries/) і [`../define-query-demo/src/demo/panels/`](../define-query-demo/src/demo/panels/).