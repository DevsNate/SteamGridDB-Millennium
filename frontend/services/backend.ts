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

export async function loadGameLinks(): Promise<unknown> {
  const links: unknown = await backend.get_game_links();
  return typeof links === 'string' ? JSON.parse(links) : links;
}

export const saveGameLinks = (links: string) => backend.save_game_links(links);

export async function loadSavedCollection(collectionId: number): Promise<unknown> {
  const saved: unknown = await backend.get_saved_collection(collectionId);
  return typeof saved === 'string' ? JSON.parse(saved) : saved;
}

export const saveCollectionFile = (collectionId: number, contents: string) => backend.save_collection(collectionId, contents);
export const deleteSavedCollection = (collectionId: number) => backend.delete_saved_collection(collectionId);

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
    if (!Number.isSafeInteger(collection.id) || collection.id! <= 0 || typeof collection.name !== 'string') {
      throw new Error('SteamGridDB returned an invalid collection.');
    }
    return {
      id: collection.id as number,
      name: collection.name,
    };
  });
}

// Collections: SteamGridDB's website API, no key. See backend/main.lua.

export type PublicCollection = {
  id: number;
  name: string;
  author?: { name: string };
  /** How many assets of each type the collection holds. */
  counts: Record<'grid' | 'hero' | 'logo' | 'icon', number>;
};

/** One asset from a collection; `game` is SteamGridDB's game, not a Steam app. */
export type CollectionAsset = {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  mime: string;
  is_animated: boolean;
  game: { id: number; name: string };
  style?: string;
  notes?: string;
  author?: { name: string; avatar: string; steam64: string };
  nsfw?: boolean;
  humor?: boolean;
  epilepsy?: boolean;
};

export type CollectionAssetPage = { assets: CollectionAsset[]; total: number };

export function isCollectionInfo(data: PublicCollection | null | undefined, collectionId: number): data is PublicCollection {
  return Boolean(data && data.id === collectionId && typeof data.name === 'string' && data.counts
    && ['grid', 'hero', 'logo', 'icon'].every(type => Number.isSafeInteger(data.counts[type as keyof PublicCollection['counts']])
      && data.counts[type as keyof PublicCollection['counts']] >= 0));
}

export function isCollectionAsset(asset: CollectionAsset | null | undefined): asset is CollectionAsset {
  return Boolean(asset && Number.isSafeInteger(asset.id) && asset.id > 0
    && asset.game && Number.isSafeInteger(asset.game.id) && asset.game.id > 0 && typeof asset.game.name === 'string'
    && typeof asset.url === 'string' && asset.url.startsWith('https://')
    && typeof asset.thumb === 'string' && asset.thumb.startsWith('https://')
    && Number.isFinite(asset.width) && asset.width > 0 && Number.isFinite(asset.height) && asset.height > 0);
}

export async function loadPublicCollection(collectionId: number): Promise<PublicCollection> {
  const data = parseResponse<PublicCollection>(await backend.get_public_collection(collectionId));
  if (!isCollectionInfo(data, collectionId)) throw Error('SteamGridDB returned an invalid collection.');
  return data;
}

/** Pages start at 0. Only ask for types with a non-zero count: the website API fails on empty ones. */
export async function loadCollectionAssets(
  collectionId: number,
  type: 'grid' | 'hero' | 'logo' | 'icon',
  page: number,
): Promise<CollectionAssetPage> {
  const data = parseResponse<{ assets?: CollectionAsset[]; total?: number }>(
    await backend.get_public_collection_assets(collectionId, type, page),
  );
  if (!data || !Array.isArray(data.assets) || !Number.isSafeInteger(data.total) || data.total! < 0
    || !data.assets.every(isCollectionAsset)) {
    throw Error('SteamGridDB returned invalid collection artwork.');
  }
  // Public collection payloads omit some v2 fields. Keep real optional metadata
  // for the shared tiles/Details; never assume an author or style is present.
  return { assets: data.assets.map(asset => ({ ...asset,
    mime: typeof asset.mime === 'string' ? asset.mime : '',
    is_animated: asset.is_animated === true,
    style: typeof asset.style === 'string' ? asset.style : undefined,
    notes: typeof asset.notes === 'string' ? asset.notes : undefined,
    nsfw: asset.nsfw === true, humor: asset.humor === true, epilepsy: asset.epilepsy === true,
    // The shared tile and Details need all three, so a partial author counts as none.
    author: asset.author && typeof asset.author.name === 'string' && typeof asset.author.avatar === 'string'
      && asset.author.avatar.startsWith('https://') && /^\d+$/.test(String(asset.author.steam64)) ? asset.author : undefined,
  })), total: data.total! };
}

/** Keyed by app ID; apps with none are left out. */
export type CustomArtwork = Record<string, SGDBAssetType[]>;
/** The SteamGridDB artwork an app shows, for the files that are still the ones we wrote. */
export type AppliedArtwork = Record<string, Partial<Record<SGDBAssetType, { id: number; collection: boolean }>>>;

/** Which artwork types each app has custom files for, and which of those files we know. */
export async function loadCustomArtwork(appids: number[]): Promise<{ custom: CustomArtwork; applied: AppliedArtwork }> {
  const result = await backend.get_custom_artwork(JSON.stringify(appids), currentSteamId()) as {
    success: boolean; error?: string; custom?: CustomArtwork; applied?: AppliedArtwork;
  };
  if (!result?.success) throw new Error(result?.error || 'Could not read your custom artwork.');
  return { custom: result.custom ?? {}, applied: result.applied ?? {} };
}

/** Notes which artwork a game now shows. It was already applied, so failing here only means the next scan treats it as custom artwork. */
export async function rememberArtwork(appid: number, type: SGDBAssetType, artworkId: number, fromCollection = false): Promise<void> {
  try {
    if (!await backend.remember_artwork(appid, type, artworkId, currentSteamId(), fromCollection)) console.error('[SteamGridDB] Could not remember the applied artwork.');
  } catch (error) {
    console.error('[SteamGridDB] Could not remember the applied artwork.', error);
  }
}

export const forgetArtwork = (appid: number, type: SGDBAssetType) => backend.forget_artwork(appid, type, currentSteamId());

/** The SteamGridDB artwork a game shows, or 0 if unknown. */
export const appliedArtwork = (appid: number, type: SGDBAssetType): Promise<number> => backend.get_applied_artwork(appid, type, currentSteamId());

export async function addAssetToCollection(
  collectionId: number,
  asset: { id: number },
  type: SGDBAssetType,
): Promise<void> {
  const body = await backend.add_asset_to_collection(collectionId, `${COLLECTION_ASSET_TYPE[type]}:${asset.id}`);
  parseResponse<null>(body);
}
