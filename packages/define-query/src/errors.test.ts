import { describe, expect, it } from 'vitest';
import {
  classify,
  errorText,
  fail,
  fieldError,
  generalErrorText,
  isRowFailure,
  isValidationError,
  rowFailure,
  rowFailureId,
  RowFailure,
} from './errors';

describe('fail + classify', () => {
  it('classifies validation failures with fields', () => {
    const error = fail.validation({ title: ['Required'], body: 'Too short' });
    const classified = classify(error);
    expect(classified).toEqual({
      kind: 'validation',
      fields: { title: ['Required'], body: 'Too short' },
    });
  });

  it('classifies network failures', () => {
    expect(classify(fail.network('offline'))).toEqual({ kind: 'network', message: 'offline' });
    expect(classify(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classify(new TypeError('Load failed')).kind).toBe('network');
  });

  it('does not mislabel a non-fetch TypeError as network', () => {
    const bug = new TypeError("Cannot read properties of undefined (reading 'comment')");
    expect(classify(bug)).toEqual({ kind: 'error', message: bug.message });
  });

  it('classifies generic errors and non-errors', () => {
    expect(classify(new Error('boom'))).toEqual({ kind: 'error', message: 'boom' });
    expect(classify('weird')).toEqual({ kind: 'error', message: 'weird' });
  });
});

describe('UI helpers', () => {
  it('fieldError reads the first message for a field', () => {
    const error = fail.validation({ title: ['First', 'Second'] });
    expect(fieldError(error, 'title')).toBe('First');
    expect(fieldError(error, 'missing')).toBeNull();
    expect(fieldError(null, 'title')).toBeNull();
  });

  it('errorText surfaces network/server messages and first validation field', () => {
    expect(errorText(fail.network('offline'))).toBe('offline');
    expect(errorText(fail.validation({ title: 'Required' }))).toBe('Required');
    expect(errorText(null)).toBeNull();
  });

  it('isValidationError discriminates', () => {
    expect(isValidationError(fail.validation({ a: 'x' }))).toBe(true);
    expect(isValidationError(fail.network())).toBe(false);
    expect(isValidationError(null)).toBe(false);
  });
});


describe('RowFailure', () => {
  it('classifies through the wrapped cause', () => {
    const wrapped = rowFailure(fail.network('offline'), 'tmp_1', 'add');
    expect(wrapped).toBeInstanceOf(RowFailure);
    expect(classify(wrapped)).toEqual({ kind: 'network', message: 'offline' });
    expect(wrapped.rowId).toBe('tmp_1');
    expect(wrapped.mutation).toBe('add');
  });

  it('isRowFailure and rowFailureId', () => {
    const wrapped = rowFailure(fail.network('offline'), 'tmp_1', 'add');
    expect(isRowFailure(wrapped)).toBe(true);
    expect(isRowFailure(fail.network())).toBe(false);
    expect(rowFailureId(wrapped)).toBe('tmp_1');
    expect(rowFailureId(null)).toBeNull();
  });

  it('generalErrorText ignores row and validation failures', () => {
    const row = rowFailure(fail.network('offline'), 'tmp_1', 'add');
    expect(generalErrorText(row)).toBeNull();
    expect(generalErrorText(fail.validation({ title: 'Required' }))).toBeNull();
    expect(generalErrorText(fail.network('offline'))).toBe('offline');
    expect(generalErrorText(null)).toBeNull();
  });
});
