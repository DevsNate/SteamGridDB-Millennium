import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const cache = new Map();
const settings = new Map([
  ['squares', true],
  ['uniform_featured', true],
  ['capsule_glow_amount', 25],
]);
const routes = new Map();
const classes = {
  libraryAssetImageClasses: { Container: 'image', PortraitImage: 'portrait' },
  gamepadLibraryClasses: { GamepadLibrary: 'bpm-library' },
  appportraitClasses: { InRecentGames: 'recents', HoversEnabled: 'hovers' },
  appgridClasses: { LibraryImageBackgroundGlow: 'glow' },
};
const patch = (object, key, handler) => {
  const original = object[key];
  object[key] = (...args) => handler(args, original(...args));
  return { unpatch: () => { object[key] = original; } };
};
const sdk = {
  EUIMode: { GamePad: 4 }, afterPatch: patch, replacePatch: patch,
  routerHook: {
    addPatch(path, callback, mode) {
      assert.equal(mode, 4, 'Library route patches must explicitly target BPM');
      assert.ok(!routes.has(path), 'Settings changes must not accumulate route patches');
      routes.set(path, callback);
      return callback;
    },
    removePatch(path, callback, mode) {
      assert.equal(mode, 4);
      if (routes.get(path) === callback) routes.delete(path);
    },
  },
};
const frames = new Map();
const replacements = [];
let frameId = 0;
const routeWindow = {
  closed: false,
  requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
  cancelAnimationFrame(id) { frames.delete(id); },
};
const history = {
  location: { pathname: '/library/home', search: '?test=1', state: { focus: 42 } },
  replace(location) { replacements.push(location); },
};
sdk.Router = { WindowStore: { GamepadUIMainWindowInstance: { BrowserWindow: routeWindow, History: history } } };

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = name => {
    if (['millennium', '@decky/ui', '@decky/api'].includes(name)) return sdk;
    if (name.endsWith('static-classes')) return classes;
    // Mirrors the settings store's synchronous read of the loaded plugin config.
    if (name === '../settings/store') return { readSetting: (key, fallback) => settings.has(key) ? settings.get(key) : fallback };
    const base = resolve(dirname(file), name);
    const target = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
    if (!target) throw Error(`Unexpected import ${name}`);
    return load(target);
  };
  vm.runInNewContext(source, {
    module, exports: module.exports, require, console,
    window: {},
  }, { filename: file });
  return module.exports;
}

function owner() {
  const nodes = new Map();
  return { closed: false, nodes, document: {
    head: { appendChild: node => nodes.set(node.id, node) },
    getElementById: id => nodes.get(id),
    createElement: () => ({ id: '', textContent: '', remove() { nodes.delete(this.id); } }),
  } };
}

const lifecycle = load(resolve(root, 'frontend/library/patches.ts'));
const styles = load(resolve(root, 'frontend/library/styles.ts'));
lifecycle.initializeLibraryPatches();
assert.equal(routes.size, 2);
// No route callback has rendered. Both square styles must already exist for a new window.
const first = owner();
styles.attachLibraryStyles(first);
assert.match(first.nodes.get('sgdb-square-capsules-home').textContent, /100%/);
assert.match(first.nodes.get('sgdb-square-capsules-library').textContent, /100%/);
assert.match(first.nodes.get('sgdb-capsule-glow').textContent, /opacity: 0.25/);
const home = load(resolve(root, 'src/patches/homePatch.tsx'));
const library = load(resolve(root, 'src/patches/squareLibraryPatch.tsx'));
home.addHomePatch(true, true, false);
library.addSquareLibraryPatch(true);
assert.equal(routes.size, 2);
first.closed = true;
const second = owner();
styles.attachLibraryStyles(second);
assert.equal(second.nodes.size, 3, 'Future BPM windows inherit saved CSS without a route render');
const scope = load(resolve(root, 'frontend/library/patch-scope.ts')).homePatchScope;
const target = { value: () => 1 };
scope.afterPatch(target, 'value', (_, value) => value + 1);
scope.afterPatch(target, 'value', (_, value) => value * 3);
assert.equal(target.value(), 6);
lifecycle.disposeLibraryPatches();
assert.equal(target.value(), 1, 'Nested patches restore in reverse order');
assert.equal(routes.size, 0);
assert.equal(second.nodes.size, 0);
settings.set('squares', false);
settings.set('uniform_featured', false);
settings.set('capsule_glow_amount', 100);
lifecycle.initializeLibraryPatches();
const third = owner();
styles.attachLibraryStyles(third);
assert.equal(routes.size, 0);
assert.equal(third.nodes.size, 1);
assert.match(third.nodes.get('sgdb-capsule-glow').textContent, /opacity: 1/);
lifecycle.disposeLibraryPatches();
const refresh = load(resolve(root, 'frontend/library/refresh.ts'));
refresh.refreshLibraryRoute();
refresh.refreshLibraryRoute();
assert.equal(frames.size, 1, 'Batch settings updates into one native refresh');
const flush = () => { const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback()); };
flush();
assert.equal(replacements.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(replacements[0])), history.location, 'Preserve path/query/focus state');
refresh.refreshLibraryRoute();
history.location.pathname = '/library/app/4115450';
flush();
assert.equal(replacements.length, 1, 'Do not pull the user back after navigation');
refresh.refreshLibraryRoute();
assert.equal(frames.size, 0, 'Game pages must not be refreshed');
history.location.pathname = '/library';
refresh.refreshLibraryRoute();
refresh.cancelLibraryRefresh();
assert.equal(frames.size, 0, 'Dismount cancels a scheduled refresh');
console.log('Library patch checks passed: synchronous saved CSS, future BPM owners, explicit route mode, repeated settings and nested cleanup.');
