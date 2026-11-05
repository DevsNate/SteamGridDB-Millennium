// Reads collections from SteamGridDB's website API, with in-memory request reuse and a saved copy on disk.
import {
  CollectionAsset, CollectionAssetPage, PublicCollection, isCollectionAsset, isCollectionInfo, loadCollectionAssets,
  loadPublicCollection, loadSavedCollection, saveCollectionFile,
} from '../services/backend';

export type CollectionArtwork = CollectionAsset & { type: SGDBAssetType };
export type CollectionContents = { info: PublicCollection; assets: CollectionArtwork[] };
export type SavedCollection = CollectionContents & { savedAt: number };
type PageType = 'grid' | 'hero' | 'logo' | 'icon';

const PAGE_TYPES: PageType[] = ['grid', 'hero', 'logo', 'icon'];
const ARTWORK_TYPES: unknown[] = ['grid_p', 'grid_l', 'hero', 'logo', 'icon'];
const CACHE_LIMIT = 128;
const SAVED_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const infos = new Map<number, Promise<PublicCollection>>();
const pages = new Map<string, Promise<CollectionAssetPage>>();
let refreshedAt = 0;

// Failed requests are forgotten, so they can always be retried.
function reuse<K, V>(cache: Map<K, Promise<V>>, key: K, fetch: () => Promise<V>): Promise<V> {
  let pending = cache.get(key);
  if (!pending) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    pending = fetch();
    cache.set(key, pending);
    void pending.catch(() => {
      if (cache.get(key) === pending) cache.delete(key);
    });
  }
  return pending;
}

export const collectionInfo = (id: number) => reuse(infos, id, () => loadPublicCollection(id));

export const collectionPage = (id: number, type: PageType, page: number) => (
  reuse(pages, `${id}:${type}:${page}`, () => loadCollectionAssets(id, type, page))
);

export function firstPageType(info: PublicCollection): PageType | undefined {
  return PAGE_TYPES.find(type => info.counts[type] > 0);
}

/** So the next read of this collection asks SteamGridDB instead of reusing this session's answer. */
export function forgetCollection(id: number): void {
  infos.delete(id);
  for (const key of pages.keys()) if (key.startsWith(`${id}:`)) pages.delete(key);
}

export function clearCollectionCache(): void {
  infos.clear();
  pages.clear();
  refreshedAt = Date.now();
}

/** A damaged or unreadable copy only means reading the collection again. */
export async function savedCollection(id: number): Promise<SavedCollection | null> {
  try {
    const saved = await loadSavedCollection(id) as Partial<SavedCollection> | null;
    return saved && typeof saved.savedAt === 'number' && isCollectionInfo(saved.info, id) && Array.isArray(saved.assets)
      && saved.assets.every(asset => isCollectionAsset(asset) && ARTWORK_TYPES.includes(asset.type))
      ? saved as SavedCollection
      : null;
  } catch {
    return null;
  }
}

/** Too big to save, or a failed write, only means the next open reads it again. */
export async function saveCollection(id: number, contents: CollectionContents): Promise<void> {
  try {
    await saveCollectionFile(id, JSON.stringify({ ...contents, savedAt: Date.now() }));
  } catch { /* See above. */ }
}

/** Whether a saved copy can stand without reading every page: same counts, recent, and no Refresh since. */
export const isSavedCurrent = (saved: SavedCollection, info: PublicCollection) => (
  saved.savedAt > Math.max(refreshedAt, Date.now() - SAVED_MAX_AGE_MS)
  && PAGE_TYPES.every(type => info.counts[type] === saved.info.counts[type])
);

export function collectionId(value: string): number {
  const match = /^(?:https:\/\/(?:www\.)?steamgriddb\.com\/collection\/)?([1-9]\d*)\/?$/.exec(value.trim());
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(id) || id > 2147483647) throw Error('Enter a SteamGridDB collection URL or ID.');
  return id;
}

// Square grids count as capsules, like the plugin's Capsule tab.
const artworkType = (type: PageType, asset: CollectionAsset): SGDBAssetType => {
  if (type !== 'grid') return type;
  return asset.width > asset.height ? 'grid_l' : 'grid_p';
};

/** Reports the artwork so far after every page. The API only accepts types the collection has. */
export async function readCollection(
  id: number,
  signal: AbortSignal,
  onPage: (info: PublicCollection, assets: CollectionArtwork[]) => void = () => {},
): Promise<CollectionContents> {
  const info = await collectionInfo(id);
  const assets: CollectionArtwork[] = [];
  for (const type of PAGE_TYPES) {
    if (!info.counts[type]) continue;
    const seen = new Set<number>();
    for (let page = 0; ; page++) {
      signal.throwIfAborted();
      const result = await collectionPage(id, type, page);
      signal.throwIfAborted();
      const added = result.assets.filter(asset => !seen.has(asset.id));
      added.forEach(asset => {
        seen.add(asset.id);
        assets.push({ ...asset, type: artworkType(type, asset) });
      });
      onPage(info, [...assets]);
      if (seen.size >= result.total) break;
      if (!added.length) throw Error('SteamGridDB returned incomplete collection contents. Please retry.');
    }
  }
  if (!assets.length) onPage(info, []);
  return { info, assets };
}
