// Icon refreshes swap app overviews in Steam's store; unloading the plugin puts the store back.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exported = {};
class Overview {
  constructor(appid) { this.appid = appid; this.icon_data = 'old'; }
  InitFromProto() { this.icon_data = 'from-steam'; return 'init'; }
}
const apps = new Map([[1, new Overview(1)], [2, new Overview(2)]]);
const window = { appStore: { m_mapApps: apps, GetAppOverviewByAppID: id => apps.get(id) } };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../frontend/steam/app-overview-refresh.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exported, window, Symbol, Object, Map, Set, Date, Math });

exported.refreshShortcutIcon(1, 'new');
assert.ok(Object.hasOwn(apps, 'set'), 'The store map is wrapped');
const refreshed = apps.get(1);
assert.equal(refreshed.icon_data, 'new');
refreshed.InitFromProto();
assert.equal(refreshed.icon_data, 'new', "Steam's own update keeps the new icon");
exported.refreshShortcutIcon(1, 'newer');
assert.equal(apps.get(1).icon_data, 'newer', 'A copy of a patched overview is patched too');

exported.restoreAppOverviews();
assert.ok(!Object.hasOwn(apps, 'set'), "The map's own set is back");
for (const overview of [refreshed, apps.get(1)]) {
  assert.ok(!Object.hasOwn(overview, 'InitFromProto'), 'No overview keeps the wrapper');
  overview.InitFromProto();
  assert.equal(overview.icon_data, 'from-steam');
}
apps.set(2, new Overview(2));
assert.equal(apps.get(2).icon_data, 'old', 'Later store updates are untouched');
console.log('App overview checks passed: icon refresh survives Steam updates, copies stay patched, unloading restores the store.');
