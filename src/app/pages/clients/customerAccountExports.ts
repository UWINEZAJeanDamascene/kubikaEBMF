export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCustomerCsv(rows: Array<Array<unknown>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] as string);
}

export function buildStatementHtml({ customer, transactions, generatedAt }: {
  customer: string;
  transactions: Array<{ date?: string; referenceNo?: string; description?: string; debit?: number; credit?: number; balance?: number }>;
  generatedAt: string;
}): string {
  const rows = transactions.map((row) => `<tr><td>${escapeHtml(row.date || '')}</td><td>${escapeHtml(row.referenceNo || '')}</td><td>${escapeHtml(row.description || '')}</td><td class="num">${escapeHtml(row.debit ?? '')}</td><td class="num">${escapeHtml(row.credit ?? '')}</td><td class="num">${escapeHtml(row.balance ?? '')}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Customer statement</title><style>body{font:14px Arial,sans-serif;color:#111;margin:32px}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.num{text-align:right}@media print{body{margin:10mm}}</style></head><body><h1>Customer statement</h1><p>${escapeHtml(customer)}</p><table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table><p>Generated ${escapeHtml(generatedAt)}</p></body></html>`;
}
