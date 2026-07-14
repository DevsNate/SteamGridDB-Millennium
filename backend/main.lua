local http = require("http")
local logger = require("logger")
local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")
local json = require("json")

local SGDB_API_BASE = "https://www.steamgriddb.com/api/v2"
local USER_AGENT = "steamgriddb-millennium/0.1.0"

local function resolve_plugin_dir()
    local source = debug.getinfo(1, "S").source or ""
    if string.sub(source, 1, 1) == "@" then
        source = string.sub(source, 2)
    end
    return string.match(source, "^(.+)[/\\]backend[/\\][^/\\]+$")
        or fs.join(millennium.steam_path(), "millennium", "plugins", "SteamGridDB")
end

local SETTINGS_FILE = fs.join(resolve_plugin_dir(), "settings.json")
local settings = { api_key = "" }

local function trim(value)
    return string.match(tostring(value or ""), "^%s*(.-)%s*$") or ""
end

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

local function save_settings()
    local ok, err = utils.write_file(SETTINGS_FILE, json.encode(settings))
    if not ok then
        logger:error("Could not save SteamGridDB settings: " .. tostring(err))
    end
    return ok
end

local function join_url(path)
    if string.sub(path, 1, 1) == "/" then
        return SGDB_API_BASE .. path
    end
    return SGDB_API_BASE .. "/" .. path
end

local function request_json(path)
    local api_key = trim(settings.api_key)
    if api_key == "" then
        return json.encode({
            success = false,
            errors = { "SteamGridDB API key is required. Add one in the plugin settings." },
        })
    end

    local res, err = http.get(join_url(path), {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
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

    local command = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' .. script_path .. '"'
    local output, status = utils.exec(command)
    if not output then
        logger:error("PowerShell command failed: " .. tostring(status))
        return nil
    end

    return utils.trim(output)
end

function sgdb_request(path)
    return request_json(path)
end

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
        return json.encode({ success = false, errors = { "Invalid SteamGridDB collection ID." } })
    end
    if not asset_id or asset_id <= 0 or asset_id ~= math.floor(asset_id) then
        return json.encode({ success = false, errors = { "Invalid SteamGridDB asset ID." } })
    end
    if not allowed_asset_types[asset_type] then
        return json.encode({ success = false, errors = { "Unsupported SteamGridDB collection asset type." } })
    end

    local api_key = trim(settings.api_key)
    if api_key == "" then
        return json.encode({
            success = false,
            errors = { "SteamGridDB API key is required. Add one in the plugin settings." },
        })
    end

    local path = "/collections/" .. tostring(collection_id) .. "/" .. asset_type .. "/" .. tostring(asset_id)
    local res, err = http.request(join_url(path), {
        method = "POST",
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. api_key,
        },
        timeout = 30,
        user_agent = USER_AGENT,
    })

    if not res then
        logger:error("SteamGridDB collection request failed: " .. tostring(err))
        return json.encode({ success = false, errors = { "SteamGridDB collection request failed: " .. tostring(err) } })
    end
    if not res.body or res.body == "" then
        return json.encode({
            success = false,
            errors = { "SteamGridDB returned an empty collection response (HTTP " .. tostring(res.status) .. ")." },
        })
    end

    return res.body
end

function get_api_key_status()
    local api_key = trim(settings.api_key)
    return json.encode({
        success = true,
        configured = api_key ~= "",
        api_key = api_key,
    })
end

function set_api_key(api_key)
    api_key = trim(api_key)
    if api_key == "" then
        return json.encode({ success = false, error = "API key cannot be empty." })
    end
    if string.len(api_key) > 256 then
        return json.encode({ success = false, error = "API key is too long." })
    end

    settings.api_key = api_key
    if not save_settings() then
        return json.encode({ success = false, error = "Could not save the API key." })
    end

    return json.encode({
        success = true,
        configured = true,
        api_key = api_key,
    })
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

function set_steam_icon_from_url(appid, url, extension)
    if type(appid) == "table" then
        local params = appid
        appid = params.appid
        url = params.url
        extension = params.extension
    end

    local cache_dir = steam_library_cache()

    url = tostring(url or "")
    extension = tostring(extension or ""):lower()
    if string.match(extension, "^https?://") then
        url = extension
        extension = ""
    end
    if not string.match(url, "^https?://") then
        logger:error("Icon download/write failed: invalid icon URL: " .. tostring(url))
        return false
    end
    if extension == "" then
        extension = string.match(url, "%.([A-Za-z0-9]+)%??[^/]*$") or "png"
        extension = tostring(extension):lower()
    end

    local steam_path = millennium.steam_path()
    local userdata_path = fs.join(steam_path, "userdata")
    if not fs.exists(userdata_path) then
        logger:error("Steam userdata folder was not found: " .. tostring(userdata_path))
        return false
    end

    local base_name = tostring(appid) .. "_icon"
    local file_name = base_name .. "." .. extension
    local icon_path = fs.join(cache_dir, file_name)
    local app_cache_dir = fs.join(cache_dir, tostring(appid))
    local script = table.concat({
        "try {",
        "$ProgressPreference = 'SilentlyContinue'",
        "$ErrorActionPreference = 'Stop'",
        "$userdata = " .. ps_quote(userdata_path),
        "$baseName = " .. ps_quote(base_name),
        "$fileName = " .. ps_quote(file_name),
        "$cacheDir = " .. ps_quote(cache_dir),
        "$cacheTarget = " .. ps_quote(icon_path),
        "$appCacheDir = " .. ps_quote(app_cache_dir),
        "$wc = [System.Net.WebClient]::new()",
        "$wc.Headers.Add('User-Agent', " .. ps_quote(USER_AGENT) .. ")",
        "$bytes = $wc.DownloadData(" .. ps_quote(url) .. ")",
        "Add-Type -AssemblyName System.Drawing",
        "function Get-ImageExtension($data) {",
        "  if ($data.Length -ge 8 -and $data[0] -eq 0x89 -and $data[1] -eq 0x50 -and $data[2] -eq 0x4E -and $data[3] -eq 0x47 -and $data[4] -eq 0x0D -and $data[5] -eq 0x0A -and $data[6] -eq 0x1A -and $data[7] -eq 0x0A) { return 'png' }",
        "  if ($data.Length -ge 3 -and $data[0] -eq 0xFF -and $data[1] -eq 0xD8 -and $data[2] -eq 0xFF) { return 'jpg' }",
        "  if ($data.Length -ge 4 -and $data[0] -eq 0x00 -and $data[1] -eq 0x00 -and $data[2] -eq 0x01 -and $data[3] -eq 0x00) { return 'ico' }",
        "  throw 'Downloaded icon is not PNG, JPEG, or ICO.'",
        "}",
        "function Get-ImageFromBytes($data) {",
        "  $sourceExtension = Get-ImageExtension $data",
        "  $stream = [System.IO.MemoryStream]::new($data, 0, $data.Length, $false, $true)",
        "  if ($sourceExtension -eq 'ico') {",
        "    $icon = [System.Drawing.Icon]::new($stream)",
        "    $bitmap = $icon.ToBitmap()",
        "    $icon.Dispose()",
        "    $stream.Dispose()",
        "    return $bitmap",
        "  }",
        "  $image = [System.Drawing.Image]::FromStream($stream, $true, $true)",
        "  $bitmap = [System.Drawing.Bitmap]::new($image)",
        "  $image.Dispose()",
        "  $stream.Dispose()",
        "  return $bitmap",
        "}",
        "function Convert-ToPngBytes($image) {",
        "  $out = [System.IO.MemoryStream]::new()",
        "  $image.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)",
        "  $result = $out.ToArray()",
        "  $out.Dispose()",
        "  return $result",
        "}",
        "function Convert-ToJpegBytes($image) {",
        "  $bitmap = [System.Drawing.Bitmap]::new($image.Width, $image.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)",
        "  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)",
        "  $graphics.Clear([System.Drawing.Color]::FromArgb(16, 16, 16))",
        "  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
        "  $graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)",
        "  $graphics.Dispose()",
        "  $out = [System.IO.MemoryStream]::new()",
        "  $bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)",
        "  $bitmap.Dispose()",
        "  $result = $out.ToArray()",
        "  $out.Dispose()",
        "  return $result",
        "}",
        "function Convert-ToIcoBytes($image) {",
        "  $out = [System.IO.MemoryStream]::new()",
        "  $writer = [System.IO.BinaryWriter]::new($out)",
        "  $pngBytes = Convert-ToPngBytes $image",
        "  $writer.Write([UInt16]0)",
        "  $writer.Write([UInt16]1)",
        "  $writer.Write([UInt16]1)",
        "  $writer.Write([byte]0)",
        "  $writer.Write([byte]0)",
        "  $writer.Write([byte]0)",
        "  $writer.Write([byte]0)",
        "  $writer.Write([UInt16]1)",
        "  $writer.Write([UInt16]32)",
        "  $writer.Write([UInt32]$pngBytes.Length)",
        "  $writer.Write([UInt32]22)",
        "  $writer.Write($pngBytes)",
        "  $writer.Flush()",
        "  $result = $out.ToArray()",
        "  $writer.Dispose()",
        "  $out.Dispose()",
        "  return $result",
        "}",
        "function Convert-IconBytesForPath($targetPath, $sourceBytes, $image) {",
        "  $targetExtension = [System.IO.Path]::GetExtension($targetPath).TrimStart('.').ToLowerInvariant()",
        "  if ($targetExtension -eq 'jpg' -or $targetExtension -eq 'jpeg') { return Convert-ToJpegBytes $image }",
        "  if ($targetExtension -eq 'png') { return Convert-ToPngBytes $image }",
        "  if ($targetExtension -eq 'ico') {",
        "    if ((Get-ImageExtension $sourceBytes) -eq 'ico') { return $sourceBytes }",
        "    return Convert-ToIcoBytes $image",
        "  }",
        "  return $sourceBytes",
        "}",
        "$downloadExtension = Get-ImageExtension $bytes",
        "$fileName = $baseName + '.' + $downloadExtension",
        "$cacheTarget = Join-Path $cacheDir $fileName",
        "$sourceImage = Get-ImageFromBytes $bytes",
        "$gridDirs = Get-ChildItem -LiteralPath $userdata -Directory | ForEach-Object { Join-Path $_.FullName 'config\\grid' }",
        "$written = @()",
        "foreach ($gridDir in $gridDirs) {",
        "  if (!(Test-Path -LiteralPath $gridDir)) { New-Item -ItemType Directory -Force -Path $gridDir | Out-Null }",
        "  Get-ChildItem -LiteralPath $gridDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | Remove-Item -Force -ErrorAction SilentlyContinue",
        "  $target = Join-Path $gridDir $fileName",
        "  [System.IO.File]::WriteAllBytes($target, $bytes)",
        "  $written += $target",
        "}",
        "if (Test-Path -LiteralPath $cacheDir) {",
        "  Get-ChildItem -LiteralPath $cacheDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | Remove-Item -Force -ErrorAction SilentlyContinue",
        "  [System.IO.File]::WriteAllBytes($cacheTarget, (Convert-IconBytesForPath $cacheTarget $bytes $sourceImage))",
        "  $written += $cacheTarget",
        "}",
        "if (Test-Path -LiteralPath $appCacheDir) {",
        "  $rootIconTargets = Get-ChildItem -LiteralPath $appCacheDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match '^[a-fA-F0-9]{40}$' -and $_.Extension -match '^\\.(jpg|jpeg|png|ico)$' }",
        "  foreach ($targetFile in $rootIconTargets) {",
        "    [System.IO.File]::WriteAllBytes($targetFile.FullName, (Convert-IconBytesForPath $targetFile.FullName $bytes $sourceImage))",
        "    $written += $targetFile.FullName",
        "  }",
        "}",
        "$sourceImage.Dispose()",
        "if ($written.Count -eq 0) { throw 'No Steam grid folders were available.' }",
        "Write-Output ($written -join '|')",
        "} catch { Write-Output ('ERROR: ' + $_.Exception.Message); exit 1 }"
    }, "; ")

    local result = run_powershell(script)
    if not result or result == "" then
        logger:error("Icon download/write failed")
        return false
    end
    if string.sub(result, 1, 7) == "ERROR: " then
        logger:error("Icon download/write failed: " .. string.sub(result, 8))
        return false
    end

    return result
end

function reset_steam_icon(appid)
    if type(appid) == "table" then
        appid = appid.appid
    end

    local steam_path = millennium.steam_path()
    local userdata_path = fs.join(steam_path, "userdata")
    local cache_dir = steam_library_cache()
    local app_cache_dir = fs.join(cache_dir, tostring(appid))
    local base_name = tostring(appid) .. "_icon"

    local script = table.concat({
        "try {",
        "$ErrorActionPreference = 'Stop'",
        "$userdata = " .. ps_quote(userdata_path),
        "$cacheDir = " .. ps_quote(cache_dir),
        "$appCacheDir = " .. ps_quote(app_cache_dir),
        "$baseName = " .. ps_quote(base_name),
        "$removed = @()",
        "if (Test-Path -LiteralPath $userdata) {",
        "  $gridDirs = Get-ChildItem -LiteralPath $userdata -Directory | ForEach-Object { Join-Path $_.FullName 'config\\grid' }",
        "  foreach ($gridDir in $gridDirs) {",
        "    if (Test-Path -LiteralPath $gridDir) {",
        "      Get-ChildItem -LiteralPath $gridDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | ForEach-Object { $removed += $_.FullName; Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }",
        "    }",
        "  }",
        "}",
        "if (Test-Path -LiteralPath $cacheDir) {",
        "  Get-ChildItem -LiteralPath $cacheDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | ForEach-Object { $removed += $_.FullName; Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }",
        "}",
        "if (Test-Path -LiteralPath $appCacheDir) {",
        "  Get-ChildItem -LiteralPath $appCacheDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match '^[a-fA-F0-9]{40}$' -and $_.Extension -match '^\\.(jpg|jpeg|png|ico)$' } | ForEach-Object { $removed += $_.FullName; Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }",
        "}",
        "Write-Output ($removed -join '|')",
        "} catch { Write-Output ('ERROR: ' + $_.Exception.Message); exit 1 }"
    }, "; ")

    local result = run_powershell(script)
    if result == nil then
        logger:error("Icon reset failed")
        return false
    end
    if string.sub(result, 1, 7) == "ERROR: " then
        logger:error("Icon reset failed: " .. string.sub(result, 8))
        return false
    end

    return result
end

function set_animated_artwork_from_url(appid, asset_type, url, extension)
    if type(appid) == "table" then
        local params = appid
        appid = params.appid
        asset_type = params.asset_type
        url = params.url
        extension = params.extension
    end

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
    load_settings()
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
