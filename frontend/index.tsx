import {
  callable,
  afterPatch,
  definePlugin,
  DialogButton,
  DropdownItem,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  EUIMode,
  IconsModule,
  Menu,
  MenuItem,
  Millennium,
  Navigation,
  PanelSection,
  PanelSectionRow,
  routerHook,
  showContextMenu,
  showModal,
  toaster,
  TextField,
  ToggleField,
  useParams,
} from '@steambrew/client';
import { Dispatch, FC, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { GamepadView } from './views/GamepadView';

declare const SteamClient: {
  Apps: {
    ClearCustomArtworkForApp(appid: number, assetType: number): Promise<void>;
    SetCustomArtworkForApp(appid: number, data: string, extension: string, assetType: number): Promise<void>;
    SetCustomLogoPositionForApp?(appid: number, position: { pinnedPosition: string; nWidthPct: number; nHeightPct: number }): Promise<void>;
  };
  UI: {
    GetUIMode(): Promise<EUIMode>;
    RegisterForUIModeChanged(callback: (mode: EUIMode) => void): { unregister(): void };
  };
};

export type SGDBAssetType = 'grid_p' | 'grid_l' | 'hero' | 'logo' | 'icon';

export type SGDBAsset = {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  author?: {
    name?: string;
  };
  nsfw?: boolean;
  humor?: boolean;
  epilepsy?: boolean;
};

export type AssetState = Record<SGDBAssetType, SGDBAsset[]>;
export type PageState = Record<SGDBAssetType, number>;
export type LoadingState = Record<SGDBAssetType, boolean>;
export type EndState = Record<SGDBAssetType, boolean>;
export type FilterState = {
  static: boolean;
  animated: boolean;
  adult: boolean;
  humor: boolean;
  epilepsy: boolean;
};
export type ZoomState = Record<SGDBAssetType, number>;
type FilterStateByType = Record<SGDBAssetType, FilterState>;
type ThemeColorSettings = {
  background: string;
  surfaceHover: string;
  gridHoverBorder: string;
  sliderTrack: string;
  sliderThumb: string;
};
type ThemePresetKey = 'fluenty' | 'steam' | 'oled' | 'midnight' | 'ember' | 'custom';
type ThemePreset = {
  key: Exclude<ThemePresetKey, 'custom'>;
  label: string;
  colors: Partial<ThemeColorSettings>;
  backgroundPaint?: string;
};

type PluginSettings = {
  showExternalLinks: boolean;
  showCollectionButtons: boolean;
  showCreatorNames: boolean;
  preloadPages: number;
  spaceThemeCompatibility: boolean;
  themePreset: ThemePresetKey;
  themeColors: ThemeColorSettings;
};

type SGDBResponse<T> = {
  success: boolean;
  data: T;
  errors?: string[];
};

type SGDBGame = {
  id: number;
  name: string;
};

export type SGDBCollection = {
  id: number;
  name: string;
};

type ApiKeyResult = {
  success: boolean;
  configured?: boolean;
  api_key?: string;
  error?: string;
};

const sgdbRequest = callable<[{ path: string }], string | false>('sgdb_request');
const addAssetToCollectionRequest = callable<[{ collection_id: number; route: string }], string | false>('add_asset_to_collection');
const getApiKeyStatus = callable<[], string>('get_api_key_status');
const setApiKey = callable<[{ api_key: string }], string>('set_api_key');
const downloadAsBase64 = callable<[{ url: string }], string | false>('download_as_base64');
const setSteamIconFromUrl = callable<[{ appid: number; url: string; extension: string }], string | false>('set_steam_icon_from_url');
const resetSteamIcon = callable<[{ appid: number }], string | false>('reset_steam_icon');
const setAnimatedArtworkFromUrl = callable<[{ appid: number; asset_type: SGDBAssetType; url: string; extension: string }], string | false>('set_animated_artwork_from_url');
const openExternalUrl = callable<[{ url: string }], boolean>('open_external_url');

const ASSET_TYPE: Record<SGDBAssetType, number> = {
  grid_p: 0,
  grid_l: 3,
  hero: 1,
  logo: 2,
  icon: 4,
};

export const ASSET_LABEL: Record<SGDBAssetType, string> = {
  grid_p: 'Grid',
  grid_l: 'Wide Grid',
  hero: 'Hero',
  logo: 'Logo',
  icon: 'Icon',
};

const ASSET_ENDPOINT: Record<SGDBAssetType, string> = {
  grid_p: 'grids',
  grid_l: 'grids',
  hero: 'heroes',
  logo: 'logos',
  icon: 'icons',
};

const ASSET_PAGE_PATH: Record<SGDBAssetType, string> = {
  grid_p: 'grid',
  grid_l: 'grid',
  hero: 'hero',
  logo: 'logo',
  icon: 'icon',
};

const DEFAULT_DIMENSIONS: Record<SGDBAssetType, string[]> = {
  grid_p: ['600x900', '342x482', '660x930'],
  grid_l: ['460x215', '920x430'],
  hero: ['1920x620', '3840x1240', '1600x650'],
  logo: [],
  icon: [1024, 768, 512, 310, 256, 194, 192, 180, 160, 152, 150, 144, 128, 120, 114, 100, 96, 90, 80, 76, 72, 64, 60, 57, 56, 54, 48, 40, 35, 32, 28, 24, 20, 16].map(String),
};

const emptyAssets = (): AssetState => ({
  grid_p: [],
  grid_l: [],
  hero: [],
  logo: [],
  icon: [],
});

const emptyPages = (): PageState => ({
  grid_p: 0,
  grid_l: 0,
  hero: 0,
  logo: 0,
  icon: 0,
});

const emptyLoading = (): LoadingState => ({
  grid_p: false,
  grid_l: false,
  hero: false,
  logo: false,
  icon: false,
});

const emptyEnd = (): EndState => ({
  grid_p: false,
  grid_l: false,
  hero: false,
  logo: false,
  icon: false,
});

const DEFAULT_STYLES: Record<SGDBAssetType, string[]> = {
  grid_p: ['alternate', 'white_logo', 'no_logo', 'blurred', 'material'],
  grid_l: ['alternate', 'white_logo', 'no_logo', 'blurred', 'material'],
  hero: ['alternate', 'blurred', 'material'],
  logo: ['official', 'white', 'black', 'custom'],
  icon: ['official', 'custom'],
};

const DEFAULT_MIMES: Record<SGDBAssetType, string[]> = {
  grid_p: ['image/png', 'image/jpeg', 'image/webp'],
  grid_l: ['image/png', 'image/jpeg', 'image/webp'],
  hero: ['image/png', 'image/jpeg', 'image/webp'],
  logo: ['image/png', 'image/webp'],
  icon: ['image/png', 'image/vnd.microsoft.icon'],
};

export const tabs = Object.keys(ASSET_TYPE) as SGDBAssetType[];

const defaultFilters: FilterState = {
  static: true,
  animated: true,
  adult: false,
  humor: true,
  epilepsy: true,
};

const defaultThemeColors: ThemeColorSettings = {
  background: '#121212',
  surfaceHover: '#1e1e1e',
  gridHoverBorder: '#ffffff',
  sliderTrack: '#252525',
  sliderThumb: '#3a3a3a',
};

const COLLECTION_ASSET_TYPE: Record<SGDBAssetType, 'grid' | 'hero' | 'logo' | 'icon'> = {
  grid_p: 'grid',
  grid_l: 'grid',
  hero: 'hero',
  logo: 'logo',
  icon: 'icon',
};

const themePresets: ThemePreset[] = [
  {
    key: 'fluenty',
    label: 'Fluenty dark',
    colors: defaultThemeColors,
  },
  {
    key: 'steam',
    label: 'Steam blue',
    colors: {
      background: '#05080b',
      surfaceHover: '#30363d',
      gridHoverBorder: '#ffffff',
      sliderTrack: '#252a2f',
      sliderThumb: '#1a9fff',
    },
    backgroundPaint: 'radial-gradient(1180px 760px at 52% 16%, rgba(17, 29, 38, 0.36), rgba(7, 12, 17, 0.18) 54%, transparent 84%), linear-gradient(180deg, #05080b 0, #060a0e 96px, #070d12 210px, #091017 100%)',
  },
  {
    key: 'oled',
    label: 'OLED black',
    colors: {
      background: '#000000',
      surfaceHover: '#101010',
      gridHoverBorder: '#ffffff',
      sliderTrack: '#202020',
      sliderThumb: '#d8d8d8',
    },
  },
  {
    key: 'midnight',
    label: 'Midnight violet',
    colors: {
      background: '#101018',
      surfaceHover: '#252235',
      gridHoverBorder: '#ffffff',
      sliderTrack: '#302c46',
      sliderThumb: '#8f87ff',
    },
  },
  {
    key: 'ember',
    label: 'Ember',
    colors: {
      background: '#17120f',
      surfaceHover: '#2a201a',
      gridHoverBorder: '#ffffff',
      sliderTrack: '#36281f',
      sliderThumb: '#d58b55',
    },
  },
];

const defaultThemePreset: ThemePresetKey = 'fluenty';
const themePresetKeys = new Set<ThemePresetKey>([...themePresets.map((preset) => preset.key), 'custom']);
const themePresetColors = (key: ThemePresetKey, fallback: ThemeColorSettings = defaultThemeColors) => ({
  ...fallback,
  ...(themePresets.find((preset) => preset.key === key)?.colors ?? defaultThemeColors),
});
const themePresetBackgroundPaint = (key: ThemePresetKey, fallback: string) =>
  themePresets.find((preset) => preset.key === key)?.backgroundPaint ?? fallback;

const defaultSettings: PluginSettings = {
  showExternalLinks: false,
  showCollectionButtons: false,
  showCreatorNames: true,
  preloadPages: 0,
  spaceThemeCompatibility: false,
  themePreset: defaultThemePreset,
  themeColors: defaultThemeColors,
};

const defaultZoom: ZoomState = {
  grid_p: 180,
  grid_l: 395,
  hero: 420,
  logo: 360,
  icon: 140,
};

const gamepadDefaultZoom: ZoomState = {
  ...defaultZoom,
  grid_l: 315,
};

type ZoomModeState = {
  desktop: ZoomState;
  gamepad: ZoomState;
};

const ZOOM_STORAGE_KEY = 'steamgriddb:zoomByMode:v1';
const SETTINGS_STORAGE_KEY = 'steamgriddb:settings:v1';
const FILTER_STORAGE_KEY = 'steamgriddb:filtersByType:v1';
const LAST_APPID_STORAGE_KEY = 'steamgriddb:lastAppId:v1';

const isZoomState = (value: unknown): value is ZoomState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return tabs.every((tab) => typeof (value as Partial<ZoomState>)[tab] === 'number');
};

const loadZoomByMode = (): ZoomModeState => {
  const fallback = {
    desktop: defaultZoom,
    gamepad: gamepadDefaultZoom,
  };

  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const saved = JSON.parse(raw) as Partial<ZoomModeState>;
    return {
      desktop: isZoomState(saved.desktop) ? { ...defaultZoom, ...saved.desktop } : fallback.desktop,
      gamepad: isZoomState(saved.gamepad) ? { ...gamepadDefaultZoom, ...saved.gamepad } : fallback.gamepad,
    };
  } catch {
    return fallback;
  }
};

const isFilterState = (value: unknown): value is FilterState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (['static', 'animated', 'adult', 'humor', 'epilepsy'] as (keyof FilterState)[]).every((key) => typeof (value as Partial<FilterState>)[key] === 'boolean');
};

const normalizeHexColor = (value: unknown, fallback: string) => {
  const text = String(value ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
};

const normalizeThemeColors = (colors: unknown): ThemeColorSettings => {
  const saved = colors && typeof colors === 'object' ? colors as Partial<ThemeColorSettings> : {};
  return {
    background: normalizeHexColor(saved.background, defaultThemeColors.background),
    surfaceHover: normalizeHexColor(saved.surfaceHover, defaultThemeColors.surfaceHover),
    gridHoverBorder: normalizeHexColor(saved.gridHoverBorder, defaultThemeColors.gridHoverBorder),
    sliderTrack: normalizeHexColor(saved.sliderTrack, defaultThemeColors.sliderTrack),
    sliderThumb: normalizeHexColor(saved.sliderThumb, defaultThemeColors.sliderThumb),
  };
};

const normalizeThemePreset = (preset: unknown): ThemePresetKey => {
  const value = String(preset ?? '');
  return themePresetKeys.has(value as ThemePresetKey) ? value as ThemePresetKey : defaultThemePreset;
};

const sameThemeColors = (left: ThemeColorSettings, right: ThemeColorSettings) =>
  left.background === right.background
  && left.surfaceHover === right.surfaceHover
  && left.gridHoverBorder === right.gridHoverBorder
  && left.sliderTrack === right.sliderTrack
  && left.sliderThumb === right.sliderThumb;

const themePresetFromColors = (colors: ThemeColorSettings) =>
  themePresets.find((preset) => sameThemeColors(themePresetColors(preset.key, colors), colors))?.key ?? 'custom';

const filterStateByType = (): FilterStateByType => ({
  grid_p: { ...defaultFilters },
  grid_l: { ...defaultFilters },
  hero: { ...defaultFilters },
  logo: { ...defaultFilters },
  icon: { ...defaultFilters },
});

const loadFiltersByType = (): FilterStateByType => {
  const defaults = filterStateByType();

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const saved = JSON.parse(raw) as Partial<Record<SGDBAssetType, unknown>>;
    return tabs.reduce((current, tab) => ({
      ...current,
      [tab]: isFilterState(saved[tab]) ? { ...defaultFilters, ...saved[tab] } : defaults[tab],
    }), defaults);
  } catch {
    return defaults;
  }
};

const normalizeSettings = (settings: Partial<PluginSettings>): PluginSettings => {
  const themeColors = normalizeThemeColors(settings.themeColors);
  return {
    showExternalLinks: typeof settings.showExternalLinks === 'boolean' ? settings.showExternalLinks : defaultSettings.showExternalLinks,
    showCollectionButtons: typeof settings.showCollectionButtons === 'boolean' ? settings.showCollectionButtons : defaultSettings.showCollectionButtons,
    showCreatorNames: typeof settings.showCreatorNames === 'boolean' ? settings.showCreatorNames : defaultSettings.showCreatorNames,
    preloadPages: Math.max(0, Math.min(5, Number.isFinite(settings.preloadPages) ? Math.trunc(settings.preloadPages as number) : defaultSettings.preloadPages)),
    spaceThemeCompatibility: typeof settings.spaceThemeCompatibility === 'boolean' ? settings.spaceThemeCompatibility : defaultSettings.spaceThemeCompatibility,
    themePreset: settings.themePreset === undefined ? themePresetFromColors(themeColors) : normalizeThemePreset(settings.themePreset),
    themeColors,
  };
};

const loadPluginSettings = (): PluginSettings => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw) as Partial<PluginSettings>) : defaultSettings;
  } catch {
    return defaultSettings;
  }
};

const normalizeAppIdText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  const appId = Number.parseInt(text, 10);
  return Number.isFinite(appId) && appId > 0 ? String(appId) : null;
};

const rememberLastAppId = (appid: number | string) => {
  const normalized = normalizeAppIdText(appid);
  if (normalized) {
    window.localStorage.setItem(LAST_APPID_STORAGE_KEY, normalized);
  }
};

const appIdFromSteamHistory = (): string | null => {
  try {
    const entries = (history.state as { memoryhistory?: { initialEntries?: unknown[] } } | null)?.memoryhistory?.initialEntries;
    if (!Array.isArray(entries)) {
      return null;
    }

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const appid = normalizeAppIdText(String(entries[index] ?? '').match(/\/library\/app\/(\d+)/)?.[1]);
      if (appid) {
        return appid;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const appIdFromCurrentLocation = (): string | null => {
  try {
    return normalizeAppIdText(window.location.pathname.match(/\/steamgriddb\/(\d+)/)?.[1]);
  } catch {
    return null;
  }
};

const fallbackAppIdText = () => appIdFromCurrentLocation() ?? normalizeAppIdText(window.localStorage.getItem(LAST_APPID_STORAGE_KEY)) ?? appIdFromSteamHistory();

function parseResponse<T>(body: string | false): T {
  if (!body) {
    throw new Error('SteamGridDB returned an empty response.');
  }

  const parsed = JSON.parse(body) as SGDBResponse<T>;
  if (!parsed.success) {
    throw new Error(parsed.errors?.join(', ') || 'SteamGridDB API request failed.');
  }

  return parsed.data;
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

async function addAssetToCollection(collectionId: number, asset: SGDBAsset, type: SGDBAssetType): Promise<void> {
  parseResponse<null>(await addAssetToCollectionRequest({
    collection_id: collectionId,
    route: `${COLLECTION_ASSET_TYPE[type]}:${asset.id}`,
  }));
}

function buildAssetQuery(assetType: SGDBAssetType, page: number, filters: FilterState) {
  const params = new URLSearchParams({
    page: String(page),
    styles: DEFAULT_STYLES[assetType].join(','),
    mimes: DEFAULT_MIMES[assetType].join(','),
    nsfw: filters.adult ? 'any' : 'false',
    humor: filters.humor ? 'any' : 'false',
    epilepsy: filters.epilepsy ? 'any' : 'false',
    oneoftag: '',
    types: [filters.static && 'static', filters.animated && 'animated'].filter(Boolean).join(','),
  });

  if (DEFAULT_DIMENSIONS[assetType].length > 0) {
    params.set('dimensions', DEFAULT_DIMENSIONS[assetType].join(','));
  }

  return params.toString();
}

const filterReturnedAssets = (assets: SGDBAsset[], filters: FilterState) =>
  assets.filter((asset) => {
    if (!filters.adult && asset.nsfw) return false;
    if (!filters.humor && asset.humor) return false;
    if (!filters.epilepsy && asset.epilepsy) return false;
    if (!filters.static && !isAnimatedAsset(asset.url) && !isAnimatedAsset(asset.thumb)) return false;
    if (!filters.animated && (isAnimatedAsset(asset.url) || isAnimatedAsset(asset.thumb))) return false;
    return true;
  });

async function apiGet<T>(path: string): Promise<T> {
  return parseResponse<T>(await sgdbRequest({ path }));
}

const getSteamAppName = (appId: number) => {
  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId) as { display_name?: string; displayName?: string; name?: string } | null | undefined;
    return overview?.display_name || overview?.displayName || overview?.name || '';
  } catch {
    return '';
  }
};

const setDefaultLogoPosition = (appId: number) => {
  const position = { pinnedPosition: 'BottomLeft', nWidthPct: 50, nHeightPct: 50 } as const;
  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId);
    if (overview && window.appDetailsStore?.SaveCustomLogoPosition) {
      void Promise.resolve(window.appDetailsStore.SaveCustomLogoPosition(overview as Parameters<typeof window.appDetailsStore.SaveCustomLogoPosition>[0], position)).catch(() => {});
    }
  } catch {
    // Logo positioning should never make a successful artwork apply fail.
  }
};

async function resolveSteamGridDBGameId(appId: number): Promise<number | null> {
  const appName = getSteamAppName(appId).trim();
  if (!appName) {
    return null;
  }

  const games = await apiGet<SGDBGame[]>(`/search/autocomplete/${encodeURIComponent(encodeURIComponent(appName))}`);
  return games[0]?.id ?? null;
}

const notice = (title: string, body: string) => {
  toaster.toast({
    title,
    body,
    icon: <IconsModule.Download />,
    duration: 2500,
  });
};

export const isAnimatedAsset = (src: string) => /\.(webm|mp4)(\?|$)/i.test(src);

type DownloadedAsset = {
  data: string;
  byteLength?: number;
};

const getAssetExtension = (asset: SGDBAsset) => {
  const source = asset.url || asset.thumb || '';
  const match = source.match(/\.([a-z0-9]+)(?:\?|$)/i);
  const extension = match?.[1]?.toLowerCase();
  if (extension === 'webm' || extension === 'mp4' || extension === 'webp' || extension === 'jpg' || extension === 'jpeg') {
    return extension;
  }
  return 'png';
};

const isDirectAnimatedExtension = (extension: string) => extension === 'webm' || extension === 'mp4';

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
};

const downloadAssetInBrowser = async (url: string): Promise<DownloadedAsset> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  const buffer = await response.arrayBuffer();
  return {
    data: arrayBufferToBase64(buffer),
    byteLength: buffer.byteLength,
  };
};

export const assetGridStyle = (assetType: SGDBAssetType, zoom: number) => {
  return { ['--asset-size' as string]: `${zoom}px` };
};

const themeColorRows: { key: keyof ThemeColorSettings; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'surfaceHover', label: 'Selected and hover surface' },
  { key: 'gridHoverBorder', label: 'Grid hover border' },
];

const SettingsView = ({
  settings,
  setSettings,
}: {
  settings: PluginSettings;
  setSettings: Dispatch<SetStateAction<PluginSettings>>;
}) => {
  const [apiKey, setApiKeyInput] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState('Checking API key…');

  useEffect(() => {
    let cancelled = false;
    void getApiKeyStatus()
      .then((body) => JSON.parse(body) as ApiKeyResult)
      .then((result) => {
        if (cancelled) return;
        setApiKeyConfigured(Boolean(result.success && result.configured));
        setApiKeyInput(result.api_key ?? '');
        setApiKeyMessage(result.configured
          ? 'API key saved.'
          : 'An API key is required to use SteamGridDB.');
      })
      .catch(() => {
        if (!cancelled) setApiKeyMessage('Could not read the saved API key.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveApiKey = async () => {
    const value = apiKey.trim();
    if (!value || apiKeySaving) return;

    setApiKeySaving(true);
    setApiKeyMessage('Saving API key…');
    try {
      const result = JSON.parse(await setApiKey({ api_key: value })) as ApiKeyResult;
      if (!result.success) throw new Error(result.error || 'Could not save the API key.');
      setApiKeyConfigured(true);
      setApiKeyInput(result.api_key ?? value);
      setApiKeyMessage('API key saved.');
    } catch (error) {
      setApiKeyMessage(error instanceof Error ? error.message : 'Could not save the API key.');
    } finally {
      setApiKeySaving(false);
    }
  };

  const updateThemeColor = (key: keyof ThemeColorSettings, value: string) => {
    setSettings((current) => ({
      ...current,
      themePreset: 'custom',
      themeColors: {
        ...current.themeColors,
        [key]: normalizeHexColor(value, current.themeColors[key]),
      },
    }));
  };

  const updateThemePreset = (themePreset: ThemePresetKey) => {
    setSettings((current) => ({
      ...current,
      themePreset,
      themeColors: themePreset === 'custom' ? current.themeColors : themePresetColors(themePreset, current.themeColors),
    }));
  };

  const resetThemeColors = () => {
    setSettings((current) => ({
      ...current,
      themePreset: defaultThemePreset,
      themeColors: themePresetColors(defaultThemePreset),
    }));
  };

  return (
    <div className="sgdbSettingsPage">
      <PanelSection title="ACCOUNT">
        <PanelSectionRow>
          <form className="sgdbNativeApiForm" onSubmit={(event) => {
            event.preventDefault();
            void saveApiKey();
          }}>
            <TextField label="SteamGridDB API key" description="Required for browsing and collections. Saved locally on this device." value={apiKey} onChange={(event) => setApiKeyInput(event.currentTarget.value)} />
            <div className="sgdbNativeApiActions">
              <span className={`sgdbApiKeyStatus ${apiKeyConfigured ? 'configured' : ''}`} role="status">{apiKeyMessage}</span>
              <DialogButton type="submit" disabled={!apiKey.trim() || apiKeySaving}>{apiKeySaving ? 'Saving…' : 'Save Key'}</DialogButton>
            </div>
          </form>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="ARTWORK BROWSER">
        <PanelSectionRow><ToggleField label="SteamGridDB link button" description="Show the external-link action on artwork." checked={settings.showExternalLinks} onChange={(showExternalLinks) => setSettings((current) => ({ ...current, showExternalLinks }))} /></PanelSectionRow>
        <PanelSectionRow><ToggleField label="Add to collection button" description="Show the collection action on artwork." checked={settings.showCollectionButtons} onChange={(showCollectionButtons) => setSettings((current) => ({ ...current, showCollectionButtons }))} /></PanelSectionRow>
        <PanelSectionRow><ToggleField label="Asset creator names" description="Display the uploader below each artwork item." checked={settings.showCreatorNames} onChange={(showCreatorNames) => setSettings((current) => ({ ...current, showCreatorNames }))} /></PanelSectionRow>
        <PanelSectionRow>
          <TextField label="Additional pages to preload" description="Load up to five extra result pages in advance." value={String(settings.preloadPages)} mustBeNumeric rangeMin={0} rangeMax={5} onChange={(event) => {
            const preloadPages = Math.max(0, Math.min(5, Number.parseInt(event.currentTarget.value || '0', 10)));
            setSettings((current) => ({ ...current, preloadPages }));
          }} />
        </PanelSectionRow>
        <PanelSectionRow><ToggleField label="SpaceTheme compatibility" description="Apply layout adjustments intended for SpaceTheme." checked={settings.spaceThemeCompatibility} onChange={(spaceThemeCompatibility) => setSettings((current) => ({ ...current, spaceThemeCompatibility }))} /></PanelSectionRow>
      </PanelSection>

      <PanelSection title="APPEARANCE">
        <PanelSectionRow>
          <DropdownItem label="Artwork browser theme" description="Choose a preset or fine-tune the colors below." rgOptions={[...themePresets.map((preset) => ({ data: preset.key, label: preset.label })), { data: 'custom', label: 'Custom' }]} selectedOption={settings.themePreset} onChange={(option) => updateThemePreset(option.data as ThemePresetKey)} />
        </PanelSectionRow>
        {themeColorRows.map(({ key, label }) => (
          <PanelSectionRow key={key}>
            <label className="sgdbNativeColorRow">
              <span>{label}</span>
              <span className="sgdbColorControl">
                <span className="sgdbColorValue">{settings.themeColors[key]}</span>
                <input type="color" value={settings.themeColors[key]} onChange={(event) => updateThemeColor(key, event.currentTarget.value)} aria-label={label} />
              </span>
            </label>
          </PanelSectionRow>
        ))}
        <PanelSectionRow><DialogButton onClick={resetThemeColors}>Reset colors</DialogButton></PanelSectionRow>
      </PanelSection>
    </div>
  );
};

const MissingApiKeyView = ({ onRetry }: { onRetry: () => void }) => (
  <div className="sgdbApiKeyFallback" role="alert">
    <div className="sgdbApiKeyFallbackCard">
      <div className="sgdbApiKeyFallbackEyebrow">Required setup</div>
      <h1>Add your SteamGridDB API key</h1>
      <p>SteamGridDB cannot load artwork until a personal API key is configured.</p>
      <ol>
        <li>Select <strong>Get API key</strong>, sign in to SteamGridDB, and copy your key.</li>
        <li>In Steam, open <strong>Settings → Millennium → Plugins → SteamGridDB</strong>.</li>
        <li>Paste it into <strong>SteamGridDB API key</strong>, select <strong>Save Key</strong>, then return here.</li>
      </ol>
      <div className="sgdbApiKeyFallbackActions">
        <DialogButton onClick={() => void openExternalUrl({ url: 'https://www.steamgriddb.com/profile/preferences/api' })}>Get API key</DialogButton>
        <DialogButton onClick={onRetry}>Retry</DialogButton>
      </div>
    </div>
  </div>
);

const SteamGridDBContent = ({
  initialAppId,
  initialAssetType,
  popout = false,
  allowAppIdFallback = false,
}: {
  initialAppId?: string;
  initialAssetType?: SGDBAssetType;
  popout?: boolean;
  allowAppIdFallback?: boolean;
}) => {
  const resolvedInitialAppId = normalizeAppIdText(initialAppId) ?? (allowAppIdFallback ? fallbackAppIdText() : null) ?? '';
  const [settings, setSettings] = useState<PluginSettings>(() => loadPluginSettings());
  const [appIdText, setAppIdText] = useState(resolvedInitialAppId);
  const [assetType, setAssetType] = useState<SGDBAssetType>('grid_p');
  const [assetsByType, setAssetsByType] = useState<AssetState>(() => emptyAssets());
  const [pagesByType, setPagesByType] = useState<PageState>(() => emptyPages());
  const [loadingByType, setLoadingByType] = useState<LoadingState>(() => emptyLoading());
  const [endReachedByType, setEndReachedByType] = useState<EndState>(() => emptyEnd());
  const [filtersByType, setFiltersByType] = useState<FilterStateByType>(() => loadFiltersByType());
  const [zoomByMode, setZoomByMode] = useState<ZoomModeState>(() => loadZoomByMode());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [uiMode, setUiMode] = useState<EUIMode>(EUIMode.Desktop);
  const [sgdbGameId, setSgdbGameId] = useState<number | null>(null);
  const appId = useMemo(() => Number.parseInt(appIdText, 10), [appIdText]);
  const hasAppId = Number.isFinite(appId) && appId > 0;
  const isGamepadUI = uiMode === EUIMode.GamePad;
  const zoomModeKey = isGamepadUI ? 'gamepad' : 'desktop';
  const zoomByType = zoomByMode[zoomModeKey];
  const filters = filtersByType[assetType] ?? defaultFilters;
  const rootStyle = {
    '--sgdb-bg': settings.themeColors.background,
    '--sgdb-bg-paint': themePresetBackgroundPaint(settings.themePreset, settings.themeColors.background),
    '--sgdb-surface-hover': settings.themeColors.surfaceHover,
    '--sgdb-grid-hover-border': settings.themeColors.gridHoverBorder,
    '--sgdb-slider-track': settings.themeColors.sliderTrack,
    '--sgdb-slider-thumb': settings.themeColors.sliderThumb,
  } as CSSProperties;

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(zoomByMode));
  }, [zoomByMode]);

  useEffect(() => {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filtersByType));
  }, [filtersByType]);

  useEffect(() => {
    if (hasAppId) {
      rememberLastAppId(appId);
    }
  }, [appId, hasAppId]);

  const setZoomByType = useCallback<Dispatch<SetStateAction<ZoomState>>>((action) => {
    setZoomByMode((current) => {
      const currentZoom = current[zoomModeKey];
      const nextZoom = typeof action === 'function' ? action(currentZoom) : action;
      return {
        ...current,
        [zoomModeKey]: nextZoom,
      };
    });
  }, [zoomModeKey]);

  const setFilters = useCallback<Dispatch<SetStateAction<FilterState>>>((action) => {
    setFiltersByType((current) => {
      const currentFilters = current[assetType] ?? defaultFilters;
      const nextFilters = typeof action === 'function' ? action(currentFilters) : action;
      return {
        ...current,
        [assetType]: nextFilters,
      };
    });
  }, [assetType]);

  useEffect(() => {
    const nextAppId = normalizeAppIdText(initialAppId) ?? (allowAppIdFallback ? fallbackAppIdText() : null);
    if (nextAppId) {
      setAppIdText(nextAppId);
      setAssetsByType(emptyAssets());
      setPagesByType(emptyPages());
      setEndReachedByType(emptyEnd());
      setSgdbGameId(null);
    }
  }, [allowAppIdFallback, initialAppId]);

  useEffect(() => {
    if (initialAssetType) {
      setAssetType(initialAssetType);
    }
  }, [initialAssetType]);

  useEffect(() => {
    let mounted = true;
    SteamClient.UI.GetUIMode()
      .then((mode) => {
        if (mounted) {
          setUiMode(mode);
        }
      })
      .catch(() => undefined);

    const registration = SteamClient.UI.RegisterForUIModeChanged((mode) => {
      setUiMode(mode);
    });

    return () => {
      mounted = false;
      registration?.unregister?.();
    };
  }, []);

  const loadAssets = useCallback(async (type: SGDBAssetType, nextPage = 0, append = false) => {
    if (!Number.isFinite(appId) || loadingByType[type] || endReachedByType[type]) return;
    if (!append) setApiKeyRequired(false);
    setLoadingByType((current) => ({ ...current, [type]: true }));
    try {
      const endpoint = ASSET_ENDPOINT[type];
      const lastPageToLoad = nextPage === 0 && !append ? nextPage + settings.preloadPages : nextPage;
      let loadedAssets: SGDBAsset[] = [];
      let lastLoadedPage = nextPage;
      let reachedEnd = false;
      let resolvedGameId = sgdbGameId;

      for (let page = nextPage; page <= lastPageToLoad; page += 1) {
        const query = buildAssetQuery(type, page, filters);
        let result: SGDBAsset[];
        try {
          result = await apiGet<SGDBAsset[]>(`/${endpoint}/${resolvedGameId ? 'game' : 'steam'}/${resolvedGameId ?? appId}?${query}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (resolvedGameId || !/game not found/i.test(message)) {
            throw err;
          }

          resolvedGameId = await resolveSteamGridDBGameId(appId);
          if (!resolvedGameId) {
            throw err;
          }

          setSgdbGameId(resolvedGameId);
          result = await apiGet<SGDBAsset[]>(`/${endpoint}/game/${resolvedGameId}?${query}`);
        }

        loadedAssets = [...loadedAssets, ...filterReturnedAssets(result, filters)];
        lastLoadedPage = page;
        if (result.length === 0) {
          reachedEnd = true;
          break;
        }
      }

      setAssetsByType((current) => ({ ...current, [type]: append ? [...current[type], ...loadedAssets] : loadedAssets }));
      setPagesByType((current) => ({ ...current, [type]: lastLoadedPage }));
      setEndReachedByType((current) => ({ ...current, [type]: reachedEnd }));
    } catch (err) {
      setEndReachedByType((current) => ({ ...current, [type]: true }));
      const message = err instanceof Error ? err.message : String(err);
      if (/api key is required/i.test(message)) {
        setApiKeyRequired(true);
      } else {
        notice('SteamGridDB Assets Failed', message);
      }
    } finally {
      setLoadingByType((current) => ({ ...current, [type]: false }));
    }
  }, [appId, endReachedByType, filters, loadingByType, settings.preloadPages, sgdbGameId]);

  useEffect(() => {
    if (!Number.isFinite(appId)) return;
    if (assetsByType[assetType].length > 0 || loadingByType[assetType] || endReachedByType[assetType]) return;
    void loadAssets(assetType, 0, false);
  }, [appId, assetType, assetsByType, endReachedByType, loadAssets, loadingByType]);

  useEffect(() => {
    if (isGamepadUI || !Number.isFinite(appId)) return;
    if (settings.preloadPages > 0) return;
    if (pagesByType[assetType] !== 0 || assetsByType[assetType].length < 45 || loadingByType[assetType] || endReachedByType[assetType]) return;
    void loadAssets(assetType, 1, true);
  }, [appId, assetType, assetsByType, endReachedByType, isGamepadUI, loadAssets, loadingByType, pagesByType, settings.preloadPages]);

  const resetCurrentTab = useCallback(() => {
    setAssetsByType((current) => ({ ...current, [assetType]: [] }));
    setPagesByType((current) => ({ ...current, [assetType]: 0 }));
    setEndReachedByType((current) => ({ ...current, [assetType]: false }));
  }, [assetType]);

  const retryAfterApiKey = useCallback(() => {
    setApiKeyRequired(false);
    setAssetsByType((current) => ({ ...current, [assetType]: [] }));
    setPagesByType((current) => ({ ...current, [assetType]: 0 }));
    setEndReachedByType((current) => ({ ...current, [assetType]: false }));
  }, [assetType]);

  const toggleFilter = (key: keyof FilterState) => {
    setFilters((current) => {
      const next = { ...current, [key]: !current[key] };
      if (!next.static && !next.animated) {
        next[key] = true;
      }
      return next;
    });
    resetCurrentTab();
  };

  const applyAsset = useCallback(async (asset: SGDBAsset, type: SGDBAssetType) => {
    if (!Number.isFinite(appId)) {
      notice('Missing Steam App ID', 'Enter the Steam app id to apply artwork.');
      return;
    }

    setApplyingId(asset.id);
    try {
      const extension = getAssetExtension(asset);
      if (type === 'icon') {
        const savedPath = await setSteamIconFromUrl({ appid: appId, url: asset.url, extension });
        if (!savedPath) {
          throw new Error('The icon could not be written to Steam grid cache.');
        }
        notice('Icon Saved', 'Restart Steam if the icon does not refresh immediately.');
        return;
      }

      const shouldDirectWriteAnimated = isAnimatedAsset(asset.thumb) || isDirectAnimatedExtension(extension);
      if (shouldDirectWriteAnimated) {
        await SteamClient.Apps.ClearCustomArtworkForApp(appId, ASSET_TYPE[type]).catch(() => undefined);
        const savedPath = await setAnimatedArtworkFromUrl({
          appid: appId,
          asset_type: type,
          url: asset.url,
          extension,
        });
        if (!savedPath) {
          throw new Error('The animated asset could not be written directly to Steam grid cache.');
        }
        if (type === 'logo') {
          setDefaultLogoPosition(appId);
        }
        notice('Animated Artwork Saved', `${ASSET_LABEL[type]} was saved directly. Restart Steam if it does not refresh immediately.`);
        return;
      }

      const downloaded: DownloadedAsset | false = await downloadAssetInBrowser(asset.url).catch(async () => {
        const data = await downloadAsBase64({ url: asset.url });
        return data ? ({ data } as DownloadedAsset) : false;
      });
      if (!downloaded) {
        throw new Error('The selected image could not be downloaded.');
      }

      await SteamClient.Apps.ClearCustomArtworkForApp(appId, ASSET_TYPE[type]).catch(() => undefined);
      await SteamClient.Apps.SetCustomArtworkForApp(appId, downloaded.data, extension, ASSET_TYPE[type]);
      if (type === 'logo') {
        setDefaultLogoPosition(appId);
      }
      notice('Artwork Applied', `${ASSET_LABEL[type]} was applied to ${appId}.`);
    } catch (err) {
      notice('Apply Failed', err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingId(null);
    }
  }, [appId]);

  const resetArtwork = useCallback(async (type: SGDBAssetType) => {
    if (!Number.isFinite(appId)) {
      notice('Missing Steam App ID', 'Enter the Steam app id to reset artwork.');
      return;
    }

    try {
      if (type === 'icon') {
        const removed = await resetSteamIcon({ appid: appId });
        if (removed === false) {
          throw new Error('Icon cache reset failed.');
        }
        notice('Icon Reset', 'Restart Steam if the icon does not refresh.');
        return;
      }

      await SteamClient.Apps.ClearCustomArtworkForApp(appId, ASSET_TYPE[type]);
      notice('Artwork Reset', `${ASSET_LABEL[type]} was reset to default.`);
    } catch (err) {
      notice('Reset Failed', err instanceof Error ? err.message : String(err));
    }
  }, [appId]);

  const openAssetPage = useCallback(async (asset: SGDBAsset, type: SGDBAssetType) => {
    const url = `https://www.steamgriddb.com/${ASSET_PAGE_PATH[type]}/${asset.id}`;
    try {
      const opened = await openExternalUrl({ url });
      if (!opened) {
        throw new Error('The browser could not be opened.');
      }
    } catch (err) {
      notice('Open Failed', err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openCollectionPicker = useCallback(async (asset: SGDBAsset, type: SGDBAssetType, anchor: EventTarget) => {
    try {
      const collections = await loadCollections();
      if (collections.length === 0) {
        notice('No Collections', 'No SteamGridDB collections were found for this account.');
        return;
      }

      showContextMenu(
        <Menu label="SteamGridDB collections">
          {collections.map((collection) => (
            <MenuItem
              key={collection.id}
              onSelected={() => {
                void addAssetToCollection(collection.id, asset, type)
                  .then(() => notice('Added to Collection', `${ASSET_LABEL[type]} added to ${collection.name}.`))
                  .catch((err) => notice('Add to Collection Failed', err instanceof Error ? err.message : String(err)));
              }}
            >
              {collection.name}
            </MenuItem>
          ))}
        </Menu>,
        anchor,
        {
          bPreferPopLeft: false,
          bOverlapVertical: true,
          bShiftToFitWindow: true,
        },
      );
    } catch (err) {
      notice('Collections Failed', err instanceof Error ? err.message : String(err));
    }
  }, []);

  const viewProps = {
    assetType,
    setAssetType,
    assetsByType,
    pagesByType,
    loadingByType,
    endReachedByType,
    filters,
    toggleFilter,
    zoomByType,
    zoomDefaults: isGamepadUI ? gamepadDefaultZoom : defaultZoom,
    setZoomByType,
    filtersOpen,
    setFiltersOpen,
    applyingId,
    applyAsset,
    openAssetPage,
    openCollectionPicker,
    showExternalLinks: settings.showExternalLinks,
    showCollectionButtons: settings.showCollectionButtons,
    showCreatorNames: settings.showCreatorNames,
    loadAssets,
    resetCurrentTab,
    resetArtwork,
    isGamepadUI,
  };

  return (
    <div className={`sgdbRoot sgdbGamepad ${isGamepadUI ? 'sgdbBigPicture' : 'sgdbDesktopToolbar'} ${settings.spaceThemeCompatibility ? 'sgdbSpaceThemeCompat' : ''} ${popout ? 'sgdbPopoutContent' : ''} ${hasAppId ? '' : 'sgdbSettingsRoot'}`} id="sgdb-wrap" style={rootStyle}>
      <style>{styles}</style>
      {hasAppId
        ? apiKeyRequired
          ? <MissingApiKeyView onRetry={retryAfterApiKey} />
          : <GamepadView {...viewProps} />
        : <SettingsView settings={settings} setSettings={setSettings} />}
    </div>
  );
};

const SteamGridDBRoute = () => {
  const { appid, assetType } = useParams<{ appid: string; assetType?: SGDBAssetType }>();
  return <SteamGridDBContent initialAppId={appid} initialAssetType={assetType} allowAppIdFallback />;
};

let steamDesktopOwnerWindow: Window | null = null;

const captureSteamDesktopWindow = (popup: any) => {
  if (popup?.m_strName !== 'SP Desktop_uid0') {
    return;
  }

  const ownerWindow = popup?.m_popup?.window ?? popup?.m_popup;
  if (ownerWindow?.document) {
    steamDesktopOwnerWindow = ownerWindow as Window;
  }
};

Millennium?.AddWindowCreateHook?.(captureSteamDesktopWindow);

const installResizablePopupPatch = () => {
  window.__SGDB_POPUP_CREATE_PATCH__?.unpatch?.();

  const popupManagerConstructor = (globalThis as any).g_PopupManager?.constructor;
  const originalCreatePopup = popupManagerConstructor?.CreatePopup;
  if (typeof originalCreatePopup !== 'function') {
    console.warn('[SteamGridDB] Steam popup manager was not available; desktop popouts will not be resizable');
    return { unpatch: () => undefined };
  }

  const restoreDetailsKey = 'SteamGridDBDesktopPopout';
  const popupManager = (globalThis as any).g_PopupManager;

  const trackPopupGeometry = (popup: any) => {
    if (!popup?.SteamClient?.Window?.GetWindowRestoreDetails || !popupManager?.SetRestoreDetails) {
      return;
    }

    let saveTimer: number | undefined;
    const saveGeometry = () => {
      popup.SteamClient.Window.GetWindowRestoreDetails()
        .then((details: string) => {
          if (details) popupManager.SetRestoreDetails(restoreDetailsKey, details, false);
        })
        .catch(() => undefined);
    };
    const scheduleSave = () => {
      if (saveTimer !== undefined) popup.clearTimeout(saveTimer);
      saveTimer = popup.setTimeout(saveGeometry, 150);
    };

    popup.addEventListener('resize', scheduleSave);
    popup.addEventListener('message', (event: MessageEvent) => {
      if (event.data === 'window_moved' || event.data === 'window_resized') scheduleSave();
    });
    popup.addEventListener('beforeunload', saveGeometry);
  };

  const wrappedCreatePopup = function (this: any, name: string, params: any) {
    if (name !== 'SteamGridDB') {
      return Reflect.apply(originalCreatePopup, this, [name, params]);
    }

    const savedRestoreDetails = popupManager?.GetRestoreDetails?.(restoreDetailsKey) || undefined;
    const nextParams = {
      ...params,
      eCreationFlags: (params?.eCreationFlags ?? 0) | 16,
      strRestoreDetails: params?.strRestoreDetails ?? savedRestoreDetails,
      center_on_window: savedRestoreDetails ? undefined : params?.center_on_window,
    };
    const result = Reflect.apply(originalCreatePopup, this, [name, nextParams]) as any;
    trackPopupGeometry(result?.popup);
    return result;
  };

  popupManagerConstructor.CreatePopup = wrappedCreatePopup;
  return {
    unpatch: () => {
      if (popupManagerConstructor.CreatePopup === wrappedCreatePopup) {
        popupManagerConstructor.CreatePopup = originalCreatePopup;
      }
    },
  };
};

function openSteamGridDB() {
  return {
    SteamButton: (): any => <IconsModule.Image height="20px" />,
  };
}

Millennium?.exposeObj?.({ openSteamGridDB });

const openSteamGridDBForApp = async (appid: number) => {
  rememberLastAppId(appid);
  const mode = await SteamClient.UI.GetUIMode().catch(() => EUIMode.Desktop);
  if (mode === EUIMode.GamePad) {
    Navigation.Navigate(`/steamgriddb/${appid}`);
    return;
  }

  const popupParent = steamDesktopOwnerWindow ?? window;
  showModal(<SteamGridDBContent initialAppId={String(appid)} popout allowAppIdFallback />, popupParent, {
    strTitle: 'SteamGridDB',
    bHideMainWindowForPopouts: false,
    bForcePopOut: true,
    popupHeight: 760,
    popupWidth: 1500,
  });
};

const spliceArtworkItem = (children: any[], appid: number) => {
  if (!Array.isArray(children) || !appid) {
    return;
  }

  const existingIndex = children.findIndex((item) => item?.key === 'sgdb-change-artwork');
  if (existingIndex >= 0) {
    children.splice(existingIndex, 1);
  }

  const propertiesIndex = children.findIndex((item) =>
    findInReactTree(item, (node) => node?.onSelected && node.onSelected.toString().includes('AppProperties')),
  );
  const insertIndex = propertiesIndex >= 0 ? propertiesIndex : children.length;

  children.splice(insertIndex, 0, (
    <MenuItem
      key="sgdb-change-artwork"
      onSelected={() => {
        void openSteamGridDBForApp(appid);
      }}
    >
      Change Artwork...
    </MenuItem>
  ));
};

const isOpeningAppContextMenu = (items: any[]) => {
  if (!items?.length) {
    return false;
  }

  return Boolean(findInReactTree(items, (node) => {
    const selected = node?.props?.onSelected?.toString?.() ?? node?.onSelected?.toString?.() ?? '';
    return selected.includes('launchSource') || selected.includes('AppProperties') || Boolean(node?.app?.appid);
  }));
};

const patchMenuItems = (menuItems: any[], fallbackAppId: number) => {
  let appid = fallbackAppId;

  const parentOverview = menuItems.find((item) => item?._owner?.pendingProps?.overview?.appid && item._owner.pendingProps.overview.appid !== fallbackAppId);
  if (parentOverview) {
    appid = parentOverview._owner.pendingProps.overview.appid;
  }

  const foundApp = findInTree(menuItems, (node) => node?.app?.appid, { walkable: ['props', 'children'] });
  if (foundApp?.app?.appid) {
    appid = foundApp.app.appid;
  }

  if (appid) {
    spliceArtworkItem(menuItems, appid);
  }
};

const findLibraryContextMenu = () => {
  const module = findModuleByExport((exp: any) => exp?.toString && exp.toString().includes('().LibraryContextMenu'));
  const component = Object.values(module ?? {}).find((sibling: any) => sibling?.toString?.().includes('navigator:')) as FC | undefined;
  if (!component) {
    return null;
  }

  return fakeRenderComponent(component)?.type;
};

const patchLibraryContextMenu = () => {
  const LibraryContextMenu = findLibraryContextMenu();
  if (!LibraryContextMenu?.prototype?.render) {
    console.warn('[SteamGridDB] Could not find LibraryContextMenu');
    return { unpatch: () => undefined };
  }

  const patches: { outer?: any; inner?: any; unpatch: () => void } = { unpatch: () => undefined };
  patches.outer = afterPatch(LibraryContextMenu.prototype, 'render', (_args: any[], component: any) => {
    const findCurrentAppId = (tree?: any) => {
      if (component?._owner?.pendingProps?.overview?.appid) {
        return component._owner.pendingProps.overview.appid;
      }

      const foundApp = findInTree(component?.props?.children, (node) => node?.app?.appid, { walkable: ['props', 'children'] });
      if (foundApp?.app?.appid) {
        return foundApp.app.appid;
      }

      const foundTreeApp = findInTree(tree, (node) => node?.app?.appid || node?.overview?.appid, { walkable: ['props', 'children', '_owner', 'pendingProps'] });
      return foundTreeApp?.app?.appid ?? foundTreeApp?.overview?.appid ?? 0;
    };

    if (!patches.inner) {
      patches.inner = afterPatch(component, 'type', (_typeArgs: any[], ret: any) => {
        if (ret?.type?.prototype?.render) {
          afterPatch(ret.type.prototype, 'render', (_renderArgs: any[], renderRet: any) => {
            const menuItems = renderRet?.props?.children?.[0];
            if (isOpeningAppContextMenu(menuItems)) {
              patchMenuItems(menuItems, findCurrentAppId(renderRet));
            }
            return renderRet;
          });

          afterPatch(ret.type.prototype, 'shouldComponentUpdate', ([nextProps]: any[], shouldUpdate: any) => {
            const menuItems = nextProps?.children;
            if (isOpeningAppContextMenu(menuItems)) {
              patchMenuItems(menuItems, findCurrentAppId(nextProps));
            }
            return shouldUpdate;
          });
        }

        return ret;
      });
    } else if (Array.isArray(component?.props?.children)) {
      patchMenuItems(component.props.children, findCurrentAppId(component));
    }

    return component;
  });

  patches.unpatch = () => {
    patches.outer?.unpatch?.();
    patches.inner?.unpatch?.();
  };
  return patches;
};

export default definePlugin(() => ({
  title: 'SteamGridDB',
  icon: <IconsModule.Image />,
  content: <SteamGridDBContent />,
  onDismount() {
    routerHook.removeRoute('/steamgriddb/:appid/:assetType?');
    window.__SGDB_POPUP_CREATE_PATCH__?.unpatch?.();
    delete window.__SGDB_POPUP_CREATE_PATCH__;
    window.__SGDB_CONTEXT_MENU_PATCH__?.unpatch?.();
    delete window.__SGDB_CONTEXT_MENU_PATCH__;
  },
}));

declare global {
  interface Window {
    __SGDB_CONTEXT_MENU_PATCH__?: { unpatch?: () => void };
    __SGDB_POPUP_CREATE_PATCH__?: { unpatch?: () => void };
  }
}

routerHook.removeRoute('/steamgriddb/:appid/:assetType?');
routerHook.addRoute('/steamgriddb/:appid/:assetType?', SteamGridDBRoute, { exact: true });
window.__SGDB_POPUP_CREATE_PATCH__ = installResizablePopupPatch();
window.__SGDB_CONTEXT_MENU_PATCH__?.unpatch?.();
window.__SGDB_CONTEXT_MENU_PATCH__ = patchLibraryContextMenu();

const styles = `
.sgdbRoot {
  position: relative;
  height: 100%;
  min-height: 0;
  margin-top: var(--basicui-header-height, 40px);
  padding: 0;
  --sgdb-bg: #121212;
  --sgdb-bg-paint: var(--sgdb-bg);
  --sgdb-bg-deep: rgb(var(--dark-14, 5, 8, 11));
  --sgdb-bg-mid: rgb(var(--dark-19, 7, 13, 18));
  --sgdb-surface: rgb(var(--dark-20, 16, 24, 32));
  --sgdb-panel: rgba(var(--fluenty-gray-1e, 30, 30, 30), 0.94);
  --sgdb-panel-solid: rgb(var(--fluenty-gray-1e, 30, 30, 30));
  --sgdb-control: rgba(var(--fluenty-gray-2b, 43, 43, 43), 0.52);
  --sgdb-surface-hover: #1e1e1e;
  --sgdb-overlay: rgba(var(--fluenty-black, 0, 0, 0), 0.42);
  --sgdb-text: rgb(var(--fluenty-gray-f3, 243, 245, 247));
  --sgdb-text-strong: rgb(var(--fluenty-gray-f7, 247, 249, 251));
  --sgdb-text-muted: #9a9a9a;
  --sgdb-text-control: #b8b8b8;
  --sgdb-border: #333333;
  --sgdb-border-soft: #2c2c2c;
  --sgdb-grid-hover-border: #ffffff;
  --sgdb-grid-hover-border-visible: color-mix(in srgb, var(--sgdb-grid-hover-border) 58%, transparent);
  --sgdb-slider-track: #252525;
  --sgdb-slider-thumb: #3a3a3a;
  --sgdb-accent: var(--accent-col, #1a9fff);
  --sgdb-accent-soft: var(--accent-secondary, #8fcfff);
  --sgdb-accent-text: #07111d;
  --sgdb-noise: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAABAAAAAQBPJcTWAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAU6SURBVHicTZeJUsIwEIaTEhC8EfX9X8NHEm+sCIKN8639Os1Mp5Ds8e+ZbX54eCjT6TSxaq1psVikx8fHdHJykm5ubupms8mz2Szt9/uUcw4aVtd18f/8/Dz9/Pyk4/GYrq6u0m63S03TpO/v76DljczD4RD0p6enIauUkiaTSSowIuDs7CwYf39/02q1Csa2bTNMCJ3P5wmgCFosFnW73WYEf3x8pIuLi5CBYGUBEODws1CIDPgxjjfyCij4gWIYUcwej8JkxCJo9/t95hxaQLNQBg1ytJA9eL++vgbj4Mdo+AFZQI+FKNNN2+02XAUzRCh2HwH8R4CC4BMQSqETCGGBHhpAQcMZstFZIAId7uQAhbpaL/BwhkKE8KAEwQpHoDnC+eXlZfBhvVazz9uQlVJqERkWbzabEECMPj8/QyggEAwN4YCeB+DX19cBGHCG0pjjVX5zZsIBGg+5V0rJhQ1QmdUmCYD6hAtgegZGhJP9JhdnyGCNKwrPcs5Cth7Sa23bpmKGq4Cnd08Q4kIAiRo6wPHWE8vlMspVT6CIfZ77+/uwHEOIv9URCVjKfw4QL+ucAxiIky7FAxCb3QDGA+v1OsBMJpPMHha/v78HCM7hDyv72GOQucJZgMA6vKDFMENk6bFADzF70PAbHoSgFI8BGqXL5TK8Ba+h4T90lrLlHB6AyXp+enoKbyAE18PMf6vDOFsdeoXkxBOAwiCFmzvIIKl5y89CB42oTqfT6HgIsgT1iI2JPRMWpYbHRkRJ0R0Rihy8xgIYyqG1WxJe5EWSrtfrDJFlhgIOrAiYTCysMXlcdriu6yIPKE2bGt5FHm/vCGRZogHAy8QyESmHVoUxHFk7XEgkGedYrNsxxJoHlMo1Eh68G0mNAvOADWMEo8K9oLz1ZrNZpYm8vr4OzQkas3zcCVFuKRMKHs7RG7Qo87Jgw0QbZznMWIR3+gSMmsdClGKA4eHBC4YNEHrNHBrnV0GwFwvxe3t7Gy4lrfFeMObQco7bbTqAVY7XsHmEHJuUb++eAkKSkGW22tdRhicG4v4isqbt8bZdlI/B8sZ7litNiv/QPz8/RzUUFDJUoAQwxlG3OTjwGCostOdbKezZ1lEGYPKAcNhtb29vI5TmRCQhihGKFwSAMNsnhCwbj93QxmKiYUg/lNT5fB79wOoiUZETMS9lCF9UhvVoHEEOSi8oCG2fAHLY0FKE4konHJoaiu2gKDYkKoeedyRk27a11ppJwPHoRAmaWDBaZgAilvy/u7sLekCNyxfhdlCver3Zl2ylkgKUTLrY3o11Dh+4G/eCHOX8tnfwBozJ6/Cix3C/Uxerb0JD9y1mMcJA6AiuMM4gRrFXrvMfwl9eXgYvqUTXe5t6s5IrzAfIdw4tXhqr1aoej8esAgX5G+tBb8vFK+aKVnvdAs7Zj7B6kVnG3hVxazL7990sg5r2CmNfGRErEPORwoVjZjsV2WwcwzhHjrG3n3iJmbj9IJMKtYk11q7tsm8o2WQEqAmKAPg48x7gjVAe9m1g9BiAES55LfWYlkwwr2HnP2d+u6BDia6jk9lBDRU8TlN+qPjdIXhv2WHM77rOkqlN08Rg4uBoPthyVWLMrW2HmPHU5Og2Hlo01FzCKzGWN01TD4dD1KW17vTiBGuZ4jFGNpsSFmqAk5VlqPekdYqCf5DZ/A+V2bjDyOeUngGAHxN+AVs5gDG+u90ukhkemppXOrT0CpLbr2T1RCs2KZxuIbJ0sE7Fjmb8tquZI+O+YVXg5v688jHrWMaCnjwhh/4Alxekc0HT9AYAAAAASUVORK5CYII=');
  background: var(--sgdb-bg-paint);
  overflow-x: hidden;
  box-sizing: border-box;
  overscroll-behavior: contain;
  box-shadow: 0 calc(-1 * var(--basicui-header-height, 40px)) 0 var(--sgdb-bg);
  --asset-size: 120px;
}

.sgdbRoot::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--sgdb-noise);
  opacity: 0.24;
  pointer-events: none;
}

.sgdbRoot > * {
  position: relative;
  z-index: 1;
}

.sgdbRoot div[class*="gamepadtabbedpage_TabHeaderRowWrapper"][class*="gamepadtabbedpage_Floating"],
.sgdbRoot div[class*="gamepadtabbedpage_TabHeaderRowWrapper"] {
  background: transparent;
}

body:has(#sgdb-wrap:not(.sgdbSettingsRoot)),
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="FullModal"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="DialogContent"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="GamepadDialogContent"],
body:has(#sgdb-wrap:not(.sgdbSettingsRoot)) [class*="ModalPosition"] {
  background: var(--sgdb-bg) !important;
}

.sgdbRoot.sgdbSettingsRoot {
  margin-top: 0;
  background: transparent !important;
  box-shadow: none;
}

.sgdbRoot.sgdbSettingsRoot::before {
  display: none;
}

body:has(#sgdb-wrap.sgdbSettingsRoot),
body:has(#sgdb-wrap.sgdbSettingsRoot) * {
  scrollbar-width: none;
}

body:has(#sgdb-wrap.sgdbSettingsRoot)::-webkit-scrollbar,
body:has(#sgdb-wrap.sgdbSettingsRoot) *::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="FullModal"],
body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="DialogContent"],
body:has(#sgdb-wrap.sgdbDesktopToolbar.sgdbPopoutContent) [class*="ModalPosition"] {
  background: transparent !important;
}

.sgdbDesktop {
  margin-top: 0;
  background: var(--sgdb-bg-paint);
}

.sgdbDesktopToolbar {
  position: relative;
  box-shadow: 0 calc(-1 * var(--basicui-header-height, 40px)) 0 var(--sgdb-bg);
  background: var(--sgdb-bg-paint);
}

.sgdbPopoutContent {
  display: flex;
  flex-direction: column;
  height: 100vh;
  margin-top: 0;
  padding: 0;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--sgdb-border);
  background: var(--sgdb-bg-paint);
}

.sgdbDesktopToolbar.sgdbPopoutContent {
  background: transparent;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap {
  background: var(--sgdb-bg-paint);
}

.sgdbPopoutContent .tabcontents-wrap {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 8px 12px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  box-sizing: border-box;
  background: var(--sgdb-bg);
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap {
  padding-top: 56px;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar {
  width: 10px;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-button:vertical:start:decrement {
  display: block;
  width: 10px;
  height: 64px;
  background: transparent;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-track {
  margin-top: 8px;
  margin-bottom: 8px;
  background: transparent;
}

.sgdbDesktopToolbar.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-track {
  margin-top: 8px;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-thumb {
  min-height: 48px;
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sgdb-text-muted) 28%, transparent);
  background-clip: padding-box;
}

.sgdbPopoutContent .tabcontents-wrap:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--sgdb-text-muted) 62%, transparent);
  background-clip: padding-box;
}

.sgdbPopoutContent .tabcontents-wrap::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--sgdb-text) 78%, transparent);
  background-clip: padding-box;
}

body:has(#sgdb-wrap) button[aria-label="Close"],
body:has(#sgdb-wrap) button[title="Close"],
body:has(#sgdb-wrap) [class*="CloseButton"],
body:has(#sgdb-wrap) [class*="closeButton"] {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 46px !important;
  min-height: 36px !important;
  position: relative !important;
  z-index: 20 !important;
  color: var(--sgdb-text-control) !important;
  background: transparent !important;
  box-shadow: none !important;
}

body:has(#sgdb-wrap) .title-bar-actions.window-controls {
  position: relative !important;
  z-index: 20 !important;
}

body:has(#sgdb-wrap) [class*="closeButton"] .title-area-icon-inner,
body:has(#sgdb-wrap) [class*="CloseButton"] .title-area-icon-inner {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
}

body:has(#sgdb-wrap) [class*="closeButton"] svg,
body:has(#sgdb-wrap) [class*="CloseButton"] svg {
  width: 16px !important;
  height: 16px !important;
}

body:has(#sgdb-wrap) button[aria-label="Close"]:hover,
body:has(#sgdb-wrap) button[title="Close"]:hover,
body:has(#sgdb-wrap) [class*="CloseButton"]:hover,
body:has(#sgdb-wrap) [class*="closeButton"]:hover {
  color: var(--sgdb-text) !important;
  background: rgba(255, 255, 255, 0.06) !important;
}

.sgdbManualTabs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 30px;
  background: var(--sgdb-surface);
  box-sizing: border-box;
}

.sgdbManualTabs button {
  width: auto;
  min-width: auto;
  padding: 12px 16px;
  border: 1px solid transparent;
  font-weight: 700;
}

.sgdbManualTabs button.selected {
  color: var(--sgdb-text);
  border-color: var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbPopoutContent .sgdbManualTabs {
  position: relative;
}

.sgdbSpaceThemeCompat.sgdbPopoutContent .sgdbManualTabs {
  position: relative;
  z-index: 3;
  width: calc(100% - 52px);
  min-height: 64px;
  padding-top: 16px;
  padding-bottom: 16px;
  -webkit-app-region: drag;
}

.sgdbSpaceThemeCompat.sgdbPopoutContent .sgdbManualTabs button {
  position: relative;
  z-index: 4;
  -webkit-app-region: no-drag;
}

.sgdbTextPill {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 999px;
  clip-path: inset(0 round 999px);
  color: var(--sgdb-text-control);
  background: transparent;
  outline: 0;
  box-shadow: none;
  font-weight: 900;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  box-sizing: border-box;
}

.sgdbTextPill.selected {
  color: var(--sgdb-text-strong);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbTextPill::before,
.sgdbTextPill::after,
.sgdbTextPill.selected::before,
.sgdbTextPill.selected::after,
.sgdbTextPill [class*="Focus"],
.sgdbTextPill [class*="focus"],
.sgdbTextPill [class*="Highlight"],
.sgdbTextPill [class*="highlight"] {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.sgdbTextPill.gpfocus,
.sgdbTextPill:focus-visible {
  outline: 0 !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.58);
  border-radius: 999px !important;
  clip-path: inset(0 round 999px) !important;
}

.sgdbTextPill.selected.gpfocus,
.sgdbTextPill.selected:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.58);
}

.sgdbTextPill.gpfocus::before,
.sgdbTextPill.gpfocus::after,
.sgdbTextPill:focus-visible::before,
.sgdbTextPill:focus-visible::after,
.sgdbTextPill.gpfocus > *,
.sgdbTextPill:focus-visible > * {
  border-radius: inherit !important;
  outline: 0 !important;
}

.sgdbTextPill.gpfocus:not(.selected),
.sgdbTextPill:focus-visible:not(.selected) {
  background: transparent;
}

.sgdbTextPill.disabled,
.sgdbTextPill:disabled {
  opacity: 0.45;
  cursor: default;
}

.sgdbGamepad .sgdbGamepadTabs {
  --sgdb-tab-vertical-gap: 18px;
  justify-content: center;
  gap: 32px;
  min-height: calc(32px + var(--sgdb-tab-vertical-gap));
  padding: var(--sgdb-tab-vertical-gap) 56px 0;
  background: transparent;
  border-bottom: 0;
  scroll-margin-top: 14px;
}

.sgdbGamepad .sgdbGamepadTab {
  width: auto;
  min-width: 0;
  height: 32px;
  margin-top: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  --gpFocusBorderRadius: 999px;
  --focus-ring-border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  transition: background 90ms ease, color 90ms ease;
}

.sgdbGamepad .sgdbGamepadTab:nth-child(2) {
  width: auto;
  min-width: 0;
}

.sgdbGamepad .sgdbGamepadTab.selected {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbGamepad .sgdbGamepadTab.selected.contentFocus {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbGamepad .sgdbGamepadTab:not(.selected):hover,
.sgdbGamepad .sgdbGamepadTab:not(.selected):focus-visible,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus {
  color: #e0e0e0;
  background: transparent !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab.gpfocus,
.sgdbGamepad .sgdbGamepadTab:focus-visible,
.sgdbGamepad .sgdbGamepadTab.gpfocus.selected,
.sgdbGamepad .sgdbGamepadTab:focus-visible.selected {
  outline: 0 !important;
  border-radius: 999px !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab *,
.sgdbGamepad .sgdbGamepadTab *::before,
.sgdbGamepad .sgdbGamepadTab *::after {
  border-radius: 999px !important;
}

.sgdbGamepad .sgdbGamepadTab.gpfocus::before,
.sgdbGamepad .sgdbGamepadTab.gpfocus::after,
.sgdbGamepad .sgdbGamepadTab:focus-visible::before,
.sgdbGamepad .sgdbGamepadTab:focus-visible::after,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus::before,
.sgdbGamepad .sgdbGamepadTab:not(.selected).gpfocus::after,
.sgdbGamepad .sgdbGamepadTab.gpfocus > *,
.sgdbGamepad .sgdbGamepadTab:focus-visible > * {
  border: 0 !important;
  border-radius: 999px !important;
  outline: 0 !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab [class*="Focus"],
.sgdbGamepad .sgdbGamepadTab [class*="focus"],
.sgdbGamepad .sgdbGamepadTab [class*="Highlight"],
.sgdbGamepad .sgdbGamepadTab [class*="highlight"],
.sgdbGamepad .sgdbGamepadTab div {
  border-radius: 999px !important;
  clip-path: inset(0 round 999px) !important;
  background: transparent !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbGamepadTab.selected.tabFocus:hover,
.sgdbGamepad .sgdbGamepadTab.selected.tabFocus.gpfocus,
.sgdbGamepad .sgdbGamepadTab.selected.tabFocus:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbGamepad .sgdbGamepadTab.selected.contentFocus:hover,
.sgdbGamepad .sgdbGamepadTab.selected.contentFocus.gpfocus,
.sgdbGamepad .sgdbGamepadTab.selected.contentFocus:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  box-shadow: none;
}

.sgdbApiKeyFallback {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 36px;
  box-sizing: border-box;
}

.sgdbApiKeyFallbackCard {
  width: min(680px, 100%);
  padding: 30px 32px;
  border: 1px solid var(--sgdb-border-soft);
  border-radius: 12px;
  color: var(--sgdb-text);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 78%, var(--sgdb-bg));
  box-shadow: 0 22px 54px rgba(0, 0, 0, 0.34);
  box-sizing: border-box;
}

.sgdbApiKeyFallbackEyebrow {
  margin-bottom: 10px;
  color: var(--sgdb-accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.25px;
  text-transform: uppercase;
}

.sgdbApiKeyFallbackCard h1 {
  margin: 0 0 10px;
  color: var(--sgdb-text-strong);
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.15;
}

.sgdbApiKeyFallbackCard p,
.sgdbApiKeyFallbackCard li {
  color: var(--sgdb-text-muted);
  font-size: 15px;
  line-height: 1.55;
}

.sgdbApiKeyFallbackCard p {
  margin: 0;
}

.sgdbApiKeyFallbackCard ol {
  display: grid;
  gap: 8px;
  margin: 20px 0 24px;
  padding-left: 24px;
}

.sgdbApiKeyFallbackCard strong {
  color: var(--sgdb-text);
}

.sgdbApiKeyFallbackActions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sgdbApiKeyFallbackActions button {
  width: auto;
  min-width: 120px;
}

.sgdbSettingsPage {
  width: min(760px, calc(100% - 10px));
  margin: 12px auto 32px;
  padding-bottom: 6px;
  color: var(--sgdb-text);
  box-sizing: border-box;
}

.sgdbSettingsIntro {
  margin-bottom: 12px;
  padding: 0 2px;
}

.sgdbSettingsIntro h1 {
  margin: 5px 0 6px;
  color: var(--sgdb-text-strong);
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.35px;
  line-height: 1.15;
}

.sgdbSettingsIntro p,
.sgdbSettingsCardHeader p {
  margin: 0;
  color: var(--sgdb-text-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
}

.sgdbSettingsEyebrow {
  color: var(--accent-col, #1a9fff);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.35px;
  line-height: 1;
  text-transform: uppercase;
}

.sgdbSettingsLayout {
  display: grid;
  gap: 10px;
  margin-top: 10px;
}

.sgdbSettingsCard {
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 10px;
  background: rgba(var(--dark-20, 16, 24, 32), 0.72);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  box-sizing: border-box;
}

.sgdbSettingsCardHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.sgdbSettingsCardHeader > div {
  min-width: 0;
}

.sgdbSettingsCardHeader h2 {
  margin: 5px 0 5px;
  color: var(--sgdb-text-strong);
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.15px;
  line-height: 1.2;
}

.sgdbSettingsOption {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 7px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.065);
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbSettingsCardHeader + .sgdbSettingsOption {
  margin-top: 9px;
}

.sgdbSettingsOptionCopy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.sgdbSettingsOptionCopy strong {
  color: var(--sgdb-text-strong);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
}

.sgdbSettingsOptionCopy small {
  color: var(--sgdb-text-muted);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.35;
}

.sgdbSettingsSwitch {
  position: relative;
  display: inline-flex;
  width: 42px;
  height: 24px;
  flex: 0 0 auto;
}

.sgdbSettingsSwitch input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.sgdbSettingsSwitch > span {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: border-color 140ms ease, background 140ms ease;
}

.sgdbSettingsSwitch > span::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #d8dee5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  transition: transform 140ms ease, background 140ms ease;
}

.sgdbSettingsSwitch input:checked + span {
  border-color: color-mix(in srgb, var(--accent-col, #1a9fff) 75%, white 10%);
  background: var(--accent-col, #1a9fff);
}

.sgdbSettingsSwitch input:checked + span::after {
  background: white;
  transform: translateX(18px);
}

.sgdbSettingsSwitch input:focus-visible + span {
  outline: 2px solid color-mix(in srgb, var(--accent-col, #1a9fff) 72%, white 18%);
  outline-offset: 2px;
}

.sgdbSettingsNumberInput {
  width: 64px;
  height: 36px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 700;
  box-sizing: border-box;
}

.sgdbSettingsNumberInput:focus,
.sgdbThemePresetSelect:focus,
.sgdbApiKeyInput:focus {
  border-color: var(--accent-col, #1a9fff);
  outline: 1px solid var(--accent-col, #1a9fff);
}

.sgdbSettingsPrimaryButton,
.sgdbSettingsResetButton {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  font-weight: 700;
  cursor: pointer;
}

.sgdbSettingsPrimaryButton {
  min-width: 88px;
  height: 40px;
  padding: 0 18px;
  background: var(--accent-col, #1a9fff);
}

.sgdbSettingsResetButton {
  flex: 0 0 auto;
  height: 30px;
  margin-top: 12px;
  padding: 0 11px;
  background: rgba(255, 255, 255, 0.055);
  font-size: 11px;
}

.sgdbSettingsPrimaryButton:hover,
.sgdbSettingsResetButton:hover {
  filter: brightness(1.12);
}

.sgdbSettingsColorGrid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin-top: 9px;
}

.sgdbSettingsColorItem {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 7px;
  color: var(--sgdb-text-strong);
  background: rgba(0, 0, 0, 0.13);
  font-size: 12px;
  font-weight: 650;
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbSettingsResetButton {
  width: auto;
  min-width: 72px;
  height: 30px;
  padding: 0 14px;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.sgdbApiKeyForm {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  margin-top: 12px;
}

.sgdbApiKeyActions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.sgdbApiKeyInput {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 13px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-family: monospace;
  font-size: 14px;
}

.sgdbApiKeyInput:focus {
  border-color: var(--accent-col, #1a9fff);
  outline: 1px solid var(--accent-col, #1a9fff);
}

.sgdbApiKeyForm button:disabled {
  cursor: default;
  opacity: 0.5;
}

.sgdbApiKeyStatus {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin: 0;
  color: var(--sgdb-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.sgdbApiKeyStatus.configured {
  color: #66c0f4;
}

.sgdbThemePresetSelect {
  min-width: 172px;
  height: 38px;
  padding: 0 34px 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 6px;
  color: var(--sgdb-text-strong);
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 700;
}

.sgdbThemePresetSelect option {
  color: var(--sgdb-text-strong);
  background: rgb(var(--dark-20, 16, 24, 32));
}

.sgdbSettingsPresetRow {
  grid-template-columns: 1fr;
  gap: 7px;
}

.sgdbThemePresetSelect {
  width: 100%;
}

.sgdbColorControl {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.sgdbColorValue {
  min-width: 58px;
  color: var(--sgdb-text-muted);
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  text-align: right;
  text-transform: uppercase;
}

.sgdbColorControl input[type="color"] {
  width: 36px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--sgdb-border);
  border-radius: 5px;
  background: var(--sgdb-surface-hover);
  cursor: pointer;
}

.sgdbColorControl input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 3px;
}

.sgdbColorControl input[type="color"]::-webkit-color-swatch {
  border: 0;
  border-radius: 3px;
}

@media (max-width: 560px) {
  .sgdbSettingsPage {
    width: min(100% - 8px, 760px);
    margin-top: 10px;
  }

  .sgdbSettingsIntro h1 {
    font-size: 23px;
  }

  .sgdbSettingsCard {
    padding: 12px;
  }

  .sgdbSettingsPrimaryButton {
    width: auto;
  }

}

@media (max-width: 410px) {
  .sgdbSettingsColorGrid {
    grid-template-columns: 1fr;
  }

  .sgdbSettingsCardHeader {
    gap: 12px;
  }

  .sgdbSettingsOption {
    gap: 12px;
  }
}

/* Settings use Steam's native PanelSection, field, toggle, dropdown, and button components. */
.sgdbSettingsPage {
  width: auto;
  margin: 8px 0 28px;
  padding: 0;
  color: inherit;
}

.sgdbSettingsPage > * {
  width: auto !important;
  margin-right: 0 !important;
  margin-left: 0 !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
  box-sizing: border-box;
}

.sgdbNativeApiForm {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
}

.sgdbNativeApiForm input {
  max-width: 100%;
  box-sizing: border-box;
}

.sgdbNativeApiActions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.sgdbNativeApiActions .sgdbApiKeyStatus {
  min-height: 0;
  margin: 0;
  justify-content: flex-start;
  text-align: left;
}

.sgdbNativeApiActions button {
  width: auto !important;
  min-width: 88px;
  height: 36px;
  padding: 0 14px;
}

.sgdbNativeColorRow {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: inherit;
  box-sizing: border-box;
  cursor: pointer;
}

.sgdbNativeColorRow .sgdbColorValue {
  color: rgba(255, 255, 255, 0.56);
}

.sgdbNativeColorRow input[type="color"] {
  background: transparent;
}

.tabcontents-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
  background: transparent;
}

.sgdbBigPicture .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbPopoutContent .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs + .tabcontents-wrap {
  margin-top: 0;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 5;
  width: max-content;
  max-width: calc(100% - 96px);
  min-height: 56px;
  padding: 0 28px;
  background: transparent;
  transform: translateX(-50%);
  isolation: isolate;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTabs::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  z-index: 0;
  height: 48px;
  border: 0;
  border-radius: 999px;
  background: var(--sgdb-bg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
  transform: translateY(-50%);
  pointer-events: none;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdbGamepadTab {
  position: relative;
  z-index: 1;
}

.sgdbDesktopToolbar.sgdbPopoutContent .sgdb-asset-toolbar {
  margin-top: 0;
  margin-bottom: 0;
}

.spinnyboi {
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  inset: 0;
  z-index: 10008;
  background: var(--sgdb-bg);
  opacity: 1;
  transition: opacity 250ms ease-out, z-index 0s;
}

.spinnyboi img {
  transform: scale(0.75);
  transition: transform 300ms ease-out;
}

.spinnyboi.loaded {
  z-index: -1;
  opacity: 0;
  pointer-events: none;
  transition-delay: 0ms, 300ms;
}

.spinnyboi.loaded img {
  transform: scale(0.6);
}

.sgdb-asset-toolbar {
  display: flex;
  width: 100%;
  gap: var(--gpSpace-Gap, 0.6em);
  padding: 0 30px;
  box-sizing: border-box;
}

.sgdb-asset-toolbar .filter-buttons {
  display: flex;
  align-items: center;
  gap: 0.5em;
}

.sgdb-asset-toolbar .filter-buttons button {
  min-width: auto;
  white-space: nowrap;
}

.sgdb-asset-toolbar .size-slider {
  flex: 1;
  padding: 0.5em 1em;
  justify-content: center;
}

.sgdbGamepad .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 32px;
  min-height: 50px;
  padding: 0 46px;
  background: transparent;
  border: 0;
}

.sgdbGamepad .sgdb-asset-toolbar .filter-buttons {
  width: auto;
}

.sgdbGamepad .sgdbDesktopSliderWrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  min-width: 0;
  border-radius: 999px;
}

.sgdbGamepad .sgdbDesktopSliderWrap::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: linear-gradient(
    90deg,
    var(--sgdb-slider-thumb) 0%,
    var(--sgdb-slider-thumb) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) 100%
  );
}

.sgdbGamepad .sgdbControllerSliderThumb {
  position: absolute;
  left: var(--sgdb-slider-progress);
  top: 50%;
  z-index: 2;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--sgdb-text-control);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.sgdbGamepad .sgdbDesktopSlider {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 30px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  outline: 0;
  cursor: pointer;
}

.sgdbGamepad .sgdbDesktopSlider::-webkit-slider-runnable-track {
  height: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
}

.sgdbGamepad .sgdbDesktopSlider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: var(--sgdb-text-control);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  appearance: none;
  -webkit-appearance: none;
}

.sgdbGamepad .sgdbDesktopSlider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.sgdbGamepad .sgdbSliderFocusable.gpfocus::after,
.sgdbGamepad .sgdbSliderFocusable:focus-visible::after {
  content: '';
  position: absolute;
  inset: 6px -10px;
  border: 1px solid var(--sgdb-border-soft);
  border-radius: 999px;
  background: var(--sgdb-surface-hover);
  pointer-events: none;
  z-index: 0;
}

.sgdbGamepad .sgdbSliderFocusable.gpfocus::before,
.sgdbGamepad .sgdbSliderFocusable:focus-visible::before {
  z-index: 1;
}

.sgdbGamepad .sgdbSliderFocusable.gpfocus .sgdbDesktopSlider,
.sgdbGamepad .sgdbSliderFocusable:focus-visible .sgdbDesktopSlider {
  z-index: 2;
}

.sgdbGamepad .sgdbFilterMainButton,
.sgdbGamepad .sgdbResetButton {
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbFilterMainButton.selected,
.sgdbGamepad .sgdbFilterMainButton:hover,
.sgdbGamepad .sgdbFilterMainButton.gpfocus,
.sgdbGamepad .sgdbFilterMainButton:focus-visible,
.sgdbGamepad .sgdbResetButton:hover,
.sgdbGamepad .sgdbResetButton.gpfocus,
.sgdbGamepad .sgdbResetButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbFilterMainButton::before,
.sgdbGamepad .sgdbFilterMainButton::after,
.sgdbGamepad .sgdbResetButton::before,
.sgdbGamepad .sgdbResetButton::after,
.sgdbGamepad .sgdbFilterToggle::before,
.sgdbGamepad .sgdbFilterToggle::after,
.sgdbGamepad .sgdbMoreButton::before,
.sgdbGamepad .sgdbMoreButton::after,
.sgdbDesktopToolbar .sgdbFilterMainButton::before,
.sgdbDesktopToolbar .sgdbFilterMainButton::after,
.sgdbDesktopToolbar .sgdbResetButton::before,
.sgdbDesktopToolbar .sgdbResetButton::after,
.sgdbDesktopToolbar .sgdbFilterToggle::before,
.sgdbDesktopToolbar .sgdbFilterToggle::after {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: 0 !important;
}

.sgdbSliderWithMarks {
  position: relative;
  min-width: 0;
}

.sgdbGamepad .sgdb-asset-toolbar .size-slider {
  padding: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.sgdbResetButton {
  display: grid;
  place-items: center;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  cursor: pointer;
}

.sgdbFilterTray {
  display: flex;
  gap: 8px;
  padding: 10px 30px 0;
  background: transparent;
  box-sizing: border-box;
}

.sgdbGamepad .sgdbGamepadFilterNotice {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 30px;
  padding: 0 42px;
  background: transparent;
  border: 0;
  box-sizing: border-box;
}

.sgdbGamepad .sgdbFilterNoticeHeader {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.sgdbGamepad .sgdbFilterNoticeLine {
  height: 1px;
  background: var(--sgdb-border);
}

.sgdbGamepad .sgdbFilterNoticeText {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 1.5px;
}

.sgdbGamepad .sgdbFilterNoticeText button {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  color: var(--sgdb-accent-text);
  background: var(--sgdb-text);
  font-size: 18px;
  font-weight: 900;
  line-height: 1;
}

.sgdbGamepad .sgdbGamepadFilterToggles {
  display: flex;
  gap: 30px;
  width: 100%;
  justify-content: center;
}

.sgdbGamepad .sgdbFilterToggle {
  flex: 0 0 auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbFilterToggle.selected,
.sgdbGamepad .sgdbFilterToggle:hover,
.sgdbGamepad .sgdbFilterToggle.gpfocus,
.sgdbGamepad .sgdbFilterToggle:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbMoreButton {
  width: auto;
  min-width: 92px;
  height: 32px !important;
  min-height: 32px !important;
  flex: 0 0 32px;
  padding: 0 16px;
  border: 1px solid transparent;
  margin: 24px auto 24px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  text-transform: uppercase;
  scroll-margin-bottom: 14px;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  box-shadow: none;
}

.sgdbGamepad .sgdbMoreButton:hover,
.sgdbGamepad .sgdbMoreButton.gpfocus,
.sgdbGamepad .sgdbMoreButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbGamepad .sgdbMoreRevealSpacer {
  flex: 0 0 max(16px, calc(var(--gamepadui-current-footer-height, 24px) / 2));
  width: 100%;
  pointer-events: none;
}

.sgdbResultsState {
  align-self: flex-start;
  margin: 6px 30px 8px;
  padding: 0;
  border: 0;
  color: var(--sgdb-text-muted);
  background: transparent;
  font-size: 16px;
  text-align: left;
  pointer-events: none;
  user-select: none;
}

.sgdbBigPicture .sgdbResultsState {
  position: absolute;
  top: 18px;
  left: 52px;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 32px;
  margin: 0;
}

.sgdbDesktopToolbar .sgdbResultsState {
  position: absolute;
  top: var(--sgdb-tab-vertical-gap, 18px);
  left: 32px;
  z-index: 2;
  display: flex;
  align-items: center;
  height: 32px;
  margin: 0;
}

.sgdbGrid.filtersOpen {
  margin-top: 12px;
}

.sgdbGrid {
  display: grid;
  padding: 10px 42px max(42px, var(--gamepadui-current-footer-height, 34px));
  row-gap: 1.22em;
  column-gap: 0.95em;
  width: 100%;
  justify-content: space-evenly;
  grid-auto-flow: dense;
  box-sizing: border-box;
}

.sgdbGrid.hasMore {
  padding-bottom: 0;
}

.sgdbDesktopToolbar .sgdbGrid {
  justify-content: center;
  padding: 14px 32px var(--gamepadui-current-footer-height, 34px);
  row-gap: 32px;
  column-gap: clamp(28px, 2.35vw, 48px);
}

.sgdbPopoutContent .sgdbGrid {
  padding-right: 32px;
  padding-bottom: 18px;
  padding-left: 32px;
}

.sgdbPopoutContent .sgdbMoreButton {
  margin-bottom: 12px;
}

.sgdbGrid.grid_p {
  grid-template-columns: repeat(auto-fill, minmax(min(var(--asset-size, 150px), 100%), var(--asset-size, 150px)));
}

.sgdbGrid.grid_l {
  grid-template-columns: repeat(auto-fill, minmax(min(var(--asset-size, 220px), 100%), var(--asset-size, 220px)));
}

.sgdbGrid.hero,
.sgdbGrid.logo {
  grid-template-columns: repeat(auto-fill, minmax(min(var(--asset-size, 320px), 100%), var(--asset-size, 320px)));
}

.sgdbGrid.icon {
  grid-template-columns: repeat(auto-fill, minmax(min(var(--asset-size, 120px), 100%), var(--asset-size, 120px)));
}

.asset-box-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  position: relative;
  perspective: 900px;
}

.image-wrap.sgdbAsset {
  position: relative;
  width: 100%;
  margin-top: auto;
  overflow: hidden;
  container-type: size;
  background: url('/images/defaultappimage.png') center center / cover, var(--sgdb-bg-deep);
  cursor: pointer;
  outline: 2px solid transparent;
  border-radius: 3px;
  box-shadow: 0 7px 18px rgba(0, 0, 0, 0.22);
  transition: outline-color ease-in-out 160ms, transform ease-out 160ms, box-shadow ease-out 160ms;
}

.image-wrap.sgdbAsset.type-logo,
.image-wrap.sgdbAsset.type-icon {
  box-sizing: border-box;
  background: var(--sgdb-surface-hover);
  border: 1px solid var(--sgdb-border-soft);
}

.image-wrap.sgdbAsset.type-logo {
  padding-bottom: 0 !important;
  height: auto;
  aspect-ratio: 650 / 248;
}

.image-wrap.sgdbAsset.type-icon {
  padding-bottom: 0 !important;
  aspect-ratio: 1 / 1;
}

.image-wrap.sgdbAsset:hover,
.image-wrap.sgdbAsset.gpfocus,
.image-wrap.sgdbAsset:focus-visible {
  z-index: 4;
  outline-color: var(--sgdb-grid-hover-border-visible);
  transform: translate3d(0, -3px, 18px) scale(1.018);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.sgdbExternalLinkButton {
  position: absolute;
  left: 0;
  bottom: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  width: clamp(23px, 13cqw, 38px);
  height: clamp(23px, 13cqw, 38px);
  padding: 0;
  border: 1px solid var(--sgdb-border-soft);
  border-left-width: 0;
  border-bottom-width: 0;
  border-radius: 0 clamp(3px, 2.4cqw, 4px) 0 0;
  color: var(--sgdb-text-control);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 88%, transparent);
  box-shadow: none;
  cursor: pointer;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease;
}

.sgdbCollectionAddButton {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 4;
  display: grid;
  place-items: center;
  width: clamp(23px, 13cqw, 38px);
  height: clamp(23px, 13cqw, 38px);
  padding: 0;
  border: 1px solid var(--sgdb-border-soft);
  border-top-width: 0;
  border-right-width: 0;
  border-radius: 0 0 0 clamp(3px, 2.4cqw, 4px);
  color: var(--sgdb-text-control);
  background: color-mix(in srgb, var(--sgdb-surface-hover) 88%, transparent);
  box-shadow: none;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease;
}

.image-wrap.sgdbAsset.type-grid_l .sgdbCollectionAddButton,
.image-wrap.sgdbAsset.type-hero .sgdbCollectionAddButton,
.image-wrap.sgdbAsset.type-logo .sgdbCollectionAddButton {
  width: clamp(20px, min(7.5cqw, 24cqh), 33px);
  height: clamp(20px, min(7.5cqw, 24cqh), 33px);
  border-radius: 0 0 0 clamp(3px, min(2cqw, 4cqh), 5px);
}

.image-wrap.sgdbAsset:hover .sgdbCollectionAddButton,
.image-wrap.sgdbAsset.gpfocus .sgdbCollectionAddButton,
.image-wrap.sgdbAsset:focus-within .sgdbCollectionAddButton {
  opacity: 1;
  transform: translateY(0);
}

.sgdbCollectionAddButton:hover,
.sgdbCollectionAddButton:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  outline: 0;
}

.sgdbCollectionAddIcon {
  width: 62%;
  height: 62%;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
}

.image-wrap.sgdbAsset.type-grid_l .sgdbExternalLinkButton,
.image-wrap.sgdbAsset.type-hero .sgdbExternalLinkButton,
.image-wrap.sgdbAsset.type-logo .sgdbExternalLinkButton {
  width: clamp(20px, min(7.5cqw, 24cqh), 33px);
  height: clamp(20px, min(7.5cqw, 24cqh), 33px);
  border-radius: 0 clamp(3px, min(2cqw, 4cqh), 5px) 0 0;
}

.image-wrap.sgdbAsset:hover .sgdbExternalLinkButton,
.image-wrap.sgdbAsset.gpfocus .sgdbExternalLinkButton,
.image-wrap.sgdbAsset:focus-within .sgdbExternalLinkButton {
  opacity: 1;
  transform: translateY(0);
}

.sgdbExternalLinkButton:hover,
.sgdbExternalLinkButton:focus-visible {
  color: var(--sgdb-text);
  background: var(--sgdb-surface-hover);
  outline: 0;
}

.sgdbExternalIcon {
  width: clamp(19px, 10.6cqw, 26px);
  height: clamp(19px, 10.6cqw, 26px);
  display: block;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.image-wrap.sgdbAsset.type-grid_l .sgdbExternalIcon,
.image-wrap.sgdbAsset.type-hero .sgdbExternalIcon,
.image-wrap.sgdbAsset.type-logo .sgdbExternalIcon {
  width: clamp(16px, min(6.25cqw, 18.75cqh), 23px);
  height: clamp(16px, min(6.25cqw, 18.75cqh), 23px);
  stroke-width: 2.45;
}

.sgdbMedia {
  position: absolute;
  inset: 0;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
  display: block;
  z-index: 1;
  margin: 0 auto;
}

.sgdbMediaBlur {
  z-index: 0;
  filter: saturate(1.8) blur(18px);
  transform: scale(1.18);
  opacity: 0.32;
}

.sgdbMedia.logo,
.sgdbMedia.icon {
  object-fit: contain;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.sgdbMediaBlur.logo,
.sgdbMediaBlur.icon {
  display: none;
}

.sgdbAssetMissing,
.sgdbEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 96px;
  color: var(--sgdb-text-muted);
}

.author {
  display: flex;
  align-items: center;
  gap: 0.5em;
  width: 100%;
  padding-top: 0.15em;
  color: var(--sgdb-text);
  font-size: 0.65em;
  overflow: hidden;
  text-shadow: 0 1px 1px #000;
}

.author span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sgdbChips {
  position: absolute;
  right: calc(-1 * clamp(5px, min(3.25cqw, 6.25cqh), 10px));
  top: clamp(5px, min(3.25cqw, 6.25cqh), 10px);
  display: flex;
  flex-direction: column;
  gap: clamp(3px, min(1.75cqw, 3.75cqh), 5px);
  z-index: 3;
  pointer-events: none;
}

.sgdbChips span {
  padding: clamp(3px, min(1.75cqw, 3.75cqh), 6px) clamp(6px, min(5cqw, 10cqh), 15px);
  min-height: clamp(14px, min(8.75cqw, 16.25cqh), 28px);
  border-radius: clamp(4px, min(2.75cqw, 6.25cqh), 8px) 0 0 clamp(4px, min(2.75cqw, 6.25cqh), 8px);
  color: white;
  font-size: clamp(8px, min(4.75cqw, 9.25cqh), 15px);
  font-weight: 700;
  text-transform: uppercase;
  transform: translateX(calc(100% - clamp(8px, min(5cqw, 10cqh), 15px)));
  transition: transform 220ms cubic-bezier(0.33, 1, 0.68, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}

.image-wrap.sgdbAsset:hover .sgdbChips span,
.image-wrap.sgdbAsset.gpfocus .sgdbChips span,
.image-wrap.sgdbAsset:focus-visible .sgdbChips span {
  transform: translateX(0);
}

.sgdbChips .animated {
  background: #e2a256;
}

.sgdbChips .nsfw {
  background: #e5344c;
}

.sgdbChips .humor {
  background: #eec314;
  color: #343434;
}

.sgdbChips .epilepsy {
  background: #735f9f;
}

.dload-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  opacity: 0;
  z-index: -3;
  background: var(--sgdb-overlay);
  transition: opacity 100ms ease, z-index 0s 100ms;
}

.dload-overlay.downloading {
  opacity: 1;
  z-index: 5;
}

.sgdbApplyStatus {
  display: grid;
  place-items: center;
  width: clamp(34px, min(18cqw, 28cqh), 52px);
  height: clamp(34px, min(18cqw, 28cqh), 52px);
  border-radius: 999px;
  background: rgba(var(--dark-14, 6, 10, 16), 0.82);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

.sgdbApplyStatus svg,
.sgdbApplyStatus img,
.sgdbApplyStatus div {
  max-width: 26px;
  max-height: 26px;
}

.sgdbDesktop .sgdbManualTabs {
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 24px;
  background: var(--sgdb-bg);
  border-bottom: 1px solid var(--sgdb-border-soft);
  box-sizing: border-box;
}

.sgdbDesktop .sgdbDesktopTab {
  width: 104px;
  height: 36px;
  min-width: 104px;
  border: 1px solid transparent;
  appearance: none;
  -webkit-appearance: none;
  background-clip: padding-box;
  box-sizing: border-box;
  padding: 0 8px;
  font-size: 13px;
  letter-spacing: 1px;
  line-height: 1;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.sgdbDesktop .sgdbDesktopTab.selected {
  color: var(--sgdb-text);
  border-color: var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover);
}

.sgdbDesktop .sgdbDesktopTab:nth-child(2) {
  width: 148px;
  min-width: 148px;
}

.sgdbDesktop .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: max-content minmax(420px, 900px) max-content;
  align-items: center;
  gap: 16px;
  justify-content: center;
  min-height: 44px;
  padding: 4px 24px 4px;
  background: var(--sgdb-bg);
}

.sgdbDesktop .sgdb-asset-toolbar .filter-buttons {
  width: auto;
  flex: 0 0 auto;
}

.sgdbDesktop .sgdb-asset-toolbar .size-slider {
  width: 100%;
  min-height: 34px;
  padding: 0;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
  display: flex;
  align-items: center;
}

.sgdbDesktop .sgdbDesktopSlider {
  width: 100%;
  height: 34px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  outline: 0;
  cursor: pointer;
}

.sgdbDesktop .sgdbDesktopSlider::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 999px;
  border: 0;
  background: linear-gradient(
    90deg,
    var(--sgdb-slider-thumb) 0%,
    var(--sgdb-slider-thumb) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) 100%
  );
}

.sgdbDesktop .sgdbDesktopSlider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -3px;
  border: 0;
  border-radius: 50%;
  background: var(--sgdb-text-control);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  appearance: none;
  -webkit-appearance: none;
}

.sgdbDesktop .sgdbDesktopSlider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.sgdbDesktop .sgdbFilterMainButton,
.sgdbDesktop .sgdbResetButton {
  width: auto;
  height: 29px;
  min-width: 0;
  padding: 0 19px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: none;
}

.sgdbDesktop .sgdbFilterTray {
  justify-content: center;
  gap: 10px;
  padding: 8px 24px 0;
}

.sgdbDesktop .sgdbFilterToggle {
  width: auto;
  height: 29px;
  min-width: 0;
  padding: 0 19px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: none;
}

.sgdbDesktop .sgdbMoreButton {
  width: auto;
  height: 34px !important;
  min-height: 34px !important;
  flex: 0 0 34px;
  min-width: 0;
  margin: 14px auto 18px;
  padding: 0 28px;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.sgdbDesktopToolbar .sgdb-asset-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 32px;
  justify-content: stretch;
  min-height: 50px;
  padding: 0 46px;
  background: transparent;
  border: 0;
}

.sgdbDesktopToolbar .sgdb-asset-toolbar .filter-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  flex: 0 0 auto;
}

.sgdbDesktopToolbar .sgdbFilterMainButton,
.sgdbDesktopToolbar .sgdbResetButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  line-height: 1;
  text-transform: none;
  box-shadow: none;
}

.sgdbDesktopToolbar .sgdbFilterMainButton.selected,
.sgdbDesktopToolbar .sgdbFilterMainButton:hover,
.sgdbDesktopToolbar .sgdbFilterMainButton:focus-visible,
.sgdbDesktopToolbar .sgdbResetButton:hover,
.sgdbDesktopToolbar .sgdbResetButton:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbDesktopToolbar .sgdbGamepadFilterNotice {
  min-height: 30px;
  padding: 0 42px;
  background: transparent;
}

.sgdbDesktopToolbar .sgdbGamepadFilterToggles {
  justify-content: center;
  gap: 30px;
}

.sgdbDesktopToolbar .sgdbFilterToggle {
  flex: 0 0 auto;
  width: auto;
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid transparent;
  color: var(--sgdb-text-control);
  background: transparent;
  font-size: 12.75px;
  font-weight: 700;
  letter-spacing: 0.42px;
  box-shadow: none;
}

.sgdbDesktopToolbar .sgdbFilterToggle.selected,
.sgdbDesktopToolbar .sgdbFilterToggle:hover,
.sgdbDesktopToolbar .sgdbFilterToggle:focus-visible {
  color: var(--sgdb-text);
  border: 1px solid var(--sgdb-border-soft);
  background: var(--sgdb-surface-hover) !important;
  box-shadow: none !important;
}

.sgdbDesktopToolbar .sgdbDesktopSliderWrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  min-width: 0;
}

.sgdbDesktopToolbar .sgdbDesktopSliderWrap::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: linear-gradient(
    90deg,
    var(--sgdb-slider-thumb) 0%,
    var(--sgdb-slider-thumb) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) var(--sgdb-slider-progress),
    var(--sgdb-slider-track) 100%
  );
}

.sgdbDesktopToolbar .sgdbDesktopSlider {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 30px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  outline: 0;
  cursor: pointer;
}

.sgdbDesktopToolbar .sgdbDesktopSlider::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  border: 0;
  background: transparent;
}

.sgdbDesktopToolbar .sgdbDesktopSlider::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: var(--sgdb-text-control);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  appearance: none;
  -webkit-appearance: none;
}

.sgdbDesktopToolbar .sgdbDesktopSlider:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.5);
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbExternalLinkButton,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbExternalLinkButton {
  width: clamp(30px, min(11.25cqw, 36cqh), 50px);
  height: clamp(30px, min(11.25cqw, 36cqh), 50px);
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbExternalIcon,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbExternalIcon {
  width: clamp(24px, min(9.375cqw, 28.125cqh), 35px);
  height: clamp(24px, min(9.375cqw, 28.125cqh), 35px);
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbChips,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbChips {
  right: calc(-1 * clamp(7.5px, min(4.875cqw, 9.375cqh), 15px));
  top: clamp(7.5px, min(4.875cqw, 9.375cqh), 15px);
  gap: clamp(4.5px, min(2.625cqw, 5.625cqh), 7.5px);
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero .sgdbChips span {
  padding: clamp(4.5px, min(2.625cqw, 5.625cqh), 9px) clamp(9px, min(7.5cqw, 15cqh), 22.5px);
  min-height: clamp(21px, min(13.125cqw, 24.375cqh), 42px);
  border-radius: clamp(6px, min(4.125cqw, 9.375cqh), 12px) 0 0 clamp(6px, min(4.125cqw, 9.375cqh), 12px);
  font-size: clamp(12px, min(7.125cqw, 13.875cqh), 22.5px);
  transform: translateX(calc(100% - clamp(12px, min(7.5cqw, 15cqh), 22.5px)));
}

.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l:hover .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l.gpfocus .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-grid_l:focus-visible .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero:hover .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero.gpfocus .sgdbChips span,
.sgdbDesktopToolbar .image-wrap.sgdbAsset.type-hero:focus-visible .sgdbChips span {
  transform: translateX(0);
}

`;
