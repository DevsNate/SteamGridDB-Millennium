import {
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  MenuItem,
  Millennium,
} from '@steambrew/client';
import type { FC } from 'react';

type Patch = { unpatch?: () => void };

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

export const getSteamDesktopOwnerWindow = () => steamDesktopOwnerWindow;

export const clearSteamDesktopOwnerWindow = () => {
  steamDesktopOwnerWindow = null;
};

export const registerSteamWindowHook = () => {
  window.__SGDB_WINDOW_HOOK__ = captureSteamDesktopWindow;
  if (window.__SGDB_WINDOW_HOOK_REGISTERED__ || !Millennium?.AddWindowCreateHook) {
    return;
  }

  Millennium.AddWindowCreateHook((popup: any) => window.__SGDB_WINDOW_HOOK__?.(popup));
  window.__SGDB_WINDOW_HOOK_REGISTERED__ = true;
};

/**
 * Steam does not expose resizable plugin popouts through a stable public API.
 * Keep this compatibility patch isolated so source-string changes in Steam are
 * easy to review and failures degrade to a normal non-resizable modal.
 */
export const installResizablePopupPatch = (): Patch => {
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

const spliceArtworkItem = (children: any[], appid: number, openForApp: (appid: number) => void) => {
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
    <MenuItem key="sgdb-change-artwork" onSelected={() => openForApp(appid)}>
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

const patchMenuItems = (menuItems: any[], fallbackAppId: number, openForApp: (appid: number) => void) => {
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
    spliceArtworkItem(menuItems, appid, openForApp);
  }
};

const findLibraryContextMenu = () => {
  const module = findModuleByExport((exp: any) => exp?.toString && exp.toString().includes('().LibraryContextMenu'));
  const component = Object.values(module ?? {}).find((sibling: any) => sibling?.toString?.().includes('navigator:')) as FC | undefined;
  return component ? fakeRenderComponent(component)?.type : null;
};

/**
 * Steam's library context menu is private React state. If discovery fails, the
 * plugin logs a warning and all route/settings functionality remains available.
 */
export const patchLibraryContextMenu = (openForApp: (appid: number) => void): Patch => {
  const LibraryContextMenu = findLibraryContextMenu();
  if (!LibraryContextMenu?.prototype?.render) {
    console.warn('[SteamGridDB] Could not find LibraryContextMenu');
    return { unpatch: () => undefined };
  }

  const findCurrentAppId = (tree?: any) => {
    const foundApp = findInTree(tree, (node) => node?.app?.appid, { walkable: ['props', 'children', '_owner', 'pendingProps'] });
    if (foundApp?.app?.appid) {
      return foundApp.app.appid;
    }

    const foundOverview = findInTree(tree, (node) => node?.overview?.appid, { walkable: ['props', 'children', '_owner', 'pendingProps'] });
    return foundOverview?.overview?.appid ?? 0;
  };

  const patches: { outer?: Patch; inner?: Patch; nested: Patch[]; unpatch: () => void } = {
    nested: [],
    unpatch: () => undefined,
  };
  const patchedMenuPrototypes = new WeakSet<object>();
  patches.outer = afterPatch(LibraryContextMenu.prototype, 'render', (_args: any[], component: any) => {
    if (!patches.inner) {
      patches.inner = afterPatch(component, 'type', (_typeArgs: any[], ret: any) => {
        const prototype = ret?.type?.prototype;
        if (prototype?.render && !patchedMenuPrototypes.has(prototype)) {
          patchedMenuPrototypes.add(prototype);
          patches.nested.push(afterPatch(prototype, 'render', (_renderArgs: any[], renderRet: any) => {
            const menuItems = renderRet?.props?.children?.[0];
            if (isOpeningAppContextMenu(menuItems)) {
              patchMenuItems(menuItems, findCurrentAppId(renderRet), openForApp);
            }
            return renderRet;
          }));

          if (typeof prototype.shouldComponentUpdate === 'function') {
            patches.nested.push(afterPatch(prototype, 'shouldComponentUpdate', ([nextProps]: any[], shouldUpdate: any) => {
              const menuItems = nextProps?.children;
              if (isOpeningAppContextMenu(menuItems)) {
                patchMenuItems(menuItems, findCurrentAppId(nextProps), openForApp);
              }
              return shouldUpdate;
            }));
          }
        }

        return ret;
      });
    } else if (Array.isArray(component?.props?.children)) {
      patchMenuItems(component.props.children, findCurrentAppId(component), openForApp);
    }

    return component;
  });

  patches.unpatch = () => {
    patches.nested.splice(0).reverse().forEach((patch) => patch?.unpatch?.());
    patches.outer?.unpatch?.();
    patches.inner?.unpatch?.();
  };
  return patches;
};

declare global {
  interface Window {
    __SGDB_CONTEXT_MENU_PATCH__?: Patch;
    __SGDB_POPUP_CREATE_PATCH__?: Patch;
    __SGDB_WINDOW_HOOK__?: (popup: any) => void;
    __SGDB_WINDOW_HOOK_REGISTERED__?: boolean;
  }
}
