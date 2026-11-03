// Steam's library reads icons from the app overview in `appStore`, which the
// Steam process only refreshes at startup:
// - Steam games: the icon URL carries `local_cache_version` as a cache buster,
//   so the library keeps showing the old image after we overwrite the file.
// - Shortcuts: `icon_data` holds the image itself.
// We swap a copy of the overview with the new values into the store, the way
// Steam's own JS does (see appStore.OnCloudStorageChanged), and keep those
// values in place when Steam pushes its own update for the app before the
// next restart.

type Overrides = Record<string, unknown>;

const overrides = new Map<number, Overrides>();
let storeGuarded = false;

const appStoreOf = () => (window as any).appStore;

const withOverrides = (overview: any) => {
  const changes = overrides.get(overview?.appid);
  if (!changes) return overview;
  Object.assign(overview, changes);
  // Steam updates observable overviews in place.
  if (!Object.prototype.hasOwnProperty.call(overview, 'InitFromProto')) {
    const initFromProto = overview.InitFromProto;
    overview.InitFromProto = function (this: any, ...args: unknown[]) {
      const result = initFromProto.apply(this, args);
      Object.assign(this, overrides.get(this.appid));
      return result;
    };
  }
  return overview;
};

const guardStore = (apps: any) => {
  if (storeGuarded) return;
  storeGuarded = true;
  const set = apps.set;
  apps.set = function (this: unknown, appid: number, overview: unknown) {
    return set.call(this, appid, withOverrides(overview));
  };
};

export const refreshAppOverview = (appid: number, changes: Overrides) => {
  const store = appStoreOf();
  const overview = store?.GetAppOverviewByAppID?.(appid);
  if (!overview || !store.m_mapApps) return;

  overrides.set(appid, { ...overrides.get(appid), ...changes });
  guardStore(store.m_mapApps);
  const copy = Object.assign(Object.create(Object.getPrototypeOf(overview)), overview);
  store.m_mapApps.set(appid, copy);
};

/** Makes the library load a Steam game's icon again from Steam's cache. */
export const refreshSteamIcon = (appid: number) => {
  refreshAppOverview(appid, { local_cache_version: Math.floor(Date.now() / 1000) });
};

/** Shows a shortcut's new icon now; '' shows no icon until Steam restarts. */
export const refreshShortcutIcon = (appid: number, png: string) => {
  refreshAppOverview(appid, png ? { icon_data: png, icon_data_format: 'png' } : { icon_data: '', icon_data_format: undefined });
};
