// Looks up Steam's own windows through its popup manager. Steam names them with the
// signed-in user's uid (usually _uid0), so any uid is accepted.
export const BIG_PICTURE_POPUP = /^SP BPM(_uid\d+)?$/;
const DESKTOP_POPUP = /^SP Desktop(_uid\d+)?$/;

const getPopupOwnerWindow = (popup: any): Window | null => {
  const ownerWindow = popup?.m_popup?.window ?? popup?.m_popup ?? popup?.window;
  try {
    return ownerWindow?.document && !ownerWindow.closed ? ownerWindow as Window : null;
  } catch {
    return null;
  }
};

const getExistingPopupWindow = (usualName: string, name: RegExp): Window | null => {
  const manager = (globalThis as any).g_PopupManager;
  const usual = getPopupOwnerWindow(manager?.GetExistingPopup?.(usualName));
  if (usual) return usual;
  for (const popup of manager?.GetPopups?.() ?? []) {
    const popupName = popup?.GetName?.();
    if (typeof popupName === 'string' && name.test(popupName)) {
      const owner = getPopupOwnerWindow(popup);
      if (owner) return owner;
    }
  }
  return null;
};

export const getSteamDesktopWindow = () => getExistingPopupWindow('SP Desktop_uid0', DESKTOP_POPUP);
export const getSteamBigPictureWindow = () => getExistingPopupWindow('SP BPM_uid0', BIG_PICTURE_POPUP);
