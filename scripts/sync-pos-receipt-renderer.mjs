import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(frontendRoot, '..');
const source = resolve(frontendRoot, 'packages/kubika-receipt-renderer/src/index.ts');
const compiler = resolve(frontendRoot, 'node_modules/typescript/bin/tsc');
const target = resolve(workspaceRoot, 'Stock_tenancy_system/packages/kubika-receipt-renderer/index.cjs');
const outputDirectory = await mkdtemp(join(tmpdir(), 'kubika-receipt-renderer-'));

try {
  const result = spawnSync(process.execPath, [
    compiler,
    source,
    '--target', 'ES2020',
    '--module', 'commonjs',
    '--lib', 'ES2020,DOM',
    '--skipLibCheck',
    '--strict',
    '--outDir', outputDirectory,
  ], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`TypeScript compilation failed with exit code ${result.status}.`);

  const compiledSource = await readFile(join(outputDirectory, 'index.js'));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, compiledSource);
  console.log(`Generated ${target}`);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
