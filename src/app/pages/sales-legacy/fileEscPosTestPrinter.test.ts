import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderReceiptEscPos, type CanonicalReceipt } from './receiptRenderers';
import { FileEscPosTestPrinter } from './test-utils/fileEscPosTestPrinter';

const directories: string[] = [];

afterEach(() => {
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('file-based ESC/POS test printer', () => {
  it('captures renderer bytes without requiring a physical printer', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kubika-escpos-'));
    directories.push(directory);
    const outputPath = join(directory, 'receipt.bin');
    const printer = new FileEscPosTestPrinter(outputPath);
    const receipt: CanonicalReceipt = {
      version: 1,
      business: { name: 'Test Shop' },
      receipt: { number: 'TEST-100', localDateTime: '2026-11-02 10:00' },
      lines: [{ name: 'Test item', quantity: 1, unitPriceRwf: 2500, totalRwf: 2500 }],
      totals: { currency: 'RWF', subtotalRwf: 2500, grandTotalRwf: 2500 },
      flags: { isCopy: false, receiptType: 'SALE' },
    };

    await printer.print(renderReceiptEscPos(receipt, { columns: 42 }));
    const output = printer.readOutput();

    expect(Array.from(output.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(new TextDecoder().decode(output)).toContain('Test Shop');
    expect(new TextDecoder().decode(output)).toContain('Test item');
    expect(Array.from(output.slice(-3))).toEqual([0x1d, 0x56, 0]);
  });
});
