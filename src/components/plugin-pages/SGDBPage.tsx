import { Focusable, useParams } from '@decky/ui';
import { useEffect, useState, VFC, useCallback } from 'react';

import { AssetSearchContext } from '../../hooks/useAssetSearch';
import { useSGDB } from '../../hooks/useSGDB';
import useSettings from '../../hooks/useSettings';
import { DEFAULT_TABS } from '../../constants';
// Millennium: Starlight packs the committed CSS compiled from this SCSS (scripts/build-styles.mjs).
import { upstreamStyle as style } from '../../../frontend/generated/upstream-style';

import AssetTabs from './AssetTabs';

// Millennium: With this, Steam moves focus to what's next to a focused element that goes away, on every tab. Without
// it focus goes nowhere, and the next press can land anywhere.
const keepFocus = { focusableIfEmpty: true } as object;

const SGDBPage: VFC = () => {
  const { get } = useSettings();
  const { setAppId, appOverview } = useSGDB();
  // Millennium: Tab preferences can also select Manage or Collections.
  const { appid, assetType = 'grid_p' } = useParams<{ appid: string, assetType: SGDBTabType }>();
  const [currentTab, setCurrentTab] = useState<string>();

  const onShowTab = useCallback((tabID: string) => {
    setCurrentTab(tabID);
  }, []);

  useEffect(() => {
    setAppId(parseInt(appid, 10));
  }, [appid, setAppId]);

  useEffect(() => {
    (async () => {
      const positions: SGDBTabType[] = await get('tabs_order', DEFAULT_TABS);
      const hidden: SGDBTabType[] = await get('tabs_hidden', []);
      let tabDefault = await get('tab_default', assetType);
      const filtered = positions.filter((x) => !hidden.includes(x));

      // Set first tab as default if default is hidden
      if (!filtered.includes(tabDefault)) {
        tabDefault = filtered[0];
      }
      setCurrentTab(tabDefault);
    })();
  }, [get, assetType]);

  if (!appOverview || !currentTab) return null;

  return (
    <>
      <style>
        {style}
      </style>
      <Focusable id="sgdb-wrap" {...keepFocus}>
        <AssetSearchContext>
          <AssetTabs currentTab={currentTab} onShowTab={onShowTab} />
        </AssetSearchContext>
      </Focusable>
    </>
  );
};

export default SGDBPage;
