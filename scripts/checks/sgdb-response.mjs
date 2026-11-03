import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: module.exports,
    require(name) {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
    URL,
    ...globals,
  }, { filename: path });
  return module.exports;
}

const responses = load('frontend/services/sgdb-response.ts');
let response;
const calls = [];
let rejections = 0;
const backend = {
  async sgdb_request(path) { calls.push(['request', path]); return response; },
  async add_asset_to_collection(...args) { calls.push(['collection', ...args]); return response; },
};
const api = load('frontend/services/backend.ts', { './sgdb-response': responses }, { backend });
const shim = load('frontend/shims/decky-api/index.ts', {
  millennium: { routerHook: {}, toaster: {} },
  '../../services/sgdb-response': responses,
  '../../services/backend': api,
  '../../services/icon-images': {},
  '../../steam/app-overview-refresh': {},
  '../../settings/store': {},
  '../../settings/key-rejected': { notifyApiKeyRejected: () => { rejections++; } },
});

for (const envelope of [
  { success: true, data: [] },
  { success: true, data: [{ id: 1, nested: [], nullable: null }] },
  { success: true, data: null },
  { success: false, errors: ['Own key required'] },
]) {
  for (const value of [envelope, JSON.stringify(envelope)]) {
    response = value;
    const reply = await shim.fetchNoCors('https://www.steamgriddb.com/api/v2/grids/steam/367520');
    assert.equal(reply.ok, envelope.success);
    assert.equal(JSON.stringify(await reply.json()), JSON.stringify(envelope));
    assert.equal(JSON.stringify(JSON.parse(await reply.text())), JSON.stringify(envelope));
    if (envelope.success) {
      assert.equal(JSON.stringify(responses.parseResponse(value)), JSON.stringify(envelope.data));
    } else {
      assert.throws(() => responses.parseResponse(value), /Own key required/);
    }
  }
}
for (const value of [{ success: true, data: null }, JSON.stringify({ success: true, data: null })]) {
  response = value;
  await api.addAssetToCollection(123, { id: 456 }, 'logo');
  assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(['collection', 123, 'logo:456']));
}
for (const value of [false, null, undefined, '', true, 123, [], {}, { success: 'yes' }, 'not JSON']) {
  assert.throws(() => responses.decodeResponse(value));
}
assert.equal(rejections, 0, 'Other failures leave the setup view alone');
response = { success: false, key_rejected: true, errors: ['rejected'] };
assert.equal((await shim.fetchNoCors('https://www.steamgriddb.com/api/v2/grids/steam/367520')).ok, false);
assert.equal(rejections, 1, 'A rejected Key tells the artwork page');
response = false;
assert.equal((await shim.fetchNoCors('https://www.steamgriddb.com/api/v2/search/autocomplete/none')).status, 502);
await assert.rejects(shim.fetchNoCors('https://example.com/api/v2/grids/steam/367520'), /only supports/);
console.log('SGDB response checks passed: native objects, JSON text, empty arrays/null, errors, rejected Key, collections and Decky fetch contract.');
