import { describe, expect, it } from 'vitest';
import { createTempId, isTempId } from './temp-id';

describe('temp ids', () => {
  it('creates unique ids that are recognized as temp', () => {
    const a = createTempId();
    const b = createTempId();
    expect(a).not.toBe(b);
    expect(isTempId(a)).toBe(true);
    expect(isTempId(b)).toBe(true);
  });

  it('rejects non-temp ids', () => {
    expect(isTempId('srv_1')).toBe(false);
    expect(isTempId('')).toBe(false);
    expect(isTempId(123)).toBe(false);
    expect(isTempId(undefined)).toBe(false);
  });
});
