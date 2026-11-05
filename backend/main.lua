---@class ApiKeyResult
---@field success boolean
---@field configured? boolean
---@field hint? string
---@field error? string

---@class HeldAssetResult
---@field success boolean
---@field id? string
---@field format? string
---@field chunks? number
---@field error? string

---@class PluginAssetResult
---@field success boolean
---@field data_url? string
---@field error? string

---@class IconResult
---@field success boolean
---@field error? string
---@field path? string
---@field written? number
---@field removed? number

local http = require("http")
local logger = require("logger")
local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")
local json = require("json")

local SGDB_API_BASE = "https://www.steamgriddb.com/api/v2"
local USER_AGENT = "steamgriddb-millennium/1.1"
-- Millennium v3.3.1 cancels child RPC calls after 30 seconds. Leave enough
-- headroom for response parsing, image conversion, and filesystem work.
local RPC_NETWORK_TIMEOUT_SECONDS = 20
local MAX_ARTWORK_BYTES = 64 * 1024 * 1024
local MAX_ICON_BYTES = 20 * 1024 * 1024

-- Keep settings in the legacy data directory;
-- packed Lua has a virtual source label, not a filesystem plugin directory.
local PLUGIN_DIR = fs.join(millennium.steam_path(), "millennium", "plugins", "SteamGridDB")
local SETTINGS_FILE = fs.join(PLUGIN_DIR, "settings.json")
local settings = { api_key = "" }

-- Input validation -------------------------------------------------------

local function trim(value)
    return string.match(tostring(value or ""), "^%s*(.-)%s*$") or ""
end

local function validate_appid(value)
    local appid = tonumber(value)
    if not appid or appid <= 0 or appid > 4294967295 or appid ~= math.floor(appid) then
        return nil, "Steam App ID must be a positive 32-bit integer."
    end
    return string.format("%.0f", appid)
end

-- Artwork comes from SteamGridDB's CDN or, for official art, Steam's.
local ARTWORK_DOMAINS = { "steamgriddb.com", "steamstatic.com" }

local function is_artwork_host(host)
    for _, domain in ipairs(ARTWORK_DOMAINS) do
        if host == domain or string.sub(host, -(#domain + 1)) == "." .. domain then
            return true
        end
    end
    return false
end

local function validate_https_url(value)
    local url = trim(value)
    if url == "" or #url > 4096 or string.find(url, "[%z\1-\31\127\\]") then
        return nil, "Artwork URL is invalid."
    end
    -- No user info or port: the host is everything up to the first slash.
    local host = string.match(url, "^https://([%w%.%-]+)/")
    if not host then
        return nil, "Artwork URL must use HTTPS."
    end
    if not is_artwork_host(string.lower(host)) then
        return nil, "Artwork can only be downloaded from SteamGridDB or Steam."
    end
    return url
end

local function validate_api_path(value)
    if type(value) ~= "string" or #value == 0 or #value > 8192 then
        return nil, "SteamGridDB API path is invalid."
    end
    if string.sub(value, 1, 1) ~= "/"
        or string.sub(value, 1, 2) == "//"
        or string.find(value, "[%z\1-\31\127\\#]")
        or string.find(value, "://", 1, true) then
        return nil, "SteamGridDB API path is invalid."
    end

    local endpoint, namespace = string.match(value, "^/([a-z]+)/([a-z]+)/%d+%?.+$")
    local allowed_endpoints = { grids = true, heroes = true, logos = true, icons = true }
    local allowed_namespaces = { game = true, steam = true }
    local allowed = value == "/search/collections"
        or string.match(value, "^/search/autocomplete/[^/?#]+$")
        or string.match(value, "^/games/id/%d+%?platformdata=steam$")
        or (allowed_endpoints[endpoint] and allowed_namespaces[namespace])
    if not allowed then
        return nil, "SteamGridDB API path is not permitted."
    end
    return value
end

local function detect_format(bytes)
    if type(bytes) ~= "string" then
        return nil
    end
    if string.sub(bytes, 1, 8) == "\137PNG\13\10\26\10" then
        return "png"
    end
    if string.byte(bytes, 1) == 0xff and string.byte(bytes, 2) == 0xd8 and string.byte(bytes, 3) == 0xff then
        return "jpg"
    end
    if string.sub(bytes, 1, 4) == "RIFF" and string.sub(bytes, 9, 12) == "WEBP" then
        return "webp"
    end
    if string.sub(bytes, 1, 6) == "GIF87a" or string.sub(bytes, 1, 6) == "GIF89a" then
        return "gif"
    end
    if string.sub(bytes, 1, 4) == "\0\0\1\0" then
        return "ico"
    end
    if string.sub(bytes, 1, 4) == "\26\69\223\163" then
        return "webm"
    end
    if string.sub(bytes, 5, 8) == "ftyp" then
        return "mp4"
    end
    return nil
end

-- Downloads a URL to a temporary file and checks its size and file format.
-- Returns the temporary path, the file's bytes and its detected format.
local function download_validated(url, maximum_bytes, allowed_formats, label)
    local temp_dir = utils.getenv("TEMP") or utils.getenv("TMP") or utils.get_backend_path()
    local temp_path = fs.join(temp_dir, "steamgriddb-millennium-" .. label .. "-" .. utils.uuid() .. ".download")
    local call_ok, result, download_err = pcall(http.download, url, temp_path, {
        timeout = RPC_NETWORK_TIMEOUT_SECONDS,
        -- A redirect could lead off the allowed hosts. Neither CDN redirects artwork.
        follow_redirects = false,
        verify_ssl = true,
        user_agent = USER_AGENT,
    })
    if not call_ok or not result or not result.success or (result.status and (result.status < 200 or result.status >= 300)) then
        os.remove(temp_path)
        return nil, "download failed: " .. tostring(call_ok and (download_err or (result and result.status)) or result)
    end

    local size = tonumber(fs.file_size(temp_path)) or 0
    if size <= 0 or size > maximum_bytes then
        os.remove(temp_path)
        return nil, "downloaded file is empty or too large (" .. tostring(size) .. " bytes)"
    end

    local bytes = utils.read_file(temp_path)
    local format = detect_format(bytes)
    if not format or not allowed_formats[format] then
        os.remove(temp_path)
        return nil, "downloaded file is not a supported format"
    end
    return temp_path, bytes, format
end

-- Settings ---------------------------------------------------------------

local function load_settings()
    local body = utils.read_file(SETTINGS_FILE)
    if not body or body == "" then
        settings = { api_key = "" }
        return
    end

    local ok, decoded = pcall(json.decode, body)
    if not ok or type(decoded) ~= "table" then
        logger:warn("Could not decode SteamGridDB settings.json")
        settings = { api_key = "" }
        return
    end

    settings = decoded
    settings.api_key = trim(settings.api_key)
end

local function ensure_data_dir()
    if fs.is_directory(PLUGIN_DIR) then return true end
    local created, create_err = fs.create_directories(PLUGIN_DIR)
    if not created and not fs.is_directory(PLUGIN_DIR) then
        logger:error("Could not create SteamGridDB data directory: " .. tostring(create_err))
        return false
    end
    return true
end

local function save_settings()
    if not ensure_data_dir() then return false end
    local ok, err = utils.write_file(SETTINGS_FILE, json.encode(settings))
    if not ok then
        logger:error("Could not save SteamGridDB settings: " .. tostring(err))
    end
    return ok
end

-- The full key never leaves the backend. The UI only needs to know that one
-- is saved and which one it is.
local function api_key_hint(api_key)
    if api_key == "" then
        return ""
    end
    return "\226\128\166" .. string.sub(api_key, -4)
end

-- SteamGridDB API --------------------------------------------------------

local function api_failure(message)
    return json.encode({ success = false, errors = { tostring(message) } })
end

-- Error pages from SteamGridDB or its proxy are HTML, not the API's JSON envelope.
local function unexpected_body(res)
    if type(res.body) == "string" and string.match(res.body, "^%s*[{%[]") then
        return nil
    end
    return api_failure("SteamGridDB returned an unexpected response (HTTP " .. tostring(res.status) .. "). Try again later.")
end

local function api_key_missing()
    return api_failure("Add your SteamGridDB API Key in the plugin settings.")
end

-- key_rejected lets the artwork page show the API Key setup view.
local function api_key_rejected()
    return json.encode({
        success = false,
        key_rejected = true,
        errors = { "SteamGridDB rejected your API Key. Check it in the plugin settings." },
    })
end

---@ffi
---@param path string
---@return string|boolean
function sgdb_request(path)
    local safe_path, path_err = validate_api_path(path)
    if not safe_path then
        logger:error("Rejected SteamGridDB API path: " .. tostring(path))
        return api_failure(path_err)
    end

    local api_key = trim(settings.api_key)
    if api_key == "" then
        return api_key_missing()
    end
    local res, err = http.get(SGDB_API_BASE .. safe_path, {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
        },
        timeout = RPC_NETWORK_TIMEOUT_SECONDS,
        user_agent = USER_AGENT,
    })

    if not res then
        logger:error("SteamGridDB request failed: " .. tostring(err))
        return false
    end

    if res.status == 401 then
        return api_key_rejected()
    end

    return unexpected_body(res) or res.body
end

---@ffi
---@param collection_id number
---@param route string
---@return string|boolean
function add_asset_to_collection(collection_id, route)
    local allowed_asset_types = {
        grid = true,
        hero = true,
        logo = true,
        icon = true,
    }
    local asset_type, encoded_id = string.match(tostring(route or ""), "^([a-z]+):(%d+)$")
    if asset_type then
        route = encoded_id
    else
        asset_type = "grid"
    end
    collection_id = tonumber(collection_id)
    local asset_id = tonumber(route)
    if not collection_id or collection_id <= 0 or collection_id ~= math.floor(collection_id) then
        return api_failure("Invalid SteamGridDB collection ID.")
    end
    if not asset_id or asset_id <= 0 or asset_id ~= math.floor(asset_id) then
        return api_failure("Invalid SteamGridDB asset ID.")
    end
    if not allowed_asset_types[asset_type] then
        return api_failure("Unsupported SteamGridDB collection asset type.")
    end

    local api_key = trim(settings.api_key)
    if api_key == "" then
        return api_key_missing()
    end

    local path = string.format("/collections/%d/%s/%d", collection_id, asset_type, asset_id)
    local res, err = http.request(SGDB_API_BASE .. path, {
        method = "POST",
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
        },
        timeout = RPC_NETWORK_TIMEOUT_SECONDS,
        user_agent = USER_AGENT,
    })

    if not res then
        logger:error("SteamGridDB collection request failed: " .. tostring(err))
        return api_failure("SteamGridDB collection request failed: " .. tostring(err))
    end
    if res.status == 401 then
        return api_key_rejected()
    end
    if not res.body or res.body == "" then
        return api_failure("SteamGridDB returned an empty collection response (HTTP " .. tostring(res.status) .. ").")
    end

    return unexpected_body(res) or res.body
end

-- Collections (website API) ----------------------------------------------
--
-- The v2 API can't read a collection's contents, so Collections
-- uses the public API behind SteamGridDB's own collection pages. It needs no
-- key, and none is sent. It's undocumented and may change.

local SGDB_PUBLIC_BASE = "https://www.steamgriddb.com/api/public"
local COLLECTION_PAGE_SIZE = 48
local MAX_GAME_LINKS_BYTES = 4 * 1024 * 1024
-- A reply is limited to 8 MB, and JSON text grows when it's sent as a string.
local MAX_SAVED_COLLECTION_BYTES = 3 * 1024 * 1024
-- Every opened collection is saved, so only the most recent ones are kept (at most 60 MB).
local MAX_SAVED_COLLECTIONS = 20
local SAVED_COLLECTIONS_DIR = fs.join(PLUGIN_DIR, "collections")

local function validate_collection_id(value)
    local id = tonumber(value)
    if not id or id <= 0 or id ~= math.floor(id) or id > 2147483647 then
        return nil
    end
    return id
end

local function public_failure(res, err)
    if not res then
        return api_failure("SteamGridDB request failed: " .. tostring(err))
    end
    if not res.body or res.body == "" then
        return api_failure("SteamGridDB returned an empty response (HTTP " .. tostring(res.status) .. ").")
    end
    if res.status < 200 or res.status >= 300 then
        return api_failure("SteamGridDB collection request failed (HTTP " .. tostring(res.status) .. ").")
    end
    return unexpected_body(res)
end

---@ffi
---@param collection_id number
---@return string
function get_public_collection(collection_id)
    local id = validate_collection_id(collection_id)
    if not id then
        return api_failure("Invalid SteamGridDB collection ID.")
    end
    local res, err = http.get(string.format("%s/collection/%d", SGDB_PUBLIC_BASE, id), {
        headers = { ["Accept"] = "application/json" },
        timeout = RPC_NETWORK_TIMEOUT_SECONDS,
        user_agent = USER_AGENT,
    })
    return public_failure(res, err) or res.body
end

-- Pages start at 0. Ask only for types the collection's counts include: an
-- empty type makes the website API fail instead of returning no assets.
---@ffi
---@param collection_id number
---@param asset_type string
---@param page number
---@return string
function get_public_collection_assets(collection_id, asset_type, page)
    local allowed_asset_types = { grid = true, hero = true, logo = true, icon = true }
    local id = validate_collection_id(collection_id)
    page = tonumber(page)
    if not id then
        return api_failure("Invalid SteamGridDB collection ID.")
    end
    if not allowed_asset_types[asset_type] then
        return api_failure("Unsupported SteamGridDB collection asset type.")
    end
    if not page or page < 0 or page ~= math.floor(page) or page > 10000 then
        return api_failure("Invalid page.")
    end
    local body = json.encode({ asset_type = asset_type, collection_id = id, page = page, limit = COLLECTION_PAGE_SIZE })
    -- Use request explicitly: older Millennium post helpers lose their options.
    local res, err = http.request(SGDB_PUBLIC_BASE .. "/search/assets", {
        method = "POST",
        data = body,
        headers = { ["Accept"] = "application/json", ["Content-Type"] = "application/json" },
        timeout = RPC_NETWORK_TIMEOUT_SECONDS,
        user_agent = USER_AGENT,
    })
    return public_failure(res, err) or res.body
end

-- Which Steam apps each SteamGridDB game links to, so a game is only looked up
-- once. Library ownership is never stored: it's always read live from Steam.
---@ffi
---@return string
function get_game_links()
    return utils.read_file(fs.join(PLUGIN_DIR, "game_links.json")) or "{}"
end

---@ffi
---@param links string JSON object
---@return boolean
function save_game_links(links)
    if type(links) ~= "string" or #links > MAX_GAME_LINKS_BYTES then return false end
    local ok, decoded = pcall(json.decode, links)
    if not ok or type(decoded) ~= "table" or not ensure_data_dir() then return false end
    local written, err = utils.write_file(fs.join(PLUGIN_DIR, "game_links.json"), links)
    if not written then
        logger:error("Could not save SteamGridDB game links: " .. tostring(err))
        return false
    end
    return true
end

-- A collection's contents, so it opens right away. The frontend validates what it reads back.
local function saved_collection_path(collection_id)
    local id = validate_collection_id(collection_id)
    return id and fs.join(SAVED_COLLECTIONS_DIR, string.format("%d.json", id)) or nil
end

---@ffi
---@param collection_id number
---@return string
function get_saved_collection(collection_id)
    local path = saved_collection_path(collection_id)
    return path and utils.read_file(path) or "null"
end

-- Removes the oldest saved collections past the limit, never the one just written.
local function prune_saved_collections(keep_path)
    local saved = {}
    for _, entry in ipairs(fs.list(SAVED_COLLECTIONS_DIR) or {}) do
        if entry.is_file and string.match(entry.name, "^%d+%.json$") and entry.path ~= keep_path then
            saved[#saved + 1] = { path = entry.path, time = tonumber(fs.last_write_time(entry.path)) or 0 }
        end
    end
    table.sort(saved, function(a, b) return a.time > b.time end)
    for index = MAX_SAVED_COLLECTIONS, #saved do
        fs.remove(saved[index].path)
    end
end

---@ffi
---@param collection_id number
---@param contents string JSON object
---@return boolean
function save_collection(collection_id, contents)
    local path = saved_collection_path(collection_id)
    if not path or type(contents) ~= "string" or #contents > MAX_SAVED_COLLECTION_BYTES then return false end
    if not ensure_data_dir() then return false end
    if not fs.is_directory(SAVED_COLLECTIONS_DIR) and not fs.create_directories(SAVED_COLLECTIONS_DIR) then return false end
    local written, err = utils.write_file(path, contents)
    if not written then
        logger:error("Could not save SteamGridDB collection: " .. tostring(err))
        return false
    end
    prune_saved_collections(path)
    return true
end

---@ffi
---@param collection_id number
---@return boolean
function delete_saved_collection(collection_id)
    local path = saved_collection_path(collection_id)
    if not path then return false end
    if fs.exists(path) then fs.remove(path) end
    return true
end

---@ffi
---@return ApiKeyResult
function get_api_key_status()
    local api_key = trim(settings.api_key)
    return {
        success = true,
        configured = api_key ~= "",
        hint = api_key_hint(api_key),
    }
end

---@ffi
---@param api_key string
---@return ApiKeyResult
function set_api_key(api_key)
    api_key = trim(api_key)
    if api_key == "" then
        return { success = false, error = "API Key cannot be empty." }
    end
    if string.len(api_key) > 256 or string.find(api_key, "[%z\1-\31\127]") then
        return { success = false, error = "API Key is not valid." }
    end

    local previous = settings.api_key
    settings.api_key = api_key
    if not save_settings() then
        settings.api_key = previous
        return { success = false, error = "Could not save the API Key." }
    end

    return {
        success = true,
        configured = true,
        hint = api_key_hint(api_key),
    }
end

---@ffi
---@return ApiKeyResult
function clear_api_key()
    local previous = settings.api_key
    settings.api_key = ""
    if not save_settings() then
        settings.api_key = previous
        return { success = false, error = "Could not clear the API Key." }
    end
    return get_api_key_status()
end

-- Starlight's Lua host rejects a return value above 8 MB, and
-- SteamGridDB artwork can be larger than that once Base64-encoded. Downloads
-- are therefore held here and read by the frontend in chunks. A chunk is a
-- multiple of 3 bytes, so the Base64 of each chunk joins without padding.
local DOWNLOAD_CHUNK_BYTES = 3 * 1024 * 1024
-- Several transfers can be in flight (an apply started before the last one
-- finished). Each is held under its own id; the oldest goes past the limit.
local MAX_HELD_ASSETS = 4
local held_assets = {}
local held_order = {}

local function forget_asset(id)
    if type(id) ~= "string" then
        return
    end
    held_assets[id] = nil
    for index, held_id in ipairs(held_order) do
        if held_id == id then
            table.remove(held_order, index)
            break
        end
    end
end

local function hold_asset(bytes, format)
    local id = utils.uuid()
    held_assets[id] = bytes
    table.insert(held_order, id)
    while #held_order > MAX_HELD_ASSETS do
        held_assets[table.remove(held_order, 1)] = nil
    end
    return {
        success = true,
        id = id,
        format = format,
        chunks = math.ceil(#bytes / DOWNLOAD_CHUNK_BYTES),
    }
end

---@ffi
---@param url string
---@return HeldAssetResult
function download_asset(url)
    local safe_url, url_err = validate_https_url(url)
    if not safe_url then
        logger:error("Artwork download rejected: " .. tostring(url_err))
        return { success = false, error = url_err }
    end

    local temp_path, bytes_or_err, format = download_validated(safe_url, MAX_ARTWORK_BYTES, {
        png = true, jpg = true, webp = true, gif = true, ico = true,
    }, "asset")
    if not temp_path then
        logger:error("Artwork download failed: " .. tostring(bytes_or_err))
        return { success = false, error = "The artwork could not be downloaded." }
    end
    os.remove(temp_path)

    logger:info("Artwork download completed: " .. tostring(#bytes_or_err) .. " bytes")
    return hold_asset(bytes_or_err, format)
end

-- Reads an image the user picked with Steam's file dialog and holds it for
-- read_asset_chunk, like download_asset. Only image files are accepted.
---@ffi
---@param path string
---@return HeldAssetResult
function load_local_asset(path)
    if type(path) ~= "string" or path == "" or #path > 4096 or path:find("[%z\1-\31]") then
        return { success = false, error = "Invalid file path." }
    end

    local size = tonumber(fs.file_size(path)) or 0
    if size <= 0 or size > MAX_ARTWORK_BYTES then
        logger:error("Local artwork rejected: missing, empty or too large (" .. tostring(size) .. " bytes)")
        return { success = false, error = "The file is missing, empty or too large." }
    end

    local bytes = utils.read_file(path)
    local format = detect_format(bytes)
    if not format or not ({ png = true, jpg = true, webp = true, gif = true, ico = true })[format] then
        logger:error("Local artwork rejected: not a supported image")
        return { success = false, error = "The file is not a PNG, JPEG, WebP, GIF or ICO image." }
    end

    logger:info("Local artwork loaded: " .. tostring(#bytes) .. " bytes")
    return hold_asset(bytes, format)
end

---@ffi
---@param id string
---@param index number
---@return string|boolean
function read_asset_chunk(id, index)
    index = tonumber(index)
    local bytes = held_assets[id]
    if not bytes or not index or index < 0 or index ~= math.floor(index) then
        return false
    end
    local start = index * DOWNLOAD_CHUNK_BYTES + 1
    if start > #bytes then
        return false
    end
    return utils.base64_encode(string.sub(bytes, start, start + DOWNLOAD_CHUNK_BYTES - 1))
end

---@ffi
---@param id string
---@return boolean
function release_asset(id)
    forget_asset(id)
    return true
end

-- Bundled assets -------------------------------------------------------

-- Files packed into the .star by millennium.toml's [assets] resources. The
-- frontend can't read the .star itself, so it asks for them here once.
local PLUGIN_ASSET_TYPES = {
    ["spinner.svg"] = "image/svg+xml",
    ["dpad.svg"] = "image/svg+xml",
    ["defaultappimage.png"] = "image/png",
}

---@ffi
---@param name string
---@return PluginAssetResult
function read_plugin_asset(name)
    local mime = PLUGIN_ASSET_TYPES[name]
    if not mime then
        return { success = false, error = "Unknown plugin asset." }
    end
    local bytes = millennium.assets.read("assets/" .. name)
    if not bytes then
        logger:error("Bundled asset missing: " .. name)
        return { success = false, error = "The plugin asset is missing." }
    end
    return { success = true, data_url = "data:" .. mime .. ";base64," .. utils.base64_encode(bytes) }
end

-- Steam account and grid folder -----------------------------------------

local function steam_library_cache()
    return fs.join(millennium.steam_path(), "appcache", "librarycache")
end

local function steam_account_id_from_steam_id64(steam_id)
    steam_id = tostring(steam_id or "")
    if not string.match(steam_id, "^%d+$") or #steam_id > 20 then
        return nil
    end

    local account_id = 0
    for index = 1, #steam_id do
        local digit = tonumber(string.sub(steam_id, index, index))
        account_id = ((account_id * 10) + digit) % 4294967296
    end
    if account_id == 0 then
        return nil
    end
    return string.format("%.0f", account_id)
end

local function ensure_grid_dir(userdata_dir, account_id)
    local grid_dir = fs.join(userdata_dir, "config", "grid")
    if not fs.exists(grid_dir) then
        local created, create_err = fs.create_directories(grid_dir)
        if not created and not fs.is_directory(grid_dir) then
            logger:error("Could not create active Steam grid folder: " .. tostring(create_err))
            return nil
        end
    end
    return grid_dir, account_id
end

-- Last resort when the frontend cannot report the signed-in user.
local function grid_dir_from_login_users()
    local steam_path = millennium.steam_path()
    local login_users_path = fs.join(steam_path, "config", "loginusers.vdf")
    local login_users, read_err = utils.read_file(login_users_path)
    if not login_users or login_users == "" then
        logger:error("Could not read Steam loginusers.vdf: " .. tostring(read_err))
        return nil
    end

    for steam_id, user_block in string.gmatch(login_users, '"(%d+)"%s*(%b{})') do
        local account_id = steam_account_id_from_steam_id64(steam_id)
        local userdata_dir = account_id and fs.join(steam_path, "userdata", account_id) or nil
        if userdata_dir and fs.is_directory(userdata_dir) and string.match(user_block, '"MostRecent"%s*"1"') then
            logger:warn("Signed-in Steam user was not reported; using the MostRecent account from loginusers.vdf")
            return ensure_grid_dir(userdata_dir, account_id)
        end
    end

    logger:error("Could not identify the signed-in Steam account")
    return nil
end

-- Resolves config\grid for the signed-in account. steam_id is the SteamID64
-- the frontend reads from the running client.
local function resolve_active_grid_dir(steam_id)
    local account_id = steam_account_id_from_steam_id64(steam_id)
    if account_id then
        local userdata_dir = fs.join(millennium.steam_path(), "userdata", account_id)
        if fs.is_directory(userdata_dir) then
            return ensure_grid_dir(userdata_dir, account_id)
        end
        logger:warn("No userdata folder for the signed-in Steam account " .. account_id)
    end
    return grid_dir_from_login_users()
end

-- Which artwork types each app already has a custom file for in the grid
-- folder, so Collections can leave the user's own artwork alone.
local CUSTOM_ARTWORK_STEMS = {
    grid_p = "%sp",
    grid_l = "%s",
    hero = "%s_hero",
    logo = "%s_logo",
    icon = "%s_icon",
}

local CUSTOM_ARTWORK_EXTENSIONS = { png = true, jpg = true, jpeg = true, webp = true, gif = true, ico = true }

-- Steam keeps only the image, so this keeps which SteamGridDB artwork it was.
-- The file's size goes with it: if the image was replaced since, from Steam's
-- own dialog or a local file, the artwork ID no longer describes it.

local APPLIED_ARTWORK_FILE = fs.join(PLUGIN_DIR, "applied_artwork.json")
local applied_artwork

local function read_applied_artwork()
    if not applied_artwork then
        local ok, saved = pcall(json.decode, utils.read_file(APPLIED_ARTWORK_FILE) or "{}")
        applied_artwork = ok and type(saved) == "table" and saved or {}
    end
    return applied_artwork
end

local function save_applied_artwork()
    return ensure_data_dir() and utils.write_file(APPLIED_ARTWORK_FILE, json.encode(applied_artwork)) and true or false
end

local function files_size(paths)
    local size = 0
    for _, path in ipairs(paths) do
        size = size + (tonumber(fs.file_size(path)) or 0)
    end
    return size
end

---@ffi
---@param appids string JSON array of app IDs
---@param steam_id string
---@return table
function get_custom_artwork(appids, steam_id)
    local ok, list = pcall(json.decode, tostring(appids or ""))
    if not ok or type(list) ~= "table" or #list > 50000 then
        return { success = false, error = "Invalid app ID list." }
    end
    for key, _ in pairs(list) do
        if type(key) ~= "number" or key < 1 or key > #list or key ~= math.floor(key) then
            return { success = false, error = "Invalid app ID list." }
        end
    end
    local account_id = steam_account_id_from_steam_id64(steam_id)
    if not account_id then
        return { success = false, error = "Could not identify the signed-in Steam account." }
    end
    for _, value in ipairs(list) do
        if not validate_appid(value) then
            return { success = false, error = "Invalid Steam App ID." }
        end
    end
    local grid_dir = fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")
    -- Read only the explicit account. fs.exists hides access errors, so confirm
    -- a missing grid folder by listing its parent rather than assuming no art.
    local entries, scan_err = fs.list(grid_dir)
    if not entries then
        local parent = fs.list(fs.join(millennium.steam_path(), "userdata", account_id, "config"))
        if parent then
            local found = false
            for _, entry in ipairs(parent) do
                if entry.name == "grid" then found = true end
            end
            if not found then return { success = true, custom = {}, applied = {} } end
        end
        return { success = false, error = "Could not check existing custom artwork: " .. tostring(scan_err) }
    end
    -- Only images count: <appid>.json is the saved logo position, not a wide capsule.
    local images = {}
    for _, entry in ipairs(entries) do
        if entry.is_file and CUSTOM_ARTWORK_EXTENSIONS[(entry.name:match("%.(%w+)$") or ""):lower()] then
            local stem = fs.stem(entry.name)
            images[stem] = images[stem] or {}
            table.insert(images[stem], entry.path)
        end
    end
    local records = read_applied_artwork()
    local custom, applied = {}, {}
    for _, value in ipairs(list) do
        local appid = validate_appid(value)
        if appid then
            local types, known = {}, {}
            for asset_type, pattern in pairs(CUSTOM_ARTWORK_STEMS) do
                local paths = images[string.format(pattern, appid)]
                if paths then
                    table.insert(types, asset_type)
                    local record = records[account_id .. ":" .. appid .. ":" .. asset_type]
                    if record and record.size == files_size(paths) then
                        known[asset_type] = { id = record.id, collection = record.collection == true }
                    end
                end
            end
            if #types > 0 then
                custom[tostring(appid)] = types
            end
            if next(known) then
                applied[tostring(appid)] = known
            end
        end
    end
    return { success = true, custom = custom, applied = applied }
end

-- Applied artwork --------------------------------------------------------

-- The record's key and the size of the file Steam shows, or nil for invalid arguments.
local function applied_artwork_file(appid, asset_type, steam_id)
    local safe_appid = validate_appid(appid)
    local account_id = steam_account_id_from_steam_id64(steam_id)
    local pattern = CUSTOM_ARTWORK_STEMS[asset_type]
    if not safe_appid or not account_id or not pattern then return nil end
    local stem = string.format(pattern, safe_appid)
    local paths = {}
    for _, entry in ipairs(fs.list(fs.join(millennium.steam_path(), "userdata", account_id, "config", "grid")) or {}) do
        if entry.is_file and fs.stem(entry.name) == stem and CUSTOM_ARTWORK_EXTENSIONS[(entry.name:match("%.(%w+)$") or ""):lower()] then
            table.insert(paths, entry.path)
        end
    end
    return account_id .. ":" .. safe_appid .. ":" .. asset_type, files_size(paths)
end

-- Artwork from a collection can be replaced by that collection's next apply.
-- Artwork picked one at a time in an artwork tab counts as the user's own.
---@ffi
---@param appid number
---@param asset_type string
---@param artwork_id number
---@param steam_id string
---@param from_collection boolean
---@return boolean
function remember_artwork(appid, asset_type, artwork_id, steam_id, from_collection)
    local key, size = applied_artwork_file(appid, asset_type, steam_id)
    local id = validate_collection_id(artwork_id)
    if not key or not id or size == 0 then return false end
    read_applied_artwork()[key] = { id = id, size = size, collection = from_collection == true or nil }
    return save_applied_artwork()
end

---@ffi
---@param appid number
---@param asset_type string
---@param steam_id string
---@return boolean
function forget_artwork(appid, asset_type, steam_id)
    local key = applied_artwork_file(appid, asset_type, steam_id)
    if not key then return false end
    read_applied_artwork()[key] = nil
    return save_applied_artwork()
end

---@ffi
---@param appid number
---@param asset_type string
---@param steam_id string
---@return number 0 if the game doesn't show artwork we know
function get_applied_artwork(appid, asset_type, steam_id)
    local key, size = applied_artwork_file(appid, asset_type, steam_id)
    local entry = key and read_applied_artwork()[key]
    return entry and entry.size == size and entry.id or 0
end

local function remove_files_with_stem(dir, stem)
    for _, entry in ipairs(fs.list(dir) or {}) do
        if entry.is_file and fs.stem(entry.name) == stem then
            local _, remove_err = fs.remove(entry.path)
            if remove_err then
                return false, remove_err
            end
        end
    end
    return true
end

-- Icons ------------------------------------------------------------------
--
-- Steam has no supported way to set a custom icon for a Steam game, so an
-- icon is written to three places:
--   1. <account>\config\grid\<appid>_icon.png
--   2. appcache\librarycache\<appid>_icon.png
--   3. Steam's cached icon files in appcache\librarycache\<appid>\ (named by
--      a 40-character hash). These are what Steam actually displays.
-- A reset deletes the cached files, and Steam downloads its own icon again.

local ICON_CACHE_PATTERN = "^" .. string.rep("%x", 40) .. "%.([%a]+)$"

local function cached_icon_files(app_cache_dir)
    local files = {}
    for _, entry in ipairs(fs.list(app_cache_dir) or {}) do
        local extension = entry.is_file and string.match(entry.name, ICON_CACHE_PATTERN)
        extension = extension and string.lower(extension)
        if extension == "jpg" or extension == "jpeg" or extension == "png" or extension == "ico" then
            files[#files + 1] = { name = entry.name, path = entry.path, extension = extension }
        end
    end
    return files
end

local function decode_icon_bytes(value, expected_format)
    if type(value) ~= "string" or value == "" or #value > MAX_ICON_BYTES * 2 then
        return nil
    end
    local bytes = utils.base64_decode(value)
    if detect_format(bytes) ~= expected_format then
        return nil
    end
    return bytes
end

---@ffi
---@param appid number
---@param ico string
---@param jpg string
---@param png string
---@param steam_id string
---@return IconResult
function set_steam_icon(appid, ico, jpg, png, steam_id)
    local safe_appid, appid_err = validate_appid(appid)
    if not safe_appid then
        return { success = false, error = appid_err }
    end
    local bytes = {
        ico = decode_icon_bytes(ico, "ico"),
        jpg = decode_icon_bytes(jpg, "jpg"),
        png = decode_icon_bytes(png, "png"),
    }
    bytes.jpeg = bytes.jpg
    if not bytes.ico or not bytes.jpg or not bytes.png then
        return { success = false, error = "Icon image data is invalid." }
    end

    local grid_dir = resolve_active_grid_dir(steam_id)
    if not grid_dir then
        return { success = false, error = "Could not find your Steam account's grid folder." }
    end

    local base_name = safe_appid .. "_icon"
    local written = 0
    local cache_dir = steam_library_cache()
    local app_cache_dir = fs.join(cache_dir, safe_appid)

    local removed, remove_err = remove_files_with_stem(grid_dir, base_name)
    if not removed then
        return { success = false, error = "Could not replace the existing icon: " .. tostring(remove_err) }
    end
    if not utils.write_file(fs.join(grid_dir, base_name .. ".png"), bytes.png) then
        return { success = false, error = "Could not write the icon to the grid folder." }
    end
    written = written + 1

    if fs.is_directory(cache_dir) then
        remove_files_with_stem(cache_dir, base_name)
        if utils.write_file(fs.join(cache_dir, base_name .. ".png"), bytes.png) then
            written = written + 1
        end
    end

    for _, file in ipairs(cached_icon_files(app_cache_dir)) do
        if utils.write_file(file.path, bytes[file.extension]) then
            written = written + 1
        else
            logger:warn("Could not overwrite Steam's cached icon " .. file.path)
        end
    end

    logger:info("Icon applied for app " .. safe_appid .. " (" .. tostring(written) .. " files)")
    return { success = true, written = written }
end

---@ffi
---@param appid number
---@param png string
---@param steam_id string
---@return IconResult
function save_shortcut_icon(appid, png, steam_id)
    local safe_appid, appid_err = validate_appid(appid)
    if not safe_appid or tonumber(safe_appid) < 2147483648 then
        return { success = false, error = appid_err or "A shortcut app ID is required." }
    end
    if type(png) ~= "string" or #png > 1024 * 1024 then
        return { success = false, error = "Shortcut icon data is too large or invalid." }
    end
    local bytes = decode_icon_bytes(png, "png")
    if not bytes then
        return { success = false, error = "Shortcut icon image data is invalid." }
    end
    local grid_dir = resolve_active_grid_dir(steam_id)
    if not grid_dir then
        return { success = false, error = "Could not find your Steam account's grid folder." }
    end
    local path = fs.join(grid_dir, safe_appid .. "_icon.png")
    if not utils.write_file(path, bytes) then
        return { success = false, error = "Could not write the shortcut icon to the grid folder." }
    end
    return { success = true, path = path }
end

---@ffi
---@param appid number
---@param steam_id string
---@return IconResult
function reset_steam_icon(appid, steam_id)
    local safe_appid, appid_err = validate_appid(appid)
    if not safe_appid then
        return { success = false, error = appid_err }
    end

    local base_name = safe_appid .. "_icon"
    local grid_dir = resolve_active_grid_dir(steam_id)
    if not grid_dir then
        return { success = false, error = "Could not find your Steam account's grid folder." }
    end
    local cleared, clear_err = remove_files_with_stem(grid_dir, base_name)
    if not cleared then
        return { success = false, error = "Could not clear the grid icon: " .. tostring(clear_err) }
    end

    local cache_dir = steam_library_cache()
    cleared, clear_err = remove_files_with_stem(cache_dir, base_name)
    if not cleared then
        return { success = false, error = "Could not clear the cached icon: " .. tostring(clear_err) }
    end

    -- Deleting the custom cached icons makes Steam download its own again.
    local removed = 0
    for _, file in ipairs(cached_icon_files(fs.join(cache_dir, safe_appid))) do
        if not os.remove(file.path) then
            return { success = false, error = "Could not remove the custom cached icon." }
        end
        removed = removed + 1
    end

    logger:info("Icon reset for app " .. safe_appid .. " (" .. removed .. " removed)")
    return { success = true, removed = removed }
end

-- Lifecycle --------------------------------------------------------------

local function on_load()
    load_settings()
    logger:info("SteamGridDB Millennium backend loaded")
    millennium.ready()
end

local function on_unload()
    logger:info("SteamGridDB Millennium backend unloaded")
end

-- Serve-time hooks --------------------------------------------------------
-- Millennium edits Steam's sp.js as it is served, so these run in Steam's own
-- code from the first render. The guard keeps Steam working when the plugin's
-- frontend hasn't loaded yet (Big Picture can open before it does).
local SELF = [[(window.PLUGIN_LIST&&#{{self}})]]

local patches = {
    -- "Change Artwork..." after Manage in the library context menu, under the
    -- same kiosk-mode gate, on every render of the menu.
    {
        file = [[sp\.js]],
        find = [[![\w$]+\.[\w$]+\.BKioskModeLocked\(\)&&this\.BuildManageSubmenu\([\w$]+,[\w$]+,[\w$]+\),]],
        transforms = {
            {
                match = [[(![\w$]+\.[\w$]+\.BKioskModeLocked\(\))&&this\.BuildManageSubmenu\(([\w$]+),([\w$]+),([\w$]+)\),]],
                replace = [[\1&&this.BuildManageSubmenu(\2,\3,\4),\1&&]] .. SELF .. [[?.libraryMenuItem?.(\2),]],
            },
        },
    },
    -- Popup creation: our popout gets resizable params, and each new window
    -- reaches the plugin before Steam renders into it (Big Picture library CSS,
    -- popout size tracking).
    {
        file = [[sp\.js]],
        find = [[static CreatePopup\([\w$]+,[\w$]+\)\{[\s\S]*?,\{popup:[\w$]+,element:]],
        transforms = {
            {
                match = [[static CreatePopup\(([\w$]+),([\w$]+)\)\{]],
                replace = [[static CreatePopup(\1,\2){\2=]] .. SELF .. [[?.popupParams?.(\1,\2)??\2;]],
            },
            {
                match = [[,\{popup:([\w$]+),element:]],
                replace = [[,]] .. SELF .. [[?.popupCreated?.(arguments[0],\1),{popup:\1,element:]],
            },
        },
    },
}

return {
    on_load = on_load,
    on_unload = on_unload,
    patches = patches,
}
