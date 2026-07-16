import { callable } from '@steambrew/client';
import { parseResponse } from './sgdb-response';
import type { SGDBAsset, SGDBAssetType, SGDBCollection } from './types';

export { parseResponse } from './sgdb-response';

export type SGDBGame = {
  id: number;
  name: string;
};

export type ApiKeyResult = {
  success: boolean;
  configured?: boolean;
  api_key?: string;
  error?: string;
};

// Millennium backend bindings -------------------------------------------

const sgdbRequest = callable<[{ path: string }], string | false>('sgdb_request');
const addAssetToCollectionRequest = callable<[{ collection_id: number; route: string }], string | false>('add_asset_to_collection');

export const getApiKeyStatus = callable<[], string>('get_api_key_status');
export const setApiKey = callable<[{ api_key: string }], string>('set_api_key');
export const downloadAsBase64 = callable<[{ url: string }], string | false>('download_as_base64');
export const setSteamIconFromUrl = callable<
  [{ appid: number; url: string; extension: string }],
  string | false
>('set_steam_icon_from_url');
export const resetSteamIcon = callable<[{ appid: number }], string | false>('reset_steam_icon');
export const setAnimatedArtworkFromUrl = callable<
  [{ appid: number; asset_type: SGDBAssetType; url: string; extension: string }],
  string | false
>('set_animated_artwork_from_url');
export const openExternalUrl = callable<[{ url: string }], boolean>('open_external_url');

const COLLECTION_ASSET_TYPE: Record<SGDBAssetType, 'grid' | 'hero' | 'logo' | 'icon'> = {
  grid_p: 'grid',
  grid_l: 'grid',
  hero: 'hero',
  logo: 'logo',
  icon: 'icon',
};

// SteamGridDB response helpers ------------------------------------------

export async function apiGet<T>(path: string): Promise<T> {
  return parseResponse<T>(await sgdbRequest({ path }));
}

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
  asset: SGDBAsset,
  type: SGDBAssetType,
): Promise<void> {
  parseResponse<null>(await addAssetToCollectionRequest({
    collection_id: collectionId,
    route: `${COLLECTION_ASSET_TYPE[type]}:${asset.id}`,
  }));
}
