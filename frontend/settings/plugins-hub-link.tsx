// "Plugins Hub" as an inline link, where Details points to it in Big Picture. Styled in
// src/styles/_details-actions.scss.
import { Focusable } from '@decky/ui';
import { openWebLink } from '../steam/open-web-link';

export const PLUGINS_HUB_URL = 'https://github.com/DevsNate/PluginsHub-Millennium';

// Focusable so a controller can reach it; Steam turns A on a focusable with
// onClick into a click, so one handler serves the mouse and the controller.
// Inside a dialog, pass its closeModal: Steam would otherwise keep the dialog,
// and its button actions, above the web page.
export const PluginsHubLink = ({ closeModal }: { closeModal?: () => void }) => (
  <Focusable className="sgdbPluginsHubLink" role="link" onClick={() => { closeModal?.(); void openWebLink(PLUGINS_HUB_URL); }}>
    Plugins Hub
  </Focusable>
);
