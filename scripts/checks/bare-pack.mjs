// Builds the plugin the way Millennium's PluginDatabase CI does: a clean copy
// of the repository files, no package install, no build scripts, just
// `starlight pack --release`. Fails if anything needs node_modules or a
// generated file that isn't committed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const starlight = join(root, 'node_modules/@steambrew/starlight/bin/starlight.js');
// What a commit would contain: tracked and new files, minus ignored ones. Outside
// a git repository, every file except dependencies and build output.
const listFiles = () => {
  try {
    return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
  } catch {
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
      .filter((file) => !/^(\.git|node_modules|dist|\.millennium)\//.test(file));
  }
};
const files = listFiles().filter((file) => file && existsSync(join(root, file)));

const copy = mkdtempSync(join(tmpdir(), 'sgdb-bare-pack-'));
try {
  for (const file of files) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(root, file), join(copy, file));
  }
  assert.ok(!existsSync(join(copy, 'node_modules')), 'The clean copy must not contain node_modules');
  // The database's prepare-dist.sh creates dist/ before packing.
  mkdirSync(join(copy, 'dist'));
  try {
    execFileSync(process.execPath, [starlight, 'pack', '-o', 'dist', '--release'], {
      cwd: copy, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (error) {
    console.error(String(error.stdout ?? '') + String(error.stderr ?? ''));
    throw new Error('starlight pack failed on a clean copy');
  }
  const star = join(copy, 'dist/steamgriddb.star');
  assert.ok(existsSync(star) && statSync(star).size > 0, 'starlight pack must write dist/steamgriddb.star');
  console.log(`Bare pack check passed: ${files.length} files, no install, ${Math.round(statSync(star).size / 1024)} KB .star.`);
} finally {
  rmSync(copy, { recursive: true, force: true });
}
