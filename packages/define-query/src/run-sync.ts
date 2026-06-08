import type { QueryClient } from '@tanstack/react-query';
import type { AnyQuery } from './define-query';
import { getQueryKey } from './query-key';
import { flattenInfiniteField, mergeObject, removeItem, updateItem } from './cache-ops';
import { isPlainObject, readId } from './util';
import type { SyncEvent, SyncOp } from './sync';

type AnyEvent = SyncEvent<unknown, unknown, unknown, unknown>;

function exactKey(query: AnyQuery, event: AnyEvent, params?: (event: AnyEvent) => unknown): readonly unknown[] {
  const target = params ? params(event) : event.params;
  return getQueryKey(query, target);
}

/** Top-level name segment — matches every param variant of a query. */
function namePrefix(query: AnyQuery, event: AnyEvent): readonly unknown[] {
  const key = getQueryKey(query, event.params);
  return key.length > 0 ? [key[0]] : key;
}

function resolveItemId(
  event: AnyEvent,
  id: ((event: AnyEvent) => string) | undefined,
  recipe: 'mergeItem' | 'removeItem',
): string {
  if (id) return id(event);
  if (typeof event.params === 'string') return event.params;
  throw new Error(
    `[define-query] sync.${recipe}: pass id() unless the mutation params is a string id`,
  );
}

export function runSync(
  client: QueryClient,
  ops: readonly SyncOp<AnyEvent>[],
  event: AnyEvent,
): void {
  for (const op of ops) {
    switch (op.kind) {
      case 'invalidate': {
        void client.invalidateQueries({ queryKey: exactKey(op.query, event, op.params) });
        break;
      }

      case 'bump': {
        client.setQueryData(exactKey(op.query, event, op.params), current => {
          if (!isPlainObject(current)) return current;
          const value = current[op.field];
          if (typeof value !== 'number') return current;
          return { ...current, [op.field]: Math.max(0, value + op.by) };
        });
        break;
      }

      case 'set': {
        client.setQueryData(exactKey(op.query, event, op.params), current =>
          op.updater(current, event),
        );
        break;
      }

      case 'setEach': {
        const items =
          event.item !== undefined
            ? [event.item]
            : event.data !== undefined
              ? flattenInfiniteField(event.data, op.field)
              : [];
        for (const item of items) {
          client.setQueryData(
            getQueryKey(op.query, op.params(event, item)),
            op.set(item, event),
          );
        }
        break;
      }

      case 'mergeItem': {
        const id = resolveItemId(event, op.id, 'mergeItem');
        const apply = (current: unknown) =>
          current === undefined
            ? current
            : updateItem(current, op.field, item => readId(item) === id, item =>
                mergeObject(item, op.set(item, event)),
              );
        if (op.params) {
          client.setQueryData(exactKey(op.query, event, op.params), apply);
        } else {
          client.setQueriesData({ queryKey: namePrefix(op.query, event) }, apply);
        }
        break;
      }

      case 'removeItem': {
        const id = resolveItemId(event, op.id, 'removeItem');
        const apply = (current: unknown) =>
          current === undefined ? current : removeItem(current, op.field, item => readId(item) === id);
        if (op.params) {
          client.setQueryData(exactKey(op.query, event, op.params), apply);
        } else {
          client.setQueriesData({ queryKey: namePrefix(op.query, event) }, apply);
        }
        break;
      }
    }
  }
}
