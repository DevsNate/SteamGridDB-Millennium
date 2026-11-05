// The settings side of the frontend: browser link routing, the API Key gate on
// the artwork page, and the plugin config store.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let mode = 7;
const opened = [];
const exported = {};
const linkSource = ts.transpileModule(readFileSync(new URL('../../frontend/steam/open-web-link.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(linkSource, {
  exports: exported, URL,
  require: () => ({ EUIMode: { GamePad: 4 }, Navigation: { NavigateToExternalWeb: url => opened.push(['steam', url]) } }),
  SteamClient: { UI: { GetUIMode: async () => mode }, System: { OpenInSystemBrowser: url => opened.push(['system', url]) } },
});
await exported.openWebLink('https://www.steamgriddb.com/');
mode = 4;
await exported.openWebLink('https://www.steamgriddb.com/');
assert.deepEqual(opened.map(entry => entry[0]), ['system', 'steam']);
await assert.rejects(exported.openWebLink('javascript:alert(1)'), /HTTPS/);
const gateExports = {};
const gateState = [];
let cursor = 0;
let previousVersion;
let effectCleanup;
let resolveStatus;
let rejectKey;
let listening = 0;
const Settings = () => {};
const Page = () => {};
const Missing = () => {};
const gateImports = {
  react: {
    useState(initial) {
      const index = cursor++;
      if (!(index in gateState)) gateState[index] = initial;
      return [gateState[index], value => { gateState[index] = typeof value === 'function' ? value(gateState[index]) : value; }];
    },
    useEffect(callback, dependencies) {
      if (previousVersion === dependencies[0]) return;
      previousVersion = dependencies[0];
      effectCleanup?.();
      effectCleanup = callback();
    },
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  '../src/components/plugin-pages/SGDBPage': { default: Page },
  '../src/hooks/useSGDB': { SGDBProvider: () => {} },
  '../src/hooks/useSettings': { SettingsProvider: Settings },
  './desktop-window/window-boundary': { PageWindowBoundary: () => {} },
  './services/backend': { getApiKeyStatus: () => new Promise(resolve => { resolveStatus = resolve; }) },
  './settings/missing-key-view': { MissingApiKeyView: Missing },
  './settings/key-rejected': { onApiKeyRejected: listener => { listening++; rejectKey = listener; return () => { listening--; }; } },
  './settings/missing-key-styles': { setupStyles: '' },
  './services/plugin-assets': { loadPluginAssets: () => Promise.resolve() },
};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/artwork-page.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports: gateExports, require: name => { assert.ok(name in gateImports); return gateImports[name]; } });
const renderGate = () => { cursor = 0; return gateExports.UpstreamPage({ desktop: true }); };
assert.equal(renderGate(), null, 'No setup or artwork may flash before status is known');
resolveStatus({ success: true, configured: false });
await new Promise(resolve => setTimeout(resolve));
const setup = renderGate().props.children;
const missingView = setup.props.children.find(child => child.type === Missing);
assert.ok(missingView);
missingView.props.onRetry();
const retrying = renderGate();
assert.ok(retrying, 'Retry keeps the page mounted, so Steam keeps its focus');
assert.ok(retrying.props.children.props.children.some(child => child.type === Missing), 'The setup view stays until the fresh status arrives');
resolveStatus({ success: true, configured: true });
await new Promise(resolve => setTimeout(resolve));
assert.equal(renderGate().props.children.type, Settings, 'Configured key mounts artwork providers');
rejectKey();
const rejectedView = renderGate().props.children.props.children.find(child => child.type === Missing);
assert.equal(rejectedView?.props.rejected, true, 'A rejected Key swaps the artwork for the setup view');
rejectedView.props.onRetry();
assert.ok(renderGate().props.children.props.children.some(child => child.type === Missing), 'The setup view stays while Retry checks');
assert.equal(listening, 1, 'Retry replaces the rejection listener');
resolveStatus({ success: true, configured: true });
await new Promise(resolve => setTimeout(resolve));
assert.equal(renderGate().props.children.type, Settings, 'Retry mounts the artwork again once the Key is accepted');
effectCleanup();
assert.equal(listening, 0, 'Leaving the page stops listening for rejections');

// The setup view saves the Key itself, then checks it again; a failed save stays on the view.
{
  const slots = [];
  let at = 0;
  const saved = [];
  let saveResult = { success: true };
  let retries = 0;
  const viewExports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/settings/missing-key-view.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: viewExports, Error, require: name => ({
    react: { useState(initial) { const i = at++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@decky/ui': { DialogBody: 'body', DialogBodyText: 'text', DialogButton: 'button', DialogControlsSection: 'section', DialogHeader: 'header', Field: 'field' },
    '../services/backend': { setApiKey: async ({ api_key }) => { saved.push(api_key); return saveResult; } },
    '../steam/open-web-link': { openWebLink: async () => {} },
    './api-key-field': { ApiKeyField: 'keyfield' },
  })[name] });
  const find = (tree, test) => {
    if (!tree || typeof tree !== 'object') return undefined;
    if (test(tree)) return tree;
    for (const child of [tree.props?.children].flat()) { const found = find(child, test); if (found) return found; }
  };
  const view = () => { at = 0; return viewExports.MissingApiKeyView({ onRetry: () => { retries++; } }); };
  const saveButton = () => find(view(), node => node.props?.children === 'Save Key');
  assert.equal(saveButton().props.disabled, true, 'Nothing to save yet');
  find(view(), node => node.type === 'keyfield').props.onChange('my-key');
  saveResult = { success: false, error: 'Could not save the API Key.' };
  saveButton().props.onClick();
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(retries, 0);
  assert.ok(find(view(), node => node.props?.children === 'Could not save the API Key.'), 'A failed save says so');
  saveResult = { success: true };
  saveButton().props.onClick();
  await new Promise(resolve => setTimeout(resolve));
  assert.deepEqual(saved, ['my-key', 'my-key']);
  assert.equal(retries, 1, 'A saved Key is checked right away');
  assert.equal(find(view(), node => node.type === 'keyfield').props.value, '', 'The field is cleared after saving');
}

// Settings store: one config load, synchronous reads after it, change events
// for our own writes and for Millennium's pushes, defaults when loading fails.
const config = { squares: true, glow: 25, tabs_order: ['hero', 'manage', 'icon'], tabs_hidden: ['hero'], tab_default: 'icon' };
let configCalls = 0;
let configFails = true;
let pushChange;
const storeExports = {};
const tabsExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/collections/tabs.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: tabsExports });
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/settings/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: storeExports, console: { error() {} }, require: name => name === '../collections/tabs' ? tabsExports : ({
  pluginConfig: {
    async getAll() { configCalls++; if (configFails) throw Error('offline'); return { ...config }; },
    async set(key, value) { config[key] = value; },
  },
  subscribePluginConfig(listener) { pushChange = listener; },
}) });
const store = storeExports;
await store.loadSettings();
assert.equal(store.readSetting('squares', false), false, 'A failed load falls back to defaults');
configFails = false;
await Promise.all([store.loadSettings(), store.loadSettings()]);
await store.loadSettings();
assert.equal(configCalls, 2, 'Settings load once after a failed attempt');
assert.equal(store.readSetting('squares', false), true);
assert.equal(store.readSetting('missing', 'fallback'), 'fallback');
assert.deepEqual(JSON.parse(JSON.stringify(store.readSetting('tabs_order', []))), ['hero', 'manage', 'collections', 'icon']);
assert.deepEqual(config.tabs_order, ['hero', 'manage', 'icon'], 'Reading the extended order does not rewrite saved settings');
assert.deepEqual(store.readSetting('tabs_hidden', []), ['hero']);
assert.equal(store.readSetting('tab_default', 'grid_p'), 'icon');
await store.writeSetting('tabs_order', ['collections', 'manage', 'hero']);
assert.deepEqual(store.readSetting('tabs_order', []), ['collections', 'manage', 'hero'], 'A reordered Collections tab stays where the user put it');
const changes = [];
const stop = store.onSettingChanged((key, value) => changes.push([key, value]));
await store.writeSetting('hide_authors', true);
assert.equal(config.hide_authors, true, 'Writes go to plugin config');
pushChange('glow', 80);
pushChange('squares', null);
assert.equal(store.readSetting('glow', 100), 80);
assert.equal(store.readSetting('squares', false), false, 'A deleted key reads as its default');
stop();
pushChange('glow', 10);
assert.deepEqual(changes, [['hide_authors', true], ['glow', 80], ['squares', null]]);
await assert.rejects(store.writeSetting('x', undefined), /JSON/);
console.log('Settings checks passed: browser routing, API Key gate, rejected Key and the config store.');
