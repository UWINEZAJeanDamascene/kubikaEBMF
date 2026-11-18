import { describe, expect, it } from 'vitest';
import { getSafeAuthReturnPath } from './authReturnPath';

describe('getSafeAuthReturnPath', () => {
  it('preserves product links and existing POS authentication destinations', () => {
    expect(getSafeAuthReturnPath('/products/abc-123')).toBe('/products/abc-123');
    expect(getSafeAuthReturnPath({ pathname: '/products/abc-123' })).toBe('/products/abc-123');
    expect(getSafeAuthReturnPath('/pos/auth')).toBe('/pos/auth');
    expect(getSafeAuthReturnPath('/pos/register-access')).toBe('/pos/register-access');
  });

  it('rejects external URLs, protocol-relative paths, and unrelated destinations', () => {
    expect(getSafeAuthReturnPath('https://attacker.test/products/abc-123')).toBeNull();
    expect(getSafeAuthReturnPath('//attacker.test/products/abc-123')).toBeNull();
    expect(getSafeAuthReturnPath('/products/abc-123/edit')).toBeNull();
    expect(getSafeAuthReturnPath(null)).toBeNull();
  });
});
