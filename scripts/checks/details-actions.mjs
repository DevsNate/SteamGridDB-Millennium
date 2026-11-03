import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function evaluate(path, imports, globals = {}) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, Error, ...globals,
    require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; },
  });
  return module.exports;
}

const slots = [], effects = [];
let index = 0, menu, collections = [{ id: 7, name: 'Test collection' }], configured = true, requestCount = 0, adds = [];
let backendError, addError, mode = 7, settingsOpened = 0;
const links = [], hubTabs = [];
const navigationOrder = [];
const jsx = (type, props) => ({ type, props });
const imports = {
  'react': {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(callback) { const i = index++; if (!(i in effects)) effects[i] = callback(); },
  },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  '@decky/ui': {
    DialogButton: 'button', Focusable: 'focusable', Menu: 'menu', MenuItem: 'menuitem',
    showContextMenu(tree, anchor) { assert.ok(anchor); menu = { tree, hidden: false, Hide() { this.hidden = true; } }; return menu; },
  },
  'millennium': { EUIMode: { GamePad: 4 }, Millennium: { openQuickAccess: async () => { settingsOpened++; } }, Navigation: { OpenQuickAccessMenu: tab => hubTabs.push(tab) } },
  'react-icons/hi2': { HiArrowTopRightOnSquare: 'linkicon' },
  './services/backend': {
    getApiKeyStatus: async () => ({ success: true, configured }),
    loadCollections: async () => { requestCount++; if (backendError) throw Error(backendError); return collections; },
    addAssetToCollection: async (...args) => { if (addError) throw Error(addError); adds.push(args); },
  },
  './steam/open-web-link': { openWebLink: async url => { navigationOrder.push('navigate'); links.push(url); } },
  './settings/plugins-hub-link': { PluginsHubLink: 'hublink' },
};
const actions = evaluate('../../frontend/details-actions.tsx', imports, { SteamClient: { UI: { GetUIMode: async () => mode } } });
const asset = { id: 99 };
const visit = (tree, test) => {
  if (!tree || typeof tree !== 'object') return;
  if (test(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) { const found = visit(child, test); if (found) return found; }
};
const render = () => {
  index = 0;
  const tree = actions.DetailsActions({ asset, assetType: 'grid_p', closeModal: () => navigationOrder.push('close') });
  visit(tree, node => node.props?.children === 'Add to collection').props.ref.current = { ownerDocument: { title: 'Test artwork' } };
  return tree;
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const click = async label => {
  const tree = render();
  const node = visit(tree, node => node.props?.children === label || node.props?.['aria-label'] === label);
  assert.ok(node, `Missing ${label}`); node.props.onClick(); await settle();
};
const message = () => visit(render(), node => node.props?.role === 'status')?.props.children;
configured = false;
await click('Add to collection');
assert.equal(requestCount, 0, 'No-key click must not search collections');
assert.match(message(), /API Key/);
await click('Open settings');
assert.equal(settingsOpened, 1);
await click('Add to collection');
mode = 4;
await click('Open settings');
assert.deepEqual(hubTabs, [998]);
const hubLink = visit(render(), node => node.type === 'hublink');
assert.ok(hubLink, 'The Big Picture hint links Plugins Hub');
hubLink.props.closeModal();
assert.equal(navigationOrder.pop(), 'close', 'The Plugins Hub link closes Details, or the dialog stays above the web page');
configured = true;
await click('Add to collection');
assert.ok(menu);
const row = menu.tree.props.children[0];
row.props.onSelected(); await settle();
assert.equal(adds.length, 1);
assert.equal(adds[0][0], 7);
assert.equal(adds[0][1], asset);
assert.equal(adds[0][2], 'grid_p');
assert.equal(message(), 'Added to Test collection.');
collections = [];
await click('Add to collection');
assert.match(message(), /No SteamGridDB collections/);
backendError = 'SteamGridDB rejected your API Key. Check it in the plugin settings.';
await click('Add to collection');
assert.match(message(), /rejected your API Key/);
assert.ok(visit(render(), node => node.props?.children === 'Open settings'));
backendError = undefined;
collections = [{ id: 7, name: 'Test collection' }];
await click('Add to collection');
addError = 'Collection write failed';
menu.tree.props.children[0].props.onSelected(); await settle();
assert.equal(message(), 'Collection write failed');
await click('Open on SteamGridDB');
assert.deepEqual(navigationOrder, ['close', 'navigate'], 'Details must close before a browser route opens');
assert.equal(links.at(-1), 'https://www.steamgriddb.com/grid/99');
for (const [type, segment] of [['grid_p', 'grid'], ['grid_l', 'grid'], ['hero', 'hero'], ['logo', 'logo'], ['icon', 'icon']]) {
  assert.equal(actions.artworkPageUrl(99, type), `https://www.steamgriddb.com/${segment}/99`);
}
assert.throws(() => actions.artworkPageUrl(-1, 'hero'), /Invalid artwork ID/);
effects.forEach(cleanup => cleanup?.());
assert.equal(menu.hidden, true, 'Unmount hides the collection menu');
console.log('Details action checks passed: animated routing/failures, native-menu actions, no-key guard/settings, empty/error collections, link mappings and cleanup.');
