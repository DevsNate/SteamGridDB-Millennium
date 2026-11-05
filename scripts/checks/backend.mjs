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
  get=function(url, options) requests[#requests+1]={url=url,options=options}; return {status=response_status,body=response_body or '{"success":true,"data":[]}' } end,
  post=function(url, data, options) requests[#requests+1]={url=url,data=data,options=options}; return {status=response_status,body='public-body'} end,
  request=function(url, options) requests[#requests+1]={url=url,options=options}; return {status=response_status,body=response_empty and '' or '{"success":true,"data":null}' } end
} end
package.preload.logger = function() return {info=function() end,warn=function() end,error=function() end} end
package.preload.millennium = function() return {steam_path=function() return '/steam' end,ready=function() end,assets={read=function(path) return path=='assets/dpad.svg' and '<svg/>' or nil end}} end
package.preload.fs = function() return {join=function(...) return table.concat({...},'/') end,is_directory=function() return true end,exists=function() return grid_exists~=false end,list=function(path) scan_path=path; if scan_failed then return nil,'access denied' end; if grid_exists==false then if path:sub(-5)=='/grid' then return nil,'missing' end; return {} end; return scan_entries or {} end,stem=function(name) return name:match('^(.*)%.') or name end,file_size=function(path) return files[path] and #files[path] or 0 end,remove=function(path) files[path]=nil; return true end} end
package.preload.json = function() return {encode=function(value) return value end,decode=function(value) if value=='[10,20]' then return {10,20} elseif value=='[0]' then return {0} elseif value=='{"1":[2,[3]]}' then return {} elseif value=='not json' then error('bad json') end; return value end} end
package.preload.utils = function() return {
  read_file=function(path) return files[path] end,
  write_file=function(path,value) if write_fails then return false end; files[path]=value; return true end,
  uuid=function() uuid_count=(uuid_count or 0)+1; return 'id-'..uuid_count end,
  getenv=function(name) return name=='TEMP' and '/tmp' or nil end,
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
-- An HTML error page becomes the API's failure envelope, so the frontend never parses HTML.
response_status=502
response_body='<!doctype html><title>502 Bad Gateway</title>'
assert(sgdb_request('/search/autocomplete/test').errors[1]:find('unexpected response (HTTP 502)',1,true))
response_status=200
assert(sgdb_request('/search/autocomplete/test').errors[1]:find('unexpected response (HTTP 200)',1,true))
assert(get_public_collection(1).errors[1]:find('unexpected response',1,true))
response_body=nil
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
-- Downloads only reach SteamGridDB's and Steam's hosts, without redirects.
for _, url in ipairs({
  'http://cdn2.steamgriddb.com/grid/a.png', 'https://127.0.0.1/a.png', 'https://example.com/a.png',
  'https://steamgriddb.com.example.com/a.png', 'https://evilsteamgriddb.com/a.png', 'https://user@cdn2.steamgriddb.com/a.png',
  'https://cdn2.steamgriddb.com:8443/a.png', 'https://cdn2.steamgriddb.com\\\\@example.com/a.png', 'https://cdn2.steamgriddb.com',
}) do
  local before=#requests
  assert(not download_asset(url).success, url)
  assert(#requests==before, url)
end
local download_options
package.loaded.http.download=function(url, path, options) download_options=options; files[path]='\\137PNG\\13\\10\\26\\10cdn'; return {success=true,status=200} end
os.remove=function(path) files[path]=nil; return true end
for _, url in ipairs({'https://cdn2.steamgriddb.com/grid/a.png', 'https://shared.steamstatic.com/store_item_assets/steam/apps/1/a.jpg', 'https://CDN.Cloudflare.SteamStatic.com/a.ico'}) do
  assert(download_asset(url).success, url)
  assert(download_options.follow_redirects==false and download_options.verify_ssl==true)
end
-- Public collection requests are bounded and never carry the saved key.
set_api_key('test-own-key-abcd')
local before_public=#requests
assert(not get_public_collection(0).success)
assert(not get_public_collection(1.5).success)
assert(not get_public_collection_assets(1,'bogus',0).success)
assert(not get_public_collection_assets(1,'grid',-1).success)
assert(not get_public_collection_assets(1,'grid',0.5).success)
assert(#requests==before_public)
get_public_collection(1)
assert(requests[#requests].url=='https://www.steamgriddb.com/api/public/collection/1')
assert(requests[#requests].options.headers.Authorization==nil)
assert(requests[#requests].options.timeout==20)
get_public_collection_assets(1,'grid',0)
assert(requests[#requests].url=='https://www.steamgriddb.com/api/public/search/assets')
assert(requests[#requests].options.method=='POST')
assert(requests[#requests].options.data.limit==48 and requests[#requests].options.data.page==0)
assert(requests[#requests].options.headers.Authorization==nil)
response_status=503
assert(not get_public_collection(1).success)
response_status=200
-- The preview only scans the explicit account, and scan errors fail closed.
scan_entries={{name='10p.png',is_file=true},{name='10_logo.webp',is_file=true},{name='20_icon.png',is_file=true},{name='20.json',is_file=true}}
local custom=get_custom_artwork('[10,20]','76561197960265729')
assert(custom.success and #custom.custom['10']==2 and #custom.custom['20']==1)
assert(custom.custom['20'][1]=='icon') -- <appid>.json is a logo position, not a wide capsule
assert(scan_path=='/steam/userdata/1/config/grid')
scan_failed=true
assert(not get_custom_artwork('[10,20]','76561197960265729').success)
scan_failed=false
grid_exists=false
assert(get_custom_artwork('[10,20]','76561197960265729').success)
grid_exists=true
assert(not get_custom_artwork('[0]','76561197960265729').success)
assert(not get_custom_artwork('[10,20]','').success)
assert(not get_custom_artwork('invalid','76561197960265729').success)
-- Applied artwork is known only while the file is the one it was recorded with.
local steam_id='76561197960265729'
files['/grid/10p.png']='12345'
scan_entries={{name='10p.png',path='/grid/10p.png',is_file=true},{name='10.json',path='/grid/10.json',is_file=true}}
assert(get_applied_artwork(10,'grid_p',steam_id)==0)
assert(remember_artwork(10,'grid_p',77,steam_id))
assert(get_applied_artwork(10,'grid_p',steam_id)==77)
local scan=get_custom_artwork('[10,20]',steam_id)
assert(scan.applied['10'].grid_p.id==77 and scan.applied['10'].grid_p.collection==false,'The scan reports it, as a one-off pick')
assert(remember_artwork(10,'grid_p',77,steam_id,true))
assert(get_custom_artwork('[10,20]',steam_id).applied['10'].grid_p.collection==true,'Or as coming from a collection')
assert(remember_artwork(10,'grid_p',77,steam_id))
files['/grid/10p.png']='1234567'
assert(get_custom_artwork('[10,20]',steam_id).applied['10']==nil,'A replaced file is not ours')
files['/grid/10p.png']='12345'
assert(get_applied_artwork(10,'hero',steam_id)==0,'Each type has its own')
assert(get_applied_artwork(10,'grid_p','76561197960265730')==0,'And each account')
files['/grid/10p.png']='123456'
assert(get_applied_artwork(10,'grid_p',steam_id)==0,'Replaced, so the ID no longer describes it')
files['/grid/10p.png']='12345'
assert(get_applied_artwork(10,'grid_p',steam_id)==77)
assert(forget_artwork(10,'grid_p',steam_id))
assert(get_applied_artwork(10,'grid_p',steam_id)==0,'Forgotten even with the file still there')
assert(not remember_artwork(10,'hero',77,steam_id),'Nothing to remember without a file')
assert(not remember_artwork(10,'grid_p',0,steam_id))
assert(not remember_artwork(10,'bogus',77,steam_id))
assert(not remember_artwork(0,'grid_p',77,steam_id))
assert(not remember_artwork(10,'grid_p',77,''))
assert(get_applied_artwork(10,'bogus',steam_id)==0)
write_fails=true
assert(not remember_artwork(10,'grid_p',77,steam_id))
write_fails=false
scan_entries=nil
-- Game links are only saved when they're valid JSON of a sensible size.
assert(get_game_links()=='{}')
assert(save_game_links('{"1":[2,[3]]}'))
assert(get_game_links()=='{"1":[2,[3]]}')
assert(not save_game_links('not json'))
assert(get_game_links()=='{"1":[2,[3]]}', 'A rejected save leaves the file alone')
write_fails = true
assert(not save_game_links('{"1":[2,[3]]}'))
write_fails = false
assert(not save_game_links(string.rep('x',4*1024*1024+1)))
assert(not save_game_links(nil))
-- Saved collections.
assert(get_saved_collection(5)=='null')
assert(save_collection(5,'{"a":1}'))
assert(get_saved_collection(5)=='{"a":1}')
assert(not save_collection('../evil','{}'))
assert(not save_collection(5,string.rep('x',3*1024*1024+1)))
assert(not save_collection(5,nil))
assert(get_saved_collection(5)=='{"a":1}')
assert(get_saved_collection('../evil')=='null')
write_fails = true
assert(not save_collection(6,'{}'))
write_fails = false
grid_exists = true
assert(delete_saved_collection(5))
assert(get_saved_collection(5)=='null')
assert(not delete_saved_collection('../evil'))
-- Only the 20 most recent saved collections stay; the one just written always does.
local saved_dir='/steam/millennium/plugins/SteamGridDB/collections'
local saved_list={}
for id=1,25 do
  local path=saved_dir..'/'..id..'.json'
  files[path]='{}'
  saved_list[#saved_list+1]={name=id..'.json',path=path,is_file=true,time=id}
end
saved_list[#saved_list+1]={name='notes.txt',path=saved_dir..'/notes.txt',is_file=true,time=0}
files[saved_dir..'/notes.txt']='x'
scan_entries=saved_list
package.loaded.fs.last_write_time=function(path) for _,e in ipairs(saved_list) do if e.path==path then return e.time end end return 0 end
assert(save_collection(1,'{}'))
local kept=0
for id=1,25 do if files[saved_dir..'/'..id..'.json'] then kept=kept+1 end end
assert(kept==20,'kept '..kept)
assert(files[saved_dir..'/1.json'],'The collection just saved is kept, though its old time was oldest')
assert(files[saved_dir..'/25.json'] and not files[saved_dir..'/6.json'] and files[saved_dir..'/7.json'])
assert(files[saved_dir..'/notes.txt'],'Other files are left alone')
scan_entries=nil
`);
lua.lua_close(state);
console.log('Backend checks passed: Lua loads, key selection/collections/clear/rollback, no retired key, bundled assets, overlapping transfers, public collection validation/auth isolation and custom-art scan failures.');
