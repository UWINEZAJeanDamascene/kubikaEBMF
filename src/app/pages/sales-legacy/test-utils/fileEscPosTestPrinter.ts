import { readFileSync, writeFileSync } from 'node:fs';

/** A hardware-free ESC/POS sink that captures exactly the bytes a printer receives. */
export class FileEscPosTestPrinter {
  constructor(private readonly outputPath: string) {}

  async print(bytes: Uint8Array): Promise<void> {
    writeFileSync(this.outputPath, Buffer.from(bytes));
  }

  readOutput(): Uint8Array {
    return new Uint8Array(readFileSync(this.outputPath));
  }
}
