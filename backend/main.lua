local http = require("http")
local logger = require("logger")
local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")
local json = require("json")

local SGDB_API_BASE = "https://www.steamgriddb.com/api/v2"
local USER_AGENT = "steamgriddb-millennium/2.0.0"

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

-- Settings ---------------------------------------------------------------

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

-- SteamGridDB API --------------------------------------------------------

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

-- PowerShell execution ---------------------------------------------------

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
    local exec_ok, output, status = pcall(utils.exec, command)
    os.remove(script_path)
    if not exec_ok or not output or status ~= 0 then
        logger:error("PowerShell command failed: " .. tostring(exec_ok and status or output))
        return nil
    end

    return utils.trim(output)
end

-- Frontend-callable API --------------------------------------------------

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
    local output_path = fs.join(temp_dir, "steamgriddb-millennium-asset-" .. utils.uuid() .. ".bin")
    url = tostring(url or "")
    if not string.match(url, "^https?://") then
        logger:error("Native image download failed: invalid URL: " .. url)
        return false
    end

    local call_ok, result, download_err = pcall(http.download, url, output_path, {
        timeout = 30,
        follow_redirects = true,
        verify_ssl = true,
        user_agent = USER_AGENT,
    })
    if not call_ok or not result or not result.success or (result.status and (result.status < 200 or result.status >= 300)) then
        os.remove(output_path)
        logger:error("Native image download failed: " .. tostring(call_ok and (download_err or (result and result.status)) or result))
        return false
    end

    local bytes, read_err = utils.read_file(output_path)
    os.remove(output_path)
    if not bytes or bytes == "" then
        logger:error("Native image download produced no readable data: " .. tostring(read_err))
        return false
    end

    local encoded = utils.base64_encode(bytes)
    if not encoded or encoded == "" then
        logger:error("Native image Base64 conversion failed")
        return false
    end

    logger:info("Native artwork download completed: " .. tostring(#bytes) .. " bytes")
    return encoded
end

-- Steam account and cache discovery -------------------------------------

local function steam_library_cache()
    return fs.join(millennium.steam_path(), "appcache", "librarycache")
end

local function steam_account_id_from_steam_id64(steam_id)
    steam_id = tostring(steam_id or "")
    if not string.match(steam_id, "^%d+$") then
        return nil
    end

    local account_id = 0
    for index = 1, #steam_id do
        local digit = tonumber(string.sub(steam_id, index, index))
        account_id = ((account_id * 10) + digit) % 4294967296
    end
    return tostring(math.floor(account_id))
end

local function resolve_active_grid_dir()
    local steam_path = millennium.steam_path()
    local login_users_path = fs.join(steam_path, "config", "loginusers.vdf")
    local login_users, read_err = utils.read_file(login_users_path)
    if not login_users or login_users == "" then
        logger:error("Could not read Steam loginusers.vdf: " .. tostring(read_err))
        return nil
    end

    for steam_id, user_block in string.gmatch(login_users, '"(%d+)"%s*(%b{})') do
        if string.match(user_block, '"MostRecent"%s*"1"') then
            local account_id = steam_account_id_from_steam_id64(steam_id)
            local userdata_dir = account_id and fs.join(steam_path, "userdata", account_id) or nil
            if not userdata_dir or not fs.is_directory(userdata_dir) then
                logger:error("Active Steam userdata folder was not found for account " .. tostring(account_id))
                return nil
            end

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
    end

    logger:error("Could not identify the active Steam account from loginusers.vdf")
    return nil
end

-- Artwork writes ---------------------------------------------------------

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
        "function Get-BestIcoFrameBytes($data) {",
        "  if ($data.Length -lt 22 -or [BitConverter]::ToUInt16($data, 0) -ne 0 -or [BitConverter]::ToUInt16($data, 2) -ne 1) { throw 'Invalid ICO header.' }",
        "  $count = [BitConverter]::ToUInt16($data, 4)",
        "  if ($count -lt 1 -or (6 + (16 * $count)) -gt $data.Length) { throw 'Invalid ICO directory.' }",
        "  $bestFrame = $null",
        "  $bestArea = -1",
        "  $bestBits = -1",
        "  for ($index = 0; $index -lt $count; $index++) {",
        "    $entry = 6 + (16 * $index)",
        "    $width = if ($data[$entry] -eq 0) { 256 } else { [int]$data[$entry] }",
        "    $height = if ($data[$entry + 1] -eq 0) { 256 } else { [int]$data[$entry + 1] }",
        "    $bits = [BitConverter]::ToUInt16($data, $entry + 6)",
        "    $size = [BitConverter]::ToUInt32($data, $entry + 8)",
        "    $offset = [BitConverter]::ToUInt32($data, $entry + 12)",
        "    if ($size -lt 1 -or $offset -gt $data.Length -or $size -gt ($data.Length - $offset)) { continue }",
        "    $area = $width * $height",
        "    if ($area -gt $bestArea -or ($area -eq $bestArea -and $bits -gt $bestBits)) {",
        "      $frame = [byte[]]::new([int]$size)",
        "      [Buffer]::BlockCopy($data, [int]$offset, $frame, 0, [int]$size)",
        "      $bestFrame = $frame",
        "      $bestArea = $area",
        "      $bestBits = $bits",
        "    }",
        "  }",
        "  if ($null -eq $bestFrame) { throw 'ICO contains no valid image frames.' }",
        "  return ,$bestFrame",
        "}",
        "function Get-ImageFromBytes($data) {",
        "  $sourceExtension = Get-ImageExtension $data",
        "  if ($sourceExtension -eq 'ico') {",
        "    $frameBytes = [byte[]](Get-BestIcoFrameBytes $data)",
        "    $isPngFrame = $frameBytes.Length -ge 8 -and $frameBytes[0] -eq 0x89 -and $frameBytes[1] -eq 0x50 -and $frameBytes[2] -eq 0x4E -and $frameBytes[3] -eq 0x47 -and $frameBytes[4] -eq 0x0D -and $frameBytes[5] -eq 0x0A -and $frameBytes[6] -eq 0x1A -and $frameBytes[7] -eq 0x0A",
        "    if ($isPngFrame) {",
        "      $frameStream = [System.IO.MemoryStream]::new($frameBytes, 0, $frameBytes.Length, $false, $true)",
        "      $frameImage = [System.Drawing.Image]::FromStream($frameStream, $true, $true)",
        "      $bitmap = [System.Drawing.Bitmap]::new($frameImage)",
        "      $frameImage.Dispose()",
        "      $frameStream.Dispose()",
        "      return $bitmap",
        "    }",
        "    $iconStream = [System.IO.MemoryStream]::new($data, 0, $data.Length, $false, $true)",
        "    $icon = [System.Drawing.Icon]::new($iconStream, 256, 256)",
        "    $bitmap = $icon.ToBitmap()",
        "    $icon.Dispose()",
        "    $iconStream.Dispose()",
        "    return $bitmap",
        "  }",
        "  $stream = [System.IO.MemoryStream]::new($data, 0, $data.Length, $false, $true)",
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
        "$fileName = $baseName + '.png'",
        "$cacheTarget = Join-Path $cacheDir $fileName",
        "$sourceImage = Get-ImageFromBytes $bytes",
        "$normalizedPngBytes = Convert-ToPngBytes $sourceImage",
        "$gridDirs = Get-ChildItem -LiteralPath $userdata -Directory | ForEach-Object { Join-Path $_.FullName 'config\\grid' }",
        "$written = @()",
        "foreach ($gridDir in $gridDirs) {",
        "  if (!(Test-Path -LiteralPath $gridDir)) { New-Item -ItemType Directory -Force -Path $gridDir | Out-Null }",
        "  Get-ChildItem -LiteralPath $gridDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | Remove-Item -Force -ErrorAction SilentlyContinue",
        "  $target = Join-Path $gridDir $fileName",
        "  [System.IO.File]::WriteAllBytes($target, $normalizedPngBytes)",
        "  $written += $target",
        "}",
        "if (Test-Path -LiteralPath $cacheDir) {",
        "  Get-ChildItem -LiteralPath $cacheDir -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -eq $baseName } | Remove-Item -Force -ErrorAction SilentlyContinue",
        "  [System.IO.File]::WriteAllBytes($cacheTarget, $normalizedPngBytes)",
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

    if not string.match(url, "^https?://") then
        logger:error("Animated artwork native download failed: invalid URL: " .. url)
        return false
    end

    -- SGDBoop intentionally stores WebP payloads with a .png filename because
    -- Steam ignores custom artwork files with a .webp extension.
    local file_extension = extension
    if file_extension == "webp" then
        file_extension = "png"
    end

    local grid_dir, account_id = resolve_active_grid_dir()
    if not grid_dir then
        return false
    end

    local base_name = tostring(appid) .. suffix
    local file_name = base_name .. "." .. file_extension
    local target_path = fs.join(grid_dir, file_name)
    local temp_dir = utils.getenv("TEMP") or utils.getenv("TMP") or utils.get_backend_path()
    local temp_path = fs.join(temp_dir, "steamgriddb-millennium-animated-" .. utils.uuid() .. ".download")
    local call_ok, result, download_err = pcall(http.download, url, temp_path, {
        timeout = 60,
        follow_redirects = true,
        verify_ssl = true,
        user_agent = USER_AGENT,
    })
    if not call_ok or not result or not result.success or (result.status and (result.status < 200 or result.status >= 300)) then
        os.remove(temp_path)
        logger:error("Animated artwork native download failed: " .. tostring(call_ok and (download_err or (result and result.status)) or result))
        return false
    end

    local entries, list_err = fs.list(grid_dir)
    if not entries then
        os.remove(temp_path)
        logger:error("Could not inspect active Steam grid folder: " .. tostring(list_err))
        return false
    end
    for _, entry in ipairs(entries) do
        if entry.is_file and fs.stem(entry.name) == base_name then
            local removed, remove_err = fs.remove(entry.path)
            if removed == nil then
                os.remove(temp_path)
                logger:error("Could not replace existing animated artwork: " .. tostring(remove_err))
                return false
            end
        end
    end

    local moved, move_err = fs.rename(temp_path, target_path)
    if not moved then
        local copied, copy_err = fs.copy(temp_path, target_path)
        os.remove(temp_path)
        if not copied then
            logger:error("Could not write animated artwork: " .. tostring(copy_err or move_err))
            return false
        end
    end

    logger:info("Animated artwork saved natively for Steam account " .. tostring(account_id) .. ": " .. target_path)
    return target_path
end

-- External navigation and lifecycle -------------------------------------

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
