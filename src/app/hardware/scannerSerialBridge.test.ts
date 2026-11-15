import { describe, expect, it } from 'vitest';
import { DEFAULT_SCANNER_SETTINGS } from './scannerService';
import { SerialScanParser } from './scannerSerialBridge';

describe('serial scanner parser', () => {
  it('uses the configured Enter or Tab terminator', () => {
    const enter = new SerialScanParser();
    expect(enter.pushText('SKU-1\r\n', 100, DEFAULT_SCANNER_SETTINGS)).toMatchObject([
      { kind: 'scan', timing: { raw: 'SKU-1', terminator: 'Enter' } },
    ]);

    const tab = new SerialScanParser();
    expect(tab.pushText('SKU-2\t', 200, { ...DEFAULT_SCANNER_SETTINGS, terminator: 'Tab' })).toMatchObject([
      { kind: 'scan', timing: { raw: 'SKU-2', terminator: 'Tab' } },
    ]);
  });

  it('rejects invalid check digits and discards an overlong frame through its terminator', () => {
    const parser = new SerialScanParser();
    expect(parser.pushText('4006381333932\r', 100, DEFAULT_SCANNER_SETTINGS)).toMatchObject([
      { kind: 'invalid', reason: 'bad_check_digit' },
    ]);
    expect(parser.pushText(`${'X'.repeat(129)}SKU-1\r`, 200, DEFAULT_SCANNER_SETTINGS)).toMatchObject([
      { kind: 'invalid', reason: 'invalid_length' },
    ]);
  });
});
