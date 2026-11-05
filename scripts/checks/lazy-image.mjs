import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../../src/components/asset/LazyImage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// One LazyImage module, so several mounted tiles share its module-level video queue.
// The React hooks dispatch to whichever tile is rendering.
function loadModule() {
  const timers = [];
  let active;
  const hooks = {
    useState: (...args) => active.useState(...args),
    useRef: (...args) => active.useRef(...args),
    useCallback: (...args) => active.useCallback(...args),
    useEffect: (...args) => active.useEffect(...args),
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === '@decky/ui') return { IconsModule: { WiredNetworkWarning: 'warning' } };
      throw Error(name);
    },
    IntersectionObserver: class { constructor() { throw Error('SharedJSContext observer must not be used'); } },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: () => undefined,
  });
  return { timers, LazyImage: module.exports.LazyImage, activate: (tile) => { active = tile; } };
}

function mount(props = {}, shared = loadModule()) {
  const slots = [], effects = [], observers = [], resizes = new Set();
  const { timers } = shared;
  let index = 0, pending = [];
  const owner = {
    innerHeight: 800,
    IntersectionObserver: class {
      constructor(callback, options) { this.callback = callback; this.options = options; this.observing = false; observers.push(this); }
      observe(node) { this.node = node; this.observing = true; }
      unobserve() { this.observing = false; }
      disconnect() { this.observing = false; }
      emit(inside, ratio = 0.01) {
        if (this.observing) this.callback([{ target: this.node, isIntersecting: inside, intersectionRatio: ratio }], this);
      }
    },
    addEventListener(type, callback) { assert.equal(type, 'resize'); resizes.add(callback); },
    removeEventListener(type, callback) { resizes.delete(callback); },
  };
  const node = { ownerDocument: { defaultView: owner } };
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const tile = {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { index++; return callback; },
    useEffect(callback, deps) {
      const i = index++;
      if (!same(effects[i]?.deps, deps)) pending.push(() => {
        effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: callback() };
      });
    },
  };
  let current = { src: 'first.png', unloadWhenOutside: true, marginOffset: '100px', ...props };
  const render = extra => {
    current = { ...current, ...extra }; index = 0; pending = [];
    shared.activate(tile);
    const tree = shared.LazyImage(current);
    tree.props.ref.current = node;
    pending.forEach(effect => effect());
    return tree;
  };
  render();
  return { owner, observers, slots, resizes, timers, render,
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

const staticImage = mount({ scrollContainer: { clientHeight: 600 } });
const first = staticImage.observers[0];
assert.equal(first.options.threshold, 0);
assert.equal(first.options.rootMargin, '2400px 0px');
first.emit(true, 0.01);
assert.equal(staticImage.slots[0], true, 'Load on the first pixel, not half a tile');
assert.equal(first.observing, false, 'Static image needs no further visibility tracking');
first.emit(false);
assert.equal(staticImage.slots[0], true, 'Static images stay mounted outside the view');
const tree = staticImage.render();
const media = tree.props.children[1].props.children[1];
const listeners = new Map();
media.props.ref({ complete: true, naturalWidth: 300, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) });
assert.equal(staticImage.slots[1], false, 'Already-cached media must finish the fade state');
media.props.ref(null);
assert.equal(listeners.size, 0, 'Detach all media listeners on ref removal');
staticImage.render({ src: 'second.png' });
assert.equal(staticImage.slots[0], false);
assert.equal(staticImage.slots[1], true, 'A new source starts its own load');
staticImage.unmount();
assert.equal(staticImage.resizes.size, 0);

const video = mount({ isVideo: true });
let observer = video.observers[0];
assert.deepEqual(Array.from(observer.options.threshold), [0.5, 0]);
assert.equal(observer.options.rootMargin, '100px 0px', 'Video keeps upstream\'s margin instead of a viewport lookahead');
observer.emit(true, 0.01);
assert.equal(video.slots[0], false, 'Video waits until half the tile is in range');
observer.emit(true, 0.5);
assert.equal(video.slots[0], true, 'Video starts once half the tile is in range');
assert.equal(observer.observing, true, 'Keep video visibility tracking');
assert.equal(video.render().props.children[2], false, 'Video waits for a start slot');
const videoTree = video.render();
const videoElement = videoTree.props.children[2];
const videoListeners = new Map();
videoElement.props.ref({ play: () => Promise.resolve(), addEventListener: (name, fn) => videoListeners.set(name, fn), removeEventListener: name => videoListeners.delete(name) });
videoListeners.get('canplaythrough')();
observer.emit(false, 0);
assert.equal(video.slots[0], false, 'Unload video outside the preload region');
assert.equal(video.slots[1], true);
observer.emit(true, 0.5);
assert.equal(video.slots[0], true, 'Video remounts on return');
observer.emit(true, 0.01);
assert.equal(video.slots[0], true, 'A partly visible video keeps playing');
video.owner.innerHeight = 1000;
video.resizes.forEach(callback => callback());
observer = video.observers.at(-1);
assert.equal(observer.options.rootMargin, '100px 0px');
videoElement.props.ref(null);
video.unmount();
assert.equal(videoListeners.size, 0);
assert.equal(video.resizes.size, 0);

const flaky = mount();
flaky.observers[0].emit(true);
const mediaOf = () => flaky.render().props.children[1].props.children[1];
const fail = () => {
  const handlers = new Map();
  mediaOf().props.ref({ addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) });
  handlers.get('error')();
};
fail();
assert.equal(flaky.slots[2], false, 'First failure retries instead of showing the warning');
assert.equal(flaky.timers[0].delay, 1000);
flaky.timers[0].callback();
assert.equal(flaky.slots[5], 1, 'Retry changes the media key');
fail();
assert.equal(flaky.slots[2], false, 'Second failure retries too');
assert.equal(flaky.timers[1].delay, 2000);
flaky.timers[1].callback();
assert.equal(flaky.slots[5], 2);
fail();
assert.equal(flaky.slots[2], true, 'Warning appears once the retries run out');
assert.equal(flaky.timers.length, 2);
flaky.unmount();
// Three animated tiles become visible at once: two start, the third waits until one has played its first frame.
const shared = loadModule();
const tiles = ['a', 'b', 'c'].map((name) => mount({ isVideo: true, src: `${name}.webm` }, shared));
const videoOf = (tile) => tile.render().props.children[2];
tiles.forEach((tile) => { tile.observers[0].emit(true, 0.5); tile.render(); });
assert.notEqual(videoOf(tiles[0]), false, 'First video starts');
assert.notEqual(videoOf(tiles[1]), false, 'Second video starts');
assert.equal(videoOf(tiles[2]), false, 'Third video waits for a free start slot');
const started = new Map();
videoOf(tiles[0]).props.ref({ play: () => Promise.resolve(), addEventListener: (name, fn) => started.set(name, fn), removeEventListener: (name) => started.delete(name) });
started.get('canplay')();
tiles[2].render();
assert.notEqual(videoOf(tiles[2]), false, 'A finished first seek frees its slot');
tiles[1].observers[0].emit(false, 0); // Scrolled away before starting: releases its slot too.
tiles[1].render();
const fourth = mount({ isVideo: true, src: 'd.webm' }, shared);
fourth.observers[0].emit(true, 0.5); fourth.render();
assert.notEqual(videoOf(fourth), false, 'A tile leaving the view frees its slot');
const stuck = shared.timers.filter((t) => t.delay === 3000);
assert.ok(stuck.length > 0, 'Every started video gets a timeout');
[...tiles, fourth].forEach((tile) => tile.unmount());

console.log('Lazy image checks passed: owner observer, pixel threshold, image lookahead, upstream video range, static retention, cache readiness, video unloading, two-at-a-time video starts, failed media retry, source reset and cleanup.');
