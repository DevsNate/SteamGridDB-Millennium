// Millennium: Native BPM uses an in-memory router in a different owner window.
import { refreshLibraryRoute } from '../../frontend/library/refresh';

export function rerenderAfterPatchUpdate(): void {
  // Millennium: Route-state notification alone can leave memoized Home geometry stale.
  refreshLibraryRoute();
}