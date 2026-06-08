# define-query

Тонкий хелпер без залежностей, який дозволяє **визначити запити й мутації один раз** і використовувати їх із **рідними** хуками [TanStack Query](https://tanstack.com/query).

Він не обгортає й не підміняє `useQuery` / `useMutation`. Натомість:

- `defineQuery` / `defineInfiniteQuery` → фабрики, що повертають рідні `queryOptions` / `infiniteQueryOptions`.
- `defineMutation` → фабрика, що повертає рідні `mutationOptions` із вшитими draft-апдейтами, звіркою temp-id, rollback і синхронізацією сусідніх запитів.

> [English](README.md)

---

## Ментальна модель

```
defineQuery(config)            →  (params) => queryOptions(...)
defineInfiniteQuery(config)    →  (params) => infiniteQueryOptions(...)
defineMutation(query, config)  →  (params) => mutationOptions(...)
```

Уся поверхня TanStack лишається твоєю (`isPending`, `error`, `fetchStatus`, `mutate`, `mutateAsync`, …). Ліба лише будує об'єкти опцій для рідних хуків.

| Шар | Відповідальність |
|-----|------------------|
| **Query** | `key`, `fetch`, опційні `options` (проксяться в TanStack) |
| **Mutation** | `request`, опційний `validate`, одна draft-форма, опційний `sync` |
| **Draft-форма** | `object`, `insert` / `prepend`, `update`, `remove` або `removes` |
| **Sync** | Mutation sync після успішного `request`; query fetch sync після network fetch |
| **UI state** | Рідний `useMutation` і `useQuery` (draft у кеші) |

Перший аргумент `defineMutation` — **який кеш оновлює мутація**, а не обов'язково endpoint API. `addComment` → `postCommentsQuery`, `renamePost` → `postQuery` тощо.

---

## Налаштування

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupDefineQuery } from 'define-query';

const queryClient = new QueryClient();
setupDefineQuery(queryClient); // потрібно для query fetch sync

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

`setupDefineQuery` підписує `QueryCache` для `sync` на `defineQuery` / `defineInfiniteQuery`. Мутації працюють і без нього; fetch sync — ні.

**Зарезервований meta:** не задавай `options.meta['define-query']` на query-фабриках — цей ключ належить бібліотеці.

---

## Швидкий старт

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

## Ключі

Використовуй **`factory.key(params)`** — нормалізований стабільний ключ:

```tsx
postQuery.key(id);              // те саме, що postQuery(id).queryKey
addComment.key(postId);         // те саме, що addComment(postId).mutationKey

queryClient.invalidateQueries({ queryKey: postQuery.key(id) });
useIsMutating({ mutationKey: addComment.key(postId) });
```

---

## Запити

### `defineQuery`

Params мають бути **плоским** об'єктом або скаляром. Вкладені структури згортаються в `{}` з **console warning** у будь-якому середовищі.

```tsx
queryClient.invalidateQueries({ queryKey: postCommentsQuery.key(postId) });
```

### `defineInfiniteQuery`

```tsx
const items = flattenInfiniteField(timeline.data, 'items');
```

### Query fetch sync

`sync` на `defineQuery` / `defineInfiniteQuery` — після **успішного network fetch** (не після ручного `setQueryData`). Потрібен `setupDefineQuery`.

| Операція | Ефект |
|----------|-------|
| `on(query).set(...)` | Upsert одного sibling entry |
| `on(query).setEach(field, ...)` | Upsert для кожного елемента списку |

**Mutation sync** — окремо: після успішного `request`, інший набір ops (`bump`, `mergeItem`, `removeItem`, `set`, `invalidate`). Той самий синтаксис `on(query)`, різні тригери.

---

## Мутації

Обов'язковий унікальний **`name`**. Обирай **одну** draft-форму.

### `DraftCtx` — єдиний API для draft

```ts
type DraftCtx<TData, TInput> = {
  data: TData;
  input: TInput;
  tempId?: string;  // insert/prepend
  item?: TItem;     // update — знайдений рядок
};
```

| Форма | `draft` | `settle` |
|-------|---------|----------|
| object | `(ctx) => TData` | `(ctx & { response }) => TData` |
| insert / prepend | `(ctx) => TItem` | `(response) => TItem` |
| update | `(ctx) => Partial<TItem>` | `(ctx & { response }) => Partial<TItem>` |
| remove / removes | — | — |

### Приклади

```tsx
// object
draft: ({ data, input }) => ({ ...data, title: input }),

// insert
draft: ({ input, tempId }) => ({ id: tempId!, text: input }),

// update
draft: ({ input }) => ({ text: input.text }),
```

> **Infinite:** `insert` — остання сторінка, `prepend` — перша. Порожній `pages` **bootstrap'иться** першою сторінкою з елементом.

> **Без кешу:** якщо даних у кеші ще немає — draft пропускається (console warning), виконується лише `request`.

### Конкурентність

Паралельні мутації на одному списку безпечні: rollback по `rowId` / `tempId`. Два edit одного рядка — **останній успішний response виграє** при settle.

---

## Помилки

```tsx
import { fail } from 'define-query';

throw fail.validation({ text: ['Порожньо'] });
throw fail.network('Offline');
throw fail.server('Помилка сервера');
```

`mutation.error` — **`DefineQueryMutationError`**:

```tsx
add.error?.field('text');  // поле форми
add.error?.banner();       // toast/banner (не validation)
```

`isMutationError` — лише для `unknown` (спільні helpers).

---

## Mutation sync

Після успішного `request`. Див. таблицю ops у [README.md](README.md#mutation-sync).

---

## Утиліти

| Експорт | Призначення |
|---------|-------------|
| `setupDefineQuery(client)` | Підключити query fetch sync |
| `factory.key(params)` | Стабільний ключ query / mutation |
| `flattenInfiniteField(data, field)` | Сплющити список по infinite-сторінках |
| `isTempId` / `createTempId` | Temp id |
| `isMutationError` | Type guard для помилки мутації |
| `fail` | validation / network / server |

---

Живі приклади: [`../define-query-demo/src/demo/queries/`](../define-query-demo/src/demo/queries/) і [`../define-query-demo/src/demo/panels/`](../define-query-demo/src/demo/panels/).
