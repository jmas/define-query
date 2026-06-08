/** Runtime warnings surfaced by define-query. */

export function warn(message: string, ...args: unknown[]): void {
  console.warn(`[define-query] ${message}`, ...args);
}

export function warnDev(message: string, ...args: unknown[]): void {
  if (import.meta.env.DEV) {
    warn(message, ...args);
  }
}

export function warnMutateWithoutCache(mutationName: string): void {
  warn(`mutate without cached data — draft skipped (${mutationName})`);
}

export function warnCollapsedParams(params: unknown): void {
  warn(
    'normalizeParams: nested/non-serializable params collapsed to {}. Use a flat key object.',
    params,
  );
}

export function warnUserMetaConflict(): void {
  warnDev('options.meta["define-query"] is reserved — it will be overwritten by query sync');
}

export function warnDuplicateMutationName(name: string): void {
  warnDev(`duplicate mutation name "${name}" on the same query`);
}
