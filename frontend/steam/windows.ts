// Looks up Steam's own windows through its popup manager.
const DESKTOP_POPUP_NAME = 'SP Desktop_uid0';

const getPopupOwnerWindow = (popup: any): Window | null => {
  const ownerWindow = popup?.m_popup?.window ?? popup?.m_popup ?? popup?.window;
  try {
    return ownerWindow?.document && !ownerWindow.closed ? ownerWindow as Window : null;
  } catch {
    return null;
  }
};

const getExistingPopupWindow = (name: string): Window | null => {
  const popup = (globalThis as any).g_PopupManager?.GetExistingPopup?.(name);
  return getPopupOwnerWindow(popup);
};

export const getSteamDesktopWindow = () => getExistingPopupWindow(DESKTOP_POPUP_NAME);
export const getSteamBigPictureWindow = () => getExistingPopupWindow('SP BPM_uid0');
