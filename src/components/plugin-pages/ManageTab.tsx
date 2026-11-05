import { FC, useState, useEffect, useRef } from 'react';
// Millennium: Report Manage action failures through the same toast integration as asset tabs.
import { toaster } from '@decky/api';
import {
  DialogButton,
  Focusable,
  joinClassNames,
  showModal,
} from '@decky/ui';
import { HiTrash, HiFolder, HiEyeSlash } from 'react-icons/hi2';

import useSGDB from '../../hooks/useSGDB';
import t from '../../utils/i18n';
import LibraryImage from '../asset/LibraryImage';
import getAppOverview from '../../utils/getAppOverview';
import { ASSET_TYPE, SGDB_ASSET_TYPE_READABLE } from '../../constants';
import openFilePicker from '../../utils/openFilePicker';
import LogoPositionerModal from '../../modals/LogoPositionerModal';
// Millennium: Match the asset-tab error notification icon.
import MenuIcon from '../Icons/MenuIcon';
// Millennium: Adding the artwork a game shows to a collection.
import { addAssetToCollection, appliedArtwork, forgetArtwork } from '../../../frontend/services/backend';
import { ownCollections, showCollectionMenu } from '../../../frontend/details-actions';

const AssetBlock: FC<{
  app: AppStoreAppOverview,
  assetType: SGDBAssetType,
  browseStartPath: string,
  editable?: boolean,
}> = ({ app, browseStartPath, assetType, editable = true }) => {
  const { clearAsset, changeAsset, changeAssetFromUrl } = useSGDB();
  const [overview, setOverview] = useState<AppStoreAppOverview | null>(app);
  const innerFocusRef = useRef<HTMLDivElement>(null);
  const refreshing = useRef(false);
  // Millennium: The SteamGridDB artwork this game shows, if we applied it and it's still there.
  const [artworkId, setArtworkId] = useState(0);

  const refreshOverview = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setOverview(null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const appoverview = await getAppOverview(app.appid);

    if (assetType === 'icon' && appoverview?.icon_hash) {
      // bump the icon url's cache buster so it gets read from disk again
      appoverview.local_cache_version = Date.now();
    }

    setOverview(appoverview);
    refreshing.current = false;
  };

  const isShortcutIcon = assetType === 'icon' && app.BIsShortcut();
  const [isShortcutIconLoaded] = useState(() => Boolean(app.icon_data));

  // Steam reads shortcut icon into icon_data as a result of this first render,
  // so check again to pick up what just landed
  useEffect(() => {
    if (isShortcutIcon && !isShortcutIconLoaded) refreshOverview();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShortcutIcon, isShortcutIconLoaded]);

  // Millennium: Changes along with the image, so follow every change the same way.
  useEffect(() => {
    if (!overview || !editable) return undefined;
    let current = true;
    appliedArtwork(app.appid, assetType).then((id) => { if (current) setArtworkId(id); }, () => { if (current) setArtworkId(0); });
    return () => { current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, editable]);

  // Millennium: Catch write and picker errors without treating cancellation as a failure.
  const runAction = async (action: () => Promise<void>) => {
    try {
      await action();
      await refreshOverview();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'User Canceled') return;
      toaster.toast({
        title: t('MSG_ASSET_APPLY_ERROR', 'There was a problem applying this asset.'),
        body: message,
        icon: <MenuIcon fill="#f3171e" />,
      });
    }
  };

  // Millennium: Limit icon choices to image formats supported by the backend and browser.
  const handleBrowse = () => runAction(async () => {
    const path = await openFilePicker(browseStartPath, true, undefined, {
      validFileExtensions: assetType === 'icon'
        ? ['png','jpg','jpeg','gif','webp','apng','ico']
        : ['png','jpg','jpeg','gif','webp','apng','tiff','tga'],
    });
    await changeAssetFromUrl(path.path as string, assetType, true);
  });

  // Millennium: Reuse the guarded action path for blank and clear writes too.
  const handleBlank = () => runAction(async () => {
    await changeAsset('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=', assetType);
  });

  const handleClear = () => runAction(async () => {
    await clearAsset(assetType);
    // Millennium: Clearing a shortcut's icon leaves its file behind.
    await forgetArtwork(app.appid, assetType);
  });

  // Millennium: The same choice as the Details dialog.
  const addToCollection = async () => {
    const report = (body: string, failed: boolean) => toaster.toast({
      title: 'SteamGridDB',
      body,
      icon: <MenuIcon fill={failed ? '#f3171e' : undefined} />,
    });
    const reportFailure = (error: unknown) => report(error instanceof Error ? error.message : String(error), true);
    try {
      const collections = await ownCollections();
      if (!innerFocusRef.current) return;
      showCollectionMenu(collections, innerFocusRef.current, (collection) => {
        addAssetToCollection(collection.id, { id: artworkId }, assetType)
          .then(() => report(`Added to ${collection.name}.`, false), reportFailure);
      });
    } catch (error) {
      reportFailure(error);
    }
  };

  return (
    <div className={joinClassNames('asset-wrap', `asset-wrap-${assetType}`)}>
      <div className="asset-label">{t('LABEL_ASSET_CURRENT', 'Current {assetType}').replace('{assetType}', SGDB_ASSET_TYPE_READABLE[assetType])}</div>
      <Focusable
        onActivate={editable ? () => innerFocusRef.current?.focus() : undefined}
        onClick={(evt) => evt.preventDefault()} // Click events only happen with cursor, don't need to focus if clicking.
        focusWithinClassName="is-focused"
        focusClassName="is-focused"
      >
        {editable && (
          <Focusable flow-children="right" className="action-overlay">
            {artworkId > 0 && (
              <Focusable
                ref={innerFocusRef}
                noFocusRing
                className="action-button"
                onActivate={addToCollection}
                onOKActionDescription="Add to Collection"
              >
                <MenuIcon />
              </Focusable>
            )}
            <Focusable
              // Millennium: Selecting the image starts at the first button.
              ref={artworkId > 0 ? undefined : innerFocusRef}
              noFocusRing
              className="action-button"
              onActivate={handleClear}
              onOKActionDescription={t('ACTION_ASSET_CUSTOM_CLEAR', 'Clear Custom Asset')}
            >
              <HiTrash />
            </Focusable>
            <Focusable
              noFocusRing
              className="action-button"
              onActivate={handleBrowse}
              onOKActionDescription={t('ACTION_ASSET_BROWSE_LOCAL', 'Browse for Local Files')}
            >
              <HiFolder />
            </Focusable>
            {assetType !== 'icon' && (
              <Focusable
                noFocusRing
                className="action-button"
                onActivate={handleBlank}
                onOKActionDescription={t('ACTION_ASSET_APPLY_TRANSPARENT', 'Use Invisible Asset')}
              >
                <HiEyeSlash />
              </Focusable>
            )}
          </Focusable>
        )}
        {overview ? (
          <LibraryImage
            app={overview}
            eAssetType={ASSET_TYPE[assetType]}
            allowCustomization={false}
            className="asset"
            imageClassName="asset-img"
          />
        ) : (
          <div className="asset" />
        )}
      </Focusable>
    </div>
  );
};

const LocalTab: FC = () => {
  const { appId, appOverview } = useSGDB();
  const [startPath, setStartPath] = useState('/');
  const [overview, setOverview] = useState<AppStoreAppOverview>();

  useEffect(() => {
    if (!appId) return;
    (async () => {
      const appoverview = await getAppOverview(appId);
      if (!appoverview) return;

      if (appoverview.icon_hash) {
        // bump the icon url's cache buster so it gets read from disk again
        appoverview.local_cache_version = Date.now();
      }

      setOverview(appoverview);
      // Millennium: Let the native file dialog choose its default start path.
      const path = '';
      setStartPath(path);
    })();
  }, [appId, appOverview]);

  if (!overview || !appId) return null;

  return (
    <Focusable id="local-images-container">
      <Focusable flow-children="right" style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
        <AssetBlock
          app={overview}
          assetType="grid_p"
          browseStartPath={startPath}
        />
        <AssetBlock
          app={overview}
          assetType="icon"
          browseStartPath={startPath}
          editable={!(overview.third_party_mod || (overview.BIsShortcut() && overview.selected_clientid != '0'))}
        />
      </Focusable>
      <Focusable flow-children="right" style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
        <AssetBlock
          app={overview}
          assetType="grid_l"
          browseStartPath={startPath}
        />
        <AssetBlock
          app={overview}
          assetType="logo"
          browseStartPath={startPath}
        />
      </Focusable>
      <div style={{ gridColumn: 'span 2' }}>
        <AssetBlock
          app={overview}
          assetType="hero"
          browseStartPath={startPath}
        />
      </div>
      <Focusable flow-children="right" style={{ gridColumn: 'span 2', display: 'flex', gap: '.5em' }}>
        <DialogButton
          onClick={() => {
            showModal(<LogoPositionerModal appId={appId} />, window);
          }}
        >
          {t('CustomArt_EditLogoPosition', 'Adjust Logo Position', true)}
        </DialogButton>
        <DialogButton
          onClick={async () => {
            await (window.appDetailsStore as unknown as {
              ClearCustomLogoPosition: (app: AppStoreAppOverview) => any;
            }).ClearCustomLogoPosition(overview);
          }}
        >
          {t('CustomArt_ResetLogoPosition', 'Reset Logo Position', true)}
        </DialogButton>
      </Focusable>
    </Focusable>
  );
};

export default LocalTab;
