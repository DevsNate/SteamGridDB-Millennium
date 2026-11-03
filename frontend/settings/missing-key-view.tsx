import { DialogBody, DialogBodyText, DialogButton, DialogControlsSection, DialogHeader, Field } from '@decky/ui';
import { Millennium } from 'millennium';
import { openWebLink } from '../steam/open-web-link';
import { PLUGINS_HUB_URL, PluginsHubLink } from './plugins-hub-link';

// Laid out like a Steam settings page: one row per step, its action on the right.
export const MissingApiKeyView = ({ onRetry, desktop = false, rejected = false }: { onRetry: () => void; desktop?: boolean; rejected?: boolean }) => (
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
        <Field
          label="2. Save it"
          description={desktop
            ? <>Open the SteamGridDB settings, paste it into Personal API Key and select Save Key.</>
            : <>In Steam's Quick Access menu, open <PluginsHubLink /> → SteamGridDB, paste it into Personal API Key and select Save Key.</>}
          childrenContainerWidth="fixed"
        >
          {desktop
            ? <DialogButton onClick={() => { void Millennium.openQuickAccess({ plugin: 'steamgriddb' }); }}>Open settings</DialogButton>
            // The D-pad moves between the buttons on the right, so the inline link also gets one here.
            : <DialogButton onClick={() => { void openWebLink(PLUGINS_HUB_URL); }}>Get Plugins Hub</DialogButton>}
        </Field>
        <Field label="3. Load artwork" description="Come back here once your Key is saved." childrenContainerWidth="fixed">
          <DialogButton onClick={onRetry}>Retry</DialogButton>
        </Field>
      </DialogControlsSection>
    </DialogBody>
  </div>
);
