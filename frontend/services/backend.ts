import { parseResponse } from './sgdb-response';

export { parseResponse } from './sgdb-response';

export type SGDBCollection = {
  id: number;
  name: string;
};

export const sgdbRequest = ({ path }: { path: string }): Promise<unknown> => backend.sgdb_request(path);
export const getApiKeyStatus = () => backend.get_api_key_status();
export const setApiKey = ({ api_key }: { api_key: string }) => backend.set_api_key(api_key);
export const clearApiKey = () => backend.clear_api_key();

export type DownloadedAsset = {
  base64: string;
  /** Format detected from the file's contents, e.g. 'png' or 'jpg'. */
  format: string;
};

/**
 * Downloads artwork through the backend. Millennium limits a backend reply to
 * 8 MB, so the image comes back in chunks and is joined here.
 */
export async function downloadAssetBase64(url: string): Promise<DownloadedAsset> {
  return readHeldAsset(await backend.download_asset(url), 'The artwork could not be downloaded.');
}

/** Reads a local image file (from Steam's file dialog) through the backend. */
export async function loadLocalAssetBase64(path: string): Promise<DownloadedAsset> {
  return readHeldAsset(await backend.load_local_asset(path), 'The image could not be read.');
}

async function readHeldAsset(result: {
  success: boolean;
  id?: string;
  format?: string;
  chunks?: number;
  error?: string;
}, fallbackError: string): Promise<DownloadedAsset> {
  if (!result.success || !result.id || !result.chunks) {
    throw new Error(result.error || fallbackError);
  }

  try {
    const chunks: string[] = [];
    for (let index = 0; index < result.chunks; index += 1) {
      const chunk = await backend.read_asset_chunk(result.id, index);
      if (typeof chunk !== 'string' || !chunk) {
        throw new Error('The downloaded artwork could not be read.');
      }
      chunks.push(chunk);
    }
    return { base64: chunks.join(''), format: result.format ?? '' };
  } finally {
    void backend.release_asset(result.id);
  }
}
export const setSteamIcon = ({ appid, ico, jpg, png, steam_id }: {
  appid: number; ico: string; jpg: string; png: string; steam_id: string;
}) => backend.set_steam_icon(appid, ico, jpg, png, steam_id);
export const resetSteamIcon = ({ appid, steam_id }: { appid: number; steam_id: string }) => backend.reset_steam_icon(appid, steam_id);
export const saveShortcutIcon = ({ appid, png, steam_id }: { appid: number; png: string; steam_id: string }) => backend.save_shortcut_icon(appid, png, steam_id);
/** SteamID64 of the signed-in user, or '' before login. */
export const currentSteamId = (): string => {
  const steamId = (window as any).App?.m_CurrentUser?.strSteamID;
  return typeof steamId === 'string' && /^\d+$/.test(steamId) ? steamId : '';
};

const COLLECTION_ASSET_TYPE: Record<SGDBAssetType, 'grid' | 'hero' | 'logo' | 'icon'> = {
  grid_p: 'grid',
  grid_l: 'grid',
  hero: 'hero',
  logo: 'logo',
  icon: 'icon',
};

// SteamGridDB response helpers ------------------------------------------

export async function loadCollections(): Promise<SGDBCollection[]> {
  const data = parseResponse<unknown>(await sgdbRequest({ path: '/search/collections' }));
  if (!Array.isArray(data)) {
    throw new Error('SteamGridDB returned an invalid collections response.');
  }

  return data.map((value) => {
    const collection = value as Partial<SGDBCollection>;
    if (!Number.isFinite(collection.id) || typeof collection.name !== 'string') {
      throw new Error('SteamGridDB returned an invalid collection.');
    }
    return {
      id: collection.id as number,
      name: collection.name,
    };
  });
}

export async function addAssetToCollection(
  collectionId: number,
  asset: { id: number },
  type: SGDBAssetType,
): Promise<void> {
  const body = await backend.add_asset_to_collection(collectionId, `${COLLECTION_ASSET_TYPE[type]}:${asset.id}`);
  parseResponse<null>(body);
}
