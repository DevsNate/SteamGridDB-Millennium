import {
  definePlugin,
  DialogButton,
  DropdownItem,
  EUIMode,
  Focusable,
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
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  addAssetToCollection,
  apiGet,
  downloadAsBase64,
  getApiKeyStatus,
  loadCollections,
  openExternalUrl,
  resetSteamIcon,
  setAnimatedArtworkFromUrl,
  setApiKey,
  setSteamIconFromUrl,
} from './api';
import type { ApiKeyResult, SGDBGame } from './api';
import { densityDefaults, normalizeDensityState } from './layout';
import type { AssetDensityState } from './layout';
import { styles } from './styles';
import {
  clearMillenniumMainWindowFallback,
  clearSteamDesktopOwnerWindow,
  getSteamDesktopOwnerWindow,
  installResizablePopupPatch,
  patchLibraryContextMenu,
  registerSteamWindowHook,
} from './steam-integration';
import type {
  AssetState,
  EndState,
  ErrorState,
  FilterState,
  LoadingState,
  PageState,
  SGDBAsset,
  SGDBAssetType,
} from './types';
import { GamepadView } from './views/GamepadView';

// Steam runtime contracts ------------------------------------------------

declare const SteamClient: {
  Apps: {
    ClearCustomArtworkForApp(appid: number, assetType: number): Promise<void>;
    ReportLibraryAssetCacheMiss?(appid: number, assetType: number): void;
    SetCustomArtworkForApp(appid: number, data: string, extension: string, assetType: number): Promise<void>;
    SetCustomLogoPositionForApp?(appid: number, position: { pinnedPosition: string; nWidthPct: number; nHeightPct: number }): Promise<void>;
  };
  UI: {
    GetUIMode(): Promise<EUIMode>;
    RegisterForUIModeChanged(callback: (mode: EUIMode) => void): { unregister(): void };
  };
};

// Plugin settings and artwork metadata ----------------------------------

type FilterStateByType = Record<SGDBAssetType, FilterState>;
type ThemeColorSettings = {
  background: string;
  surfaceHover: string;
  gridHoverBorder: string;
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
  hideDesktopGameLogos: boolean;
  themePreset: ThemePresetKey;
  themeColors: ThemeColorSettings;
};

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

const emptyErrors = (): ErrorState => ({
  grid_p: null,
  grid_l: null,
  hero: null,
  logo: null,
  icon: null,
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

// State defaults ---------------------------------------------------------

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
};

// Theme presets ----------------------------------------------------------

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
    },
  },
  {
    key: 'midnight',
    label: 'Midnight violet',
    colors: {
      background: '#101018',
      surfaceHover: '#252235',
      gridHoverBorder: '#ffffff',
    },
  },
  {
    key: 'ember',
    label: 'Ember',
    colors: {
      background: '#17120f',
      surfaceHover: '#2a201a',
      gridHoverBorder: '#ffffff',
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
  hideDesktopGameLogos: false,
  themePreset: defaultThemePreset,
  themeColors: defaultThemeColors,
};

type DensityModeState = {
  desktop: AssetDensityState;
  gamepad: AssetDensityState;
};

// Persisted UI state -----------------------------------------------------

const DENSITY_STORAGE_KEY = 'steamgriddb:densityByMode:v2';
const SETTINGS_STORAGE_KEY = 'steamgriddb:settings:v1';
const FILTER_STORAGE_KEY = 'steamgriddb:filtersByType:v1';
const LAST_APPID_STORAGE_KEY = 'steamgriddb:lastAppId:v1';

const loadDensityByMode = (): DensityModeState => {
  const fallback = {
    desktop: densityDefaults('desktop'),
    gamepad: densityDefaults('gamepad'),
  };

  try {
    const raw = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const saved = JSON.parse(raw) as Partial<DensityModeState>;
    return {
      desktop: normalizeDensityState(saved.desktop, 'desktop'),
      gamepad: normalizeDensityState(saved.gamepad, 'gamepad'),
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
  };
};

const filterStateKey = (filters: FilterState) => [
  filters.static,
  filters.animated,
  filters.adult,
  filters.humor,
  filters.epilepsy,
].map((enabled) => enabled ? '1' : '0').join('');

const normalizeThemePreset = (preset: unknown): ThemePresetKey => {
  const value = String(preset ?? '');
  return themePresetKeys.has(value as ThemePresetKey) ? value as ThemePresetKey : defaultThemePreset;
};

const sameThemeColors = (left: ThemeColorSettings, right: ThemeColorSettings) =>
  left.background === right.background
  && left.surfaceHover === right.surfaceHover
  && left.gridHoverBorder === right.gridHoverBorder;

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
    hideDesktopGameLogos: typeof settings.hideDesktopGameLogos === 'boolean' ? settings.hideDesktopGameLogos : defaultSettings.hideDesktopGameLogos,
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

// Artwork queries and application ---------------------------------------

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

const themeColorRows: { key: keyof ThemeColorSettings; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'surfaceHover', label: 'Selected and hover surface' },
  { key: 'gridHoverBorder', label: 'Grid hover border' },
];

// Settings views ---------------------------------------------------------

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
      </PanelSection>

      <PanelSection title="STEAM LIBRARY">
        <PanelSectionRow><ToggleField label="Hide game logos" description="Hide logos on Desktop library game pages without changing the artwork." checked={settings.hideDesktopGameLogos} onChange={(hideDesktopGameLogos) => setSettings((current) => ({ ...current, hideDesktopGameLogos }))} /></PanelSectionRow>
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
        <li>In Steam, open <strong>Steam → Millennium Library Manager → SteamGridDB → API Key</strong>.</li>
        <li>Paste it into <strong>SteamGridDB API key</strong>, select <strong>Save Key</strong>, then return here.</li>
      </ol>
      <Focusable className="sgdbApiKeyFallbackActions" flow-children="row">
        <DialogButton onClick={() => void openExternalUrl({ url: 'https://www.steamgriddb.com/profile/preferences/api' })}>Get API key</DialogButton>
        <DialogButton onClick={onRetry}>Retry</DialogButton>
      </Focusable>
    </div>
  </div>
);

// Artwork browser --------------------------------------------------------

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
  const [lookupAppIdText, setLookupAppIdText] = useState(resolvedInitialAppId);
  const [lookupAppIdDraft, setLookupAppIdDraft] = useState(resolvedInitialAppId);
  const [assetType, setAssetType] = useState<SGDBAssetType>('grid_p');
  const [assetsByType, setAssetsByType] = useState<AssetState>(() => emptyAssets());
  const [pagesByType, setPagesByType] = useState<PageState>(() => emptyPages());
  const [loadingByType, setLoadingByType] = useState<LoadingState>(() => emptyLoading());
  const [endReachedByType, setEndReachedByType] = useState<EndState>(() => emptyEnd());
  const [loadErrorByType, setLoadErrorByType] = useState<ErrorState>(() => emptyErrors());
  const [filtersByType, setFiltersByType] = useState<FilterStateByType>(() => loadFiltersByType());
  const [densityByMode, setDensityByMode] = useState<DensityModeState>(() => loadDensityByMode());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [uiMode, setUiMode] = useState<EUIMode>(EUIMode.Desktop);
  const [sgdbGameId, setSgdbGameId] = useState<number | null>(null);
  const appId = useMemo(() => Number.parseInt(appIdText, 10), [appIdText]);
  const lookupAppId = useMemo(() => Number.parseInt(lookupAppIdText, 10), [lookupAppIdText]);
  const requestVersionByTypeRef = useRef<PageState>(emptyPages());
  const activeRequestKeyByTypeRef = useRef<Partial<Record<SGDBAssetType, string>>>({});
  const currentLookupAppIdRef = useRef(lookupAppId);
  const currentFiltersByTypeRef = useRef(filtersByType);
  currentLookupAppIdRef.current = lookupAppId;
  currentFiltersByTypeRef.current = filtersByType;
  const hasAppId = Number.isFinite(appId) && appId > 0;
  const isGamepadUI = uiMode === EUIMode.GamePad;
  // Big Picture intentionally mirrors the desktop browser's density choices.
  // Keep the legacy gamepad density record readable for backwards compatibility,
  // but use the desktop record as the single source of truth in both modes.
  const densityModeKey = 'desktop' as const;
  const densityByType = densityByMode[densityModeKey];
  const filters = filtersByType[assetType] ?? defaultFilters;
  const rootStyle = {
    '--sgdb-bg': settings.themeColors.background,
    '--sgdb-bg-paint': themePresetBackgroundPaint(settings.themePreset, settings.themeColors.background),
    '--sgdb-surface-hover': settings.themeColors.surfaceHover,
    '--sgdb-grid-hover-border': settings.themeColors.gridHoverBorder,
  } as CSSProperties;

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    document.documentElement.classList.toggle('sgdbHideDesktopGameLogos', settings.hideDesktopGameLogos);
    return () => document.documentElement.classList.remove('sgdbHideDesktopGameLogos');
  }, [settings.hideDesktopGameLogos]);

  useEffect(() => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, JSON.stringify(densityByMode));
  }, [densityByMode]);

  useEffect(() => {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filtersByType));
  }, [filtersByType]);

  useEffect(() => {
    if (hasAppId) {
      rememberLastAppId(appId);
    }
  }, [appId, hasAppId]);

  const setDensityByType = useCallback<Dispatch<SetStateAction<AssetDensityState>>>((action) => {
    setDensityByMode((current) => {
      const currentDensity = current[densityModeKey];
      const nextDensity = typeof action === 'function' ? action(currentDensity) : action;
      return {
        ...current,
        [densityModeKey]: normalizeDensityState(nextDensity, densityModeKey),
      };
    });
  }, [densityModeKey]);

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

  const invalidateAssetRequests = useCallback((type?: SGDBAssetType) => {
    const affectedTypes = type ? [type] : tabs;
    affectedTypes.forEach((affectedType) => {
      requestVersionByTypeRef.current[affectedType] += 1;
      delete activeRequestKeyByTypeRef.current[affectedType];
    });
    setLoadingByType((current) => affectedTypes.reduce((next, affectedType) => ({
      ...next,
      [affectedType]: false,
    }), current));
  }, []);

  const resetAssetSearchState = useCallback(() => {
    invalidateAssetRequests();
    setAssetsByType(emptyAssets());
    setPagesByType(emptyPages());
    setEndReachedByType(emptyEnd());
    setLoadErrorByType(emptyErrors());
    setSgdbGameId(null);
    setApiKeyRequired(false);
  }, [invalidateAssetRequests]);

  const confirmLookupAppId = useCallback(() => {
    const nextAppId = normalizeAppIdText(lookupAppIdDraft);
    if (!nextAppId) {
      notice('Invalid App ID', 'Enter a positive numeric Steam App ID.');
      return;
    }

    setLookupAppIdDraft(nextAppId);
    if (nextAppId === lookupAppIdText) {
      return;
    }

    resetAssetSearchState();
    setLookupAppIdText(nextAppId);
    notice('Lookup App ID Updated', `Showing SteamGridDB results for ${nextAppId}. Artwork will still apply to ${appId}.`);
  }, [appId, lookupAppIdDraft, lookupAppIdText, resetAssetSearchState]);

  const resetLookupAppId = useCallback(() => {
    const originalAppId = normalizeAppIdText(appIdText);
    if (!originalAppId) {
      return;
    }

    setLookupAppIdDraft(originalAppId);
    if (originalAppId === lookupAppIdText) {
      return;
    }

    resetAssetSearchState();
    setLookupAppIdText(originalAppId);
  }, [appIdText, lookupAppIdText, resetAssetSearchState]);

  useEffect(() => {
    const nextAppId = normalizeAppIdText(initialAppId) ?? (allowAppIdFallback ? fallbackAppIdText() : null);
    if (nextAppId) {
      setAppIdText(nextAppId);
      setLookupAppIdText(nextAppId);
      setLookupAppIdDraft(nextAppId);
      resetAssetSearchState();
    }
  }, [allowAppIdFallback, initialAppId, resetAssetSearchState]);

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
    if (!Number.isFinite(lookupAppId) || loadingByType[type] || endReachedByType[type]) return;
    const requestAppId = lookupAppId;
    const requestFilters = { ...filters };
    const requestFilterKey = filterStateKey(requestFilters);
    const requestKey = `${requestAppId}:${nextPage}:${append ? 'append' : 'replace'}:${requestFilterKey}:${sgdbGameId ?? 'steam'}`;
    if (activeRequestKeyByTypeRef.current[type] === requestKey) return;

    requestVersionByTypeRef.current[type] += 1;
    const requestVersion = requestVersionByTypeRef.current[type];
    activeRequestKeyByTypeRef.current[type] = requestKey;
    const isCurrentRequest = () => requestVersionByTypeRef.current[type] === requestVersion
      && currentLookupAppIdRef.current === requestAppId
      && filterStateKey(currentFiltersByTypeRef.current[type] ?? defaultFilters) === requestFilterKey;

    if (!append) setApiKeyRequired(false);
    setLoadErrorByType((current) => ({ ...current, [type]: null }));
    setLoadingByType((current) => ({ ...current, [type]: true }));
    try {
      const endpoint = ASSET_ENDPOINT[type];
      const lastPageToLoad = nextPage;
      let loadedAssets: SGDBAsset[] = [];
      let lastLoadedPage = nextPage;
      let reachedEnd = false;
      let resolvedGameId = sgdbGameId;

      for (let page = nextPage; page <= lastPageToLoad; page += 1) {
        const query = buildAssetQuery(type, page, requestFilters);
        let result: SGDBAsset[];
        try {
          result = await apiGet<SGDBAsset[]>(`/${endpoint}/${resolvedGameId ? 'game' : 'steam'}/${resolvedGameId ?? requestAppId}?${query}`);
          if (!isCurrentRequest()) return;
        } catch (err) {
          if (!isCurrentRequest()) return;
          const message = err instanceof Error ? err.message : String(err);
          if (resolvedGameId || !/game not found/i.test(message)) {
            throw err;
          }

          resolvedGameId = await resolveSteamGridDBGameId(requestAppId);
          if (!isCurrentRequest()) return;
          if (!resolvedGameId) {
            throw err;
          }

          setSgdbGameId(resolvedGameId);
          result = await apiGet<SGDBAsset[]>(`/${endpoint}/game/${resolvedGameId}?${query}`);
          if (!isCurrentRequest()) return;
        }

        loadedAssets = [...loadedAssets, ...filterReturnedAssets(result, requestFilters)];
        lastLoadedPage = page;
        if (result.length === 0) {
          reachedEnd = true;
          break;
        }
      }

      if (!isCurrentRequest()) return;
      setAssetsByType((current) => ({ ...current, [type]: append ? [...current[type], ...loadedAssets] : loadedAssets }));
      setPagesByType((current) => ({ ...current, [type]: lastLoadedPage }));
      setEndReachedByType((current) => ({ ...current, [type]: reachedEnd }));
    } catch (err) {
      if (!isCurrentRequest()) return;
      const message = err instanceof Error ? err.message : String(err);
      setLoadErrorByType((current) => ({ ...current, [type]: message }));
      if (/api key is required/i.test(message)) {
        setApiKeyRequired(true);
      } else {
        notice('SteamGridDB Assets Failed', message);
      }
    } finally {
      if (requestVersionByTypeRef.current[type] === requestVersion) {
        delete activeRequestKeyByTypeRef.current[type];
        setLoadingByType((current) => ({ ...current, [type]: false }));
      }
    }
  }, [endReachedByType, filters, loadingByType, lookupAppId, sgdbGameId]);

  useEffect(() => {
    if (!Number.isFinite(lookupAppId)) return;
    if (assetsByType[assetType].length > 0 || loadingByType[assetType] || endReachedByType[assetType] || loadErrorByType[assetType]) return;
    void loadAssets(assetType, 0, false);
  }, [assetType, assetsByType, endReachedByType, loadAssets, loadErrorByType, loadingByType, lookupAppId]);

  const resetCurrentTab = useCallback(() => {
    invalidateAssetRequests(assetType);
    setAssetsByType((current) => ({ ...current, [assetType]: [] }));
    setPagesByType((current) => ({ ...current, [assetType]: 0 }));
    setEndReachedByType((current) => ({ ...current, [assetType]: false }));
    setLoadErrorByType((current) => ({ ...current, [assetType]: null }));
  }, [assetType, invalidateAssetRequests]);

  const retryAfterApiKey = useCallback(() => {
    invalidateAssetRequests(assetType);
    setApiKeyRequired(false);
    setAssetsByType((current) => ({ ...current, [assetType]: [] }));
    setPagesByType((current) => ({ ...current, [assetType]: 0 }));
    setEndReachedByType((current) => ({ ...current, [assetType]: false }));
    setLoadErrorByType((current) => ({ ...current, [assetType]: null }));
  }, [assetType, invalidateAssetRequests]);

  const retryCurrentLoad = useCallback(() => {
    setLoadErrorByType((current) => ({ ...current, [assetType]: null }));
    const append = assetsByType[assetType].length > 0;
    void loadAssets(assetType, append ? pagesByType[assetType] + 1 : 0, append);
  }, [assetType, assetsByType, loadAssets, pagesByType]);

  const toggleFilter = (key: keyof FilterState) => {
    invalidateAssetRequests(assetType);
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
        SteamClient.Apps.ReportLibraryAssetCacheMiss?.(appId, ASSET_TYPE[type]);
        notice('Animated Artwork Saved', `${ASSET_LABEL[type]} was saved directly. Restart Steam if it does not refresh immediately.`);
        return;
      }

      const downloaded = await downloadAsBase64({ url: asset.url });
      if (!downloaded) {
        throw new Error('The selected image could not be downloaded.');
      }

      await SteamClient.Apps.ClearCustomArtworkForApp(appId, ASSET_TYPE[type]).catch(() => undefined);
      await SteamClient.Apps.SetCustomArtworkForApp(appId, downloaded, extension, ASSET_TYPE[type]);
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
    loadErrorByType,
    filters,
    toggleFilter,
    densityByType,
    setDensityByType,
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
    retryCurrentLoad,
    resetArtwork,
    originalAppIdText: appIdText,
    lookupAppIdText,
    lookupAppIdDraft,
    setLookupAppIdDraft,
    confirmLookupAppId,
    resetLookupAppId,
    isGamepadUI,
  };

  return (
    <div className={`sgdbRoot sgdbGamepad sgdbDesktopToolbar ${isGamepadUI ? 'sgdbBigPicture' : ''} ${popout || (isGamepadUI && hasAppId) ? 'sgdbPopoutContent' : ''} ${hasAppId ? '' : 'sgdbSettingsRoot'}`} id="sgdb-wrap" style={rootStyle}>
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

// Routes, popouts, and plugin lifecycle ---------------------------------

registerSteamWindowHook();

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

  const popupParent = getSteamDesktopOwnerWindow() ?? window;
  showModal(<SteamGridDBContent initialAppId={String(appid)} popout allowAppIdFallback />, popupParent, {
    strTitle: 'SteamGridDB',
    bHideMainWindowForPopouts: false,
    bForcePopOut: true,
    popupHeight: 760,
    popupWidth: 1500,
  });
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
    delete window.__SGDB_WINDOW_HOOK__;
    clearMillenniumMainWindowFallback();
    clearSteamDesktopOwnerWindow();
  },
}));

routerHook.removeRoute('/steamgriddb/:appid/:assetType?');
routerHook.addRoute('/steamgriddb/:appid/:assetType?', SteamGridDBRoute, { exact: true });
window.__SGDB_POPUP_CREATE_PATCH__ = installResizablePopupPatch();
window.__SGDB_CONTEXT_MENU_PATCH__?.unpatch?.();
window.__SGDB_CONTEXT_MENU_PATCH__ = patchLibraryContextMenu((appid) => {
  void openSteamGridDBForApp(appid);
});
