// Collections and the SteamGridDB link in the Details dialog; specific to this port.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { DialogButton, Focusable, Menu, MenuItem, showContextMenu } from '@decky/ui';
import { EUIMode, Millennium, Navigation } from 'millennium';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';
import { addAssetToCollection, getApiKeyStatus, loadCollections } from './services/backend';
import { PluginsHubLink } from './settings/plugins-hub-link';
import { openWebLink } from './steam/open-web-link';

// Plugins Hub's Quick Access tab (HUB_TAB_ID in its frontend/index.tsx); it
// hosts this plugin's settings in Big Picture.
const PLUGINS_HUB_TAB_ID = 998;

export function artworkPageUrl(assetId: number, type: SGDBAssetType): string {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) throw Error('Invalid artwork ID.');
  const segment = { grid_p: 'grid', grid_l: 'grid', hero: 'hero', logo: 'logo', icon: 'icon' }[type];
  if (!segment) throw Error('Invalid artwork type.');
  return `https://www.steamgriddb.com/${segment}/${assetId}`;
}

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
    const status = await getApiKeyStatus();
    if (!status.success) throw Error(status.error || 'Could not read API Key status.');
    if (!status.configured) throw Error('Add your SteamGridDB API Key in the plugin settings.');
    const collections = await loadCollections();
    if (!mounted.current) return;
    if (!collections.length) { setMessage('No SteamGridDB collections found for your account.'); return; }
    const anchor = button.current;
    if (!anchor) return;
    activeMenu.current?.Hide();
    activeMenu.current = showContextMenu(
      <Menu label="SteamGridDB collections">
        {collections.map(collection => (
          <MenuItem key={collection.id} onSelected={() => {
            void run(async () => {
              await addAssetToCollection(collection.id, asset, assetType);
              if (mounted.current) setMessage(`Added to ${collection.name}.`);
            });
          }}>{collection.name}</MenuItem>
        ))}
      </Menu>, anchor,
      { bPreferPopLeft: false, bOverlapVertical: true, bShiftToFitWindow: true },
    );
  });

  const openSettings = () => run(async () => {
    if (await SteamClient.UI.GetUIMode() === EUIMode.GamePad) {
      Navigation.OpenQuickAccessMenu(PLUGINS_HUB_TAB_ID as Parameters<typeof Navigation.OpenQuickAccessMenu>[0]);
      setMessage(<>In <PluginsHubLink closeModal={closeModal} />, select SteamGridDB and save your personal API Key.</>);
    } else await Millennium.openQuickAccess({ plugin: 'steamgriddb' });
  });

  return (
    <div className="sgdb-details-extras">
      <style>{`
        .sgdb-modal-details .sgdb-details-actions { display:flex; gap:8px; margin-top:12px; align-items:stretch; }
        .sgdb-modal-details .sgdb-details-actions > button { height:44px; min-height:44px; }
        .sgdb-modal-details .sgdb-details-actions > button:first-child { flex:1; min-width:0; }
        .sgdb-modal-details .sgdb-details-actions > .sgdb-details-link { flex:0 0 44px; width:44px; height:44px; min-width:44px; min-height:44px; padding:0; display:flex; align-items:center; justify-content:center; }
        .sgdb-modal-details .sgdb-details-message { margin-top:8px; overflow-wrap:anywhere; }
      `}</style>
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
