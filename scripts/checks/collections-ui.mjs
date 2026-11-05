// The Collections store and views together: the real modules, with fake Steam, API and React.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = name => {
    if (name.endsWith('collections/nav') || name === './nav') return { keepColumn: { navEntryPreferPosition: 2 } };
    assert.ok(name in imports, `Unexpected import in ${path}: ${name}`);
    return imports[name];
  };
  vm.runInNewContext(source, { exports, require, Error, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

// A minimal React: enough to render a component function and call its handlers.
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx };
let slots = [], index = 0, effects = [];
const react = {
  useState(initial) {
    const slot = slots[index++] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, value => { slot.value = typeof value === 'function' ? value(slot.value) : value; }];
  },
  useMemo: compute => compute(),
  useEffect(effect, deps) {
    const slot = slots[index++] ??= {};
    if (slot.deps && deps && deps.every((value, at) => value === slot.deps[at])) return;
    slot.deps = deps;
    effects.push(() => { slot.cleanup = effect(); });
  },
  useRef: initial => (slots[index++] ??= { current: initial }),
};
function render(component) {
  index = 0;
  const tree = component();
  effects.splice(0).forEach(effect => effect());
  return tree;
}
function unmount() {
  slots.forEach(slot => slot.cleanup?.());
  slots = [];
}
function all(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => all(child, predicate));
  if (!node || typeof node !== 'object') return [];
  // Resolve this file's own helper components, so the tree shows what they render.
  if (typeof node.type === 'function') return all(node.type(node.props), predicate);
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
}
const textOf = node => {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') {
    return textOf(typeof node.type === 'function' ? node.type(node.props) : node.props?.children);
  }
  return node === null || node === undefined || node === false ? '' : String(node);
};
const ofType = (tree, type) => all(tree, node => node.type === type);
const button = (tree, label) => {
  const found = all(tree, node => node.type === 'DialogButton' && textOf(node) === label)[0];
  assert.ok(found, `Missing button: ${label}`);
  return found;
};
const native = Object.fromEntries([
  'DialogBody', 'DialogBodyText', 'DialogButton', 'DialogCheckbox', 'DialogFooter', 'DialogHeader', 'Dropdown',
  'Field', 'Focusable', 'IconsModule', 'Menu', 'MenuItem', 'ModalRoot', 'ProgressBar', 'SliderField', 'Spinner', 'TextField', 'ToggleField',
].map(name => [name, name]));

// Fixtures ----------------------------------------------------------------------------------------
const art = (id, game, type, kind = type) => ({
  id,
  kind,
  game: { id: game, name: `Game ${game}` },
  width: kind === 'grid' ? 600 : 1920,
  height: kind === 'grid' ? 900 : 620,
  url: `https://cdn.test/${id}.png`,
  thumb: `https://cdn.test/${id}.jpg`,
});
const catalog = [art(1, 1, 'grid', 'grid'), art(11, 1, 'grid', 'grid'), art(2, 2, 'grid', 'grid'), art(3, 1, 'hero'), art(4, 3, 'logo')];
const info = { id: 7, name: 'Fixture', counts: { grid: 3, hero: 1, logo: 1, icon: 0 } };
const firstAccount = '76561198000000001';
let account = firstAccount;
let custom = {}, scanFailure = false, failing = new Set(), hold;
const writes = [], toasts = [], settings = new Map(), savedCopies = new Map();
const apps = new Map([10, 20, 40].map(appid => [appid, {
  appid, display_name: `Library ${appid}`, BIsOwned: () => true, BIsShortcut: () => false,
}]));
const remembered = [];
// What the disk says each game shows, which is all that carries over a restart.
let shownArtwork = {};
const backend = {
  rememberArtwork: async (appid, type, id, collection) => {
    remembered.push([appid, type, id, collection].join(':'));
    shownArtwork = { ...shownArtwork, [appid]: { ...shownArtwork[appid], [type]: { id, collection } } };
  },
  currentSteamId: () => account,
  loadCollections: async () => [{ id: 7, name: info.name }],
  loadPublicCollection: async () => info,
  loadCollectionAssets: async (_id, type) => {
    const assets = catalog.filter(asset => asset.kind === type);
    return { assets, total: assets.length };
  },
  loadCustomArtwork: async () => {
    if (scanFailure) throw Error('Scan failed');
    return { custom: { ...custom }, applied: shownArtwork };
  },
  parseResponse: value => value.data,
  loadGameLinks: async () => ({}),
  saveGameLinks: async () => true,
  loadSavedCollection: async id => savedCopies.get(id) ?? null,
  saveCollectionFile: async (id, contents) => { savedCopies.set(id, JSON.parse(contents)); return true; },
  deleteSavedCollection: async id => { savedCopies.delete(id); return true; },
  isCollectionInfo: value => Boolean(value?.counts),
  isCollectionAsset: value => Boolean(value?.url),
  // Game 1 owns app 10 and game 2 owns app 20. Game 3 links to an app the user doesn't have.
  sgdbRequest: async ({ path }) => {
    const id = Number(/id\/(\d+)/.exec(path)[1]);
    return { data: { external_platform_data: { steam: [{ id: String(id * 10) }] } } };
  },
};
const settingsStore = {
  readSetting: (key, fallback) => (settings.has(key) ? settings.get(key) : fallback),
  writeSetting: async (key, value) => { settings.set(key, value); },
};
const windowFake = { appStore: { allApps: [...apps.values()], GetAppOverviewByAppID: id => apps.get(id) } };
const names = { grid_p: 'Capsule', grid_l: 'Wide Capsule', hero: 'Hero', logo: 'Logo', icon: 'Icon' };

const draft = load('frontend/collections/draft.ts', {});
const library = load('frontend/collections/library.ts', {
  '../services/backend': backend, '../settings/store': settingsStore,
}, { window: windowFake });
const collections = load('frontend/collections/load.ts', { '../services/backend': backend });
const text = load('frontend/collections/text.ts', { '../../src/constants': { SGDB_ASSET_TYPE_READABLE: names } });
const store = load('frontend/collections/store.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/api': { toaster: { toast: toast => toasts.push(toast) } },
  '../../src/components/Icons/MenuIcon': { default: 'MenuIcon' },
  '../../src/hooks/useSGDB': {
    artworkWriter: (appid, app) => ({
      changeAssetFromUrl: async (url, type) => {
        assert.equal(app.appid, appid);
        await hold;
        if (failing.has(url)) throw Error('Download failed');
        writes.push(`${appid}:${type}:${url.match(/(\d+)\.png/)[1]}`);
      },
    }),
  },
  '../services/backend': backend,
  '../settings/store': settingsStore,
  './draft': draft,
  './load': collections,
  './library': library,
  './run': load('frontend/collections/run.ts', {}),
  './text': text,
});
// Reads the store through its own hook slots, so it can run in the middle of rendering a view.
const storeSlots = [];
const current = () => {
  const outerSlots = slots, outerIndex = index;
  slots = storeSlots;
  const value = render(() => store.useCollections());
  slots = outerSlots;
  index = outerIndex;
  return value;
};
const statusOf = () => {
  const entries = draft.buildRows(current().draft).map(row => [row.key, row.status]);
  return Object.fromEntries(entries);
};

// Browse and open ---------------------------------------------------------------------------------
await store.loadList();
assert.equal(current().list.items.length, 1);

// Added collections are saved, stay listed, and can be removed.
const listedIds = () => store.myCollections(current()).map(item => item.id).join();
assert.equal(listedIds(), '7');
await store.addCollection(8);
assert.equal(listedIds(), '8,7', 'A new collection comes first');
assert.equal(settings.get(`added_collections_${firstAccount}`).length, 1);
await store.addCollection(8);
await store.addCollection(7);
assert.equal(listedIds(), '8,7', 'Nothing is listed twice');
const addedOwn = settings.get(`added_collections_${firstAccount}`);
settings.set(`added_collections_${firstAccount}`, [...addedOwn, { id: 7, name: 'Also mine' }, 'junk', { id: -1, name: 'Bad' }]);
assert.equal(listedIds(), '8,7', 'Damaged entries are ignored, and an owned one is only listed once');
settings.set(`added_collections_${firstAccount}`, addedOwn);
const realPublic = backend.loadPublicCollection;
backend.loadPublicCollection = async () => { throw Error('Collection not found'); };
await assert.rejects(store.addCollection(9), /not found/);
assert.equal(listedIds(), '8,7', 'A collection that fails to load is never saved');

// The list view and its dialog.
let shownDialog;
const listView = load('frontend/collections/list-view.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': { ...native, showModal: element => { shownDialog = element; } },
  './collection-card': { CollectionCard: 'CollectionCard' },
  './load': collections,
  './page-parts': {
    PageBar: 'PageBar', PageSpinner: 'PageSpinner', PageToolbar: 'PageToolbar',
    useGridSize: () => [1, () => {}, {}], useInitialFocus: () => false,
  },
  './store': store,
}, { window: {} });
let listPage = render(() => listView.ListView({ state: current(), opened: false }));
assert.deepEqual(ofType(listPage, 'CollectionCard').map(card => card.props.collection.id).join(), '8,7');
assert.equal(typeof ofType(listPage, 'CollectionCard')[0].props.onRemove, 'function', 'An added collection can be removed');
assert.equal(ofType(listPage, 'CollectionCard')[1].props.onRemove, undefined, 'Your own can not');
assert.match(textOf(listPage), /My Collections/);
button(listPage, 'Add Collection').props.onClick();
unmount();
let dialogClosed = 0;
const dialogTree = () => render(() => shownDialog.type({ closeModal: () => { dialogClosed++; } }));
let addDialog = dialogTree();
assert.equal(textOf(ofType(addDialog, 'DialogHeader')), 'Add a Collection');
assert.equal(button(addDialog, 'Add Collection').props.disabled, true, 'Needs a link first');
ofType(addDialog, 'TextField')[0].props.onChange({ target: { value: 'https://evil.test/collection/1' } });
addDialog = dialogTree();
await button(addDialog, 'Add Collection').props.onClick();
addDialog = dialogTree();
assert.match(textOf(addDialog), /Enter a SteamGridDB collection/, 'A wrong link explains itself');
assert.equal(dialogClosed, 0);
ofType(addDialog, 'TextField')[0].props.onChange({ target: { value: '9' } });
addDialog = dialogTree();
await button(addDialog, 'Add Collection').props.onClick();
addDialog = dialogTree();
assert.match(textOf(addDialog), /not found/, 'And so does a failed load');
assert.equal(button(addDialog, 'Add Collection').props.disabled, false, 'It can be tried again');
backend.loadPublicCollection = realPublic;
await button(addDialog, 'Add Collection').props.onClick();
assert.equal(dialogClosed, 1, 'Adding closes the dialog');
assert.equal(listedIds(), '9,8,7');
unmount();
savedCopies.set(9, {});
await store.removeCollection(9);
assert.equal(savedCopies.has(9), false, 'Removing also deletes the saved copy');
await store.removeCollection(8);
assert.equal(listedIds(), '7');
assert.equal(settings.get(`added_collections_${firstAccount}`).length, 0);

// The saved copy: a collection opens from it, and updates behind it.
await store.openCollection(7);
await settle();
const firstCopy = savedCopies.get(7);
assert.equal(firstCopy.assets.length, catalog.length, 'A full read is saved');
const artIds = () => current().draft.assets.map(asset => asset.id).join();
const reopen = async copy => {
  store.closeCollection();
  savedCopies.set(7, copy);
  const opening = store.openCollection(7);
  await opening;
  return current();
};
await settle();
const shortCopy = { ...firstCopy, savedAt: Date.now(), assets: firstCopy.assets.slice(0, 2) };
let opened = await reopen(shortCopy);
assert.equal(opened.complete, true, 'Opening from the copy is ready straight away');
assert.equal(artIds(), '1,11', 'It shows the copy');
await settle();
assert.equal(artIds(), '1,11', 'Same counts and recent: the pages are not read again');
const countInfo = backend.loadPublicCollection;
let infoReads = 0;
backend.loadPublicCollection = async (...args) => { infoReads++; return countInfo(...args); };
await reopen(shortCopy);
await settle();
assert.equal(infoReads, 1, 'Every open asks SteamGridDB again, even within one session');
await reopen(shortCopy);
await settle();
assert.equal(infoReads, 2);
backend.loadPublicCollection = countInfo;
store.closeCollection();
const changedCopy = { ...shortCopy, info: { ...info, counts: { ...info.counts, grid: 2 } } };
savedCopies.set(7, changedCopy);
await store.openCollection(7);
assert.equal(artIds(), '1,11');
store.setPick('1:grid_p', { action: 'use', artworkId: 11 });
await settle();
await settle();
assert.equal(artIds(), catalog.map(asset => asset.id).join(), 'Changed counts: the update appears by itself');
assert.equal(current().draft.picks['1:grid_p'].artworkId, 11, 'And your choices stay');
assert.equal(savedCopies.get(7).assets.length, catalog.length, 'The copy is updated too');
store.closeCollection();
savedCopies.set(7, { ...shortCopy, assets: [...shortCopy.assets, { ...shortCopy.assets[0], id: 99 }], info: changedCopy.info });
await store.openCollection(7);
store.setPick('1:grid_p', { action: 'use', artworkId: 99 });
await settle();
await settle();
assert.equal(current().draft.picks['1:grid_p'], undefined, 'A choice whose artwork is gone is dropped');
store.closeCollection();
savedCopies.set(7, changedCopy);
const workingPages = backend.loadCollectionAssets;
collections.clearCollectionCache();
backend.loadCollectionAssets = async () => { throw Error('Offline'); };
await store.openCollection(7);
await settle();
await settle();
assert.equal(artIds(), '1,11', 'Offline, the copy stays');
assert.equal(current().loadError, '');
backend.loadCollectionAssets = workingPages;
store.closeCollection();
collections.clearCollectionCache();
const workingLibrary = windowFake.appStore.allApps;
windowFake.appStore.allApps = undefined;
await store.openCollection(7);
await settle();
assert.match(current().loadError, /Could not check your library: Steam library search is unavailable/, 'A broken library lookup says so instead of checking for good');
windowFake.appStore.allApps = workingLibrary;
store.closeCollection();
collections.clearCollectionCache();
savedCopies.clear();
await settle();

await store.openCollection(7);
await settle();
let state = current();
assert.equal(state.view, 'overview');
assert.equal(state.complete, true);
assert.equal(state.draft.assets.length, 5);
assert.equal(state.draft.matches.get(3).status, 'not-owned');
assert.equal(writes.length, 0, 'Opening never writes');
const sheetHero = store.rowsForGame(current().draft, 1).find(row => row.type === 'hero');
assert.equal(sheetHero.status, 'ready', 'Game sheets know the custom-artwork status without a review');

// Review ------------------------------------------------------------------------------------------
custom = { 20: ['grid_p'] };
store.startReview(null, 'Apply to My Library');
assert.equal(current().draft.custom, undefined, 'A review always scans again');
await settle();
assert.deepEqual(JSON.parse(JSON.stringify(statusOf())), {
  '1:grid_p': 'needs-choice', '1:hero': 'ready', '2:grid_p': 'keep-custom', '3:logo': 'no-target',
});
assert.equal(current().draft.replace, false, 'Replacing starts off');
store.setReplace(true);
assert.equal(statusOf()['2:grid_p'], 'ready');
store.setReplace(false);

store.setPick('2:grid_p', { action: 'use', artworkId: 2 });
assert.equal(statusOf()['2:grid_p'], 'ready', 'Picking overrides protection for that row only');
store.setPick('2:grid_p', { action: 'leave' });
assert.equal(statusOf()['2:grid_p'], 'leave');
store.startReview(new Set([1]), 'Apply This Game');
await settle();
assert.deepEqual(Object.keys(statusOf()), ['1:grid_p', '1:hero'], 'A game review only has that game');
store.startReview(null, 'Apply to My Library');
await settle();
assert.equal(statusOf()['2:grid_p'], 'leave', 'Picks survive between reviews');
store.setReplace(true);
store.startReview(null, 'Apply to My Library');
await settle();
assert.equal(current().draft.replace, true, 'And so does replacing');
store.closeCollection();
await store.openCollection(7);
await settle();
store.startReview(null, 'Apply to My Library');
await settle();
assert.equal(statusOf()['2:grid_p'], 'leave', 'Leaving the collection and coming back keeps the picks');
assert.equal(current().draft.replace, true, 'And replacing');
store.setReplace(false);

store.excludeGame(3);
assert.equal(statusOf()['3:logo'], undefined, 'Excluding removes the game from this review');
assert.equal(current().reviewTitle, 'Apply 2 Games', 'And the title follows what is left');
store.includeGame(3);
assert.notEqual(statusOf()['3:logo'], undefined, 'An excluded game can come back');
assert.equal(current().reviewTitle, 'Apply to My Library', 'With every game back, so does the title');
assert.equal(current().excluded.size, 0);
store.excludeGame(3);

store.pickFirstForRest(draft.buildRows(current().draft));
assert.equal(statusOf()['1:grid_p'], 'ready', 'Use first resolves the waiting choices');
store.setPick('1:grid_p', { action: 'use', artworkId: 11 });

// Applying ----------------------------------------------------------------------------------------
failing = new Set(['https://cdn.test/3.png']);
await store.applyDraft();
assert.deepEqual(writes, ['10:grid_p:11'], 'Only runnable rows run, with the chosen artwork');
assert.deepEqual(remembered.join(), '10:grid_p:11:true', 'And what was applied is remembered, as coming from a collection');
assert.equal(statusOf()['1:grid_p'], 'applied');
assert.equal(statusOf()['1:hero'], 'failed');
assert.match(toasts.at(-1).body, /1 artwork applied · 1 failed/);
assert.equal(current().run, null);

failing = new Set();
await store.applyDraft();
assert.deepEqual(writes, ['10:grid_p:11', '10:hero:3'], 'Applying again retries the failure and replays nothing');

// What was applied is custom artwork by the next scan, and has to stay Applied.
store.closeCollection();
custom = { 10: ['grid_p', 'hero'] };
await store.openCollection(7);
await settle();
store.startReview(null, 'Apply to My Library');
await settle();
assert.equal(statusOf()['1:hero'], 'applied', 'Leaving the collection and coming back keeps what was applied');
assert.equal(statusOf()['1:grid_p'], 'applied');
assert.equal(current().excluded.size, 0, 'A new review starts with nothing excluded');
custom = {};
store.excludeGame(3);
await settle();

store.setPick('1:grid_p', { action: 'use', artworkId: 1 });
assert.equal(statusOf()['1:grid_p'], 'ready', 'Editing a row clears its result');
store.setPick('1:grid_p', { action: 'leave' });

// A failed scan writes nothing.
store.setPick('2:grid_p', { action: 'use', artworkId: 2 });
scanFailure = true;
const before = writes.length;
await store.applyDraft();
assert.equal(writes.length, before);
assert.match(current().scanError, /Scan failed/);
assert.equal(current().error, '', 'Said once, so Retry leaves nothing behind');
scanFailure = false;
store.retryScan();
await settle();
assert.equal(current().scanError, '');

// Custom artwork added after the review opened is protected, unless the row was explicitly picked.
shownArtwork = {};
await store.openCollection(7);
await settle();
store.startReview(new Set([1, 2]), 'Apply Selected Games');
await settle();
store.setPick('1:grid_p', { action: 'leave' });
store.setPick('2:grid_p', { action: 'use', artworkId: 2 });
assert.equal(statusOf()['1:hero'], 'ready');
custom = { 10: ['hero'], 20: ['grid_p'] };
writes.length = 0;
await store.applyDraft();
assert.deepEqual(writes, ['20:grid_p:2']);
assert.equal(statusOf()['1:hero'], 'keep-custom');
custom = {};
writes.length = 0;

// The batch keeps going when the tab unmounts, and cancel stops the remainder.
let release;
hold = new Promise(resolve => { release = resolve; });
store.setPick('1:hero', { action: 'use', artworkId: 3 });
store.startReview(new Set([1]), 'Apply This Game');
await settle();
const running = store.applyDraft();
await settle();
assert.equal(current().run?.total, 1);
unmount();
store.cancelRun();
assert.equal(current().run.stopping, true);
store.closeCollection();
assert.equal(current().view, 'overview', 'The collection can\'t close under a running batch');
release();
hold = undefined;
await running;
assert.deepEqual(writes, ['10:hero:3'], 'The game already in progress finishes');
assert.equal(current().run, null);

// One artwork from Details ------------------------------------------------------------------------
writes.length = 0;
const hero = current().draft.assets.find(asset => asset.id === 3);
await store.applyNow(1, hero);
assert.deepEqual(writes, ['10:hero:3']);
assert.equal(statusOf()['1:hero'], 'applied', 'The draft records what Details applied');
failing = new Set(['https://cdn.test/3.png']);
const toastCount = toasts.length;
await store.applyNow(1, hero);
assert.equal(toasts.length, toastCount + 1, 'Details gets its failure as a toast, so its spinner always stops');
assert.match(toasts.at(-1).body, /Download failed/);
failing = new Set();

// Picking artwork for one of two games aimed at one library game settles it.
store.startReview(null, 'Apply to My Library');
await settle();
store.setPick('1:grid_p', { action: 'use', artworkId: 1 });
await store.chooseMatch(2, 10);
await settle();
assert.equal(statusOf()['1:grid_p'], 'collision');
assert.equal(statusOf()['2:grid_p'], 'collision');
store.setPick('2:grid_p', { action: 'use', artworkId: 2 });
assert.equal(statusOf()['2:grid_p'], 'ready', 'The one picked goes ahead');
assert.equal(statusOf()['1:grid_p'], 'leave', 'And the other is left unchanged');
store.setPick('1:grid_p', { action: 'use', artworkId: 1 });
assert.equal(statusOf()['2:grid_p'], 'collision', 'Picking the other side brings the question back, as they would both write again');
store.setPick('1:grid_p', { action: 'leave' });
await store.chooseMatch(2, null);
await settle();

// Saving a match never writes, and clears that game's old results.
writes.length = 0;
await store.chooseMatch(1, 40);
assert.equal(writes.length, 0);
assert.equal(current().draft.matches.get(1).appid, 40);
await settle();
assert.notEqual(statusOf()['1:hero'], 'applied');
await store.chooseMatch(1, null);
assert.equal(current().draft.matches.get(1).appid, 10);

// The review page ---------------------------------------------------------------------------------
const uiModals = [];
const decky = { ...native, showModal: tree => uiModals.push(tree), showContextMenu: tree => uiModals.push(tree) };
const review = load('frontend/collections/review-view.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': decky,
  '../../src/components/AdaptiveNavGlyph': { default: 'AdaptiveNavGlyph' },
  '../../src/components/asset/Asset': { default: 'Asset' },
  './collection-card': { isVideoUrl: () => false },
  './draft': draft,
  './page-parts': { PageBar: 'PageBar', PageToolbar: 'PageToolbar', useGridSize: () => [9, () => {}, {}] },
  './store': store,
  './text': text,
});
unmount();
const renderReview = () => render(() => review.ReviewView({ state: current() }));
shownArtwork = {};
scanFailure = true;
store.openReview(null, 'Apply to My Library');
await settle();
const scanFailed = renderReview();
assert.match(textOf(scanFailed), /Could not check your existing artwork/, 'A failed scan says so');
assert.doesNotMatch(textOf(scanFailed), /Checking/, 'And nothing still claims to be checking');
assert.equal(all(scanFailed, node => node.props?.disabled === true).length, 1, 'Apply stays off');
scanFailure = false;
unmount();
store.openReview(null, 'Apply to My Library');
assert.equal(current().view, 'review', 'Applying opens the review page');
const scanning = renderReview();
assert.equal(button(scanning, 'Checking…').props.disabled, true, 'Apply waits for the scan');
assert.doesNotMatch(textOf(scanning), /To Apply|Not in Your Library/, 'Nothing is listed before it is known');
const focusWait = () => new Promise(resolve => setTimeout(resolve, 70));
const tookFocus = [];
const watchFocus = (node, name) => { node.props.navRef.current = { TakeFocus: () => tookFocus.push(name) }; };
await settle();
custom = {};
store.setPick('1:grid_p', { action: 'leave' });
store.setPick('1:hero', { action: 'use', artworkId: 3 });
store.setPick('2:grid_p', { action: 'leave' });
unmount();
let page = renderReview();
assert.equal(button(page, 'Apply Artwork (1)').props.disabled, false, 'The button names what will happen');
watchFocus(button(page, 'Apply Artwork (1)'), 'apply');
await focusWait();
assert.deepEqual(tookFocus.splice(0).join(), 'apply', 'With nothing left to choose, focus goes to Apply');
assert.equal(all(page, node => node.props?.['flow-children'] === 'column').length > 0, true, 'The page moves as one column');
assert.match(textOf(page), /To Apply \(1 artwork\)/);
assert.doesNotMatch(textOf(page), /Game 3/, 'Games that change nothing start out of the way');
assert.equal(ofType(page, 'ToggleField').length, 0, 'The replace option only shows when custom artwork is involved');
assert.match(textOf(page), /To Apply \(1 artwork\) · Hero/, 'What every game shares is said once, on the heading');
assert.doesNotMatch(textOf(page), /Ready to apply/, 'And the section name already says this');
assert.equal(ofType(page, 'Focusable').some(node => node.props.className === 'sgdb-collection-exclude'), false, 'The hint is not a stop for left and right');
assert.equal(all(page, node => node.props?.className === 'sgdb-collection-tile-text').length, 0);
assert.equal(ofType(page, 'PageToolbar')[0].props.type, 'grid_p', 'The size slider comes with the tiles');
assert.equal(ofType(page, 'AdaptiveNavGlyph')[0].props.button, 3, 'A tile shows Y for Exclude, for a hidden footer');
const reviewTile = ofType(page, 'Asset')[0];
assert.equal(reviewTile.props.onOptionsActionDescription, 'Exclude');
reviewTile.props.onActivate();
assert.equal(current().view, 'game', 'A listed game opens on its page');
assert.equal(current().fromReview, true);
store.closeGame();
assert.equal(current().view, 'review', 'And comes back to the review');
assert.equal(current().reviewGame, 1);
unmount();
page = renderReview();
assert.equal(ofType(page, 'Asset')[0].props.autoFocus, true, 'With focus on that game');
watchFocus(button(page, 'Apply Artwork (1)'), 'apply');
await focusWait();
assert.equal(tookFocus.length, 0, 'And Apply leaves it there');
reviewTile.props.onOptionsButton();
assert.equal(statusOf()['1:hero'], undefined, 'Y excludes the game');
unmount();
const excludedPage = renderReview();
assert.match(textOf(excludedPage), /Excluded \(/, 'It moves to its own section');
const excludedTile = ofType(excludedPage, 'Asset').at(-1);
assert.equal(excludedTile.props.onOptionsActionDescription, 'Include');
excludedTile.props.onOptionsButton();
assert.equal(statusOf()['1:hero'], 'ready', 'Y there brings it back, as it was');
store.excludeGame(1);
unmount();
all(page, node => node.props?.className === 'sgdb-collection-exclude')[0].props.onClick();
store.openReview(null, 'Apply to My Library');
await settle();
custom = { 10: ['hero'] };
store.startReview(null, 'Apply to My Library');
await settle();
unmount();
assert.equal(ofType(renderReview(), 'ToggleField').length, 1);
custom = {};
store.startReview(null, 'Apply to My Library');
await settle();
store.unselect(store.rowsForGame(current().draft, 1).find(row => row.type === 'grid_p'));
unmount();
const choosing = renderReview();
const heading = all(choosing, node => node.props?.className === 'sgdb-collection-section-head').find(node => /Needs a Choice/.test(textOf(node)));
watchFocus(button(heading, 'Choose'), 'choose');
await focusWait();
assert.equal(tookFocus.splice(0).join(), 'choose', 'Choose sits on the heading of what it resolves, and goes first');
assert.doesNotMatch(textOf(choosing), /your choice/, 'And the count is only said once');
assert.equal(textOf(choosing).match(/to exclude a game/g)?.length, 1, 'Excluding is explained once');
assert.doesNotMatch(textOf(heading), /to exclude a game/, 'In its own bar, above the sections');
unmount();
custom = { 10: ['grid_p'] };
store.startReview(null, 'Apply to My Library');
await settle();
const replaceOption = ofType(renderReview(), 'ToggleField')[0];
assert.equal(all(renderReview(), node => node.type === 'DialogButton' && textOf(node) === 'Choose').length, 0, 'Protected artwork needs no choice yet');
replaceOption.props.onChange(true);
watchFocus(button(renderReview(), 'Choose'), 'choose');
await focusWait();
assert.equal(tookFocus.length, 0, 'Turning on replacing leaves focus on the option');
custom = {};
store.setPick('1:grid_p', { action: 'leave' });
store.startReview(null, 'Apply to My Library');
await settle();
unmount();

// A game returned to gets focus wherever its row ended up.
store.setPick('1:hero', { action: 'leave' });
store.openGame(1, true);
store.closeGame();
unmount();
const returned = renderReview();
assert.match(textOf(returned), /Not Changing/);
assert.equal(ofType(returned, 'Asset').some(node => node.props.autoFocus), true, 'A closed section opens for the game returned to');
store.unselect(store.rowsForGame(current().draft, 1).find(row => row.type === 'hero'));
store.startReview(null, 'Apply to My Library');
await settle();
unmount();

// Steam moves focus on from an element that goes away only under an ancestor that asks for it. This covers
// Exclude, Show More, Retry, filtering and anything added later.
const sgdbPage = readFileSync(new URL('../../src/components/plugin-pages/SGDBPage.tsx', import.meta.url), 'utf8');
assert.match(sgdbPage, /focusableIfEmpty: true/);
assert.match(sgdbPage, /<Focusable id="sgdb-wrap" \{\.\.\.keepFocus\}>/, 'Above the tabs, so it outlasts every page');

// The tab bar follows the flow ---------------------------------------------------------------------
const flowModule = load('frontend/collections/flow-tabs.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  './collections-tab': { CollectionsTab: 'CollectionsTab' },
  './draft': draft,
  './store': store,
});
const flowTabs = (onCollections = true) => render(() => flowModule.useFlowTabs(onCollections));
const ids = bar => bar.tabs.map(value => value.id).join();
store.unselect(store.rowsForGame(current().draft, 1).find(row => row.type === 'grid_p'));
let bar = flowTabs();
assert.equal(ids(bar), 'collections,review,choose', 'The review shows the steps');
assert.equal(bar.activeTab, 'review');
const stepCanTakeFocus = id => bar.tabs.find(value => value.id === id).footer?.fnCanTakeFocus?.() ?? true;
assert.equal(stepCanTakeFocus('review'), true, 'The current step can have focus');
assert.equal(stepCanTakeFocus('collections'), false, 'Another step can not, because Steam would open it');
assert.equal(stepCanTakeFocus('choose'), false);
assert.equal(bar.wrapAround, false, 'Past the last step is not the first one');
assert.equal(bar.tabs[1].content.props.page, 'review', 'Each step keeps its own page while sliding out');
assert.equal(flowTabs(false), null, 'Only on the Collections tab, so another tab stays as it is');
store.setPick('1:grid_p', { action: 'leave' });
assert.equal(ids(flowTabs()), 'collections,review', 'Nothing to choose: no Choose step');
store.unselect(store.rowsForGame(current().draft, 1).find(row => row.type === 'grid_p'));
bar = flowTabs();
bar.onShowTab('choose');
assert.equal(current().view, 'choose', 'RB moves to the next step');
bar = flowTabs();
assert.equal(bar.tabs.map(value => value.title).join(), 'Game 1', 'Choosing shows one tab for each game');
assert.equal(bar.tabs[0].bTitleAlreadyLocalized, true, 'A game name is not a localization token');
assert.equal(bar.tabs[0].footer, undefined, 'Moving along the games is safe');
assert.equal(bar.wrapAround, true, 'And they go around');
assert.equal(bar.activeTab, 'choice:1:grid_p');
assert.equal(bar.tabs[0].content.props.rowKey, '1:grid_p');
store.nextChoice('tile');
assert.equal(current().view, 'review', 'After the last choice, back to the review');
store.openChoices();
bar = flowTabs();
bar.onCancelFromTabHeader();
assert.equal(current().view, 'review', 'B on the bar goes back a step, not out of the page');
store.openGame(1, true);
bar = flowTabs();
assert.equal(bar.activeTab, 'game:1', 'A game from the review stays in the flow');
assert.equal(bar.tabs.at(-1).title, 'Game 1');
assert.equal(bar.tabs.at(-1).content.props.gameId, 1);
bar.onShowTab('review');
assert.equal(current().view, 'review');
flowTabs().onShowTab('collections');
assert.equal(current().view, 'overview', 'The first step returns to the grid');
assert.equal(flowTabs(), null, 'And the artwork tabs are back');
store.openGame(1);
assert.equal(flowTabs(), null, 'A game from the grid is not part of the flow');
const headerBack = () => render(() => flowModule.useHeaderBack(true));
assert.equal(typeof headerBack(), 'function', 'B on the bar still goes back inside a collection');assert.equal(render(() => flowModule.useHeaderBack(false)), undefined, 'But not from another tab');
store.closeGame();
const manyChoices = Array.from({ length: 100 }, (_, at) => ({ key: String(at), title: `Game ${at}` }));
const shownChoices = flowModule.describeFlow({ view: 'choose', choices: manyChoices, choiceKey: '0' });
assert.equal(shownChoices.tabs.length, 31, 'A huge collection does not fill the bar with hundreds of tabs');
assert.equal(shownChoices.tabs[15].id, 'choice:0', 'The current game sits in the middle');
assert.equal(shownChoices.tabs[14].id, 'choice:99', 'With wrapping on both sides');
store.startReview(null, 'Apply to My Library');
await settle();
unmount();

// Pages take focus when opened, but not when the tab is entered ------------------------------------
const tabState = { view: 'overview', collectionId: 7 };
const tab = load('frontend/collections/collections-tab.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': native,
  '../../src/utils/i18n': { default: (_key, fallback) => fallback },
  './choose-view': { ChooseView: 'ChooseView' },
  './game-view': { GameView: 'GameView' },
  './list-view': { ListView: 'ListView' },
  './overview-view': { OverviewView: 'OverviewView' },
  './review-view': { ReviewView: 'ReviewView' },
  './store': { ...store, loadList: async () => {}, useCollections: () => tabState },
});
const renderTab = () => render(() => tab.CollectionsTab({}));
assert.equal(ofType(renderTab(), 'OverviewView')[0].props.opened, false, 'Entering the tab takes no focus: Steam is sliding it in');
assert.equal(ofType(renderTab(), 'Focusable')[0].props.scrollIntoViewType, 1, 'Focus during a slide never drags the page sideways');
tabState.view = 'game';
assert.equal(ofType(renderTab(), 'GameView')[0].props.opened, true, 'Opening a page does');
tabState.view = 'review';
assert.equal(ofType(renderTab(), 'GameView').length, 1, 'The grid tab keeps its page while the review slides in');
unmount();
assert.equal(ofType(render(() => tab.CollectionsTab({ page: 'review' })), 'ReviewView').length, 1, 'A flow step shows its own page');
unmount();
assert.equal(ofType(render(() => tab.CollectionsTab({ page: 'choose', rowKey: 'a' })), 'ChooseView')[0].props.rowKey, 'a');
unmount();
const stepGame = ofType(render(() => tab.CollectionsTab({ page: 'game', gameId: 4 })), 'GameView')[0];
assert.equal(stepGame.props.gameId, 4);
assert.equal(stepGame.props.opened, true, 'A game from the review focuses its artwork');
unmount();

// The collection grid -----------------------------------------------------------------------------
const pageParts = {
  PageBar: 'PageBar',
  PageSpinner: 'PageSpinner',
  PageToolbar: 'PageToolbar',
  useGridSize: () => [9, () => {}, {}],
  useInitialFocus: load('frontend/collections/page-parts.tsx', {
    react,
    'react/jsx-runtime': jsxRuntime,
    '@decky/ui': native,
    '../../src/components/AdaptiveNavGlyph': { default: 'AdaptiveNavGlyph' },
    '../../src/components/AppGridFilterBar': { default: 'AppGridFilterBar' },
    '../../src/components/qam-contents/Toolbar': { defaultSliderSizes: {}, sliderProps: {} },
    '../settings/store': settingsStore,
  }).useInitialFocus,
};
const overview = load('frontend/collections/overview-view.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': decky,
  '../../src/components/asset/Asset': { default: 'Asset' },
  '../steam/open-web-link': { openWebLink: async () => {} },
  './collection-card': { isVideoUrl: () => false },
  './draft': draft,
  './library': library,
  './library-picker': { MatchDialog: 'MatchDialog' },
  './page-parts': pageParts,
  './store': store,
  './text': text,
}, { window: windowFake });
const renderGrid = (opened = false) => render(() => overview.OverviewView({ state: current(), opened }));
let grid = renderGrid(true);
assert.equal(ofType(grid, 'Asset')[0].props.autoFocus, true, 'Opening a collection focuses its first game');
assert.equal(ofType(grid, 'Asset')[1].props.autoFocus, false);
assert.equal(ofType(renderGrid(true), 'Asset')[0].props.autoFocus, false, 'Only once, so it never pulls focus back');
unmount();
grid = renderGrid();
assert.equal(ofType(grid, 'Asset')[0].props.autoFocus, false);
assert.doesNotMatch(textOf(grid), /Library 10/, 'A matched tile shows one name');
assert.equal(ofType(grid, 'Asset').length, 3, 'One tile per game');
assert.match(textOf(grid), /Not in library/);
const partly = current();
const oneMatch = new Map([...partly.draft.matches].slice(0, 1));
assert.match(
  textOf(render(() => overview.OverviewView({ state: { ...partly, draft: { ...partly.draft, matches: oneMatch } }, opened: false }))),
  /Checking your library: 1 of 3/,
  'Library matching shows how far it has got',
);
assert.doesNotMatch(textOf(grid), /Checking your library/);
assert.equal(
  button(render(() => overview.OverviewView({ state: { ...partly, draft: { ...partly.draft, matches: oneMatch } }, opened: false })), 'Apply to My Library').props.disabled,
  true,
  'Apply waits until the library is checked',
);
assert.equal(button(grid, 'Apply to My Library').props.disabled, false);
button(grid, 'Apply to My Library').props.onClick();
assert.equal(current().view, 'review');
assert.equal(current().reviewTitle, 'Apply to My Library');
assert.equal(current().draft.scope, null);
await settle();
store.closeReview();
ofType(grid, 'Asset')[0].props.onOptionsButton();
grid = renderGrid();
button(grid, 'Apply 1 Game').props.onClick();
assert.deepEqual([...current().draft.scope], [1], 'Selecting narrows what Apply covers');
assert.equal(current().reviewTitle, 'Apply 1 Game');
await settle();
store.closeReview();
store.startReview(null, 'Apply to My Library');
await settle();
const menuFor = at => {
  const nodes = all(renderGrid(), node => node.props?.ref || node.type === 'Asset');
  nodes[at * 2].props.ref.current = {};
  nodes[at * 2 + 1].props.onMenuButton();
  return textOf(uiModals.at(-1));
};
assert.match(menuFor(0), /Unselect Game/);
assert.doesNotMatch(menuFor(0), /Clear Selection/, 'With only this game selected, Unselect already says it all');
assert.match(menuFor(1), /Select Game.*Clear Selection/, 'Other games selected: clearing is a different action');
store.setBrowse({ selected: new Set([1, 2]) });
assert.match(menuFor(0), /Unselect Game.*Clear Selection/, 'Several selected: one game or all of them');
store.setBrowse({ term: 'Game 2', selected: new Set() });
assert.equal(ofType(renderGrid(), 'Asset').length, 1, 'Filtering narrows the grid');
store.setBrowse({ term: '', filter: 'unmatched' });
assert.equal(ofType(renderGrid(), 'Asset').length, 1);
store.setBrowse({ filter: 'all' });
ofType(renderGrid(), 'Asset')[0].props.onActivate();
assert.equal(current().view, 'game');
assert.equal(current().lastGame, 1);
store.closeGame();
unmount();
store.setBrowse({});
const secondGame = current().draft.assets.find(asset => asset.game.id === 2).game.id;
store.openGame(secondGame);
store.closeGame();
grid = renderGrid(true);
assert.equal(ofType(grid, 'Asset')[1].props.autoFocus, true, 'Coming back from a game returns to its tile');
unmount();

// A game's page -----------------------------------------------------------------------------------
const gameModals = [];
const gamePage = load('frontend/collections/game-view.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': { ...native, showModal: tree => gameModals.push(tree) },
  './artwork-picker': { ArtworkPicker: 'ArtworkPicker' },
  './library-picker': { MatchDialog: 'MatchDialog' },
  './library': library,
  './page-parts': pageParts,
  './store': store,
  './text': text,
}, { window: windowFake });

// A running batch keeps its collection and its games as they were reviewed --------------------------
const shownBeforeRun = shownArtwork;
store.startReview(new Set([1]), 'Apply Game 1');
await settle();
store.setPick('1:grid_p', { action: 'use', artworkId: 1 });
let finishRun;
hold = new Promise(resolve => { finishRun = resolve; });
const heldRun = store.applyDraft();
await settle();
assert.ok(current().run, 'The batch is waiting on its first write');
assert.equal(current().view, 'overview');
const whileRunning = renderGrid();
assert.equal(ofType(whileRunning, 'PageBar')[0].props.onBack, undefined, 'The collection shows no way back');
unmount();
assert.equal(render(() => flowModule.useHeaderBack(true)), undefined, 'B on the tab bar offers nothing either');
unmount();
const tabViewBefore = tabState.view;
tabState.view = 'overview';
tabState.run = current().run;
assert.equal(renderTab().props.onCancelButton, undefined, 'Nor B on the page');
unmount();
tabState.run = null;
assert.equal(typeof renderTab().props.onCancelButton, 'function', 'Which goes back again once the batch is over');
unmount();
tabState.view = tabViewBefore;
assert.doesNotMatch(menuFor(0), /Match to Library|Change Library Match|Apply This Game/, 'A tile menu can\'t change what is running');
unmount();
store.openGame(1);
const lockedGame = render(() => gamePage.GameView({ state: current(), opened: false }));
assert.equal(button(lockedGame, 'Change Match').props.disabled, true, 'Nor can a game\'s page');
assert.equal(ofType(lockedGame, 'ArtworkPicker')[0].props.locked, true);
unmount();
store.closeGame();
await assert.rejects(store.chooseMatch(1, 40), /Wait for the current batch/, 'The store refuses too');
const picksDuringRun = current().draft.picks;
store.setPick('1:hero', { action: 'leave' });
assert.equal(current().draft.picks, picksDuringRun);
finishRun();
hold = undefined;
await heldRun;
assert.equal(typeof ofType(renderGrid(), 'PageBar')[0].props.onBack, 'function', 'Afterwards the collection shows its way back again');
unmount();
shownArtwork = shownBeforeRun;
store.startReview(null, 'Apply to My Library');
await settle();

store.openGame(1);
const renderGame = () => render(() => gamePage.GameView({ state: current(), opened: true }));
let tree = renderGame();
assert.equal(ofType(tree, 'ArtworkPicker')[0].props.takeFocus, true, 'A game page focuses its artwork');
assert.equal(ofType(renderGame(), 'ArtworkPicker')[0].props.takeFocus, false, 'Only once, so changing type keeps focus');
assert.equal(text.sameName('LEGO® Batman™: Legacy', 'LEGO Batman: Legacy'), true, 'Symbols alone do not make two names');
assert.equal(text.sameName('BioShock 2', 'BioShock 2 Remastered'), false);
assert.equal(ofType(tree, 'ArtworkPicker')[0].props.row.type, 'grid_p');
button(tree, 'Hero (1)').props.onClick();
tree = renderGame();
assert.equal(ofType(tree, 'ArtworkPicker')[0].props.row.type, 'hero', 'Type buttons switch the grid');
button(tree, 'Change Match').props.onClick();
assert.equal(gameModals.at(-1).type, 'MatchDialog');
ofType(tree, 'PageBar')[0].props.onBack();
assert.equal(current().view, 'overview', 'The bar goes back');
store.openGame(1);
unmount();
tree = renderGame();
button(tree, 'Apply This Game').props.onClick();
assert.equal(current().view, 'review');
assert.deepEqual([...current().draft.scope], [1]);
assert.equal(current().reviewTitle, 'Apply Game 1');
await settle();
store.closeReview();
store.startReview(null, 'Apply to My Library');
await settle();
store.setReplace(true);
store.setTypes(['grid_p']);
store.openGame(1, true);
store.goBack();
assert.equal(current().view, 'review', 'A game opened from the review returns to it');
assert.equal(current().draft.replace, true, 'Returning keeps Replace My Custom Artwork');
assert.deepEqual(current().draft.types, ['grid_p'], 'Returning keeps the chosen types');
assert.notEqual(current().draft.custom, undefined, 'Returning does not scan again');
store.startReview(null, 'Apply to My Library');
assert.equal(current().draft.replace, true, 'A new review keeps replacing as it was left');
assert.deepEqual(current().draft.types.join(), 'grid_p', 'The same games keep their artwork types');
store.startReview(new Set([1]), 'Apply This Game');
assert.equal(current().draft.types.join(), 'grid_p,hero', 'Other games start with all of theirs');
store.setReplace(false);
store.startReview(null, 'Apply to My Library');
await settle();
unmount();

// The picker: tiles only choose, and Details is the one place that writes -------------------------
const details = [];
const picker = load('frontend/collections/artwork-picker.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': { ...native, showModal: modal => details.push(modal) },
  '../../src/components/asset/Asset': { default: 'Asset' },
  '../../src/modals/DetailsModal': { default: 'DetailsModal' },
  '../settings/store': settingsStore,
  './collection-card': { isVideoUrl: () => false },
  './store': store,
  './text': text,
}, { window: windowFake });
writes.length = 0;
store.setPick('1:grid_p', { action: 'use', artworkId: 1 });
const pickerRow = () => store.rowsForGame(current().draft, 1).find(value => value.type === 'grid_p');
tree = render(() => picker.ArtworkPicker({ row: pickerRow() }));
const tiles = () => all(tree, node => node.props?.className === 'sgdb-collection-tile');
assert.equal(ofType(tree, 'Asset').length, 2);
assert.equal(tiles()[0].props['data-selected'], true, 'The artwork in use is marked');
assert.equal(tiles()[1].props['data-selected'], undefined);
ofType(tree, 'Asset')[1].props.onActivate();
assert.equal(pickerRow().artwork.id, 11, 'Selecting a tile chooses it');
tree = render(() => picker.ArtworkPicker({ row: pickerRow() }));
ofType(tree, 'Asset')[1].props.onActivate();
assert.equal(pickerRow().status, 'needs-choice', 'Unselecting goes back to needing a choice');
assert.equal(current().draft.picks['1:grid_p'], undefined);
assert.equal(writes.length, 0, 'Choosing a tile writes nothing');
const onlyRow = () => store.rowsForGame(current().draft, 2)[0];
custom = { 20: ['grid_p'] };
store.retryScan();
await settle();
store.setPick('2:grid_p', { action: 'use', artworkId: 2 });
assert.equal(onlyRow().status, 'ready');
store.unselect(onlyRow());
assert.equal(onlyRow().status, 'keep-custom', 'Unselecting goes back to keeping custom artwork');
custom = {};
store.retryScan();
await settle();
assert.equal(onlyRow().status, 'ready', 'A single artwork with nothing protected applies by itself');
store.unselect(onlyRow());
assert.equal(onlyRow().status, 'leave', 'So unselecting it has to leave the type unchanged');
ofType(tree, 'Asset')[1].props.onMenuButton();
assert.equal(details.at(-1).type, 'DetailsModal');
await details.at(-1).props.onAssetChange();
assert.deepEqual(writes, ['10:grid_p:11'], 'Apply in Details writes that exact artwork');
unmount();

// The choose page: picking moves on, and focus stays where a repeated action needs it --------------
const choiceRow = (key, status = 'needs-choice') => ({ key, status, game: { id: 1, name: key }, type: 'grid_p' });
const choiceRows = [choiceRow('a'), choiceRow('b'), choiceRow('c', 'collision')];
const choiceCalls = [];
const choiceState = { draft: {}, choices: choiceRows.map(row => ({ key: row.key, title: row.key })), choiceFocus: 'tile' };
const choose = load('frontend/collections/choose-view.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': native,
  './artwork-picker': { ArtworkPicker: 'ArtworkPicker' },
  './page-parts': { PageBar: 'PageBar', PageToolbar: 'PageToolbar', useGridSize: () => [13, () => {}, {}] },
  './draft': { buildRows: () => choiceRows },
  './store': {
    closeChoices: () => choiceCalls.push('close'),
    goBack: () => choiceCalls.push('back'),
    nextChoice: focus => choiceCalls.push(`next:${focus}`),
    pickFirstForRest: rows => choiceCalls.push(`first:${rows.length}`),
    setChoiceFocus: focus => choiceCalls.push(`focus:${focus}`),
    setPick: (key, pick) => choiceCalls.push(`${pick.action}:${key}`),
  },
  './text': { artworkNames: text.artworkNames, rowText: () => 'Pick one' },
});
const renderChoose = (rowKey = 'a') => render(() => choose.ChooseView({ state: choiceState, rowKey }));
const shownRow = node => ofType(node, 'ArtworkPicker')[0].props;
let choosePage = renderChoose();
assert.equal(shownRow(choosePage).row.key, 'a');
assert.equal(shownRow(choosePage).takeFocus, true, 'Opening focuses the artwork');
assert.equal(button(choosePage, 'Leave Unchanged').props.autoFocus, false);
assert.match(textOf(choosePage), /1 of 3 · a: Capsule/);
assert.doesNotMatch(textOf(choosePage), /Pick one/, 'It does not explain itself');
assert.match(textOf(renderChoose('c')), /Pick one/, 'Except for a conflict, which needs the reason');
assert.equal(ofType(choosePage, 'PageToolbar')[0].props.type, 'grid_p', 'The artwork tab\'s size slider');
assert.equal(ofType(choosePage, 'PageBar')[0].props.onBack(), 1, 'The bar goes back');
choiceCalls.length = 0;
shownRow(choosePage).onPicked();
assert.deepEqual(choiceCalls.splice(0), ['next:tile'], 'Choosing moves on, with focus on the artwork');
button(choosePage, 'Leave Unchanged').props.onClick();
assert.deepEqual(choiceCalls.splice(0), ['leave:a', 'next:button'], 'Leave Unchanged moves on and stays on the button');
button(choosePage, 'Use First for the Rest').props.onClick();
assert.deepEqual(choiceCalls.splice(0), ['first:3', 'close'], 'Nothing is left to go through');
button(choosePage, 'Done').props.onClick();
assert.deepEqual(choiceCalls.splice(0), ['close']);
const onBumper = all(choosePage, node => node.props?.onButtonDown)[0].props.onButtonDown;
onBumper({ target: { closest: () => ({}) }, detail: { button: 6 } });
assert.deepEqual(choiceCalls.splice(0), ['focus:tile'], 'RB on a tile hands focus to the next artwork');
onBumper({ target: { closest: () => null }, detail: { button: 5 } });
assert.deepEqual(choiceCalls.splice(0), ['focus:button'], 'LB on a button stays with the buttons');
onBumper({ target: { closest: () => null }, detail: { button: 2 } });
assert.deepEqual(choiceCalls.splice(0), [], 'Other buttons change nothing');
unmount();
choiceState.choiceFocus = 'button';
choosePage = renderChoose('b');
assert.equal(shownRow(choosePage).takeFocus, false);
assert.equal(button(choosePage, 'Leave Unchanged').props.autoFocus, true, 'So it can repeat');
unmount();
assert.equal(render(() => choose.ChooseView({ state: choiceState, rowKey: 'gone' })), null, 'A row that went away shows nothing');
unmount();

// Shared Details, for collection artwork without an author or style -------------------------------
const detailsModal = load('src/modals/DetailsModal.tsx', {
  react,
  'react/jsx-runtime': jsxRuntime,
  '@decky/ui': { ...native, DialogButtonPrimary: 'DialogButtonPrimary', joinClassNames: (...values) => values.filter(Boolean).join(' '), Navigation: {} },
  '../components/asset/Asset': { default: 'Asset' },
  '../components/Markdown': { default: 'Markdown' },
  '../utils/i18n': { default: (_key, fallback) => fallback },
  '../constants': { SGDB_ASSET_TYPE_READABLE: names, SGDB_MIME_MAP: {} },
  '../../frontend/details-actions': { DetailsActions: 'DetailsActions' },
});
tree = render(() => detailsModal.default({ asset: { ...catalog[0], mime: 'image/png' }, assetType: 'grid_p' }));
assert.equal(all(tree, node => node.props?.className === 'author').length, 0, 'No author row without an author');
assert.equal(ofType(tree, 'DetailsActions').length, 1);
unmount();

// Changing accounts leaves nothing behind ---------------------------------------------------------
account = '76561198000000002';
await store.loadList();
state = current();
assert.equal(state.account, account);
assert.equal(state.view, 'list');
assert.equal(state.draft.assets.length, 0);
assert.equal(state.collectionId, undefined);
unmount();

console.log('Collection UI checks passed: review rules, retries without replay, scan failure, batches surviving the tab, the review and choose pages, the tab bar following the flow, focus when opening pages but not the tab, the game grid and page, tiles only choosing, Details writes and account changes.');
