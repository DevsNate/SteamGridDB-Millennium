import { DialogButton, Focusable, GamepadButton, SliderField, Spinner } from '@steambrew/client';
import { Dispatch, SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { columnsToSliderValue, sliderRange, sliderValueToColumns } from '../layout';
import type { AssetDensityState } from '../layout';
import type { AssetState, EndState, ErrorState, FilterState, LoadingState, PageState, SGDBAsset, SGDBAssetType } from '../index';

type ViewProps = {
  assetType: SGDBAssetType;
  setAssetType: Dispatch<SetStateAction<SGDBAssetType>>;
  assetsByType: AssetState;
  pagesByType: PageState;
  loadingByType: LoadingState;
  endReachedByType: EndState;
  loadErrorByType: ErrorState;
  filters: FilterState;
  toggleFilter: (key: keyof FilterState) => void;
  densityByType: AssetDensityState;
  setDensityByType: Dispatch<SetStateAction<AssetDensityState>>;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  applyingId: number | null;
  applyAsset: (asset: SGDBAsset, type: SGDBAssetType) => Promise<void>;
  openAssetPage: (asset: SGDBAsset, type: SGDBAssetType) => Promise<void>;
  openCollectionPicker: (asset: SGDBAsset, type: SGDBAssetType, anchor: EventTarget) => void;
  showExternalLinks: boolean;
  showCollectionButtons: boolean;
  showCreatorNames: boolean;
  loadAssets: (type: SGDBAssetType, nextPage?: number, append?: boolean) => Promise<void>;
  resetCurrentTab: () => void;
  retryCurrentLoad: () => void;
  resetArtwork: (type: SGDBAssetType) => Promise<void>;
  isGamepadUI?: boolean;
};

const ASSET_LABEL: Record<SGDBAssetType, string> = {
  grid_p: 'GRID',
  grid_l: 'WIDE GRID',
  hero: 'HERO',
  logo: 'LOGO',
  icon: 'ICON',
};

const tabs = Object.keys(ASSET_LABEL) as SGDBAssetType[];
type ViewTab = SGDBAssetType;
const viewTabs: ViewTab[] = tabs;
const VIEW_LABEL: Record<ViewTab, string> = {
  ...ASSET_LABEL,
};
type FocusZone = 'tabs' | 'content';
const isAnimatedAsset = (src: string) => /\.(webm|mp4)(\?|$)/i.test(src);
const DEFAULT_VISIBLE_ROWS = 7;

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

const AddToCollectionIcon = () => (
  <svg className="sgdbCollectionAddIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const GamepadView = ({
  assetType,
  setAssetType,
  assetsByType,
  pagesByType,
  loadingByType,
  endReachedByType,
  loadErrorByType,
  filters,
  toggleFilter,
  densityByType,
  setDensityByType,
  filtersOpen,
  setFiltersOpen,
  applyingId,
  applyAsset,
  openAssetPage,
  openCollectionPicker,
  showExternalLinks,
  showCollectionButtons,
  showCreatorNames,
  loadAssets,
  resetCurrentTab,
  retryCurrentLoad,
  resetArtwork,
  isGamepadUI = true,
}: ViewProps) => {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<ViewTab>(assetType);
  const internalTabChangeRef = useRef(false);
  const lastBumperAtRef = useRef(0);
  const pendingArtworkFocusRef = useRef(true);
  const preserveScrollTopRef = useRef<number | null>(null);
  const lastFocusedAssetIdRef = useRef<number | null>(null);
  const restoreAssetFocusIdRef = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const autoLoadPendingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<ViewTab>(assetType);
  const [focusZone, setFocusZone] = useState<FocusZone>('content');
  const [autoLoadReadyType, setAutoLoadReadyType] = useState<SGDBAssetType | null>(null);
  const [visibleRowsByType, setVisibleRowsByType] = useState<Record<SGDBAssetType, number>>({
    grid_p: DEFAULT_VISIBLE_ROWS,
    grid_l: DEFAULT_VISIBLE_ROWS,
    hero: DEFAULT_VISIBLE_ROWS,
    logo: DEFAULT_VISIBLE_ROWS,
    icon: DEFAULT_VISIBLE_ROWS,
  });
  const tabAssets = assetsByType[assetType];
  const tabLoading = loadingByType[assetType];
  const tabEndReached = endReachedByType[assetType];
  const tabError = loadErrorByType[assetType];
  const slider = sliderRange(assetType);
  const columnCount = densityByType[assetType];
  const currentSliderValue = columnsToSliderValue(assetType, columnCount);
  const tabGridStyle = { ['--asset-columns' as string]: columnCount };
  const sliderProgress = ((currentSliderValue - slider.min) / (slider.max - slider.min)) * 100;
  const rawVisibleLimit = visibleRowsByType[assetType] * columnCount;
  const rawVisibleCount = Math.min(tabAssets.length, rawVisibleLimit);
  const hasMoreAfterRawVisible = tabAssets.length > rawVisibleCount || !tabEndReached;
  const visibleCount = hasMoreAfterRawVisible && rawVisibleCount >= columnCount
    ? Math.max(columnCount, Math.floor(rawVisibleCount / columnCount) * columnCount)
    : rawVisibleCount;
  const visibleAssets = tabAssets.slice(0, visibleCount);
  const hasHiddenLoadedAssets = tabAssets.length > visibleAssets.length;
  const canShowMore = !tabError && tabAssets.length > 0 && (hasHiddenLoadedAssets || !tabEndReached);
  const selectTab = useCallback((tab: ViewTab) => {
    activeTabRef.current = tab;
    setActiveTab(tab);
    internalTabChangeRef.current = true;
    pendingArtworkFocusRef.current = true;
    setAutoLoadReadyType(isGamepadUI ? null : tab);
    setFocusZone('content');
    setAssetType(tab);
  }, [isGamepadUI, setAssetType]);
  const selectRelativeTab = useCallback((direction: 1 | -1) => {
    const index = viewTabs.indexOf(activeTabRef.current);
    const next = viewTabs[(index + direction + viewTabs.length) % viewTabs.length];
    selectTab(next);
  }, [selectTab]);
  const handleTabBumper = useCallback((event: CustomEvent<{ button: number }>) => {
    const isLeft = event.detail.button === GamepadButton.BUMPER_LEFT;
    const isRight = event.detail.button === GamepadButton.BUMPER_RIGHT;
    if (!isLeft && !isRight) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const now = Date.now();
    if (now - lastBumperAtRef.current < 180) {
      return;
    }
    lastBumperAtRef.current = now;

    if (isLeft) {
      event.preventDefault();
      event.stopPropagation();
      selectRelativeTab(-1);
    }

    if (isRight) {
      event.preventDefault();
      event.stopPropagation();
      selectRelativeTab(1);
    }
  }, [selectRelativeTab]);
  const revealFocusedEdge = useCallback((target: HTMLElement, edge: 'top' | 'bottom') => {
    window.requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: edge === 'top' ? 'start' : 'end',
        inline: 'nearest',
      });
    });
  }, []);
  const revealToolbar = useCallback(() => {
    setFocusZone('content');
    const target = toolbarRef.current?.closest('.sgdbRoot')?.querySelector<HTMLElement>('.sgdbGamepadTabs') ?? toolbarRef.current;
    if (target) {
      revealFocusedEdge(target, 'top');
    }
  }, [revealFocusedEdge]);
  const clearTabFocusArtifacts = useCallback(() => {
    document.querySelectorAll<HTMLElement>('.sgdbGamepadTab.gpfocus, .sgdbGamepadTab:focus').forEach((tab) => {
      tab.classList.remove('gpfocus');
      tab.blur();
    });
  }, []);
  const focusFirstAssetAfterApply = useCallback(() => {
    if (!isGamepadUI) {
      return;
    }

    let attempts = 0;
    const restoreFocus = () => {
      attempts += 1;
      clearTabFocusArtifacts();
      const target = gridRef.current?.querySelector<HTMLElement>('.image-wrap.sgdbAsset');

      if (!target) {
        if (attempts < 8) {
          window.setTimeout(restoreFocus, 50);
        } else {
          pendingArtworkFocusRef.current = true;
        }
        return;
      }

      setFocusZone('content');
      target.setAttribute('tabindex', '0');
      if (document.activeElement instanceof HTMLElement && document.activeElement !== target) {
        document.activeElement.blur();
      }
      target.focus();
    };

    [80, 180, 360, 700, 1100].forEach((delay) => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(restoreFocus));
      }, delay);
    });
  }, [clearTabFocusArtifacts, isGamepadUI]);
  const applyAssetAndRestoreFocus = useCallback(async (asset: SGDBAsset, type: SGDBAssetType) => {
    activeTabRef.current = type;
    pendingArtworkFocusRef.current = false;
    setFocusZone('content');

    try {
      await applyAsset(asset, type);
    } finally {
      activeTabRef.current = type;
      internalTabChangeRef.current = false;
      pendingArtworkFocusRef.current = true;
      setFocusZone('content');
      focusFirstAssetAfterApply();
    }
  }, [applyAsset, focusFirstAssetAfterApply]);
  const showMoreAssets = useCallback(() => {
    if (tabLoading || autoLoadPendingRef.current) {
      return;
    }

    autoLoadPendingRef.current = true;
    const scroller = gridRef.current?.closest<HTMLElement>('.tabcontents-wrap');
    if (isGamepadUI) {
      preserveScrollTopRef.current = scroller?.scrollTop ?? null;
      const lastFocusedAssetId = lastFocusedAssetIdRef.current;
      restoreAssetFocusIdRef.current = lastFocusedAssetId && visibleAssets.some((asset) => asset.id === lastFocusedAssetId)
        ? lastFocusedAssetId
        : null;
    } else {
      preserveScrollTopRef.current = null;
      restoreAssetFocusIdRef.current = null;
    }

    if (hasHiddenLoadedAssets || !tabEndReached) {
      setVisibleRowsByType((current) => ({ ...current, [assetType]: current[assetType] + DEFAULT_VISIBLE_ROWS }));
    }

    if (!tabEndReached) {
      void loadAssets(assetType, pagesByType[assetType] + 1, true);
    }
  }, [assetType, hasHiddenLoadedAssets, isGamepadUI, loadAssets, pagesByType, tabEndReached, tabLoading, visibleAssets]);
  const resetCurrentArtwork = () => {
    void resetArtwork(assetType);
  };

  useEffect(() => {
    setVisibleRowsByType({
      grid_p: DEFAULT_VISIBLE_ROWS,
      grid_l: DEFAULT_VISIBLE_ROWS,
      hero: DEFAULT_VISIBLE_ROWS,
      logo: DEFAULT_VISIBLE_ROWS,
      icon: DEFAULT_VISIBLE_ROWS,
    });
  }, [filters]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (internalTabChangeRef.current) {
      internalTabChangeRef.current = false;
      return;
    }

    if (activeTab !== assetType) {
      activeTabRef.current = assetType;
      setActiveTab(assetType);
    }
  }, [activeTab, assetType]);

  useEffect(() => {
    if (!isGamepadUI || !pendingArtworkFocusRef.current || tabLoading || visibleAssets.length === 0) {
      return;
    }

    pendingArtworkFocusRef.current = false;
    let attempts = 0;
    const focusFirstAsset = () => {
      attempts += 1;
      clearTabFocusArtifacts();
      const target = gridRef.current?.querySelector<HTMLElement>('.image-wrap.sgdbAsset');
      if (!target) {
        if (attempts < 8) {
          window.setTimeout(focusFirstAsset, 50);
        } else {
          pendingArtworkFocusRef.current = true;
        }
        return;
      }

      setFocusZone('content');
      const targetAssetId = Number(target.dataset.sgdbAssetId);
      if (Number.isFinite(targetAssetId)) {
        lastFocusedAssetIdRef.current = targetAssetId;
      }
      target.setAttribute('tabindex', '0');
      if (document.activeElement instanceof HTMLElement && document.activeElement !== target) {
        document.activeElement.blur();
      }
      target.focus();
      setAutoLoadReadyType(assetType);
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(focusFirstAsset));
  }, [assetType, clearTabFocusArtifacts, isGamepadUI, tabLoading, visibleAssets.length]);

  useEffect(() => {
    autoLoadPendingRef.current = false;
  }, [assetType, tabLoading, visibleAssets.length]);

  useEffect(() => {
    if (!isGamepadUI) {
      setAutoLoadReadyType(assetType);
    }
  }, [assetType, isGamepadUI]);

  useEffect(() => {
    const scroller = gridRef.current?.closest<HTMLElement>('.tabcontents-wrap');
    if (!scroller || autoLoadReadyType !== assetType || !canShowMore) {
      return undefined;
    }

    const maybeLoadMore = () => {
      const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (distanceToBottom <= Math.max(480, scroller.clientHeight * 0.35)) {
        showMoreAssets();
      }
    };

    scroller.addEventListener('scroll', maybeLoadMore, { passive: true });
    maybeLoadMore();
    return () => scroller.removeEventListener('scroll', maybeLoadMore);
  }, [assetType, autoLoadReadyType, canShowMore, showMoreAssets, visibleAssets.length]);

  useLayoutEffect(() => {
    if (preserveScrollTopRef.current === null && restoreAssetFocusIdRef.current === null) {
      return;
    }

    const scrollTop = preserveScrollTopRef.current;
    preserveScrollTopRef.current = null;
    const restoreAssetId = restoreAssetFocusIdRef.current;
    restoreAssetFocusIdRef.current = null;
    const scroller = gridRef.current?.closest<HTMLElement>('.tabcontents-wrap');
    if (scroller && scrollTop !== null) {
      scroller.scrollTop = scrollTop;
      window.requestAnimationFrame(() => {
        scroller.scrollTop = scrollTop;
      });
    }

    if (restoreAssetId !== null) {
      window.requestAnimationFrame(() => {
        const target = gridRef.current?.querySelector<HTMLElement>(`[data-sgdb-asset-id="${restoreAssetId}"]`);
        target?.focus();
      });
    }
  }, [tabLoading, visibleAssets.length]);

  return (
    <>
      {isGamepadUI ? (
        <div className="sgdbResultsState" aria-live="polite">
          {tabLoading ? 'Loading' : `${tabAssets.length} ${ASSET_LABEL[assetType].toLowerCase()} results`}
        </div>
      ) : null}

      <div className="sgdbManualTabs sgdbGamepadTabs">
        {viewTabs.map((tab) => (
          <button
            key={tab}
            className={`sgdbGamepadTab sgdbTextPill ${tab === activeTab ? 'selected' : ''} ${tab === activeTab && focusZone === 'tabs' ? 'tabFocus' : 'contentFocus'}`}
            type="button"
            tabIndex={-1}
            onPointerDown={(event) => {
              if (event.pointerType !== 'mouse' && event.pointerType !== 'touch') {
                return;
              }
              event.preventDefault();
              selectTab(tab);
            }}
            onClick={() => selectTab(tab)}
          >
            {VIEW_LABEL[tab]}
          </button>
        ))}
      </div>

      <div className="tabcontents-wrap">
        {!isGamepadUI ? (
          <div className="sgdbResultsState" aria-live="polite">
            {tabLoading ? 'Loading' : `${tabAssets.length} ${ASSET_LABEL[assetType].toLowerCase()} results`}
          </div>
        ) : null}

        <div className={`spinnyboi ${!tabLoading || tabAssets.length > 0 ? 'loaded' : ''}`}>
          <img alt="Loading..." src="/images/steam_spinner.png" />
        </div>

        <>
        {isGamepadUI ? (
          <Focusable ref={toolbarRef} className="sgdb-asset-toolbar" flow-children="row" onGamepadFocus={revealToolbar} onMouseEnter={() => setFocusZone('content')} onButtonDown={handleTabBumper}>
            <Focusable className="filter-buttons" flow-children="row">
              <Focusable
                className={`sgdbFilterMainButton sgdbTextPill ${filtersOpen ? 'selected' : ''}`}
                onActivate={() => setFiltersOpen((open) => !open)}
                onClick={() => setFiltersOpen((open) => !open)}
                onGamepadFocus={revealToolbar}
                onOKActionDescription="Filter"
                role="button"
              >
                Filter
              </Focusable>
            </Focusable>
            <div className="sgdbDensityControl">
              <div className="sgdbSliderWithMarks" onFocusCapture={revealToolbar} onMouseEnter={() => setFocusZone('content')} style={{ ['--sgdb-slider-progress' as string]: `${sliderProgress}%` }}>
                <SliderField
                  className="size-slider"
                  value={currentSliderValue}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  showValue={false}
                  editableValue={false}
                  onChange={(value) => {
                    const nextColumns = sliderValueToColumns(assetType, Number(value));
                    setDensityByType((current) => ({ ...current, [assetType]: nextColumns }));
                  }}
                />
              </div>
              <span className="sgdbDensityValue" aria-live="polite">{columnCount} per row</span>
            </div>
            <Focusable className="sgdbResetButton sgdbTextPill" onActivate={resetCurrentArtwork} onClick={resetCurrentArtwork} onGamepadFocus={revealToolbar} role="button">
              Reset Artwork
            </Focusable>
          </Focusable>
        ) : (
          <div className="sgdb-asset-toolbar">
            <div className="filter-buttons">
              <button className={`sgdbFilterMainButton sgdbTextPill ${filtersOpen ? 'selected' : ''}`} type="button" onClick={() => setFiltersOpen((open) => !open)}>
                Filter
              </button>
            </div>
            <div className="sgdbDensityControl">
              <div className="sgdbDesktopSliderWrap" style={{ ['--sgdb-slider-progress' as string]: `${sliderProgress}%` }}>
                <input
                  className="sgdbDesktopSlider"
                  type="range"
                  aria-label={`${ASSET_LABEL[assetType]} preview size, ${columnCount} per row`}
                  value={currentSliderValue}
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  onChange={(event) => {
                    const nextColumns = sliderValueToColumns(assetType, Number(event.currentTarget.value));
                    setDensityByType((current) => ({ ...current, [assetType]: nextColumns }));
                  }}
                />
              </div>
              <span className="sgdbDensityValue" aria-live="polite">{columnCount} per row</span>
            </div>
            <button className="sgdbResetButton sgdbTextPill" type="button" onClick={resetCurrentArtwork}>Reset Artwork</button>
          </div>
        )}

        {filtersOpen ? (
          <Focusable className="sgdbFilterTray sgdbGamepadFilterNotice" flow-children="row" onGamepadFocus={revealToolbar} onFocusCapture={revealToolbar}>
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
                onGamepadFocus={revealToolbar}
                onOKActionDescription={label}
                role="button"
              >
                {label}
              </Focusable>
            ))}
            </div>
          </Focusable>
        ) : null}

        <Focusable key={assetType} ref={gridRef} id="images-container" className={`sgdbGrid ${assetType} ${canShowMore ? 'hasMore' : ''} ${filtersOpen ? 'filtersOpen' : ''}`} style={tabGridStyle} flow-children="right" onGamepadFocus={() => setFocusZone('content')} onMouseEnter={() => setFocusZone('content')} onButtonDown={handleTabBumper}>
          {visibleAssets.map((asset) => (
            <div className="asset-box-wrap" key={`${assetType}-${asset.id}`}>
              {(() => {
                const animated = isAnimatedAsset(asset.url) || isAnimatedAsset(asset.thumb);
                return (
              <Focusable
                className={`image-wrap sgdbAsset type-${assetType}`}
                tabIndex={0}
                data-sgdb-asset-id={asset.id}
                onActivate={() => void applyAssetAndRestoreFocus(asset, assetType)}
                onClick={() => void applyAssetAndRestoreFocus(asset, assetType)}
                onOKActionDescription={`Apply ${ASSET_LABEL[assetType]}`}
                onSecondaryActionDescription="Filter"
                onSecondaryButton={() => setFiltersOpen((open) => !open)}
                onGamepadFocus={() => {
                  lastFocusedAssetIdRef.current = asset.id;
                  setFocusZone('content');
                }}
                onFocus={() => {
                  lastFocusedAssetIdRef.current = asset.id;
                  setFocusZone('content');
                }}
                onMouseEnter={() => setFocusZone('content')}
                onButtonDown={handleTabBumper}
                role="button"
              >
                <AssetPreview asset={asset} assetType={assetType} />
                {showCollectionButtons ? (
                  <button
                    className="sgdbCollectionAddButton"
                    type="button"
                    aria-label="Add to collection"
                    title="Add to collection"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openCollectionPicker(asset, assetType, event.currentTarget);
                    }}
                  >
                    <AddToCollectionIcon />
                  </button>
                ) : null}
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
              {showCreatorNames && asset.author?.name ? <div className="author"><span>{asset.author.name}</span></div> : null}
            </div>
          ))}
          {tabAssets.length === 0 && !tabLoading ? (
            <div className="sgdbEmpty">
              {tabError
                ? `Could not load ${ASSET_LABEL[assetType].toLowerCase()} artwork: ${tabError}`
                : `No ${ASSET_LABEL[assetType].toLowerCase()} artwork found for this Steam app.`}
              <DialogButton onClick={tabError ? retryCurrentLoad : resetCurrentTab}>Retry</DialogButton>
            </div>
          ) : null}
        </Focusable>

        {tabError && tabAssets.length > 0 && !tabLoading ? (
          <div className="sgdbEmpty" role="alert">
            Could not load more {ASSET_LABEL[assetType].toLowerCase()} artwork: {tabError}
            <DialogButton onClick={retryCurrentLoad}>Retry</DialogButton>
          </div>
        ) : null}

        {canShowMore ? <div className={`sgdbMoreRevealSpacer ${tabLoading ? 'loading' : ''}`} aria-hidden="true" /> : null}
        </>
      </div>
    </>
  );
};
