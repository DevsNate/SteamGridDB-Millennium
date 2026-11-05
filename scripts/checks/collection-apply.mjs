// Collections' non-UI modules, against API and Steam fixtures. Nothing touches live artwork.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const require = name => {
    assert.ok(name in imports, `Unexpected import in ${path}: ${name}`);
    return imports[name];
  };
  vm.runInNewContext(source, { exports, require, Error, setTimeout, clearTimeout, ...globals });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setTimeout(resolve, 5));

// Tab order ---------------------------------------------------------------------------------------
const tabs = load('frontend/collections/tabs.ts');
assert.deepEqual(plain(tabs.withCollectionsTab(['hero', 'manage', 'icon'])), ['hero', 'manage', 'collections', 'icon']);
assert.deepEqual(plain(tabs.withCollectionsTab(['collections', 'hero', 'manage'])), ['collections', 'hero', 'manage']);
assert.deepEqual(plain(tabs.withCollectionsTab(['icon'])), ['icon', 'collections']);

// Fixtures ----------------------------------------------------------------------------------------
const asset = (id, game = 1, width = 600, height = 900) => ({
  id,
  game: { id: game, name: `Game ${game}` },
  width,
  height,
  url: `https://cdn2.steamgriddb.com/grid/${id}.png`,
  thumb: `https://cdn2.steamgriddb.com/thumb/${id}.jpg`,
  mime: 'image/png',
});
const info = { id: 1, name: 'Collection', counts: { grid: 3, hero: 1, logo: 0, icon: 0 } };
let pageCalls = [], lookups = [], account = '76561198000000001', brokenPage = false, scanFailure = false, storeReads = 0;
const settings = new Map(), links = new Map();
let savedFile = null;
const shortcutId = 0x80000010;
const apps = new Map([
  [10, { appid: 10, display_name: 'Owned, uninstalled', BIsOwned: () => true, BIsShortcut: () => false }],
  [20, { appid: 20, display_name: 'Not owned', BIsOwned: () => false, BIsShortcut: () => false }],
  [30, { appid: 30, display_name: 'Local shortcut', selected_clientid: '0', BIsOwned: () => true, BIsShortcut: () => true }],
  [40, { appid: 40, display_name: 'Another edition', BIsOwned: () => true, BIsShortcut: () => false }],
  [50, { appid: 50, display_name: 'Mod', third_party_mod: true, BIsOwned: () => true, BIsShortcut: () => false }],
  [shortcutId, { appid: shortcutId, display_name: 'Shortcut', selected_clientid: '0', icon_data: 'x', BIsShortcut: () => true }],
]);
const services = {
  currentSteamId: () => account,
  loadPublicCollection: async () => info,
  loadCollectionAssets: async (_id, type, page) => {
    pageCalls.push([type, page]);
    if (brokenPage) return { assets: [], total: 5 };
    if (type === 'hero') return { assets: [asset(4)], total: 1 };
    return page === 0
      ? { assets: [asset(1), asset(2, 1, 920, 430)], total: 3 }
      : { assets: [asset(2, 1, 920, 430), asset(3, 1, 512, 512)], total: 3 };
  },
  parseResponse: value => value.data,
  loadGameLinks: async () => ({}),
  saveGameLinks: async () => true,
  loadSavedCollection: async () => savedFile,
  saveCollectionFile: async (_id, contents) => { savedFile = JSON.parse(contents); return true; },
  isCollectionInfo: value => Boolean(value?.counts),
  isCollectionAsset: value => Boolean(value?.url),
  sgdbRequest: async ({ path }) => {
    const id = Number(/\/id\/(\d+)/.exec(path)[1]);
    lookups.push(id);
    return { data: { external_platform_data: { steam: (links.get(id) ?? []).map(appid => ({ id: String(appid) })) } } };
  },
  loadCustomArtwork: async () => {
    if (scanFailure) throw Error('Scan failed');
    return { custom: { 10: ['grid_p'] }, applied: { 10: { grid_p: { id: 1, collection: true } } } };
  },
};
const settingsStore = {
  readSetting: (key, fallback) => (settings.has(key) ? settings.get(key) : fallback),
  writeSetting: async (key, value) => { settings.set(key, value); },
};
const appStore = {
  GetAppOverviewByAppID: id => apps.get(id),
  get allApps() {
    storeReads++;
    return [...apps.values()];
  },
};
const loadLibrary = () => load('frontend/collections/library.ts', {
  '../services/backend': services,
  '../settings/store': settingsStore,
}, { window: { appStore } });
const library = loadLibrary();
const collections = load('frontend/collections/load.ts', { '../services/backend': services });
const draftModule = load('frontend/collections/draft.ts');
const run = load('frontend/collections/run.ts');

// Links and IDs -----------------------------------------------------------------------------------
assert.equal(collections.collectionId('https://www.steamgriddb.com/collection/30936/'), 30936);
assert.equal(collections.collectionId('1'), 1);
for (const bad of ['0', '-1', '1e3', 'https://evil.test/collection/1', 'https://www.steamgriddb.com@evil.test/collection/1', '2147483648']) {
  assert.throws(() => collections.collectionId(bad), undefined, bad);
}

// Reading a collection ----------------------------------------------------------------------------
const signal = new AbortController().signal;
let read = [];
await collections.readCollection(1, signal, (_info, assets) => { read = assets; });
assert.deepEqual(plain(pageCalls), [['grid', 0], ['grid', 1], ['hero', 0]], 'Only nonempty types, until the total');
assert.deepEqual(plain(read.map(item => item.id)), [1, 2, 3, 4], 'A repeated item between pages is kept once');
assert.deepEqual(plain(read.map(item => item.type)), ['grid_p', 'grid_l', 'grid_p', 'hero'], 'Wide grids are wide capsules; square grids are capsules');

// The saved copy.
assert.equal(await collections.savedCollection(1), null);
const contents = await collections.readCollection(1, signal);
assert.equal(contents.assets.length, 4, 'A read returns what it reported');
collections.clearCollectionCache();
await settle();
await collections.saveCollection(1, contents);
const savedCopy = await collections.savedCollection(1);
assert.equal(savedCopy.assets.length, 4);
assert.equal(collections.isSavedCurrent(savedCopy, savedCopy.info), true, 'Recent, with the same counts');
assert.equal(collections.isSavedCurrent(savedCopy, { ...info, counts: { ...info.counts, grid: 4 } }), false, 'New artwork was added');
assert.equal(collections.isSavedCurrent({ ...savedCopy, savedAt: Date.now() - 25 * 3600000 }, savedCopy.info), false, 'Too old');
await settle();
collections.clearCollectionCache();
assert.equal(collections.isSavedCurrent(savedCopy, savedCopy.info), false, 'Refresh rechecks everything');
for (const damaged of ['junk', { savedAt: 1 }, { ...savedCopy, savedAt: 'x' }, { ...savedCopy, assets: [{}] }, { ...savedCopy, assets: [{ ...savedCopy.assets[0], type: 'x' }] }]) {
  savedFile = damaged;
  assert.equal(await collections.savedCollection(1), null);
}
services.loadSavedCollection = async () => { throw Error('Unreadable'); };
assert.equal(await collections.savedCollection(1), null, 'An unreadable copy just means reading again');
services.loadSavedCollection = async () => savedFile;
services.saveCollectionFile = async () => { throw Error('Disk full'); };
await collections.saveCollection(1, contents);
services.saveCollectionFile = async () => true;
savedFile = null;

brokenPage = true;
collections.clearCollectionCache();
await assert.rejects(collections.readCollection(1, signal, () => {}), /incomplete/);
brokenPage = false;
collections.clearCollectionCache();
const stopped = new AbortController();
stopped.abort();
await assert.rejects(collections.readCollection(1, stopped.signal, () => {}), { name: 'AbortError' });

pageCalls = [];
collections.clearCollectionCache();
await Promise.all([collections.collectionPage(1, 'grid', 0), collections.collectionPage(1, 'grid', 0)]);
assert.equal(pageCalls.length, 1, 'Cards and browsing share a pending page');
const realPages = services.loadCollectionAssets;
services.loadCollectionAssets = async () => { throw Error('Offline'); };
await assert.rejects(collections.collectionPage(1, 'hero', 0), /Offline/);
await settle();
services.loadCollectionAssets = realPages;
assert.equal((await collections.collectionPage(1, 'hero', 0)).total, 1, 'A failed page is retried');

// Library matching --------------------------------------------------------------------------------
assert.ok(library.libraryApp(10), 'Installation is not required');
assert.equal(library.libraryApp(20), null, 'Not owned');
assert.equal(library.libraryApp(50), null, 'Mods are excluded');
assert.equal(library.libraryApp(30), null, 'Shortcuts are never automatic');
assert.ok(library.libraryApp(30, true));
apps.get(10).BIsOwned = undefined;
assert.throws(() => library.libraryApp(10), /unavailable/);
apps.get(10).BIsOwned = () => true;

const match = gameId => library.matchGame(gameId, account);
links.set(1, []);
assert.equal((await match(1)).status, 'unlinked');
links.set(2, [20]);
assert.equal((await match(2)).status, 'not-owned');
links.set(3, [10]);
assert.equal((await match(3)).appid, 10);
links.set(8, [10, 40]);
assert.equal((await match(8)).status, 'ambiguous', 'Never applies to every owned edition silently');

await library.saveGameMatch(account, 8, 30);
assert.equal((await match(8)).appid, 30, 'A local shortcut can be chosen');
assert.equal((await match(8)).manual, true);
const firstAccount = account;
account = '76561198000000002';
assert.equal((await match(8)).status, 'ambiguous', 'Manual matches stay with their account');
await assert.rejects(library.saveGameMatch(firstAccount, 8, 10), /account changed/);
account = firstAccount;
apps.get(30).selected_clientid = '42';
assert.equal((await match(8)).status, 'unavailable', 'A remote shortcut cannot use a local match');
apps.get(30).selected_clientid = '0';
await library.saveGameMatch(account, 8, null);
assert.equal((await match(8)).status, 'ambiguous', 'Reset returns to automatic matching');

settings.set(`nonsteam_${shortcutId}`, { id: 9 });
links.set(9, []);
assert.equal((await match(9)).appid, shortcutId, 'Existing shortcut links are used');
assert.deepEqual(plain(settings.get(`nonsteam_${shortcutId}`)), { id: 9 }, 'and left alone');

const realRequest = services.sgdbRequest;
library.clearGameLinks();
services.sgdbRequest = async () => { throw Error('Offline'); };
links.set(12, [10]);
const failedLookup = await match(12);
assert.equal(failedLookup.status, 'error');
assert.match(failedLookup.error, /Offline/);
await settle();
services.sgdbRequest = realRequest;
assert.equal((await match(12)).appid, 10, 'A failed lookup is not remembered as no match');

let releaseLookup;
library.clearGameLinks();
services.sgdbRequest = () => new Promise(resolve => { releaseLookup = resolve; });
const pending = match(11);
await settle();
await library.saveGameMatch(account, 11, 40);
releaseLookup({ data: { external_platform_data: { steam: [{ id: '10' }] } } });
assert.equal((await pending).appid, 40, 'A late lookup cannot override a newer manual choice');
services.sgdbRequest = realRequest;

// Bounded lookups, with one library pass for all of them.
let active = 0, peak = 0, batches = 0;
const received = new Map();
services.sgdbRequest = async ({ path }) => {
  active++;
  peak = Math.max(peak, active);
  await settle();
  active--;
  return realRequest({ path });
};
library.clearGameLinks();
storeReads = 0;
const manyGames = Array.from({ length: 12 }, (_, index) => 100 + index);
await library.matchGames(manyGames, account, signal, batch => {
  batches++;
  batch.forEach((value, key) => received.set(key, value));
});
services.sgdbRequest = realRequest;
assert.equal(received.size, 12);
assert.equal(peak, 3, 'Three lookups at a time');
assert.equal(storeReads, 1, 'The shortcut table is built once, not per game');
assert.ok(batches < 12, 'Results arrive in batches');

// Lookups survive a restart, and library ownership stays live.
let disk = '{}';
services.loadGameLinks = async () => JSON.parse(disk);
services.saveGameLinks = async value => { disk = value; return true; };
const matchAfterRestart = async ids => {
  const restarted = loadLibrary();
  const found = new Map();
  lookups.length = 0;
  await restarted.matchGames(ids, account, signal, batch => batch.forEach((value, key) => found.set(key, value)));
  return found;
};
await matchAfterRestart([3, 500]);
assert.deepEqual(plain([...lookups].sort((a, b) => a - b)), [3, 500]);
assert.deepEqual(plain(JSON.parse(disk)[3][1]), plain(links.get(3)), 'Lookups are saved');
assert.equal((await matchAfterRestart([3])).get(3).appid, 10);
assert.deepEqual(plain(lookups), [], 'A saved game needs no request');
const aged = (id, days) => { disk = JSON.stringify({ ...JSON.parse(disk), [id]: [Date.now() - days * 86400000, JSON.parse(disk)[id][1]] }); };
aged(3, 29);
await matchAfterRestart([3]);
assert.deepEqual(plain(lookups), [], 'A recent link is trusted');
aged(3, 31);
await matchAfterRestart([3]);
assert.deepEqual(plain(lookups), [3], 'Old links are checked again');
assert.ok(Date.now() - JSON.parse(disk)[3][0] < 60000, 'And saved again');
aged(500, 2);
await matchAfterRestart([500]);
assert.deepEqual(plain(lookups), [500], 'A game without a link is checked again sooner');
services.loadGameLinks = async () => { throw Error('Damaged'); };
assert.equal((await matchAfterRestart([3])).get(3).appid, 10, 'A damaged file only costs a lookup');
assert.deepEqual(plain(lookups), [3]);
services.loadGameLinks = async () => ({ 3: 'junk', 700: [1, ['x']] });
await matchAfterRestart([3, 700]);
assert.deepEqual(plain([...lookups].sort((a, b) => a - b)), [3, 700], 'Bad entries are ignored');
services.loadGameLinks = async () => JSON.parse(disk);

// A passing failure gets one more try, and an outage stops at the first repeat.
disk = '{}';
let requestCount = 0;
services.sgdbRequest = async ({ path }) => {
  requestCount++;
  if (requestCount === 1) throw Error('Blip');
  return realRequest({ path });
};
assert.equal((await matchAfterRestart([3])).get(3).appid, 10, 'A passing failure recovers by itself');
disk = '{}';
requestCount = 0;
services.sgdbRequest = async () => { requestCount++; throw Error('Offline'); };
const outage = await matchAfterRestart([600, 601, 602, 603, 604, 605]);
assert.equal(requestCount, 7, 'Six failures, then one retry that also fails');
assert.equal(outage.get(600).status, 'error');
assert.deepEqual(plain(JSON.parse(disk)), {}, 'Failures are never saved');
services.sgdbRequest = realRequest;
services.loadGameLinks = async () => ({});
services.saveGameLinks = async () => true;
library.clearGameLinks();

// Custom artwork ----------------------------------------------------------------------------------
const scanned = await library.customArtwork([10, shortcutId]);
assert.deepEqual(plain(scanned.custom), { 10: ['grid_p'], [shortcutId]: ['icon'] }, 'A shortcut icon counts as custom');
assert.equal(scanned.applied[10].grid_p.id, 1, 'What we know of the files comes with the scan');
scanFailure = true;
await assert.rejects(library.customArtwork([10]), /Scan failed/);
scanFailure = false;

// The draft ---------------------------------------------------------------------------------------
const art = (id, game, type) => ({ ...asset(id, game), type });
const matched = appid => ({ status: 'matched', appid, candidates: [appid] });
const draft = (patch = {}) => ({
  assets: [art(1, 1, 'grid_p'), art(2, 1, 'grid_p'), art(3, 1, 'hero'), art(4, 2, 'hero'), art(5, 3, 'logo')],
  matches: new Map([[1, matched(10)], [2, matched(40)], [3, { status: 'not-owned', candidates: [] }]]),
  custom: {},
  scope: null,
  types: draftModule.ARTWORK_TYPES,
  replace: false,
  picks: {},
  results: {},
  ...patch,
});
const statuses = value => Object.fromEntries(draftModule.buildRows(value).map(row => [row.key, row.status]));

assert.deepEqual(plain(statuses(draft())), {
  '1:grid_p': 'needs-choice', '1:hero': 'ready', '2:hero': 'ready', '3:logo': 'no-target',
});
assert.deepEqual(plain(statuses(draft({ matches: new Map() }))), {
  '1:grid_p': 'checking', '1:hero': 'checking', '2:hero': 'checking', '3:logo': 'checking',
});
assert.equal(statuses(draft({ custom: undefined }))['1:hero'], 'checking', 'Nothing is ready until the custom scan is back');

const customHero = { 10: ['hero'] };
assert.equal(statuses(draft({ custom: customHero }))['1:hero'], 'keep-custom');
assert.equal(statuses(draft({ custom: customHero, replace: true }))['1:hero'], 'ready');
const pickedHero = { '1:hero': { action: 'use', artworkId: 3 } };
assert.equal(statuses(draft({ custom: customHero, picks: pickedHero }))['1:hero'], 'ready', 'An explicit pick overrides protection');

const picked = draftModule.buildRows(draft({ picks: { '1:grid_p': { action: 'use', artworkId: 2 } } }))[0];
assert.equal(picked.status, 'ready');
assert.equal(picked.artwork.id, 2, 'The chosen artwork is what runs');
assert.equal(statuses(draft({ picks: { '1:hero': { action: 'leave' } } }))['1:hero'], 'leave');
assert.deepEqual(Object.keys(statuses(draft({ scope: new Set([2]) }))), ['2:hero'], 'Scope limits the rows');
assert.deepEqual(Object.keys(statuses(draft({ types: ['logo'] }))), ['3:logo'], 'Types limit the rows');
const heroOnly = draftModule.buildRows(draft({ scope: new Set([1]), types: ['grid_p', 'hero'] })).map(row => row.type);
assert.deepEqual(plain(heroOnly), ['grid_p', 'hero'], 'A game keeps its rows together, in artwork order');

const sameTarget = new Map([[1, matched(10)], [2, matched(10)], [3, { status: 'not-owned', candidates: [] }]]);
assert.equal(statuses(draft({ matches: sameTarget }))['1:hero'], 'collision');
assert.equal(statuses(draft({ matches: sameTarget }))['2:hero'], 'collision', 'Both sides are blocked');
const oneLeft = { '2:hero': { action: 'leave' } };
assert.equal(statuses(draft({ matches: sameTarget, picks: oneLeft }))['1:hero'], 'ready', 'Leaving one side resolves it');

const failedResult = { '1:hero': { appid: 10, error: 'Download failed' } };
const failedRow = draftModule.buildRows(draft({ results: failedResult })).find(row => row.key === '1:hero');
assert.equal(failedRow.status, 'failed');
assert.equal(draftModule.isRunnable(failedRow), true, 'Failed rows can run again');
assert.equal(failedRow.error, 'Download failed');
const failedElsewhere = { '1:hero': { appid: 99, error: 'Download failed' } };
assert.equal(statuses(draft({ results: failedElsewhere }))['1:hero'], 'ready', 'A failure on a previous target says nothing about this one');

// Applied comes from what the game shows, so no memory of this session is involved.
const shows = (id, collection = true) => ({ 10: { hero: { id, collection } } });
assert.equal(statuses(draft({ applied: shows(3), custom: customHero }))['1:hero'], 'applied', 'Applied artwork is recognized, even after a restart');
const ownPick = draftModule.buildRows(draft({ applied: { 10: { grid_p: { id: 2, collection: true } } }, custom: { 10: ['grid_p'] } }))[0];
assert.equal(ownPick.status, 'applied', 'With several candidates too, without asking again');
assert.equal(ownPick.artwork.id, 2, 'And it names the one the game shows');
assert.equal(statuses(draft({ applied: shows(99), custom: customHero }))['1:hero'], 'ready', 'Older artwork from a collection can be replaced');
assert.equal(statuses(draft({ applied: shows(99, false), custom: customHero }))['1:hero'], 'keep-custom', 'One the user picked in an artwork tab is theirs');
assert.equal(statuses(draft({ custom: customHero }))['1:hero'], 'keep-custom', 'So is a file that changed, which has no record');
assert.equal(statuses(draft({ applied: shows(3, false), custom: customHero }))['1:hero'], 'applied', 'Their pick can still be the same artwork');
assert.equal(statuses(draft({ applied: shows(3), custom: customHero, picks: { '1:hero': { action: 'leave' } } }))['1:hero'], 'leave', 'Unselecting says so');
assert.equal(statuses(draft({ applied: shows(3), custom: customHero, matches: new Map([[1, matched(40)]]) }))['1:hero'], 'ready', 'Showing it on one game says nothing about another');
const showsCapsule = { 10: { grid_p: { id: 2, collection: true } } };
const again = draft({ applied: showsCapsule, custom: { 10: ['grid_p'] }, rechoose: new Set(['1:grid_p']) });
assert.equal(statuses(again)['1:grid_p'], 'needs-choice', 'Choose Again asks again, even though the game shows one');
const sameAgain = { ...again, picks: { '1:grid_p': { action: 'use', artworkId: 2 } } };
assert.equal(statuses(sameAgain)['1:grid_p'], 'applied', 'Picking the one it shows writes nothing');
const otherAgain = { ...again, picks: { '1:grid_p': { action: 'use', artworkId: 1 } } };
assert.equal(statuses(otherAgain)['1:grid_p'], 'ready', 'Picking another one applies it');
const ownAgain = { ...again, applied: { 10: { grid_p: { id: 2, collection: false } } } };
assert.equal(statuses(ownAgain)['1:grid_p'], 'needs-choice', 'Also when it was picked in an artwork tab');
assert.equal(statuses({ ...ownAgain, picks: { '1:grid_p': { action: 'use', artworkId: 1 } } })['1:grid_p'], 'ready');
assert.deepEqual(plain(draftModule.typesIn(draft().assets, new Set([1]))), ['grid_p', 'hero']);

// Running -----------------------------------------------------------------------------------------
const rows = games => games.flatMap((game, index) => Array.from({ length: game }, (_, type) => ({
  game: { id: index + 1 }, key: `${index + 1}:${type}`,
})));
active = 0;
peak = 0;
const order = [], outcomes = {};
await run.runRows(rows([2, 2, 2]), signal, async row => {
  active++;
  peak = Math.max(peak, active);
  order.push(row.key);
  await settle();
  active--;
  if (row.key === '2:0') throw Error('Download failed');
}, (row, error) => { outcomes[row.key] = error ?? 'ok'; });
assert.equal(peak, 2, 'Two games at a time');
assert.ok(order.indexOf('1:0') < order.indexOf('1:1'), 'Rows of a game run in order');
assert.equal(Object.keys(outcomes).length, 6);
assert.equal(outcomes['2:0'], 'Download failed');
assert.equal(outcomes['2:1'], 'ok', 'A failure does not stop anything else');

const cancel = new AbortController();
const started = [];
await run.runRows(rows([2, 2, 2, 2]), cancel.signal, async row => {
  started.push(row.key);
  await settle();
  cancel.abort();
}, () => {});
assert.deepEqual([...started].sort(), ['1:0', '1:1', '2:0', '2:1'], 'Cancel finishes the games in progress and starts no more');

// Response boundary -------------------------------------------------------------------------------
const responses = load('frontend/services/sgdb-response.ts');
let reply;
const api = load('frontend/services/backend.ts', { './sgdb-response': responses }, {
  backend: { get_public_collection: async () => reply, get_public_collection_assets: async () => reply },
});
reply = { success: true, data: info };
assert.equal(api.isCollectionAsset(asset(1)), true);
for (const bad of [null, { ...asset(1), id: 0 }, { ...asset(1), url: 'http://x' }, { ...asset(1), game: {} }]) assert.equal(api.isCollectionAsset(bad), false);
assert.equal(api.isCollectionInfo(info, 1), true);
assert.equal(api.isCollectionInfo(info, 2), false);
assert.equal((await api.loadPublicCollection(1)).name, 'Collection');
reply = { success: true, data: { ...info, counts: { grid: -1 } } };
await assert.rejects(api.loadPublicCollection(1), /invalid/);
reply = { success: true, data: { assets: [asset(1)], total: 1 } };
assert.equal((await api.loadCollectionAssets(1, 'grid', 0)).total, 1);
reply = { success: true, data: { assets: null, total: 1 } };
await assert.rejects(api.loadCollectionAssets(1, 'grid', 0), /invalid/);
reply = { success: true, data: { assets: [{ ...asset(1), url: 'file:///private' }], total: 1 } };
await assert.rejects(api.loadCollectionAssets(1, 'grid', 0), /invalid/);
reply = { success: true, data: { assets: [{ ...asset(1), author: { name: 'Nameless avatar' } }], total: 1 } };
assert.equal((await api.loadCollectionAssets(1, 'grid', 0)).assets[0].author, undefined, 'A partial author counts as none');

// The write path, shared with the artwork tabs ----------------------------------------------------
const writes = [];
let downloadFails = false;
const useSGDB = load('src/hooks/useSGDB.tsx', {
  react: { createContext: () => ({}) },
  'react/jsx-runtime': { jsx() {}, jsxs() {} },
  '@decky/api': {
    toaster: {},
    fetchNoCors: async () => {},
    call: async (name, ...args) => {
      writes.push([name, ...args]);
      if (name.includes('base64')) {
        if (downloadFails) throw Error('Download failed');
        return 'bytes';
      }
      return 'icon_is_same_path';
    },
  },
  '../../frontend/shims/decky-env': { process: { env: {} } },
  '../components/Icons/MenuIcon': { default: 'MenuIcon' },
  '../utils/getAppOverview': { default: () => null },
  '../utils/log': { default: () => {} },
  '../constants': { ASSET_TYPE: { grid_p: 0, grid_l: 3, hero: 1, logo: 2, icon: 4 }, MIMES: {}, STYLES: {}, DIMENSIONS: {} },
  '../utils/getAppDetails': { default: () => null },
  '../utils/showRestartConfirm': { default: () => {} },
  '../utils/getCurrentSteamUserId': { default: () => 'account' },
  '../utils/getCustomLogoPosition': { default: async () => null },
}, {
  SteamClient: { Apps: {
    ClearCustomArtworkForApp: async (...args) => writes.push(['clear', ...args]),
    SetCustomArtworkForApp: async (...args) => writes.push(['set', ...args]),
    SetShortcutName: (...args) => writes.push(['name', ...args]),
  } },
  window: { appDetailsStore: { SaveCustomLogoPosition: async (...args) => writes.push(['position', ...args]) } },
  setTimeout: callback => { callback(); },
});
await useSGDB.artworkWriter(10, apps.get(10)).changeAssetFromUrl('https://cdn/art.png', 'hero');
assert.deepEqual(writes.map(entry => entry[0]), ['download_as_base64', 'clear', 'set'], 'Download, then clear, then set');
assert.deepEqual(plain(writes.at(-1)), ['set', 10, 'bytes', 'png', 1], 'The explicit app and type are written');

writes.length = 0;
downloadFails = true;
await assert.rejects(useSGDB.artworkWriter(10, apps.get(10)).changeAssetFromUrl('https://cdn/art.png', 'logo'));
assert.equal(writes.length, 1, 'A failed download never clears the current artwork');
downloadFails = false;

writes.length = 0;
await useSGDB.artworkWriter(10, { ...apps.get(10), icon_hash: 'hash' }).changeAssetFromUrl('https://cdn/icon.png', 'icon');
assert.equal(writes[0][0], 'set_steam_icon_from_url', 'Steam icons go through the backend');
assert.equal(writes[0][1], 10);

writes.length = 0;
await useSGDB.artworkWriter(30, apps.get(30)).changeAsset('bytes', 'logo');
assert.deepEqual(writes.map(entry => entry[0]), ['clear', 'set', 'position'], 'Shortcut logo positions stay supported');

console.log('Collection checks passed: tabs, IDs, paging, grid shapes, matching, custom-art protection, draft rules, game concurrency, cancel, failures, response validation and the write path.');
