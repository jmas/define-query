import type { InfiniteData } from '@tanstack/react-query';

type ArrayElem<T> = T extends readonly (infer E)[] ? E : never;

type PageOf<TData> = TData extends InfiniteData<infer Page> ? Page : never;

/** Plain page object for list-field lookup (single object or one infinite page). */
export type SyncDataShape<TData> = [PageOf<TData>] extends [never] ? TData : PageOf<TData>;

/** Keys of query data that hold a list — used to type `insert` / `update` / `removeField` / sync `field`. */
export type SyncListFieldOf<TData> = Extract<
  {
    [K in keyof SyncDataShape<TData>]: SyncDataShape<TData>[K] extends readonly unknown[]
      ? K
      : never;
  }[keyof SyncDataShape<TData>],
  string
>;

/** Element type of list field `K` on source data (plain or infinite). */
export type SyncFieldItem<TData, K extends SyncListFieldOf<TData>> = ArrayElem<
  SyncDataShape<TData> extends Record<K, infer Arr> ? Arr : never
>;

type ItemUnion<T> = {
  [K in keyof T]: T[K] extends readonly (infer E)[] ? E : never;
}[keyof T];

/** Element type of any list field on query data (plain or infinite). */
export type ListItem<TData> = ItemUnion<SyncDataShape<TData>>;
