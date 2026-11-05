// Collections and the SteamGridDB link in the Details dialog; specific to this port.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { DialogButton, Focusable, Menu, MenuItem, showContextMenu } from '@decky/ui';
import { EUIMode, Millennium, Navigation } from 'millennium';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';
import { SGDBCollection, addAssetToCollection, getApiKeyStatus, loadCollections } from './services/backend';
import { requestApiKeySetup } from './settings/key-rejected';
import { PluginsHubLink } from './settings/plugins-hub-link';
import { openWebLink } from './steam/open-web-link';

// Plugins Hub's Quick Access tab (HUB_TAB_ID in its frontend/index.tsx). When it's installed it hosts
// this plugin's settings in Big Picture; without it, the artwork page's own setup view takes the Key.
const PLUGINS_HUB_TAB_ID = 998;
const PLUGINS_HUB_ID = 'plugins-hub';
const pluginsHubLoaded = () => Boolean((window as { PLUGIN_LIST?: Record<string, unknown> }).PLUGIN_LIST?.[PLUGINS_HUB_ID]);

export function artworkPageUrl(assetId: number, type: SGDBAssetType): string {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw Error('Invalid artwork ID.');
  const segment = { grid_p: 'grid', grid_l: 'grid', hero: 'hero', logo: 'logo', icon: 'icon' }[type];
  if (!segment) throw Error('Invalid artwork type.');
  return `https://www.steamgriddb.com/${segment}/${assetId}`;
}

/** The collections artwork can be added to. Throws what to tell the user if there are none. */
export async function ownCollections(): Promise<SGDBCollection[]> {
  const status = await getApiKeyStatus();
  if (!status.success) throw Error(status.error || 'Could not read API Key status.');
  if (!status.configured) throw Error('Add your SteamGridDB API Key in the plugin settings.');
  const collections = await loadCollections();
  if (!collections.length) throw Error('No SteamGridDB collections found for your account.');
  return collections;
}

export const showCollectionMenu = (collections: SGDBCollection[], anchor: HTMLElement, onSelected: (collection: SGDBCollection) => void) => showContextMenu(
  <Menu label="SteamGridDB collections">
    {collections.map(collection => (
      <MenuItem key={collection.id} onSelected={() => onSelected(collection)}>{collection.name}</MenuItem>
    ))}
  </Menu>, anchor,
  { bPreferPopLeft: false, bOverlapVertical: true, bShiftToFitWindow: true },
);

export const DetailsActions = ({ asset, assetType, closeModal }: { asset: { id: number }; assetType: SGDBAssetType; closeModal?: () => void }) => {
  const button = useRef<HTMLDivElement>(null);
  const activeMenu = useRef<ReturnType<typeof showContextMenu>>();
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ReactNode>('');
  const [needsKey, setNeedsKey] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeMenu.current?.Hide(); };
  }, []);

  const failure = (error: unknown) => {
    if (!mounted.current) return;
    const text = error instanceof Error ? error.message : String(error);
    setMessage(text);
    setNeedsKey(/API Key/i.test(text));
  };
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setNeedsKey(false);
    try { await action(); } catch (error) { failure(error); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };

  const chooseCollection = () => run(async () => {
    const collections = await ownCollections();
    const anchor = button.current;
    if (!mounted.current || !anchor) return;
    activeMenu.current?.Hide();
    activeMenu.current = showCollectionMenu(collections, anchor, collection => {
      void run(async () => {
        await addAssetToCollection(collection.id, asset, assetType);
        if (mounted.current) setMessage(`Added to ${collection.name}.`);
      });
    });
  });

  const openSettings = () => {
    const rejected = typeof message === 'string' && /rejected/i.test(message);
    return run(async () => {
      if (await SteamClient.UI.GetUIMode() !== EUIMode.GamePad) {
        await Millennium.openQuickAccess({ plugin: 'steamgriddb' });
      } else if (pluginsHubLoaded()) {
        Navigation.OpenQuickAccessMenu(PLUGINS_HUB_TAB_ID as Parameters<typeof Navigation.OpenQuickAccessMenu>[0]);
        setMessage(<>In <PluginsHubLink closeModal={closeModal} />, select SteamGridDB and save your personal API Key.</>);
      } else {
        // The artwork page behind this dialog swaps to its setup view, where the Key can be saved.
        closeModal?.();
        if (!requestApiKeySetup(rejected)) throw Error('Open SteamGridDB from a game to add your API Key.');
      }
    });
  };

  return (
    <div className="sgdb-details-extras">
      {/* Styled in src/styles/_details-actions.scss. */}
      <Focusable className="sgdb-details-actions" flow-children="row">
        <DialogButton ref={button} disabled={busy} onClick={() => { void chooseCollection(); }}>Add to collection</DialogButton>
        <DialogButton className="sgdb-details-link" aria-label="Open on SteamGridDB" title="Open on SteamGridDB"
          onClick={() => { void run(async () => {
            const url = artworkPageUrl(asset.id, assetType);
            // Match upstream's author-link behavior: dismiss before changing routes.
            // Otherwise Steam carries this global modal above the browser/library.
            closeModal?.();
            await openWebLink(url);
          }); }}>
          <HiArrowTopRightOnSquare aria-hidden="true" />
        </DialogButton>
      </Focusable>
      {message && <div className="sgdb-details-message" role="status">{message}</div>}
      {needsKey && <DialogButton disabled={busy} onClick={() => { void openSettings(); }}>Open settings</DialogButton>}
    </div>
  );
};
