// "Plugins Hub" as an inline link, wherever Big Picture setup mentions it.
import { Focusable } from '@decky/ui';
import { openWebLink } from '../steam/open-web-link';

export const PLUGINS_HUB_URL = 'https://github.com/DevsNate/PluginsHub-Millennium';

// Focusable so a controller can reach it; Steam turns A on a focusable with
// onClick into a click, so one handler serves the mouse and the controller.
// Inside a dialog, pass its closeModal: Steam would otherwise keep the dialog,
// and its button actions, above the web page.
export const PluginsHubLink = ({ closeModal }: { closeModal?: () => void }) => (
  <>
    <style>{`
      .sgdbPluginsHubLink { display:inline; color:inherit; text-decoration:underline; text-underline-offset:2px; cursor:pointer; border-radius:3px; }
      .sgdbPluginsHubLink:hover, .sgdbPluginsHubLink.gpfocus { color:#fff; background:rgba(255,255,255,.18); outline:2px solid rgba(255,255,255,.18); }
    `}</style>
    <Focusable className="sgdbPluginsHubLink" role="link" onClick={() => { closeModal?.(); void openWebLink(PLUGINS_HUB_URL); }}>
      Plugins Hub
    </Focusable>
  </>
);
