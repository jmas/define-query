const TEMP_PREFIX = 'tmp_';

let seq = 0;

/** Optimistic placeholder id, swapped for the server id once the request settles. */
export function createTempId(): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${TEMP_PREFIX}${Date.now().toString(36)}_${seq}_${rand}`;
}

export function isTempId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(TEMP_PREFIX);
}
