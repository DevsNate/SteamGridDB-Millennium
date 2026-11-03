import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    exports: module.exports,
    require(name) { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; },
    ...globals,
  }, { filename: path });
  return module.exports;
}

let reply;
let rejection;
let options;
const picker = load('frontend/shims/decky-api/index.ts', {
  millennium: {}, '../../services/sgdb-response': {}, '../../services/backend': {},
  '../../services/icon-images': {}, '../../steam/app-overview-refresh': {}, '../../settings/store': {},
  '../../settings/key-rejected': {},
}, { SteamClient: { System: { async OpenFileDialog(value) {
  options = value;
  if (rejection !== undefined) throw rejection;
  return reply;
} } } });

for (const failure of [{ result: 52, message: '' }, { result: 52, message: 'Canceled' }]) {
  rejection = failure;
  await assert.rejects(picker.openFilePicker(picker.FileSelectionType.FILE, ''), { message: 'User Canceled' });
}
for (const [failure, message] of [
  [{ result: 2, message: '' }, 'File dialog failed (EResult 2)'],
  [{ result: 15, message: 'Access denied' }, 'Access denied'],
  [new Error('Native failure'), 'Native failure'],
  [null, 'File dialog failed'],
  ['unknown', 'File dialog failed'],
]) {
  rejection = failure;
  await assert.rejects(picker.openFilePicker(picker.FileSelectionType.FOLDER, ''), { message });
}
rejection = undefined;
for (const empty of [undefined, null, [], '', ['']]) {
  reply = empty;
  await assert.rejects(picker.openFilePicker(picker.FileSelectionType.FILE, ''), { message: 'User Canceled' });
}
reply = ['C:\\artwork.png'];
assert.equal((await picker.openFilePicker(picker.FileSelectionType.FILE, 'C:\\', true, true, /\.png$/, ['png'])).path, reply[0]);
assert.equal(options.rgFilters[0].rFilePatterns[0], '*.png');
reply = 'C:\\folder';
assert.equal((await picker.openFilePicker(picker.FileSelectionType.FOLDER, '')).realpath, reply);
assert.equal(options.bChooseDirectory, true);
await assert.rejects(picker.openFilePicker(picker.FileSelectionType.FILE, '', true, true, /\.png$/), /requested filter/);

const navigation = load('frontend/desktop-window/navigation.tsx', { millennium: {}, react: {}, 'react/jsx-runtime': {} });
const listeners = new Map();
const owner = {
  addEventListener(name, listener) { listeners.set(name, listener); },
  removeEventListener(name, listener) { assert.equal(listeners.get(name), listener); listeners.delete(name); },
};
let created = 0;
let resets = 0;
let registered = 0;
class Keyboard {
  constructor(window) {
    created++;
    this.OnKeyDown = () => {};
    this.OnKeyUp = () => {};
    this.Reset = () => { resets++; };
    window.addEventListener('keydown', this.OnKeyDown);
    window.addEventListener('keyup', this.OnKeyUp);
    window.addEventListener('blur', this.Reset);
  }
}
const controller = { RegisterInputSource() { registered++; return () => { registered--; }; } };
const page = navigation.registerDesktopKeyboard(owner, Keyboard, controller);
const dialog = navigation.registerDesktopKeyboard(owner, Keyboard, controller);
assert.equal(created, 1);
assert.equal(registered, 1);
dialog(); dialog();
assert.equal(registered, 1);
assert.equal(listeners.size, 3);
page(); page();
assert.equal(registered, 0);
assert.equal(listeners.size, 0);
assert.equal(resets, 1);
navigation.registerDesktopKeyboard(owner, Keyboard, controller)();
assert.equal(created, 2);
assert.equal(listeners.size, 0);
for (const missing of ['lookup', 'controller']) {
  let warnings = 0;
  const Native = () => undefined;
  const fallback = load('frontend/desktop-window/navigation.tsx', {
    millennium: {
      findModuleExport: () => missing === 'lookup' ? undefined : Native,
      getFocusNavController: () => missing === 'controller' ? undefined : controller,
    },
    react: {
      useId: () => 'fallback-test', useState: () => [null, () => {}],
      useCallback: callback => callback, useEffect: callback => callback(),
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
  }, { console: { warn: () => { warnings++; } } });
  const child = { type: 'button', props: { children: 'Mouse control' } };
  assert.equal(fallback.DesktopNavigation({ children: child }).props.children, child);
  assert.equal(fallback.DesktopNavigation({ children: child, modal: true }).props.children, child);
  assert.equal(warnings, 1, 'Missing navigation warns once and preserves page/dialog children');
}
console.log('Desktop input checks passed: cancel/errors, files/folders, shared native keyboard registration and cleanup.');
