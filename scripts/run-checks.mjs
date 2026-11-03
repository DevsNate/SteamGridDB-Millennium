// Runs every check in scripts/checks/. Build first: some inspect dist/steamgriddb.star.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (...args) => {
  const { status } = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
};
run('scripts/build-styles.mjs', '--check');
const checks = readdirSync(new URL('checks/', import.meta.url)).filter((name) => name.endsWith('.mjs')).sort();
for (const name of checks) run(`scripts/checks/${name}`);
run('scripts/checks/backend.mjs', '--packed');
