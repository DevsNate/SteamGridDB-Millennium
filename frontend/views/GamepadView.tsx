import { DialogButton, Focusable, GamepadButton, SliderField, Spinner } from '@steambrew/client';
import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetState, CurrentArtworkState, EndState, FilterState, LoadingState, PageState, SGDBAsset, SGDBAssetType, ZoomState } from '../index';

type ViewProps = {
  assetType: SGDBAssetType;
  setAssetType: Dispatch<SetStateAction<SGDBAssetType>>;
  assetsByType: AssetState;
  pagesByType: PageState;
  loadingByType: LoadingState;
  endReachedByType: EndState;
  filters: FilterState;
  toggleFilter: (key: keyof FilterState) => void;
  zoomByType: ZoomState;
  zoomDefaults: ZoomState;
  setZoomByType: Dispatch<SetStateAction<ZoomState>>;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  applyingId: number | null;
  applyAsset: (asset: SGDBAsset, type: SGDBAssetType) => Promise<void>;
  openAssetPage: (asset: SGDBAsset, type: SGDBAssetType) => Promise<void>;
  showExternalLinks: boolean;
  loadAssets: (type: SGDBAssetType, nextPage?: number, append?: boolean) => Promise<void>;
  resetCurrentTab: () => void;
  resetArtwork: (type: SGDBAssetType) => Promise<void>;
  isGamepadUI?: boolean;
  currentArtwork: CurrentArtworkState;
  refreshCurrentArtwork: () => Promise<void>;
};

const ASSET_LABEL: Record<SGDBAssetType, string> = {
  grid_p: 'GRID',
  grid_l: 'WIDE GRID',
  hero: 'HERO',
  logo: 'LOGO',
  icon: 'ICON',
};

const tabs = Object.keys(ASSET_LABEL) as SGDBAssetType[];
type ViewTab = SGDBAssetType | 'manage';
const viewTabs: ViewTab[] = [...tabs, 'manage'];
const isAnimatedAsset = (src: string) => /\.(webm|mp4)(\?|$)/i.test(src);
const DEFAULT_VISIBLE_ROWS = 7;

const assetGridStyle = (assetType: SGDBAssetType, zoom: number) => {
  if (assetType === 'hero' || assetType === 'logo') {
    const columns = Math.max(2, Math.min(6, zoom));
    return { gridTemplateColumns: `repeat(auto-fill, minmax(calc(${100 / columns}% - 10px), 1fr))` };
  }

  return { ['--asset-size' as string]: `${zoom}px` };
};

const sliderLimits = (assetType: SGDBAssetType) => ({
  min: assetType === 'hero' ? 2 : assetType === 'logo' ? 2 : assetType === 'grid_l' ? 160 : 100,
  max: assetType === 'hero' ? 4 : assetType === 'logo' ? 6 : assetType === 'grid_l' ? 640 : assetType === 'grid_p' ? 300 : 200,
  step: assetType === 'hero' || assetType === 'logo' ? 1 : 5,
});

const AssetPreview = ({ asset, assetType }: { asset: SGDBAsset; assetType: SGDBAssetType }) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => Array.from(new Set([asset.thumb, asset.url].filter(Boolean))), [asset.thumb, asset.url]);
  const src = sources[sourceIndex] ?? '';

  if (!src) {
    return <div className="sgdbAssetMissing">No preview</div>;
  }

  if (isAnimatedAsset(src)) {
    return (
      <>
        <video className={`sgdbMedia sgdbMediaBlur ${assetType}`} src={src} muted loop autoPlay playsInline />
        <video className={`sgdbMedia ${assetType}`} src={src} muted loop autoPlay playsInline onError={() => setSourceIndex((current) => Math.min(current + 1, sources.length))} />
      </>
    );
  }

  return (
    <>
      <img className={`sgdbMedia sgdbMediaBlur ${assetType}`} src={src} alt="" loading="lazy" />
      <img className={`sgdbMedia ${assetType}`} src={src} alt="" loading="lazy" onError={() => setSourceIndex((current) => Math.min(current + 1, sources.length))} />
    </>
  );
};

const ExternalLinkIcon = () => (
  <svg className="sgdbExternalIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M8 5H5.75C4.78 5 4 5.78 4 6.75v11.5C4 19.22 4.78 20 5.75 20h11.5c.97 0 1.75-.78 1.75-1.75V16" />
    <path d="M13 4h7v7" />
    <path d="M11 13 20 4" />
  </svg>
);

const fileUrl = (path: string) => `file:///${path.replace(/\\/g, '/')}`;

const ManagePreview = ({ item, assetType }: { item?: CurrentArtworkState[SGDBAssetType]; assetType: SGDBAssetType }) => {
  if (!item?.path) {
    return <div className="sgdbManageMissing">Not set</div>;
  }

  const src = fileUrl(item.path);
  return (
    <div className={`sgdbManagePreview type-${assetType}`}>
      <img className={`sgdbMedia ${assetType}`} src={src} alt="" />
    </div>
  );
};

export const GamepadView = ({
  assetType,
  setAssetType,
  assetsByType,
  pagesByType,
  loadingByType,
  endReachedByType,
  filters,
  toggleFilter,
  zoomByType,
  zoomDefaults,
  setZoomByType,
  filtersOpen,
  setFiltersOpen,
  applyingId,
  applyAsset,
  openAssetPage,
  showExternalLinks,
  loadAssets,
  resetCurrentTab,
  resetArtwork,
  isGamepadUI = true,
  currentArtwork,
  refreshCurrentArtwork,
}: ViewProps) => {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>(assetType);
  const [visibleRowsByType, setVisibleRowsByType] = useState<Record<SGDBAssetType, number>>({
    grid_p: DEFAULT_VISIBLE_ROWS,
    grid_l: DEFAULT_VISIBLE_ROWS,
    hero: DEFAULT_VISIBLE_ROWS,
    logo: DEFAULT_VISIBLE_ROWS,
    icon: DEFAULT_VISIBLE_ROWS,
  });
  const [columnCount, setColumnCount] = useState(1);
  const tabAssets = assetsByType[assetType];
  const tabLoading = loadingByType[assetType];
  const tabEndReached = endReachedByType[assetType];
  const tabGridStyle = assetGridStyle(assetType, zoomByType[assetType]);
  const slider = sliderLimits(assetType);
  const sliderProgress = ((zoomByType[assetType] - slider.min) / (slider.max - slider.min)) * 100;
  const rawVisibleLimit = visibleRowsByType[assetType] * columnCount;
  const rawVisibleCount = Math.min(tabAssets.length, rawVisibleLimit);
  const hasMoreAfterRawVisible = tabAssets.length > rawVisibleCount || !tabEndReached;
  const visibleCount = hasMoreAfterRawVisible && rawVisibleCount >= columnCount
    ? Math.max(columnCount, Math.floor(rawVisibleCount / columnCount) * columnCount)
    : rawVisibleCount;
  const visibleAssets = tabAssets.slice(0, visibleCount);
  const hasHiddenLoadedAssets = tabAssets.length > visibleAssets.length;
  const canShowMore = tabAssets.length > 0 && (hasHiddenLoadedAssets || !tabEndReached);
  const isManageTab = activeTab === 'manage';
  const selectTab = (tab: ViewTab) => {
    setActiveTab(tab);
    if (tab !== 'manage') {
      setAssetType(tab);
    } else {
      void refreshCurrentArtwork();
    }
  };
  const showMoreAssets = () => {
    if (tabLoading) {
      return;
    }

    if (hasHiddenLoadedAssets || !tabEndReached) {
      setVisibleRowsByType((current) => ({ ...current, [assetType]: current[assetType] + DEFAULT_VISIBLE_ROWS }));
    }

    if (!tabEndReached) {
      void loadAssets(assetType, pagesByType[assetType] + 1, true);
    }
  };
  const resetCurrentArtwork = () => {
    void resetArtwork(assetType);
  };

  useEffect(() => {
    setVisibleRowsByType((current) => ({ ...current, [assetType]: DEFAULT_VISIBLE_ROWS }));
  }, [assetType, filters]);

  useEffect(() => {
    if (activeTab !== 'manage' && activeTab !== assetType) {
      setActiveTab(assetType);
    }
  }, [activeTab, assetType]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;

    const updateColumns = () => {
      const columns = window.getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumnCount(Math.max(1, columns));
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [assetType, zoomByType]);

  return (
    <>
      <Focusable className="sgdbManualTabs sgdbGamepadTabs" flow-children="row">
        {viewTabs.map((tab) => (
          <Focusable
            key={tab}
            className={`sgdbGamepadTab sgdbTextPill ${tab === activeTab ? 'selected' : ''} ${tab === 'manage' ? 'sgdbManageTab' : ''}`}
            onActivate={() => selectTab(tab)}
            onClick={() => selectTab(tab)}
            onOKActionDescription={tab === 'manage' ? 'MANAGE' : ASSET_LABEL[tab]}
            role="button"
          >
            {tab === 'manage' ? 'MANAGE' : ASSET_LABEL[tab]}
          </Focusable>
        ))}
      </Focusable>

      <div className="tabcontents-wrap">
        <div className={`spinnyboi ${!tabLoading ? 'loaded' : ''}`}>
          <img alt="Loading..." src="/images/steam_spinner.png" />
        </div>

        {isManageTab ? (
          <Focusable className="sgdbManageGrid" flow-children="right">
            <section className="sgdbManagePanel sgdbManagePanelCapsule">
              <h2>Current Grid</h2>
              <ManagePreview item={currentArtwork.grid_p} assetType="grid_p" />
            </section>
            <section className="sgdbManagePanel sgdbManagePanelWide">
              <h2>Current Wide Grid</h2>
              <ManagePreview item={currentArtwork.grid_l} assetType="grid_l" />
            </section>
            <section className="sgdbManagePanel sgdbManagePanelHero">
              <h2>Current Hero</h2>
              <ManagePreview item={currentArtwork.hero} assetType="hero" />
            </section>
            <section className="sgdbManagePanel sgdbManagePanelLogo">
              <h2>Current Logo</h2>
              <ManagePreview item={currentArtwork.logo} assetType="logo" />
            </section>
            <section className="sgdbManagePanel sgdbManagePanelIcon">
              <h2>Current Icon</h2>
              <ManagePreview item={currentArtwork.icon} assetType="icon" />
            </section>
          </Focusable>
        ) : (
          <>
        {isGamepadUI ? (
          <Focusable className="sgdb-asset-toolbar" flow-children="row">
            <Focusable className="filter-buttons" flow-children="row">
              <Focusable
                className={`sgdbFilterMainButton sgdbTextPill ${filtersOpen ? 'selected' : ''}`}
                onActivate={() => setFiltersOpen((open) => !open)}
                onClick={() => setFiltersOpen((open) => !open)}
                onOKActionDescription="Filter"
                role="button"
              >
                Filter
              </Focusable>
            </Focusable>
            <div className="sgdbSliderWithMarks">
              <SliderField
                className="size-slider"
                value={zoomByType[assetType]}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                showValue={false}
                bottomSeparator="none"
                onChange={(value) => setZoomByType((current) => ({ ...current, [assetType]: value }))}
              />
            </div>
            <Focusable className="sgdbResetButton sgdbTextPill" onActivate={resetCurrentArtwork} onClick={resetCurrentArtwork} role="button">
              Reset
            </Focusable>
          </Focusable>
        ) : (
          <div className="sgdb-asset-toolbar">
            <div className="filter-buttons">
              <button className={`sgdbFilterMainButton sgdbTextPill ${filtersOpen ? 'selected' : ''}`} type="button" onClick={() => setFiltersOpen((open) => !open)}>
                Filter
              </button>
            </div>
            <div className="sgdbDesktopSliderWrap" style={{ ['--sgdb-slider-progress' as string]: `${sliderProgress}%` }}>
              <input
                className="sgdbDesktopSlider"
                type="range"
                value={zoomByType[assetType]}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                onChange={(event) => {
                  const nextZoom = Number(event.currentTarget.value);
                  setZoomByType((current) => ({ ...current, [assetType]: nextZoom }));
                }}
              />
            </div>
            <button className="sgdbResetButton sgdbTextPill" type="button" onClick={resetCurrentArtwork}>Reset</button>
          </div>
        )}

        {filtersOpen ? (
          <Focusable className="sgdbFilterTray sgdbGamepadFilterNotice" flow-children="row">
            <div className="sgdbGamepadFilterToggles">
            {([
              ['static', 'Static'],
              ['animated', 'Animated'],
              ['adult', 'Adult'],
              ['humor', 'Humor'],
              ['epilepsy', 'Epilepsy'],
            ] as [keyof FilterState, string][]).map(([key, label]) => (
              <Focusable
                key={key}
                className={`sgdbFilterToggle sgdbTextPill ${filters[key] ? 'selected' : ''}`}
                onActivate={() => toggleFilter(key)}
                onClick={() => toggleFilter(key)}
                onOKActionDescription={label}
                role="button"
              >
                {label}
              </Focusable>
            ))}
            </div>
          </Focusable>
        ) : null}

        <button className="sgdbResultsState" type="button" onClick={() => setFiltersOpen((open) => !open)}>
          {tabLoading ? 'Loading' : `${tabAssets.length} ${ASSET_LABEL[assetType].toLowerCase()} results`}
        </button>

        <Focusable ref={gridRef} id="images-container" className={`sgdbGrid ${assetType}`} style={tabGridStyle} flow-children="right">
          {!tabLoading && visibleAssets.map((asset) => (
            <div className="asset-box-wrap" key={asset.id}>
              {(() => {
                const animated = isAnimatedAsset(asset.url) || isAnimatedAsset(asset.thumb);
                return (
              <Focusable
                className={`image-wrap sgdbAsset type-${assetType}`}
                style={{ paddingBottom: `${asset.width === asset.height ? 100 : (asset.height / asset.width) * 100}%` }}
                onActivate={() => applyAsset(asset, assetType)}
                onClick={() => applyAsset(asset, assetType)}
                onOKActionDescription={`Apply ${ASSET_LABEL[assetType]}`}
                onSecondaryActionDescription="Filter"
                onSecondaryButton={() => setFiltersOpen((open) => !open)}
                actionDescriptionMap={{
                  [GamepadButton.BUMPER_LEFT]: 'Previous Tab',
                  [GamepadButton.BUMPER_RIGHT]: 'Next Tab',
                }}
                role="button"
              >
                <AssetPreview asset={asset} assetType={assetType} />
                {showExternalLinks ? (
                  <button
                    className="sgdbExternalLinkButton"
                    type="button"
                    aria-label="Open on SteamGridDB"
                    title="Open on SteamGridDB"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void openAssetPage(asset, assetType);
                    }}
                  >
                    <ExternalLinkIcon />
                  </button>
                ) : null}
                <div className="sgdbChips">
                  {animated ? <span className="animated">Animated</span> : null}
                  {asset.nsfw ? <span className="nsfw">Adult</span> : null}
                  {asset.humor ? <span className="humor">Humor</span> : null}
                  {asset.epilepsy ? <span className="epilepsy">Epilepsy</span> : null}
                </div>
                {applyingId === asset.id ? (
                  <div className="dload-overlay downloading">
                    <div className="sgdbApplyStatus">
                      <Spinner />
                    </div>
                  </div>
                ) : null}
              </Focusable>
                );
              })()}
              {asset.author?.name ? <div className="author"><span>{asset.author.name}</span></div> : null}
            </div>
          ))}
          {tabAssets.length === 0 && !tabLoading ? (
            <div className="sgdbEmpty">
              No {ASSET_LABEL[assetType].toLowerCase()} artwork found for this Steam app.
              <DialogButton onClick={resetCurrentTab}>Retry</DialogButton>
            </div>
          ) : null}
        </Focusable>

        {canShowMore ? (
          <Focusable
            className={`sgdbMoreButton sgdbTextPill ${tabLoading ? 'disabled' : ''}`}
            onActivate={() => {
              showMoreAssets();
            }}
            onClick={() => {
              showMoreAssets();
            }}
            onOKActionDescription="More"
            role="button"
          >
            More
          </Focusable>
        ) : null}
          </>
        )}
      </div>
    </>
  );
};
