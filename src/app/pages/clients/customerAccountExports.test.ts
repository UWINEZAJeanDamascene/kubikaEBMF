import { describe, expect, it } from 'vitest';
import { buildCustomerCsv, buildStatementHtml } from './customerAccountExports';

describe('customer account exports', () => {
  it('quotes CSV values including commas and embedded quotes', () => {
    expect(buildCustomerCsv([['Name', 'Note'], ['Aline, Shop', 'Said "paid"']])).toContain('"Aline, Shop","Said ""paid"""');
  });

  it('escapes customer and transaction text in the HTML statement', () => {
    const html = buildStatementHtml({ customer: '<script>alert(1)</script>', generatedAt: 'today', transactions: [{ description: '<img src=x>', debit: 2 }] });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});
