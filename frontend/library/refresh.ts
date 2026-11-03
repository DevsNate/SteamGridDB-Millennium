// Owner-aware adaptation of SteamGridDB/decky-steamgriddb src/patches/patchUtils.ts.
import { Router } from 'millennium';

type LibraryWindow = {
  BrowserWindow: Window;
  History?: {
    location: { pathname: string; [key: string]: unknown };
    replace(location: { pathname: string; [key: string]: unknown }): void;
  };
};
let scheduled: { owner: Window; frame: number } | undefined;

export function refreshLibraryRoute(): void {
  const bpm = Router?.WindowStore?.GamepadUIMainWindowInstance as LibraryWindow | undefined;
  const owner = bpm?.BrowserWindow;
  const pathname = bpm?.History?.location.pathname;
  if (!owner || owner.closed || (pathname !== '/library/home' && pathname !== '/library')) return;
  cancelLibraryRefresh();
  // A settings action removes/re-adds several patches; refresh once after that batch.
  scheduled = { owner, frame: owner.requestAnimationFrame(() => {
    scheduled = undefined;
    const history = bpm.History;
    if (!owner.closed && history?.location.pathname === pathname) {
      // Notify the native in-memory router without another entry or a route bounce.
      history.replace({ ...history.location });
    }
  }) };
}

export function cancelLibraryRefresh(): void {
  if (scheduled && !scheduled.owner.closed) scheduled.owner.cancelAnimationFrame(scheduled.frame);
  scheduled = undefined;
}
