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
      '/pos/admin/discount-settings', '/pos/admin/accounting-settings',
      '/pos/admin/approvals', '/pos/admin/reports', '/pos/admin/audit', '/clients',
    ]));
    expect(backOffice?.items.find((item) => item.href === '/pos/admin/discount-settings')?.permission)
      .toBe('pos.admin:settings');
    expect(backOffice?.items.find((item) => item.href === '/pos/admin/accounting-settings')?.permission)
      .toBe('pos.admin:settings');
    expect(backOffice?.items.some((item) => item.href === '/sales-legacy')).toBe(false);
  });

  it('exposes the Reports Hub and POS accounting reports in Reports & Insights', () => {
    const reports = APP_SECTIONS.find((section) => section.id === 'reports');
    expect(reports?.items.find((item) => item.href === '/reports')?.nameKey).toBe('nav.reportsHub');
    expect(reports?.items.find((item) => item.href === '/reports/pos-accounting')).toMatchObject({
      nameKey: 'nav.posAccountingReports',
      permission: 'pos.admin:reports',
    });
  });
});
