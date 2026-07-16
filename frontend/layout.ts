import type { SGDBAssetType } from './types';

export type AssetDensityState = Record<SGDBAssetType, number>;
export type AssetDensityMode = 'desktop' | 'gamepad';

export type AssetLayoutProfile = {
  minColumns: number;
  maxColumns: number;
  desktopDefault: number;
  gamepadDefault: number;
};

export const ASSET_LAYOUT_PROFILES: Record<SGDBAssetType, AssetLayoutProfile> = {
  grid_p: { minColumns: 4, maxColumns: 12, desktopDefault: 8, gamepadDefault: 7 },
  grid_l: { minColumns: 3, maxColumns: 8, desktopDefault: 5, gamepadDefault: 4 },
  hero: { minColumns: 2, maxColumns: 6, desktopDefault: 3, gamepadDefault: 3 },
  logo: { minColumns: 3, maxColumns: 7, desktopDefault: 4, gamepadDefault: 4 },
  icon: { minColumns: 6, maxColumns: 14, desktopDefault: 10, gamepadDefault: 9 },
};

export const densityDefaults = (mode: AssetDensityMode): AssetDensityState => ({
  grid_p: ASSET_LAYOUT_PROFILES.grid_p[mode === 'gamepad' ? 'gamepadDefault' : 'desktopDefault'],
  grid_l: ASSET_LAYOUT_PROFILES.grid_l[mode === 'gamepad' ? 'gamepadDefault' : 'desktopDefault'],
  hero: ASSET_LAYOUT_PROFILES.hero[mode === 'gamepad' ? 'gamepadDefault' : 'desktopDefault'],
  logo: ASSET_LAYOUT_PROFILES.logo[mode === 'gamepad' ? 'gamepadDefault' : 'desktopDefault'],
  icon: ASSET_LAYOUT_PROFILES.icon[mode === 'gamepad' ? 'gamepadDefault' : 'desktopDefault'],
});

export const clampColumns = (assetType: SGDBAssetType, value: unknown, fallback: number) => {
  const profile = ASSET_LAYOUT_PROFILES[assetType];
  const columns = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(profile.minColumns, Math.min(profile.maxColumns, columns));
};

export const normalizeDensityState = (value: unknown, mode: AssetDensityMode): AssetDensityState => {
  const defaults = densityDefaults(mode);
  const saved = value && typeof value === 'object' ? value as Partial<AssetDensityState> : {};
  return {
    grid_p: clampColumns('grid_p', saved.grid_p, defaults.grid_p),
    grid_l: clampColumns('grid_l', saved.grid_l, defaults.grid_l),
    hero: clampColumns('hero', saved.hero, defaults.hero),
    logo: clampColumns('logo', saved.logo, defaults.logo),
    icon: clampColumns('icon', saved.icon, defaults.icon),
  };
};

export const columnOptions = (assetType: SGDBAssetType) => {
  const profile = ASSET_LAYOUT_PROFILES[assetType];
  return Array.from(
    { length: profile.maxColumns - profile.minColumns + 1 },
    (_, index) => profile.minColumns + index,
  );
};
