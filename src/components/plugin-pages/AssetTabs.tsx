
import { memo, useEffect, useState, FC } from 'react';
import { Tabs, TabsProps, showModal } from '@decky/ui';

import t from '../../utils/i18n';
import useAssetSearch from '../../hooks/useAssetSearch';
import useSGDB from '../../hooks/useSGDB';
import { tabStrs, DEFAULT_TABS } from '../../constants';
import useSettings from '../../hooks/useSettings';
import BeggingModal from '../../modals/BeggingModal';

// Millennium: The collection browser uses the same native tabs and page window.
import { CollectionsTab } from '../../../frontend/collections/collections-tab';
import { useFlowTabs, useHeaderBack } from '../../../frontend/collections/flow-tabs';
import ManageTab from './ManageTab';
import AssetTab from './AssetTab';

const AssetTabs: FC<{
  currentTab: string,
  onShowTab: TabsProps['onShowTab']
}> = ({ currentTab, onShowTab }) => {
  const { get, set } = useSettings();
  const { appOverview } = useSGDB();
  const { openFilters } = useAssetSearch();
  const [tabPositions, setTabPositions] = useState<string[] | null>(null);
  const [hiddenTabs, setHiddenTabs] = useState<string[] | null>(null);
  // Millennium: While applying a collection, the bar shows that flow's steps.
  const flow = useFlowTabs(currentTab === 'collections');
  const headerBack = useHeaderBack(currentTab === 'collections');

  useEffect(() => {
    (async () => {
      setTabPositions(await get('tabs_order', DEFAULT_TABS));
      setHiddenTabs(await get('tabs_hidden', []));

      // Amount of times tabs page opened, used to hide tutorial after a while
      const useCount = await get('plugin_use_count', 0);
      set('plugin_use_count', useCount + 1, true);

      // Donation message if plugin is used a lot
      if ([15, 75, 200, 1337].includes(useCount)) {
        showModal(<BeggingModal />);
      }
    })();
  }, [get, set]);

  if (!tabPositions || !hiddenTabs) return null;

  if (flow) return <Tabs autoFocusContents {...flow} />;

  let tabs = [
    ...tabPositions
      /*
        Filter out icons if:
          - App is a mod, editing edit liblist.gam/gameinfo.txt is destructive and out of scope for this plugin
          - Shortcut is not locally installed, can't edit shortcuts.vdf remotely.
      */
      .filter((type) => !(type === 'icon' && (
        appOverview.third_party_mod ||
        (appOverview.BIsShortcut() && appOverview.selected_clientid != '0')
      )))
      // Filter hidden tabs
      .filter((x) => !hiddenTabs.includes(x)),
  ];

  /*
    If no tabs are left, force show manage tab. Useful for when only icons are selected and trying to view a mod.
  */
  if (tabs.length === 0) {
    tabs = ['manage'];
  }

  return (
    <Tabs
      autoFocusContents
      activeTab={currentTab}
      onShowTab={onShowTab}
      onCancelFromTabHeader={headerBack}
      tabs={tabs.map((type) => {
        if (type === 'collections') {
          return { id: type, title: tabStrs[type], content: <CollectionsTab /> };
        }
        if (type === 'manage') {
          return {
            title: tabStrs[type],
            content: <ManageTab />,
            id: 'manage',
          };
        }
        return {
          id: type,
          title: tabStrs[type as SGDBAssetType],
          content: <AssetTab assetType={type as SGDBAssetType} />,
          footer: {
            onSecondaryActionDescription: t('ACTION_OPEN_FILTER', 'Filter'),
            onSecondaryButton: () => openFilters(type as SGDBAssetType),
          },
        };
      })}
    />
  );
};

export default memo(AssetTabs);