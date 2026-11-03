import { routerHook, toaster as clientToaster } from 'millennium';
import { decodeResponse } from '../../services/sgdb-response';
import {
  currentSteamId,
  downloadAssetBase64,
  loadLocalAssetBase64,
  resetSteamIcon,
  saveShortcutIcon,
  setSteamIcon,
  sgdbRequest,
} from '../../services/backend';
import { renderIconImages } from '../../services/icon-images';
import { refreshShortcutIcon, refreshSteamIcon } from '../../steam/app-overview-refresh';
import { notifyApiKeyRejected } from '../../settings/key-rejected';
import { loadSettings, readSetting, writeSetting } from '../../settings/store';

export { routerHook };
export type RoutePatch = Parameters<typeof routerHook.addPatch>[1];

// Maps Decky's positional calls to the existing Millennium backend and plugin config.
export async function call<Args extends unknown[] = unknown[], Result = unknown>(name: string, ...args: Args): Promise<Result> {
  return await dispatchCall(name, args) as Result;
}

// Maps supported Decky backend names to chunked transfers, icon conversion, or plugin config.
async function dispatchCall(name: string, args: unknown[]): Promise<unknown> {
  switch (name) {
    case 'download_as_base64':
      return (await downloadAssetBase64(stringArgument(name, args[0]))).base64;
    case 'read_file_as_base64':
      return (await loadLocalAssetBase64(stringArgument(name, args[0]))).base64;
    case 'get_setting':
      await loadSettings();
      return readSetting(stringArgument(name, args[0]), args[1]);
    case 'set_setting':
      return await writeSetting(stringArgument(name, args[0]), args[1]);
    case 'set_steam_icon_from_url':
    case 'set_steam_icon_from_path': {
      const appid = appIdArgument(name, args[0]);
      const location = stringArgument(name, args[1]);
      const asset = name === 'set_steam_icon_from_url'
        ? await downloadAssetBase64(location)
        : await loadLocalAssetBase64(location);
      const images = await renderIconImages(asset.base64);
      const result = await setSteamIcon({
        appid,
        ico: images.ico,
        jpg: images.jpg,
        png: images.png,
        steam_id: currentSteamId(),
      });
      if (!result.success) throw new Error(result.error || 'The Steam icon could not be saved.');
      refreshSteamIcon(appid);
      return true;
    }
    case 'reset_steam_icon': {
      const appid = appIdArgument(name, args[0]);
      const result = await resetSteamIcon({ appid, steam_id: currentSteamId() });
      if (!result.success) throw new Error(result.error || 'The Steam icon could not be reset.');
      refreshSteamIcon(appid);
      return true;
    }
    case 'set_shortcut_icon':
    case 'set_shortcut_icon_from_url':
    case 'set_shortcut_icon_from_path': {
      const appid = appIdArgument(name, args[0]);
      if (appid < 0x80000000) throw new Error(`${name} requires a shortcut app ID.`);
      if (typeof SteamClient?.Apps?.SetShortcutIcon !== 'function') {
        throw new Error('Steam shortcut icon editing is unavailable.');
      }
      let path = '';
      let png = '';
      if (name !== 'set_shortcut_icon' || args[2] !== null) {
        const location = stringArgument(name, args[2]);
        const asset = name === 'set_shortcut_icon_from_url'
          ? await downloadAssetBase64(location)
          : await loadLocalAssetBase64(location);
        const images = await renderIconImages(asset.base64);
        const result = await saveShortcutIcon({ appid, png: images.png, steam_id: currentSteamId() });
        if (!result.success || !result.path) throw new Error(result.error || 'The shortcut icon could not be saved.');
        path = result.path;
        png = images.png;
      }
      await SteamClient.Apps.SetShortcutIcon(appid, path);
      // Steam on Windows reads shortcut icons only at startup, so show the new
      // one in the library now; upstream then skips its restart prompt.
      refreshShortcutIcon(appid, png);
      return 'icon_is_same_path';
    }
    default:
      throw new Error(`Unsupported Decky backend call: ${name}`);
  }
}

function appIdArgument(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 0xffffffff) {
    throw new Error(`${name} requires a valid unsigned 32-bit app ID.`);
  }
  return value;
}

// Validates string arguments before forwarding them to Millennium FFI.
function stringArgument(name: string, value: unknown): string {
  if (typeof value !== 'string') throw new Error(`${name} requires a string argument.`);
  return value;
}

export type FetchResponse = Pick<Response, 'ok' | 'status' | 'json' | 'text'>;

// Maps only SteamGridDB API GETs to sgdb_request, never forwarding caller credentials.
export async function fetchNoCors(url: string, init: RequestInit = {}): Promise<FetchResponse> {
  const target = new URL(url);
  if (target.origin !== 'https://www.steamgriddb.com' || target.username || target.password || !target.pathname.startsWith('/api/v2/')) {
    throw new Error('fetchNoCors only supports https://www.steamgriddb.com/api/v2/ URLs.');
  }
  if ((init.method ?? 'GET').toUpperCase() !== 'GET' || init.body != null) {
    throw new Error('fetchNoCors only supports SteamGridDB API GET requests.');
  }
  init.signal?.throwIfAborted();
  const reply = await sgdbRequest({ path: target.pathname.slice('/api/v2'.length) + target.search });
  init.signal?.throwIfAborted();
  const result = reply ? decodeResponse<unknown>(reply) : { success: false, errors: ['SteamGridDB returned an empty response.'] };
  if ((result as { key_rejected?: unknown }).key_rejected === true) notifyApiKeyRejected();
  const body = typeof reply === 'string' ? reply : JSON.stringify(result);
  const ok = result.success === true;
  return {
    ok,
    status: ok ? 200 : reply ? 400 : 502,
    // Maps Response.json() to the unchanged backend response envelope.
    async json() { return result; },
    // Maps Response.text() to the unchanged backend response text.
    async text() { return body; },
  };
}

export const toaster = {
  // Maps Decky notifications to Millennium's existing Steam notification integration.
  toast(data: Parameters<typeof clientToaster.toast>[0]): ReturnType<typeof clientToaster.toast> {
    return clientToaster.toast(data);
  },
};

export enum FileSelectionType {
  FILE,
  FOLDER,
}

export type FilePickerResult = { path: string; realpath: string };

// Maps Decky's file picker to the render window's native Steam file or folder dialog.
export async function openFilePicker(
  select: FileSelectionType,
  startPath: string,
  _includeFiles = true,
  _includeFolders = true,
  filter?: RegExp | ((file: File) => boolean),
  validFileExtensions?: string[],
  _defaultHidden = false,
  _showExtensions = true,
): Promise<FilePickerResult> {
  if (select !== FileSelectionType.FILE && select !== FileSelectionType.FOLDER) throw new Error('Unsupported file selection type.');
  if (typeof filter === 'function') throw new Error('Native Steam file dialogs do not support custom file predicate filters.');
  // The Big Picture window's SteamClient has no System API; the shared
  // context's (where plugin code runs) does.
  const steamClient = (globalThis as typeof globalThis & { SteamClient?: typeof SteamClient }).SteamClient;
  if (!steamClient?.System?.OpenFileDialog) throw new Error('Steam native file dialog is unavailable.');
  const patterns = validFileExtensions?.map((extension) => `*.${extension.replace(/^\*?\./, '')}`) ?? ['*'];
  const picked: unknown = await steamClient.System.OpenFileDialog({
    strTitle: select === FileSelectionType.FOLDER ? 'Choose a folder' : 'Choose artwork',
    bChooseDirectory: select === FileSelectionType.FOLDER,
    strInitialFile: startPath,
    rgFilters: [{ strFileTypeName: 'Files', rFilePatterns: patterns, bUseAsDefault: true }],
  }).catch((error: unknown) => {
    const failure = error as { result?: unknown; message?: unknown } | null;
    if (failure?.result === 52) throw new Error('User Canceled');
    const message = typeof failure?.message === 'string' ? failure.message.trim() : '';
    throw new Error(message || `File dialog failed${typeof failure?.result === 'number' ? ` (EResult ${failure.result})` : ''}`);
  });
  const path = Array.isArray(picked) ? picked[0] : picked;
  if (typeof path !== 'string' || !path) throw new Error('User Canceled');
  if (filter && !new RegExp(filter.source, filter.flags).test(path)) throw new Error('The selected file does not match the requested filter.');
  return { path, realpath: path };
}
