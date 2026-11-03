// Applies backend/main.lua's serve-time patches to the installed Steam client's
// sp.js the way Millennium's loopback engine does (first `find` match, then each
// transform replaced throughout that region), and checks the result.
// Set STEAM_PATH if Steam isn't in the default folder.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const steam = process.env.STEAM_PATH ?? 'C:/Program Files (x86)/Steam';
const spPath = join(steam, 'steamui/sp.js');
if (!existsSync(spPath)) {
  console.log(`Serve patch check skipped: no ${spPath}.`);
  process.exit(0);
}

// Loads main.lua with stub modules and returns its patches table as JSON.
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
const source = readFileSync(new URL('../../backend/main.lua', import.meta.url), 'utf8');
const script = `
for _, name in ipairs({'http','logger','millennium','fs','json','utils'}) do
  package.preload[name] = function() return setmetatable({}, {__index=function() return function() end end}) end
end
local plugin = (function() ${source} end)()
local out = {}
for _, p in ipairs(plugin.patches) do
  local t = {}
  for _, x in ipairs(p.transforms) do t[#t+1] = {x.match, x.replace} end
  out[#out+1] = {p.file, p.find, t}
end
patches_out = out`;
if (lauxlib.luaL_dostring(state, to_luastring(script)) !== lua.LUA_OK) throw Error(to_jsstring(lua.lua_tostring(state, -1)));
const read = (index) => {
  if (lua.lua_isstring(state, index)) return to_jsstring(lua.lua_tostring(state, index));
  const list = [];
  for (let i = 1; lua.lua_rawgeti(state, index, i) !== lua.LUA_TNIL; i++) {
    list.push(read(lua.lua_gettop(state)));
    lua.lua_pop(state, 1);
  }
  lua.lua_pop(state, 1);
  return list;
};
lua.lua_getglobal(state, to_luastring('patches_out'));
const patches = read(lua.lua_gettop(state));

// Millennium's expand_self and re2_to_rust_rep; JS replacement strings share Rust's `$N` and `$$`.
const replacement = (text) => text
  .replaceAll('#{{self}}', "window.PLUGIN_LIST['steamgriddb']")
  .replace(/\$|\\(\d)/g, (match, digit) => digit ? `$${digit}` : '$$$$');

let sp = readFileSync(spPath, 'utf8');
for (const [file, find, transforms] of patches) {
  assert.ok(new RegExp(file).test('https://steamloopback.host/sp.js'), `${file} must select sp.js`);
  assert.equal([...sp.matchAll(new RegExp(find, 'g'))].length, 1, `find must match once: ${find}`);
  const found = new RegExp(find).exec(sp);
  let region = found[0];
  for (const [match, replace] of transforms) {
    const hits = [...region.matchAll(new RegExp(match, 'g'))].length;
    assert.equal(hits, 1, `transform must match once in its region: ${match}`);
    region = region.replace(new RegExp(match, 'g'), replacement(replace));
  }
  sp = sp.slice(0, found.index) + region + sp.slice(found.index + found[0].length);
}
assert.doesNotThrow(() => new vm.Script(sp, { filename: 'sp.js' }), 'Patched sp.js must still parse');

const self = "(window.PLUGIN_LIST&&window.PLUGIN_LIST['steamgriddb'])";
assert.match(sp, /&&this\.BuildManageSubmenu\(([\w$]+),[\w$]+,[\w$]+\),(![\w$.]+\.BKioskModeLocked\(\))&&\(window\.PLUGIN_LIST&&window\.PLUGIN_LIST\['steamgriddb'\]\)\?\.libraryMenuItem\?\.\(\1\),/);
assert.match(sp, /static CreatePopup\(([\w$]+),([\w$]+)\)\{\2=\(window\.PLUGIN_LIST&&window\.PLUGIN_LIST\['steamgriddb'\]\)\?\.popupParams\?\.\(\1,\2\)\?\?\2;/);
assert.match(sp, /\?\.popupCreated\?\.\(arguments\[0\],([\w$]+)\),\{popup:\1,element:/);

// The guard keeps CreatePopup working before Millennium defines PLUGIN_LIST.
const guard = new Function('window', `return ${self}?.popupParams?.('SP BPM_uid0', 1) ?? 1;`);
assert.equal(guard({}), 1);
assert.equal(guard({ PLUGIN_LIST: {} }), 1);
assert.equal(guard({ PLUGIN_LIST: { steamgriddb: { popupParams: () => 2 } } }), 2);
// The frontend side of the hooks.
const { default: ts } = await import('typescript');
const attached = [];
const restore = new Map([['SteamGridDBDesktopPopout', 'saved-geometry']]);
const hooks = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/steam/serve-hooks.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports: hooks, console: { error() {} },
  g_PopupManager: { GetRestoreDetails: (key) => restore.get(key), SetRestoreDetails: (key, value) => restore.set(key, value) },
  require: (name) => ({
    millennium: { MenuItem: 'MenuItem' },
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }) },
    '../library/styles': { attachLibraryStyles: (owner) => attached.push(owner) },
    './windows': {},
  })[name],
});
const other = { eCreationFlags: 1 };
assert.equal(hooks.popupParams('SP Desktop_uid0', other), other, 'Other popups keep their params');
const popout = hooks.popupParams('SteamGridDB', { eCreationFlags: 1, center_on_window: 'main' });
assert.deepEqual([popout.eCreationFlags, popout.strRestoreDetails, popout.center_on_window], [17, 'saved-geometry', undefined]);
restore.clear();
assert.equal(hooks.popupParams('SteamGridDB', { center_on_window: 'main' }).center_on_window, 'main', 'First open centers');
const bigPicture = {};
hooks.popupCreated('SP BPM_uid0', bigPicture);
hooks.popupCreated('SP Desktop_uid0', {});
assert.deepEqual(attached, [bigPicture], 'Only Big Picture windows get library styles');
assert.doesNotThrow(() => hooks.popupCreated('SteamGridDB', { get SteamClient() { throw Error('gone'); } }), 'Hooks never throw into Steam');
const opened = [];
const item = hooks.createLibraryMenuItem((appid) => opened.push(appid));
assert.equal(item([{ appid: 1 }, { appid: 2 }]), null, 'No item for a multi-selection');
item([{ appid: 620 }]).props.onSelected();
assert.deepEqual(opened, [620]);
console.log(`Serve patch checks passed: ${patches.length} patches apply once each to this Steam's sp.js, which still parses; guarded before the plugin loads; popout params, window setup and menu item.`);
