// Artwork search timing: the first search runs at once, repeats collapse.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (path, context) => {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, JSON, Date, ...context });
  return module.exports;
};

// leadingDebounce: first call now, later calls in the window collapse into one with the latest arguments.
const timers = [];
const { default: leadingDebounce } = load('../../src/utils/leadingDebounce.ts', {
  setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
});
const calls = [];
const search = leadingDebounce((...args) => calls.push(args), 500);
search('first');
assert.deepEqual(calls, [['first']], 'The first search must not wait out the debounce');
search('second');
search('third');
assert.equal(calls.length, 1);
timers.shift().callback();
assert.deepEqual(calls.at(-1), ['third'], 'Calls inside the window collapse to the latest');
timers.shift().callback();
assert.equal(calls.length, 2, 'No trailing call without a new request');
search('fourth');
assert.deepEqual(calls.at(-1), ['fourth'], 'After a quiet window the next call runs at once');

console.log('Asset search checks passed: immediate first search and collapsed repeats.');
