/** Field-level validation payload (422-style). */
export type ValidationFields = Record<string, string | string[]>;

/** Classified mutation failure — branch on `kind` in UI. */
export type MutationError =
  | { kind: 'validation'; fields: ValidationFields }
  | { kind: 'network'; message: string }
  | { kind: 'error'; message: string };

class ValidationFailure extends Error {
  readonly fields: ValidationFields;
  constructor(fields: ValidationFields) {
    super('Validation failed');
    this.name = 'ValidationFailure';
    this.fields = fields;
  }
}

class NetworkFailure extends Error {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkFailure';
  }
}

/** Thrown when a `keepOnFail` list mutation fails — carries the affected row id. */
export class RowFailure extends Error {
  readonly rowId: string;
  readonly mutation: string;
  readonly cause: unknown;

  constructor(cause: unknown, rowId: string, mutation: string) {
    super(errorMessage(classify(cause)));
    this.name = 'RowFailure';
    this.cause = cause;
    this.rowId = rowId;
    this.mutation = mutation;
  }
}

/** Wrap a caught failure with row context for `mutation.error`. */
export function rowFailure(cause: unknown, rowId: string, mutation: string): RowFailure {
  return new RowFailure(cause, rowId, mutation);
}

/**
 * Throw these from `request` (or `validate`) to classify failures.
 *
 * ```ts
 * if (!text.trim()) throw fail.validation({ text: 'Cannot be empty' });
 * if (offline) throw fail.network();
 * ```
 */
export const fail = {
  validation: (fields: ValidationFields): Error => new ValidationFailure(fields),
  network: (message?: string): Error => new NetworkFailure(message),
};

// `fetch` rejects with a TypeError on a real network failure. Match those by
// message so a plain TypeError from a bug (e.g. reading a prop of undefined in
// `from`/`draft`) is not mislabeled as a network error.
const FETCH_NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i;

function isFetchNetworkError(error: unknown): boolean {
  return error instanceof TypeError && FETCH_NETWORK_MESSAGE.test(error.message);
}

/** Map any thrown value to a classified `MutationError`. */
export function classify(error: unknown): MutationError {
  if (error instanceof RowFailure) {
    return classify(error.cause);
  }
  if (error instanceof ValidationFailure) {
    return { kind: 'validation', fields: error.fields };
  }
  if (error instanceof NetworkFailure || isFetchNetworkError(error)) {
    return { kind: 'network', message: (error as Error).message || 'Network request failed' };
  }
  if (error instanceof Error) {
    return { kind: 'error', message: error.message };
  }
  return { kind: 'error', message: String(error) };
}

function firstFieldMessage(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function fieldErrorOf(error: MutationError | null, key: string): string | null {
  if (!error || error.kind !== 'validation') return null;
  return firstFieldMessage(error.fields[key]);
}

/** User-visible message for a classified error (first validation field or message). */
export function errorMessage(error: MutationError): string {
  if (error.kind === 'validation') {
    const first = Object.values(error.fields)[0];
    return firstFieldMessage(first) ?? 'Validation failed';
  }
  return error.message;
}

/* ------------------------------------------------------------------ *
 * UI helpers — accept the raw error from `useMutation().error`.
 * ------------------------------------------------------------------ */

/** Message for a single field from a thrown error, or null. */
export function fieldError(error: unknown, key: string): string | null {
  if (error == null) return null;
  return fieldErrorOf(classify(error), key);
}

/** User-visible message for any thrown error, or null. */
export function errorText(error: unknown): string | null {
  if (error == null) return null;
  return errorMessage(classify(error));
}

/** Whether a thrown error is a field-validation failure. */
export function isValidationError(error: unknown): boolean {
  return error != null && classify(error).kind === 'validation';
}

/** Whether a thrown error is scoped to a specific list row (`keepOnFail`). */
export function isRowFailure(error: unknown): error is RowFailure {
  return error instanceof RowFailure;
}

/** Row id from a row-scoped failure, or null. */
export function rowFailureId(error: unknown): string | null {
  return error instanceof RowFailure ? error.rowId : null;
}

/**
 * Component-level message (banner, toast, alert) from `mutation.error`.
 * Null for row-scoped failures (read inline via `useRowState`) and validation
 * (read per-field via `fieldError`).
 */
export function generalErrorText(error: unknown): string | null {
  if (error == null || isRowFailure(error) || isValidationError(error)) return null;
  return errorText(error);
}
