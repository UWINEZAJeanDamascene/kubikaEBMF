import { describe, expect, it } from 'vitest';
import { APP_SECTIONS } from './Sidebar';

describe('POS navigation split', () => {
  it('separates cashier entry from back-office management routes', () => {
    const till = APP_SECTIONS.find((section) => section.id === 'pos-till');
    const backOffice = APP_SECTIONS.find((section) => section.id === 'pos-back-office');
    expect(till?.items.map((item) => item.href)).toEqual(['/pos/till', '/pos/auth']);
    expect(backOffice?.overviewPath).toBe('/pos/admin');
    expect(backOffice?.items.map((item) => item.href)).toEqual(expect.arrayContaining([
      '/pos/register-settings', '/pos/printer-setup', '/pos/admin/shifts',
      '/pos/admin/approvals', '/pos/admin/audit', '/clients', '/reports',
    ]));
    expect(backOffice?.items.some((item) => item.href === '/sales-legacy')).toBe(false);
  });
});
