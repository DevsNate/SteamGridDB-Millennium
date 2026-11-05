import { Focusable, SliderField, DialogButton, SliderFieldProps } from '@decky/ui';
import {
  useState,
  useImperativeHandle,
  useRef,
  forwardRef,
  useEffect,
  useMemo,
  Ref,
} from 'react';

import t from '../../utils/i18n';
import useSettings from '../../hooks/useSettings';
import useAssetSearch from '../../hooks/useAssetSearch';
import { SGDB_ASSET_TYPE_READABLE } from '../../constants';
import { keepColumn } from '../../../frontend/collections/nav';

// Millennium: Every tab sizes by items per row (upstream does this for hero
// and logo only), with ranges for large desktop and TV displays. Values map
// to columns as max - value + min, so moving right means fewer, bigger items.
export const sliderProps = {
  grid_p: {
    min: 3,
    max: 14,
    step: 1,
    notchCount: 12,
    notchTicksVisible: true,
  },
  grid_l: {
    min: 2,
    max: 10,
    step: 1,
    notchCount: 9,
    notchTicksVisible: true,
  },
  hero: {
    min: 1,
    max: 6,
    step: 1,
    notchCount: 6,
    notchTicksVisible: true,
  },
  logo: {
    min: 2,
    max: 10,
    step: 1,
    notchCount: 9,
    notchTicksVisible: true,
  },
  icon: {
    min: 4,
    max: 16,
    step: 1,
    notchCount: 13,
    notchTicksVisible: true,
  },
};

// Millennium: Defaults in the same items-per-row scale: 8 capsules, 5 wide
// capsules, 4 heroes, 8 logos, 10 icons per row. Collections sizes its grids the same way.
export const defaultSliderSizes = {
  grid_p: 9,
  grid_l: 7,
  hero: 3,
  logo: 4,
  icon: 10,
};

export interface Toolbar {
  assetType: SGDBAssetType;
  onSizeChange: (size: any) => void;
  onFilterClick: () => void;
  onOfficialAssetsClick: () => void;
  onLogoPosClick: () => void;
  disabled: boolean;
  noFocusRing?: boolean;
}

export type ToolbarRefType = {
  focus: () => void;
  assetSizeStyleAttr: any;
};

// map SGDBAssetType to steam response
const defaultAssetMap = {
  grid_p: 'library_capsule',
  grid_l: 'header_image',
  hero: 'library_hero',
  logo: 'library_logo',
  icon: 'clienticon',
};

const Toolbar = forwardRef(({
  assetType,
  onSizeChange,
  onFilterClick,
  onOfficialAssetsClick,
  onLogoPosClick,
  disabled = false,
  noFocusRing,
}: Toolbar, ref: Ref<ToolbarRefType>) => {
  const { externalSgdbData } = useAssetSearch();
  const { set, get } = useSettings();
  const [sliderValue, setSliderValue] = useState<number>(120);
  const toolbarFocusRef = useRef<HTMLDivElement>(null);

  const handleSliderChange: SliderFieldProps['onChange'] = (size) => {
    setSliderValue(size);
    set(`zoomlevel_${assetType}`, size);
  };

  const assetSizeStyleAttr = useMemo(() => {
    // Millennium: Items-per-row sizing for every tab, not only hero and logo.
    const percent = 100 / (sliderProps[assetType].max - sliderValue + sliderProps[assetType].min);
    return {
      gridTemplateColumns: `repeat(auto-fill, minmax(calc(${percent}% - .65em), 1fr))`,
    };
  }, [assetType, sliderValue]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      toolbarFocusRef.current?.focus();
    },
    assetSizeStyleAttr,
  }), [assetSizeStyleAttr]);

  useEffect(() => {
    onSizeChange?.(assetSizeStyleAttr);
  }, [assetSizeStyleAttr, onSizeChange]);

  // Set initial slider value from config or default
  useEffect(() => {
    (async () => {
      const defSize = await get(`zoomlevel_${assetType}`, defaultSliderSizes[assetType]);
      // Millennium: Fall back to upstream's default for invalid or out-of-range saved sizes.
      const { min, max } = sliderProps[assetType];
      setSliderValue(Number.isFinite(defSize) && defSize >= min && defSize <= max ? defSize : defaultSliderSizes[assetType]);
    })();
  }, [assetType, get]);

  if (disabled) return null;

  return (
    <Focusable className="sgdb-asset-toolbar" noFocusRing={noFocusRing} flow-children="row" {...keepColumn}>
      <Focusable className="filter-buttons" {...keepColumn}>
        <DialogButton
          ref={toolbarFocusRef}
          style={{ flex: 0 }}
          noFocusRing
          onOKActionDescription={t('ACTION_OPEN_FILTER', 'Filter')}
          onClick={onFilterClick}
        >
          {t('ACTION_OPEN_FILTER', 'Filter')}
        </DialogButton>
        {(
          externalSgdbData &&
          Object.keys(externalSgdbData).length !== 0 &&
          externalSgdbData?.steam[0]?.metadata[defaultAssetMap[assetType]]
        ) && (
          <DialogButton
            noFocusRing
            onOKActionDescription={t('ACTION_OPEN_OFFICIAL_ASSETS', 'Official {assetType}').replace('{assetType}', SGDB_ASSET_TYPE_READABLE[assetType])}
            onClick={onOfficialAssetsClick}
          >
            {t('ACTION_OPEN_OFFICIAL_ASSETS', 'Official {assetType}').replace('{assetType}', SGDB_ASSET_TYPE_READABLE[assetType])}
          </DialogButton>
        )}
        {['logo', 'hero'].includes(assetType) && (
          <DialogButton
            noFocusRing
            onOKActionDescription={t('CustomArt_EditLogoPosition', 'Adjust Logo Position', true)}
            onClick={onLogoPosClick}
          >
            {t('CustomArt_EditLogoPosition', 'Adjust Logo Position', true)}
          </DialogButton>
        )}
      </Focusable>
      <SliderField
        className="size-slider"
        onChange={handleSliderChange}
        value={sliderValue}
        layout="below"
        bottomSeparator="none"
        {...sliderProps[assetType]}
      />
    </Focusable>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
