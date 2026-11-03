import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
const state = lauxlib.luaL_newstate();
lualib.luaL_openlibs(state);
function run(source) {
  if (lauxlib.luaL_dostring(state, to_luastring(source)) !== lua.LUA_OK) throw Error(to_jsstring(lua.lua_tostring(state, -1)));
  lua.lua_settop(state, 0);
}
const backend = readFileSync(new URL('../../backend/main.lua', import.meta.url), 'utf8');
// Upstream 1.8.1's built-in key (SGDB_API_KEY in src/hooks/useSGDB.tsx), which
// SteamGridDB rejects. Only its SHA-256 is kept here, so the key isn't in this repo.
const RETIRED_KEY_SHA256 = '1c5cef7552ba6acc6f251859ec191fb6ef9c32555fc10aee1d0e2be5183b2fc2';
const hasRetiredKey = (text) => [...text.matchAll(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi)]
  .some(([token]) => createHash('sha256').update(token.toLowerCase()).digest('hex') === RETIRED_KEY_SHA256);
assert.ok(!hasRetiredKey(backend), 'Retired upstream key must not appear in backend source');
assert.ok(!backend.includes('SGDB_API_KEY'), 'No built-in key slot may remain');
const packed = process.argv.includes('--packed');
const inspect = query => execFileSync(process.execPath, ['node_modules/@steambrew/starlight/bin/starlight.js', '-i', 'dist/steamgriddb.star', '-q', query], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const luaSource = packed ? inspect('backend:backend/main.lua') : backend;
if (packed) {
  const frontend = inspect('frontend:bundle.js');
  assert.ok(!hasRetiredKey(frontend), 'Retired key must not appear in packed frontend');
  assert.ok(!hasRetiredKey(luaSource), 'Retired key must not appear in packed backend');
  assert.ok(!frontend.includes('data:video/webm;base64,'), 'The guide video was removed and must not be in the bundle');
  assert.ok(!frontend.includes('steamgriddb:settings:v1'), 'Old settings must not be read by active frontend');
}
run(`
local files = {}
write_fails = false
requests = {}
response_status = 200
package.preload.http = function() return {
  get=function(url, options) requests[#requests+1]={url=url,options=options}; return {status=response_status,body='{"success":true,"data":[]}' } end,
  request=function(url, options) requests[#requests+1]={url=url,options=options}; return {status=response_status,body=response_empty and '' or '{"success":true,"data":null}' } end
} end
package.preload.logger = function() return {info=function() end,warn=function() end,error=function() end} end
package.preload.millennium = function() return {steam_path=function() return '/steam' end,ready=function() end,assets={read=function(path) return path=='assets/dpad.svg' and '<svg/>' or nil end}} end
package.preload.fs = function() return {join=function(...) return table.concat({...},'/') end,is_directory=function() return true end,file_size=function(path) return files[path] and #files[path] or 0 end} end
package.preload.json = function() return {encode=function(value) return value end,decode=function(value) return value end} end
package.preload.utils = function() return {
  read_file=function(path) return files[path] end,
  write_file=function(path,value) if write_fails then return false end; files[path]=value; return true end,
  uuid=function() uuid_count=(uuid_count or 0)+1; return 'id-'..uuid_count end,
  base64_encode=function(value) return value end
} end
plugin = (function() ${luaSource} end)()
plugin.on_load()
assert(not get_api_key_status().configured)
local missing='Add your SteamGridDB API Key in the plugin settings.'
assert(sgdb_request('/search/autocomplete/test').errors[1]==missing)
assert(sgdb_request('/search/collections').errors[1]==missing)
assert(add_asset_to_collection(1,'logo:2').errors[1]==missing)
assert(#requests==0)
assert(not set_api_key('').success)
assert(not set_api_key('bad\\nkey').success)
assert(set_api_key('test-own-key-abcd').success)
assert(get_api_key_status().configured and get_api_key_status().hint:sub(-4)=='abcd')
sgdb_request('/search/autocomplete/test')
assert(requests[#requests].options.headers.Authorization=='Bearer test-own-key-abcd')
sgdb_request('/search/collections')
assert(requests[#requests].options.headers.Authorization=='Bearer test-own-key-abcd')
add_asset_to_collection(1,'logo:2')
assert(requests[#requests].options.method=='POST')
assert(requests[#requests].options.headers.Authorization=='Bearer test-own-key-abcd')
response_status=401
local rejected='SteamGridDB rejected your API Key. Check it in the plugin settings.'
assert(sgdb_request('/search/autocomplete/test').errors[1]==rejected)
assert(sgdb_request('/search/autocomplete/test').key_rejected==true)
assert(add_asset_to_collection(1,'logo:2').errors[1]==rejected)
response_empty=true
assert(add_asset_to_collection(1,'logo:2').errors[1]==rejected)
response_empty=false
assert(get_api_key_status().configured)
response_status=403
assert(type(sgdb_request('/search/autocomplete/test'))=='string')
response_status=200
write_fails=true
assert(not clear_api_key().success and get_api_key_status().configured)
assert(not set_api_key('replacement-efgh').success)
assert(get_api_key_status().hint:sub(-4)=='abcd')
write_fails=false
assert(clear_api_key().success and not get_api_key_status().configured)
local count=#requests
assert(sgdb_request('/search/autocomplete/test').errors[1]==missing)
assert(add_asset_to_collection(1,'logo:2').errors[1]==missing)
assert(#requests==count)
-- Bundled assets: only known names, read from the .star, returned as data URLs.
assert(read_plugin_asset('dpad.svg').data_url=='data:image/svg+xml;base64,<svg/>')
assert(not read_plugin_asset('../main.lua').success)
assert(not read_plugin_asset('spinner.svg').success)
-- Overlapping transfers each keep their own bytes; release frees only its own.
files['/a.png']='\\137PNG\\13\\10\\26\\10aaaa'
files['/b.png']='\\137PNG\\13\\10\\26\\10bbbb'
local first=load_local_asset('/a.png')
local second=load_local_asset('/b.png')
assert(first.success and second.success and first.id~=second.id and first.chunks==1)
assert(read_asset_chunk(first.id,0)==files['/a.png'])
assert(read_asset_chunk(second.id,0)==files['/b.png'])
assert(read_asset_chunk(first.id,1)==false)
release_asset(first.id)
release_asset(nil)
assert(read_asset_chunk(first.id,0)==false)
assert(read_asset_chunk(second.id,0)==files['/b.png'])
for _=1,4 do load_local_asset('/a.png') end
assert(read_asset_chunk(second.id,0)==false)
`);
lua.lua_close(state);
console.log('Backend checks passed: Lua loads, key selection/collections/clear/rollback, no retired key, bundled assets and overlapping transfers.');
