import {
  definePlugin,
  EUIMode,
  IconsModule,
  Navigation,
  routerHook,
  showModal,
} from 'millennium';
import { useEffect, useState } from 'react';
import { attachExistingBigPicture, createLibraryMenuItem } from './steam/serve-hooks';
import { getSteamDesktopWindow } from './steam/windows';
import { RouteParamsContext, useRouteParams } from './steam/route-params';
import { UpstreamPage } from './artwork-page';
import { PluginSettingsPage } from './settings/panel';
import { initializeLibraryPatches, disposeLibraryPatches } from './library/patches';
import { loadPluginAssets } from './services/plugin-assets';
import { loadSettings } from './settings/store';

const normalizeAppIdText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }

  const appId = Number.parseInt(text, 10);
  return Number.isFinite(appId) && appId > 0 ? String(appId) : null;
};

const useSteamUIMode = () => {
  const [uiMode, setUiMode] = useState<EUIMode | null>(null);

  useEffect(() => {
    let mounted = true;
    SteamClient.UI.GetUIMode()
      .then((mode) => {
        if (mounted) setUiMode(mode);
      })
      .catch(() => {
        if (mounted) setUiMode(EUIMode.Desktop);
      });

    const registration = SteamClient.UI.RegisterForUIModeChanged((mode) => {
      if (mounted) setUiMode(mode);
    });

    return () => {
      mounted = false;
      registration?.unregister?.();
    };
  }, []);

  return uiMode;
};

const SteamGridDBRoute = () => {
  const { appid, assetType } = useRouteParams<{ appid: string; assetType?: SGDBAssetType }>();
  const uiMode = useSteamUIMode();
  const resolvedAppId = normalizeAppIdText(appid);

  if (uiMode === null || !resolvedAppId) return null;

  return (
    <RouteParamsContext.Provider value={{ appid: resolvedAppId, assetType }}>
      <UpstreamPage desktop={uiMode !== EUIMode.GamePad} />
    </RouteParamsContext.Provider>
  );
};

// Routes, popouts, and plugin lifecycle ---------------------------------

// One config read; the patches then apply saved settings synchronously.
void loadSettings().then(initializeLibraryPatches);
void loadPluginAssets();
attachExistingBigPicture();

const openSteamGridDBForApp = async (appid: number) => {
  const mode = await SteamClient.UI.GetUIMode().catch(() => EUIMode.Desktop);
  if (mode === EUIMode.GamePad) {
    Navigation.Navigate(`/steamgriddb/${appid}`);
    return;
  }

  const popupParent = getSteamDesktopWindow() ?? window;
  showModal(
    <RouteParamsContext.Provider value={{ appid: String(appid) }}>
      <UpstreamPage desktop />
    </RouteParamsContext.Provider>,
    popupParent, {
      strTitle: 'SteamGridDB',
      bHideMainWindowForPopouts: false,
      bForcePopOut: true,
      popupHeight: 760,
      popupWidth: 1500,
    },
  );
};

export default definePlugin(() => ({
  title: 'SteamGridDB',
  icon: <IconsModule.Image />,
  content: <PluginSettingsPage />,
  onDismount() {
    disposeLibraryPatches();
    routerHook.removeRoute('/steamgriddb/:appid/:assetType?');
  },
}));

routerHook.removeRoute('/steamgriddb/:appid/:assetType?');
routerHook.addRoute('/steamgriddb/:appid/:assetType?', SteamGridDBRoute, { exact: true });

// Called from Steam's served code (backend/main.lua patches).
/** @ffi */
export { popupParams, popupCreated } from './steam/serve-hooks';
/** @ffi */
export const libraryMenuItem = createLibraryMenuItem((appid) => {
  void openSteamGridDBForApp(appid);
});
