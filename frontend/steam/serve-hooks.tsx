import { MenuItem } from 'millennium';
import { attachLibraryStyles } from '../library/styles';
import { getSteamBigPictureWindow } from './windows';

const BIG_PICTURE_POPUP = /^SP BPM(_uid\d+)?$/;
const POPOUT_NAME = 'SteamGridDB';
const POPOUT_RESTORE_KEY = 'SteamGridDBDesktopPopout';

// A Big Picture window that opened before the plugin loaded gets the library
// styles now; later ones get them from popupCreated.
export const attachExistingBigPicture = () => {
  const bigPicture = getSteamBigPictureWindow();
  if (bigPicture) attachLibraryStyles(bigPicture);
};

/**
 * Called by the served CreatePopup (backend/main.lua patches) with its params.
 * Makes our desktop popout resizable and reopens it at its saved size.
 */
export const popupParams = (name: string, params: any) => {
  if (name !== POPOUT_NAME) return params;
  try {
    const saved = (globalThis as any).g_PopupManager?.GetRestoreDetails?.(POPOUT_RESTORE_KEY) || undefined;
    return {
      ...params,
      eCreationFlags: (params?.eCreationFlags ?? 0) | 16,
      strRestoreDetails: params?.strRestoreDetails ?? saved,
      center_on_window: saved ? undefined : params?.center_on_window,
    };
  } catch (error) {
    console.error('[SteamGridDB] Popout params', error);
    return params;
  }
};

/**
 * Called by the served CreatePopup once a window's document exists, before
 * Steam renders into it. It must never throw into Steam's code.
 */
export const popupCreated = (name: string, popup: Window) => {
  try {
    if (BIG_PICTURE_POPUP.test(name)) attachLibraryStyles(popup);
    else if (name === POPOUT_NAME) trackPopoutGeometry(popup);
  } catch (error) {
    console.error('[SteamGridDB] Popup setup', error);
  }
};

const trackPopoutGeometry = (popup: any) => {
  const popupManager = (globalThis as any).g_PopupManager;
  if (!popup?.SteamClient?.Window?.GetWindowRestoreDetails || !popupManager?.SetRestoreDetails) return;

  let saveTimer: number | undefined;
  const saveGeometry = () => {
    popup.SteamClient.Window.GetWindowRestoreDetails()
      .then((details: string) => {
        if (details) popupManager.SetRestoreDetails(POPOUT_RESTORE_KEY, details, false);
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

/**
 * "Change Artwork..." for Steam's library context menu, placed after Manage by
 * the served menu (backend/main.lua patches), so it is part of every render.
 */
export const createLibraryMenuItem = (openForApp: (appid: number) => void) => (apps: Array<{ appid: number }>) => {
  const appid = apps?.length === 1 ? apps[0]?.appid : 0;
  if (!appid) return null;
  return (
    <MenuItem key="sgdb-change-artwork" onSelected={() => openForApp(appid)}>
      Change Artwork...
    </MenuItem>
  );
};
