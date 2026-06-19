local http = require("http")
local logger = require("logger")
local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")

local SGDB_API_BASE = "https://www.steamgriddb.com/api/v2"
local SGDB_API_KEY = "e6e64699762c2129f481a910336af00a"
local USER_AGENT = "steamgriddb-millennium/0.1.0"

local function join_url(path)
    if string.sub(path, 1, 1) == "/" then
        return SGDB_API_BASE .. path
    end
    return SGDB_API_BASE .. "/" .. path
end

local function request_json(path)
    local res, err = http.get(join_url(path), {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. SGDB_API_KEY,
        },
        timeout = 30,
        user_agent = USER_AGENT,
    })

    if not res then
        logger:error("SteamGridDB request failed: " .. tostring(err))
        return false
    end

    return res.body
end

local function ps_quote(value)
    return "'" .. string.gsub(tostring(value), "'", "''") .. "'"
end

local function run_powershell(script)
    local temp_dir = utils.getenv("TEMP") or utils.getenv("TMP") or utils.get_backend_path()
    local script_path = fs.join(temp_dir, "steamgriddb-millennium-" .. utils.uuid() .. ".ps1")
    local ok, write_err = utils.write_file(script_path, script)
    if not ok then
        logger:error("Could not write PowerShell helper: " .. tostring(write_err))
        return nil
    end

    local command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' .. script_path .. '"'
    local output, status = utils.exec(command)
    if not output then
        logger:error("PowerShell command failed: " .. tostring(status))
        return nil
    end

    return utils.trim(output)
end

local function json_escape(value)
    value = tostring(value or "")
    value = string.gsub(value, "\\", "\\\\")
    value = string.gsub(value, "\"", "\\\"")
    value = string.gsub(value, "\r", "\\r")
    value = string.gsub(value, "\n", "\\n")
    return value
end

function sgdb_request(path)
    return request_json(path)
end

function download_as_base64(url)
    local temp_dir = utils.getenv("TEMP") or utils.getenv("TMP") or utils.get_backend_path()
    local output_path = fs.join(temp_dir, "steamgriddb-millennium-asset-" .. utils.uuid() .. ".b64")
    local script = table.concat({
        "$ProgressPreference = 'SilentlyContinue'",
        "$wc = [System.Net.WebClient]::new()",
        "$wc.Headers.Add('User-Agent', " .. ps_quote(USER_AGENT) .. ")",
        "$bytes = $wc.DownloadData(" .. ps_quote(url) .. ")",
        "[System.IO.File]::WriteAllText(" .. ps_quote(output_path) .. ", [Convert]::ToBase64String($bytes))",
        "Write-Output 'ok'"
    }, "; ")

    local result = run_powershell(script)
    if result ~= "ok" then
        logger:error("Image download/base64 conversion failed")
        return false
    end

    local handle = io.open(output_path, "rb")
    if not handle then
        logger:error("Could not read base64 output file")
        return false
    end

    local encoded = handle:read("*a")
    handle:close()
    os.remove(output_path)

    if not encoded or encoded == "" then
        logger:error("Base64 output file was empty")
        return false
    end

    return encoded
end

local function steam_library_cache()
    return fs.join(millennium.steam_path(), "appcache", "librarycache")
end

function set_steam_icon_from_url(appid, url)
    local cache_dir = steam_library_cache()
    if not fs.exists(cache_dir) then
        local ok, err = fs.create_directories(cache_dir)
        if not ok then
            logger:error("Could not create Steam library cache: " .. tostring(err))
            return false
        end
    end

    local icon_path = fs.join(cache_dir, tostring(appid) .. "_icon.jpg")
    local script = table.concat({
        "$ProgressPreference = 'SilentlyContinue'",
        "$wc = [System.Net.WebClient]::new()",
        "$wc.Headers.Add('User-Agent', " .. ps_quote(USER_AGENT) .. ")",
        "$wc.DownloadFile(" .. ps_quote(url) .. ", " .. ps_quote(icon_path) .. ")",
        "Write-Output 'ok'"
    }, "; ")

    local result = run_powershell(script)
    if result ~= "ok" then
        logger:error("Icon download/write failed")
        return false
    end

    return icon_path
end

function set_animated_artwork_from_url(appid, asset_type, url, extension)
    local suffixes = {
        grid_p = "p",
        grid_l = "",
        hero = "_hero",
        logo = "_logo",
    }
    local suffix = suffixes[asset_type]
    if not suffix then
        logger:error("Unsupported animated artwork type: " .. tostring(asset_type))
        return false
    end

    url = tostring(url or "")
    extension = tostring(extension or ""):lower()

    if string.match(extension, "^https?://") then
        url = extension
        extension = ""
    end

    if extension == "" then
        extension = string.match(url, "%.([A-Za-z0-9]+)%??[^/]*$") or "webp"
        extension = tostring(extension):lower()
    end

    -- SGDBoop intentionally stores WebP payloads with a .png filename because
    -- Steam ignores custom artwork files with a .webp extension.
    local file_extension = extension
    if file_extension == "webp" then
        file_extension = "png"
    end

    local steam_path = millennium.steam_path()
    local userdata_path = fs.join(steam_path, "userdata")
    if not fs.exists(userdata_path) then
        logger:error("Steam userdata folder was not found: " .. tostring(userdata_path))
        return false
    end

    local base_name = tostring(appid) .. suffix
    local file_name = base_name .. "." .. file_extension
    local script = table.concat({
        "$ProgressPreference = 'SilentlyContinue'",
        "$ErrorActionPreference = 'Stop'",
        "$userdata = " .. ps_quote(userdata_path),
        "$url = " .. ps_quote(url),
        "$fileName = " .. ps_quote(file_name),
        "$baseName = " .. ps_quote(base_name),
        "$wc = [System.Net.WebClient]::new()",
        "$wc.Headers.Add('User-Agent', " .. ps_quote(USER_AGENT) .. ")",
        "$bytes = $wc.DownloadData($url)",
        "$gridDirs = Get-ChildItem -LiteralPath $userdata -Directory | ForEach-Object { Join-Path $_.FullName 'config\\grid' }",
        "$written = @()",
        "foreach ($gridDir in $gridDirs) {",
        "  if (!(Test-Path -LiteralPath $gridDir)) { New-Item -ItemType Directory -Force -Path $gridDir | Out-Null }",
        "  Get-ChildItem -LiteralPath $gridDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | Remove-Item -Force -ErrorAction SilentlyContinue",
        "  $target = Join-Path $gridDir $fileName",
        "  [System.IO.File]::WriteAllBytes($target, $bytes)",
        "  $written += $target",
        "}",
        "if ($written.Count -eq 0) { throw 'No Steam grid folders were available.' }",
        "Write-Output ($written -join '|')"
    }, "; ")

    local result = run_powershell(script)
    if not result or result == "" then
        logger:error("Animated artwork direct write failed")
        return false
    end

    return result
end

function get_current_artwork(appid)
    appid = tostring(appid or "")
    if appid == "" then
        return "{}"
    end

    local steam_path = millennium.steam_path()
    local userdata_path = fs.join(steam_path, "userdata")
    if not fs.exists(userdata_path) then
        return "{}"
    end

    local script = table.concat({
        "$ErrorActionPreference = 'SilentlyContinue'",
        "$userdata = " .. ps_quote(userdata_path),
        "$appid = " .. ps_quote(appid),
        "$patterns = @{ grid_p = @($appid + 'p.*'); grid_l = @($appid + '.*'); hero = @($appid + '_hero.*'); logo = @($appid + '_logo.*'); icon = @($appid + '_icon.*') }",
        "$result = [ordered]@{}",
        "$gridDirs = Get-ChildItem -LiteralPath $userdata -Directory | ForEach-Object { Join-Path $_.FullName 'config\\grid' } | Where-Object { Test-Path -LiteralPath $_ }",
        "foreach ($key in $patterns.Keys) {",
        "  $files = @()",
        "  foreach ($gridDir in $gridDirs) { foreach ($pattern in $patterns[$key]) { $files += Get-ChildItem -LiteralPath $gridDir -File -Filter $pattern -ErrorAction SilentlyContinue } }",
        "  if ($key -eq 'grid_l') { $files = $files | Where-Object { $_.BaseName -eq $appid } }",
        "  $file = $files | Sort-Object LastWriteTime -Descending | Select-Object -First 1",
        "  if ($file) { $result[$key] = @{ path = $file.FullName; modified = $file.LastWriteTimeUtc.ToString('o'); length = $file.Length } }",
        "}",
        "$result | ConvertTo-Json -Compress"
    }, "; ")

    local result = run_powershell(script)
    if not result or result == "" then
        return "{}"
    end

    return result
end

function open_external_url(url)
    if type(url) ~= "string" or not string.match(url, "^https://www%.steamgriddb%.com/") then
        logger:error("Refusing to open non-SteamGridDB URL: " .. tostring(url))
        return false
    end

    local script = "Start-Process " .. ps_quote(url) .. "; Write-Output 'ok'"
    local result = run_powershell(script)
    return result == "ok"
end

local function on_load()
    logger:info("SteamGridDB Millennium backend loaded")
    millennium.ready()
end

local function on_unload()
    logger:info("SteamGridDB Millennium backend unloaded")
end

return {
    on_load = on_load,
    on_unload = on_unload,
}
