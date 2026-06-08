/** Field-level validation payload (422-style). */
export type ValidationFields = Record<string, string | string[]>;

/** Classified mutation failure — branch on `kind` in UI. */
export type MutationError =
  | { kind: 'validation'; fields: ValidationFields }
  | { kind: 'network'; message: string }
  | { kind: 'server'; message: string }
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

class ServerFailure extends Error {
  constructor(message = 'Server error') {
    super(message);
    this.name = 'ServerFailure';
  }
}

/**
 * Throw these from `request` (or `validate`) to classify failures.
 *
 * ```ts
 * if (!text.trim()) throw fail.validation({ text: 'Cannot be empty' });
 * if (offline) throw fail.network();
 * if (status >= 500) throw fail.server();
 * ```
 */
export const fail = {
  validation: (fields: ValidationFields): Error => new ValidationFailure(fields),
  network: (message?: string): Error => new NetworkFailure(message),
  server: (message?: string): Error => new ServerFailure(message),
};

const FETCH_NETWORK_MESSAGE = /failed to fetch|networkerror|load failed|network request failed/i;

function isFetchNetworkError(error: unknown): boolean {
  return error instanceof TypeError && FETCH_NETWORK_MESSAGE.test(error.message);
}

function firstFieldMessage(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Map any thrown value to a classified `MutationError`. */
export function classify(error: unknown): MutationError {
  if (error instanceof DefineQueryMutationError) {
    return error.toMutationError();
  }
  if (error instanceof ValidationFailure) {
    return { kind: 'validation', fields: error.fields };
  }
  if (error instanceof ServerFailure) {
    return { kind: 'server', message: error.message };
  }
  if (error instanceof NetworkFailure || isFetchNetworkError(error)) {
    return { kind: 'network', message: (error as Error).message || 'Network request failed' };
  }
  if (error instanceof Error) {
    return { kind: 'error', message: error.message };
  }
  return { kind: 'error', message: String(error) };
}

/**
 * Normalized error surfaced on `useMutation().error` after a define-query mutation.
 * With `useMutation(defineMutation(...))`, `error` is already this type.
 */
export class DefineQueryMutationError extends Error {
  readonly kind: MutationError['kind'];
  readonly fields?: ValidationFields;

  constructor(detail: MutationError) {
    super(DefineQueryMutationError.messageFor(detail));
    this.name = 'DefineQueryMutationError';
    this.kind = detail.kind;
    if (detail.kind === 'validation') {
      this.fields = detail.fields;
    }
  }

  private static messageFor(detail: MutationError): string {
    if (detail.kind === 'validation') {
      const first = Object.values(detail.fields)[0];
      return firstFieldMessage(first) ?? 'Validation failed';
    }
    return detail.message;
  }

  /** First validation message for a field, or `null`. */
  field(key: string): string | null {
    if (this.kind !== 'validation' || !this.fields) return null;
    return firstFieldMessage(this.fields[key]);
  }

  /** Non-validation user-visible message (network / server / generic), or `null`. */
  banner(): string | null {
    if (this.kind === 'validation') return null;
    return this.message;
  }

  toMutationError(): MutationError {
    if (this.kind === 'validation') {
      return { kind: 'validation', fields: this.fields ?? {} };
    }
    if (this.kind === 'network') {
      return { kind: 'network', message: this.message };
    }
    if (this.kind === 'server') {
      return { kind: 'server', message: this.message };
    }
    return { kind: 'error', message: this.message };
  }
}

/** Whether a value is a normalized define-query mutation error. */
export function isMutationError(error: unknown): error is DefineQueryMutationError {
  return error instanceof DefineQueryMutationError;
}

/** Normalize any thrown value into `DefineQueryMutationError` for `mutation.error`. */
export function toDefineQueryMutationError(error: unknown): DefineQueryMutationError {
  if (error instanceof DefineQueryMutationError) return error;
  return new DefineQueryMutationError(classify(error));
}
