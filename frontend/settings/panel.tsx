// Settings composition adapted from SteamGridDB/decky-steamgriddb, src/index.tsx.
import { DialogButton, Field, Focusable, PanelSection, PanelSectionRow, TextField } from '@decky/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, ComponentProps } from 'react';
import QuickAccessSettings from '../../src/components/qam-contents/QuickAccessSettings';
import { SettingsProvider } from '../../src/hooks/useSettings';
import { clearApiKey, getApiKeyStatus, setApiKey } from '../services/backend';
import { bigPictureRootClasses } from '../desktop-window/big-picture-presentation';
import { registerPageWindow } from '../desktop-window/window-boundary';
import { pluginSettingsStyles } from './panel-styles';
import { openWebLink } from '../steam/open-web-link';

const PasswordField = TextField as ComponentType<ComponentProps<typeof TextField> & { type: 'password'; autoComplete: 'off' }>;

const ApiKeySettings = () => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getApiKeyStatus>> | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;
    void getApiKeyStatus().then(result => {
      if (!mounted) return;
      if (result.success) setStatus(result);
      else setError(result.error || 'Could not read API Key status.');
    }).catch(() => { if (mounted) setError('Could not read API Key status.'); });
    return () => { mounted = false; };
  }, []);

  const update = async (clear: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = clear ? await clearApiKey() : await setApiKey({ api_key: key });
      if (!result.success) throw new Error(result.error || 'Could not update API Key.');
      setStatus(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update API Key.');
    } finally {
      setKey('');
      setBusy(false);
    }
  };

  return (
    <PanelSection title="SteamGridDB API Key">
      <PanelSectionRow>
        <Field label={status ? status.configured ? `Using your Key ${status.hint ?? ''}` : 'No API Key saved' : 'Checking Key status…'}
          description="A personal API Key is required, free with a SteamGridDB account." childrenLayout="below">
          {/* One column for the D-pad: the key field, Save Key, then Get Key and Clear Key. */}
          <Focusable flow-children="column">
            <Focusable ref={inputRoot} focusWithinClassName="sgdb-key-focus" onActivate={() => {
              if (busy) return;
              const input = inputRoot.current?.querySelector('input');
              input?.focus();
              input?.click();
            }}>
              <PasswordField label="Personal API Key" type="password" autoComplete="off" value={key}
                disabled={busy} onChange={event => setKey(event.target.value)} />
            </Focusable>
            <Focusable className="sgdb-key-actions sgdb-key-save" focusWithinClassName="sgdb-key-focus">
              <DialogButton disabled={busy || !key.trim()} onClick={() => { void update(false); }}>Save Key</DialogButton>
            </Focusable>
            <Focusable className="sgdb-key-actions" flow-children="row">
              <DialogButton onClick={() => { void openWebLink('https://www.steamgriddb.com/profile/preferences/api'); }}>Get Key</DialogButton>
              <DialogButton disabled={busy || !status?.configured} onClick={() => { void update(true); }}>Clear Key</DialogButton>
            </Focusable>
          </Focusable>
          {error && <div role="alert">{error}</div>}
        </Field>
      </PanelSectionRow>
    </PanelSection>
  );
};

export const PluginSettingsPage = () => {
  const release = useRef<(() => void) | undefined>(undefined);
  const attach = useCallback((node: HTMLDivElement | null) => {
    release.current?.();
    release.current = node ? registerPageWindow(node) : undefined;
  }, []);
  return (
    <div ref={attach} className={`sgdbPluginSettings ${bigPictureRootClasses}`}>
      <style>{pluginSettingsStyles}</style>
      <SettingsProvider>
        <ApiKeySettings />
        <QuickAccessSettings />
      </SettingsProvider>
    </div>
  );
};
