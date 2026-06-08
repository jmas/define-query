import { describe, expect, it } from 'vitest';
import {
  DefineQueryMutationError,
  fail,
  isMutationError,
  toDefineQueryMutationError,
} from './errors';

describe('fail + DefineQueryMutationError', () => {
  it('normalizes validation failures with field()', () => {
    const error = toDefineQueryMutationError(fail.validation({ title: ['Required'], body: 'Too short' }));
    expect(isMutationError(error)).toBe(true);
    expect(error.kind).toBe('validation');
    expect(error.field('title')).toBe('Required');
    expect(error.field('body')).toBe('Too short');
    expect(error.banner()).toBeNull();
  });

  it('normalizes network failures with banner()', () => {
    const error = toDefineQueryMutationError(fail.network('offline'));
    expect(error.kind).toBe('network');
    expect(error.banner()).toBe('offline');
    expect(error.field('title')).toBeNull();
  });

  it('normalizes server failures', () => {
    const error = toDefineQueryMutationError(fail.server('Internal error'));
    expect(error.kind).toBe('server');
    expect(error.banner()).toBe('Internal error');
  });

  it('does not mislabel a non-fetch TypeError as network', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'comment')");
    const error = toDefineQueryMutationError(bug);
    expect(error.kind).toBe('error');
    expect(error.banner()).toBe(bug.message);
  });

  it('normalizes generic errors and non-errors', () => {
    expect(toDefineQueryMutationError(new Error('boom')).banner()).toBe('boom');
    expect(toDefineQueryMutationError('weird').banner()).toBe('weird');
  });

  it('is idempotent for DefineQueryMutationError', () => {
    const original = new DefineQueryMutationError({ kind: 'network', message: 'offline' });
    expect(toDefineQueryMutationError(original)).toBe(original);
  });
});
