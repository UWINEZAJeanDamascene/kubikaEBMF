import { describe, expect, it } from 'vitest';
import { getClientCreditStatusTranslationKey } from './clientCreditStatus';

describe('getClientCreditStatusTranslationKey', () => {
  it.each([
    ['ACTIVE', 'clients.creditStatusActive'],
    ['ON_HOLD', 'clients.creditStatusOnHold'],
    ['CLOSED', 'clients.creditStatusClosed'],
    [undefined, 'clients.creditStatusActive'],
  ] as const)('maps %s to a translation key', (status, expectedKey) => {
    expect(getClientCreditStatusTranslationKey(status)).toBe(expectedKey);
  });
});
