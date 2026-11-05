// Provider composition adapted from SteamGridDB/decky-steamgriddb, src/index.tsx.
import { useEffect, useState } from 'react';
import SGDBPage from '../src/components/plugin-pages/SGDBPage';
import { SGDBProvider } from '../src/hooks/useSGDB';
import { SettingsProvider } from '../src/hooks/useSettings';
import { PageWindowBoundary } from './desktop-window/window-boundary';
import { getApiKeyStatus } from './services/backend';
import { loadPluginAssets } from './services/plugin-assets';
import { onApiKeyRejected } from './settings/key-rejected';
import { MissingApiKeyView } from './settings/missing-key-view';
import { setupStyles } from './settings/missing-key-styles';

export const UpstreamPage = ({ desktop = false }: { desktop?: boolean }) => {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rejected, setRejected] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // A Key SteamGridDB rejects swaps the artwork for the setup view; Retry checks again.
    const stopListening = onApiKeyRejected((keyRejected = true) => { setRejected(keyRejected); setConfigured(false); });
    // The bundled images must be ready before tiles render their spinners.
    void Promise.all([getApiKeyStatus(), loadPluginAssets()]).then(([result]) => {
      if (cancelled) return;
      setRejected(false);
      setConfigured(result.success && result.configured === true);
    }).catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; stopListening(); };
  }, [version]);
  if (configured === null) return null;
  return (
  <PageWindowBoundary desktop={desktop}>
    {configured ? <SettingsProvider>
      <SGDBProvider>
        <SGDBPage />
      </SGDBProvider>
    </SettingsProvider> : <div className="sgdbRoot sgdbGamepad sgdbBigPicture sgdbPopoutContent" id="sgdb-wrap">
      <style>{setupStyles}</style>
      {/* The setup view stays until the check answers: an empty page would drop the focused Retry button and Steam's focus with it. */}
      <MissingApiKeyView rejected={rejected} onRetry={() => setVersion(current => current + 1)} />
    </div>}
  </PageWindowBoundary>
  );
};
