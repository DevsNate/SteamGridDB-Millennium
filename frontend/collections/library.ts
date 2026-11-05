// Connects SteamGridDB games to the user's Steam library. Reads Steam's app store; never writes artwork.
import { currentSteamId, loadCustomArtwork, loadGameLinks, parseResponse, saveGameLinks, sgdbRequest } from '../services/backend';
import { readSetting, writeSetting } from '../settings/store';

export type { AppliedArtwork, CustomArtwork } from '../services/backend';
export type LibraryApp = AppStoreAppOverview & { BIsOwned(): boolean };
export type GameMatch = {
  status: 'matched' | 'unlinked' | 'not-owned' | 'ambiguous' | 'unavailable' | 'error';
  appid?: number;
  candidates: number[];
  manual?: boolean;
  error?: string;
};

const LOOKUP_WORKERS = 3;
const FLUSH_INTERVAL_MS = 200;
const RETRY_DELAY_MS = 1000;
const SAVE_DELAY_MS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
// SteamGridDB has no bulk lookup, so links are kept on disk and each game is only looked up once in a while.
// A game without a link may get one soon, so those are checked again sooner.
const LINK_MAX_AGE_MS = 30 * DAY_MS;
const NO_LINK_MAX_AGE_MS = DAY_MS;

type StoredLink = [savedAt: number, appids: number[]];
const links = new Map<number, Promise<number[]>>();
let stored: Promise<Map<number, StoredLink>> | undefined;
let unsaved = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const validAppid = (appid: unknown) => Number.isSafeInteger(appid) && (appid as number) > 0 && (appid as number) < 0x80000000;

/** A damaged or unreadable file only costs new lookups. */
function storedLinks(): Promise<Map<number, StoredLink>> {
  stored ??= loadGameLinks().then(file => {
    const entries = Object.entries(file && typeof file === 'object' ? file : {}).flatMap(([id, value]): [number, StoredLink][] => (
      Array.isArray(value) && typeof value[0] === 'number' && Array.isArray(value[1]) && value[1].every(validAppid)
        ? [[Number(id), [value[0], value[1]]]]
        : []
    ));
    return new Map(entries);
  }).catch(() => new Map<number, StoredLink>());
  return stored;
}

async function saveLinks(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!unsaved || !stored) return;
  unsaved = false;
  const current = await stored;
  try {
    // The backend answers false for a failed write; the next save tries again.
    if (!await saveGameLinks(JSON.stringify(Object.fromEntries(current)))) unsaved = true;
  } catch {
    unsaved = true;
  }
}

// The saved links stay: they're the same for every account, and expiry still applies on the next pass.
export const clearGameLinks = () => links.clear();

export function libraryApp(appid: number, shortcuts = false): LibraryApp | null {
  const app = window.appStore.GetAppOverviewByAppID(appid) as LibraryApp | null;
  if (!app || app.third_party_mod) return null;
  if (app.BIsShortcut()) return shortcuts && app.selected_clientid === '0' ? app : null;
  // Steam defines ownership as visible_in_game_list && subscribed_to, not installed.
  if (typeof app.BIsOwned !== 'function') throw Error('Steam library ownership checks are unavailable.');
  return app.BIsOwned() ? app : null;
}

function storeApps(): LibraryApp[] {
  const store = window.appStore as typeof window.appStore & {
    allApps?: LibraryApp[];
    m_mapApps?: Map<number, LibraryApp>;
  };
  const apps = store.allApps;
  if (Array.isArray(apps)) return apps;
  if (store.m_mapApps) return [...store.m_mapApps.values()];
  throw Error('Steam library search is unavailable.');
}

export function libraryApps(): LibraryApp[] {
  return storeApps()
    .filter(app => libraryApp(app.appid, true))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** Shortcuts already linked to a SteamGridDB game by the artwork tabs. Those settings are only read here. */
export function shortcutAssociations(): Map<number, number[]> {
  const associations = new Map<number, number[]>();
  for (const app of storeApps()) {
    if (!app.BIsShortcut() || !libraryApp(app.appid, true)) continue;
    const id = (readSetting(`nonsteam_${app.appid}`, null) as { id?: unknown } | null)?.id;
    if (typeof id === 'number') associations.set(id, [...(associations.get(id) ?? []), app.appid]);
  }
  return associations;
}

export function matchSettingKey(account: string, gameId: number): string {
  if (!/^\d+$/.test(account) || !Number.isSafeInteger(gameId) || gameId <= 0) throw Error('Invalid collection match.');
  return `collection_match_${account}_${gameId}`;
}

export async function saveGameMatch(account: string, gameId: number, appid: number | null): Promise<void> {
  if (currentSteamId() !== account) throw Error('Your Steam account changed. Open the game again.');
  if (appid !== null && !libraryApp(appid, true)) throw Error('This game is no longer available in your local library.');
  await writeSetting(matchSettingKey(account, gameId), appid);
}

function savedMatch(account: string, gameId: number): GameMatch | null {
  const saved = readSetting(matchSettingKey(account, gameId), null);
  if (saved === null) return null;
  return typeof saved === 'number' && Number.isSafeInteger(saved) && libraryApp(saved, true)
    ? { status: 'matched', appid: saved, candidates: [saved], manual: true }
    : { status: 'unavailable', candidates: [], manual: true };
}

function steamLinks(gameId: number): Promise<number[]> {
  let pending = links.get(gameId);
  if (!pending) {
    pending = (async () => {
      const known = await storedLinks();
      const saved = known.get(gameId);
      if (saved && Date.now() - saved[0] < (saved[1].length ? LINK_MAX_AGE_MS : NO_LINK_MAX_AGE_MS)) return saved[1];
      const game = parseResponse<{ external_platform_data?: { steam?: Array<{ id: number | string }> } }>(
        await sgdbRequest({ path: `/games/id/${gameId}?platformdata=steam` }),
      );
      const steam = game.external_platform_data?.steam ?? [];
      if (!Array.isArray(steam)) throw Error('SteamGridDB returned invalid game links.');
      const appids = [...new Set(steam.map(app => Number(app.id)))].filter(validAppid);
      known.set(gameId, [Date.now(), appids]);
      unsaved = true;
      saveTimer ??= setTimeout(() => { void saveLinks(); }, SAVE_DELAY_MS);
      return appids;
    })();
    links.set(gameId, pending);
    void pending.catch(() => {
      if (links.get(gameId) === pending) links.delete(gameId);
    });
  }
  return pending;
}

export async function matchGame(
  gameId: number,
  account: string,
  associations?: Map<number, number[]>,
): Promise<GameMatch> {
  try {
    const saved = savedMatch(account, gameId);
    if (saved) return saved;
    const steam = await steamLinks(gameId);
    // A manual choice made during the lookup wins.
    const newer = savedMatch(account, gameId);
    if (newer) return newer;
    const candidates = [...steam.filter(appid => libraryApp(appid)), ...((associations ?? shortcutAssociations()).get(gameId) ?? [])];
    if (candidates.length === 1) return { status: 'matched', appid: candidates[0], candidates };
    if (candidates.length > 1) return { status: 'ambiguous', candidates };
    return { status: steam.length ? 'not-owned' : 'unlinked', candidates };
  } catch (error) {
    return { status: 'error', candidates: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** Bounded lookups. Results arrive in small batches, so a big collection doesn't re-render per game. */
export async function matchGames(
  gameIds: number[],
  account: string,
  signal: AbortSignal,
  onBatch: (matches: Map<number, GameMatch>) => void,
): Promise<void> {
  const associations = shortcutAssociations();
  let next = 0;
  let batch = new Map<number, GameMatch>();
  let flushed = Date.now();
  const failed: number[] = [];
  const flush = () => {
    if (!batch.size || signal.aborted) return;
    onBatch(batch);
    batch = new Map();
    flushed = Date.now();
  };
  const worker = async () => {
    while (!signal.aborted && next < gameIds.length) {
      const gameId = gameIds[next++];
      const match = await matchGame(gameId, account, associations);
      batch.set(gameId, match);
      if (match.status === 'error') failed.push(gameId);
      if (Date.now() - flushed >= FLUSH_INTERVAL_MS) flush();
    }
  };
  await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker));
  flush();
  await saveLinks();
  await retryFailed(failed, account, associations, signal, onBatch);
}

/** One more try for passing failures. It stops at the first repeat, so an outage doesn't mean hundreds more requests. */
async function retryFailed(
  failed: number[],
  account: string,
  associations: Map<number, number[]>,
  signal: AbortSignal,
  onBatch: (matches: Map<number, GameMatch>) => void,
): Promise<void> {
  if (!failed.length || signal.aborted) return;
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  for (const gameId of failed) {
    if (signal.aborted) return;
    const match = await matchGame(gameId, account, associations);
    if (signal.aborted) return;
    onBatch(new Map([[gameId, match]]));
    if (match.status === 'error') break;
  }
  await saveLinks();
}

/** Existing custom artwork per app, and what we know of it. A failed scan rejects, so nothing is treated as safe to overwrite. */
export async function customArtwork(appids: number[]) {
  const { custom, applied } = await loadCustomArtwork(appids);
  for (const appid of appids) {
    const app = libraryApp(appid, true);
    if (app?.BIsShortcut() && app.icon_data) custom[appid] = [...(custom[appid] ?? []), 'icon'];
  }
  return { custom, applied };
}
