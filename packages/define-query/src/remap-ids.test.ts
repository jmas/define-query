import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { forgetSettledId, getSettledIds } from './client-state';
import { remapIds } from './run-mutation';

describe('remapIds', () => {
  it('remaps a plain string id input', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_1', 'srv-1');
    expect(remapIds(client, 'tmp_1')).toBe('srv-1');
  });

  it('remaps only the id key by default, not arbitrary text fields', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_comment', 'srv-1');
    const input = { commentId: 'tmp_comment', text: 'tmp_comment' };
    expect(remapIds(client, input)).toEqual({ commentId: 'tmp_comment', text: 'tmp_comment' });
  });

  it('remaps configured object keys', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_comment', 'srv-1');
    const input = { commentId: 'tmp_comment', text: 'tmp_comment' };
    expect(remapIds(client, input, ['commentId'])).toEqual({
      commentId: 'srv-1',
      text: 'tmp_comment',
    });
  });

  it('remaps the id key on objects', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_2', 'srv-2');
    expect(remapIds(client, { id: 'tmp_2', name: 'tmp_2' })).toEqual({
      id: 'srv-2',
      name: 'tmp_2',
    });
  });

  it('does not remap after forgetSettledId clears the mapping', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_3', 'srv-3');
    forgetSettledId(client, 'srv-3');
    expect(remapIds(client, 'tmp_3')).toBe('tmp_3');
    expect(remapIds(client, { commentId: 'tmp_3' }, ['commentId'])).toEqual({
      commentId: 'tmp_3',
    });
  });

  it('leaves non-object, non-string values unchanged', () => {
    const client = new QueryClient();
    getSettledIds(client).set('tmp_4', 'srv-4');
    expect(remapIds(client, 42)).toBe(42);
    expect(remapIds(client, null)).toBeNull();
  });
});
