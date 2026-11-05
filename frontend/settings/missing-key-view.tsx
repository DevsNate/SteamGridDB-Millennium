import { DialogBody, DialogBodyText, DialogButton, DialogControlsSection, DialogHeader, Field } from '@decky/ui';
import { useState } from 'react';
import { setApiKey } from '../services/backend';
import { openWebLink } from '../steam/open-web-link';
import { ApiKeyField } from './api-key-field';

// Laid out like a Steam settings page: one row per step. The Key is saved right here, so setup needs no
// other plugin or settings page, in Big Picture or on the desktop.
export const MissingApiKeyView = ({ onRetry, rejected = false }: { onRetry: () => void; rejected?: boolean }) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (busy || !key.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await setApiKey({ api_key: key });
      if (!result.success) throw new Error(result.error || 'Could not save the API Key.');
      setKey('');
      setBusy(false);
      // Checks the saved Key again; SteamGridDB rejecting it brings this view back.
      onRetry();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the API Key.');
      setBusy(false);
    }
  };

  return (
    <div className="sgdbApiKeySetup" role="alert">
      <DialogHeader>{rejected ? 'SteamGridDB rejected your API Key' : 'Add your SteamGridDB API Key'}</DialogHeader>
      <DialogBody>
        <DialogBodyText>{rejected
          ? "The saved API Key didn't work. Check that it was copied in full, or get a new one."
          : "SteamGridDB can't load artwork until you add your personal API Key."}</DialogBodyText>
        <DialogControlsSection>
          <Field label="1. Get your Key" description="Sign in to SteamGridDB and copy your API Key." childrenContainerWidth="fixed">
            <DialogButton autoFocus onClick={() => { void openWebLink('https://www.steamgriddb.com/profile/preferences/api'); }}>Get Key</DialogButton>
          </Field>
          <Field label="2. Paste it" description="It's stored by the plugin's backend and never shown in full again." childrenLayout="below">
            <ApiKeyField value={key} disabled={busy} onChange={setKey} />
            {error && <div className="sgdbApiKeyError">{error}</div>}
          </Field>
          <Field label="3. Save it" description="Artwork loads as soon as the Key is saved." childrenContainerWidth="fixed">
            <DialogButton disabled={busy || !key.trim()} onClick={() => { void save(); }}>Save Key</DialogButton>
          </Field>
        </DialogControlsSection>
      </DialogBody>
    </div>
  );
};
