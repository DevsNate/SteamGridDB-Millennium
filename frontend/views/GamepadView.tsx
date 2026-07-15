import { DialogButton, Dropdown, Focusable, GamepadButton, Spinner } from '@steambrew/client';
import { Dispatch, SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { columnOptions } from '../layout';
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
  originalAppIdText: string;
  lookupAppIdText: string;
  lookupAppIdDraft: string;
  setLookupAppIdDraft: Dispatch<SetStateAction<string>>;
  confirmLookupAppId: () => void;
  resetLookupAppId: () => void;
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
const MIN_VERTICAL_ROW_GAP = 12;
const MAX_VERTICAL_ROW_GAP = 44;
const VERTICAL_FIT_EDGE_INSET = 4;

type VerticalFit = {
  rowGap: number;
  paddingTop: number;
  rows: number;
  exact: boolean;
};

const emptyVerticalFits = (): Record<SGDBAssetType, VerticalFit | null> => ({
  grid_p: null,
  grid_l: null,
  hero: null,
  logo: null,
  icon: null,
});

const emptyScrollTops = (): Record<SGDBAssetType, number> => ({
  grid_p: 0,
  grid_l: 0,
  hero: 0,
  logo: 0,
  icon: 0,
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

const AddToCollectionIcon = () => (
  <svg className="sgdbCollectionAddIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ResetIdIcon = () => (
  <svg className="sgdbToolbarIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 4v6h6" />
    <path d="M5.6 15.5A7.5 7.5 0 1 0 6 7.8L4 10" />
  </svg>
);

const ConfirmIdIcon = () => (
  <svg className="sgdbToolbarIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m5 12 4.2 4.2L19 6.5" />
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
  originalAppIdText,
  lookupAppIdText,
  lookupAppIdDraft,
  setLookupAppIdDraft,
  confirmLookupAppId,
  resetLookupAppId,
  isGamepadUI = true,
}: ViewProps) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<ViewTab>(assetType);
  const previousAssetTypeRef = useRef<SGDBAssetType>(assetType);
  const scrollTopByTypeRef = useRef<Record<SGDBAssetType, number>>(emptyScrollTops());
  const pendingTabScrollRestoreRef = useRef<SGDBAssetType | null>(null);
  const internalTabChangeRef = useRef(false);
  const lastBumperAtRef = useRef(0);
  const pendingArtworkFocusRef = useRef(true);
  const preserveScrollTopRef = useRef<number | null>(null);
  const lastFocusedAssetIdRef = useRef<number | null>(null);
  const restoreAssetFocusIdRef = useRef<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const autoLoadPendingRef = useRef(false);
  const verticalFitFrameRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>(assetType);
  const [focusZone, setFocusZone] = useState<FocusZone>('content');
  const [autoLoadReadyType, setAutoLoadReadyType] = useState<SGDBAssetType | null>(null);
  const [verticalFitByType, setVerticalFitByType] = useState<Record<SGDBAssetType, VerticalFit | null>>(() => emptyVerticalFits());
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
  const columnCount = densityByType[assetType];
  const columns = useMemo(() => columnOptions(assetType).map((value) => ({
    data: value,
    label: `${value} columns`,
  })), [assetType]);
  const verticalFit = verticalFitByType[assetType];
  const tabGridStyle = {
    ['--asset-columns' as string]: columnCount,
    ...(verticalFit ? {
      ['--sgdb-grid-row-gap' as string]: `${verticalFit.rowGap}px`,
      ['--sgdb-grid-padding-top' as string]: `${verticalFit.paddingTop}px`,
    } : {}),
  };
  const rawVisibleLimit = visibleRowsByType[assetType] * columnCount;
  const rawVisibleCount = Math.min(tabAssets.length, rawVisibleLimit);
  const hasMoreAfterRawVisible = tabAssets.length > rawVisibleCount || !tabEndReached;
  const visibleCount = hasMoreAfterRawVisible && rawVisibleCount >= columnCount
    ? Math.max(columnCount, Math.floor(rawVisibleCount / columnCount) * columnCount)
    : rawVisibleCount;
  const visibleAssets = tabAssets.slice(0, visibleCount);
  const hasHiddenLoadedAssets = tabAssets.length > visibleAssets.length;
  const canShowMore = !tabError && tabAssets.length > 0 && (hasHiddenLoadedAssets || !tabEndReached);
  const getGridElement = useCallback(
    () => scrollerRef.current?.querySelector<HTMLElement>('.sgdbGrid') ?? null,
    [],
  );
  const selectTab = useCallback((tab: ViewTab) => {
    if (tab === activeTabRef.current) {
      return;
    }

    const scroller = scrollerRef.current;
    if (scroller) {
      scrollTopByTypeRef.current[activeTabRef.current] = scroller.scrollTop;
    }
    pendingTabScrollRestoreRef.current = tab;
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
      const target = getGridElement()?.querySelector<HTMLElement>('.image-wrap.sgdbAsset');

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
  }, [clearTabFocusArtifacts, getGridElement, isGamepadUI]);
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
    const scroller = scrollerRef.current;
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

  const updateVerticalFit = useCallback((nextFit: VerticalFit | null) => {
    setVerticalFitByType((current) => {
      const previous = current[assetType];
      const unchanged = previous === nextFit || (
        previous !== null
        && nextFit !== null
        && previous.rows === nextFit.rows
        && previous.exact === nextFit.exact
        && Math.abs(previous.rowGap - nextFit.rowGap) < 0.25
        && Math.abs(previous.paddingTop - nextFit.paddingTop) < 0.25
      );
      return unchanged ? current : { ...current, [assetType]: nextFit };
    });
  }, [assetType]);

  const measureVerticalFit = useCallback(() => {
    const grid = getGridElement();
    const scroller = scrollerRef.current;
    if (!grid || !scroller || visibleAssets.length === 0) {
      updateVerticalFit(null);
      return;
    }

    const items = Array.from(grid.querySelectorAll<HTMLElement>(':scope > .asset-box-wrap'));
    if (items.length === 0) {
      updateVerticalFit(null);
      return;
    }

    const rowGroups: { top: number; height: number }[] = [];
    items.forEach((item) => {
      const top = item.offsetTop;
      const height = item.getBoundingClientRect().height;
      const row = rowGroups.find((candidate) => Math.abs(candidate.top - top) <= 2);
      if (row) {
        row.height = Math.max(row.height, height);
      } else {
        rowGroups.push({ top, height });
      }
    });
    rowGroups.sort((left, right) => left.top - right.top);

    const scrollerRect = scroller.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const viewportHeight = Math.min(
      scroller.clientHeight,
      Math.max(0, window.innerHeight - Math.max(0, scrollerRect.top)),
    );
    const gridTopAtRest = gridRect.top - scrollerRect.top + scroller.scrollTop;
    const availableHeight = viewportHeight - gridTopAtRest - VERTICAL_FIT_EDGE_INSET;

    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      updateVerticalFit(null);
      return;
    }

    let fittedRows = 0;
    let fittedArtworkHeight = 0;
    for (const row of rowGroups) {
      const nextRows = fittedRows + 1;
      const nextArtworkHeight = fittedArtworkHeight + row.height;
      if (nextArtworkHeight + (nextRows * MIN_VERTICAL_ROW_GAP) > availableHeight) {
        break;
      }
      fittedRows = nextRows;
      fittedArtworkHeight = nextArtworkHeight;
    }

    const hasFollowingRow = fittedRows < rowGroups.length || canShowMore;
    if (fittedRows === 0 || !hasFollowingRow) {
      updateVerticalFit(null);
      return;
    }

    const idealGap = (availableHeight - fittedArtworkHeight) / fittedRows;
    const rowGap = Math.max(MIN_VERTICAL_ROW_GAP, Math.min(MAX_VERTICAL_ROW_GAP, idealGap));
    updateVerticalFit({
      rowGap,
      paddingTop: rowGap / 2,
      rows: fittedRows,
      exact: idealGap <= MAX_VERTICAL_ROW_GAP,
    });
  }, [canShowMore, getGridElement, updateVerticalFit, visibleAssets.length]);

  const scheduleVerticalFit = useCallback(() => {
    if (verticalFitFrameRef.current !== null) {
      window.cancelAnimationFrame(verticalFitFrameRef.current);
    }
    verticalFitFrameRef.current = window.requestAnimationFrame(() => {
      verticalFitFrameRef.current = null;
      measureVerticalFit();
    });
  }, [measureVerticalFit]);

  useEffect(() => {
    setVisibleRowsByType({
      grid_p: DEFAULT_VISIBLE_ROWS,
      grid_l: DEFAULT_VISIBLE_ROWS,
      hero: DEFAULT_VISIBLE_ROWS,
      logo: DEFAULT_VISIBLE_ROWS,
      icon: DEFAULT_VISIBLE_ROWS,
    });
  }, [filters]);

  useLayoutEffect(() => {
    scrollTopByTypeRef.current = emptyScrollTops();
    pendingTabScrollRestoreRef.current = activeTabRef.current;
  }, [filters]);

  useLayoutEffect(() => {
    const tabsElement = tabsRef.current;
    const scroller = scrollerRef.current;
    if (!tabsElement || !scroller) {
      return undefined;
    }

    let frame: number | null = null;
    let disposed = false;
    const updateToolbarGeometry = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const width = Math.ceil(tabsElement.getBoundingClientRect().width);
        if (width > 0) {
          scroller.style.setProperty('--sgdb-tab-island-width', `${width}px`);
        }

        const toolbarElement = toolbarRef.current;
        const closeElement = document.querySelector<HTMLElement>(
          'button[aria-label="Close"], button[title="Close"], [class*="CloseButton"], [class*="closeButton"]',
        );
        if (toolbarElement && closeElement) {
          const toolbarRect = toolbarElement.getBoundingClientRect();
          const closeRect = closeElement.getBoundingClientRect();
          const toolbarRightPadding = Number.parseFloat(window.getComputedStyle(toolbarElement).paddingRight) || 0;
          const toolbarContentRight = toolbarRect.right - toolbarRightPadding;
          const closeSafePadding = Math.max(0, Math.ceil(toolbarContentRight - closeRect.left));
          scroller.style.setProperty('--sgdb-close-safe-padding', `${closeSafePadding}px`);
        } else {
          scroller.style.setProperty('--sgdb-close-safe-padding', '0px');
        }
      });
    };

    updateToolbarGeometry();
    document.fonts?.ready.then(() => {
      if (!disposed) updateToolbarGeometry();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateToolbarGeometry);
    observer?.observe(tabsElement);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    window.addEventListener('resize', updateToolbarGeometry);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', updateToolbarGeometry);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      scroller.style.removeProperty('--sgdb-tab-island-width');
      scroller.style.removeProperty('--sgdb-close-safe-padding');
    };
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const previousType = previousAssetTypeRef.current;
    if (previousType !== assetType && pendingTabScrollRestoreRef.current !== assetType) {
      scrollTopByTypeRef.current[previousType] = scroller.scrollTop;
      pendingTabScrollRestoreRef.current = assetType;
    }
    previousAssetTypeRef.current = assetType;

    if (pendingTabScrollRestoreRef.current !== assetType) {
      return;
    }

    pendingTabScrollRestoreRef.current = null;
    const restoreTop = scrollTopByTypeRef.current[assetType];
    scroller.scrollTop = restoreTop;
    window.requestAnimationFrame(() => {
      if (previousAssetTypeRef.current === assetType) {
        scroller.scrollTop = restoreTop;
      }
    });
  }, [assetType, tabLoading, visibleAssets.length]);

  useEffect(() => {
    const grid = getGridElement();
    const scroller = scrollerRef.current;
    scheduleVerticalFit();

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleVerticalFit);
    if (grid) observer?.observe(grid);
    if (scroller) observer?.observe(scroller);
    window.addEventListener('resize', scheduleVerticalFit);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleVerticalFit);
      if (verticalFitFrameRef.current !== null) {
        window.cancelAnimationFrame(verticalFitFrameRef.current);
        verticalFitFrameRef.current = null;
      }
    };
  }, [assetType, columnCount, filtersOpen, getGridElement, scheduleVerticalFit, showCreatorNames, visibleAssets.length]);

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
      const target = getGridElement()?.querySelector<HTMLElement>('.image-wrap.sgdbAsset');
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
  }, [assetType, clearTabFocusArtifacts, getGridElement, isGamepadUI, tabLoading, visibleAssets.length]);

  useEffect(() => {
    autoLoadPendingRef.current = false;
  }, [assetType, tabLoading, visibleAssets.length]);

  useEffect(() => {
    if (!isGamepadUI) {
      setAutoLoadReadyType(assetType);
    }
  }, [assetType, isGamepadUI]);

  useEffect(() => {
    const scroller = scrollerRef.current;
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
    const scroller = scrollerRef.current;
    if (scroller && scrollTop !== null) {
      scroller.scrollTop = scrollTop;
      window.requestAnimationFrame(() => {
        scroller.scrollTop = scrollTop;
      });
    }

    if (restoreAssetId !== null) {
      window.requestAnimationFrame(() => {
        const target = getGridElement()?.querySelector<HTMLElement>(`[data-sgdb-asset-id="${restoreAssetId}"]`);
        target?.focus();
      });
    }
  }, [getGridElement, tabLoading, visibleAssets.length]);

  const normalizedLookupDraft = /^\d+$/.test(lookupAppIdDraft.trim())
    && Number.parseInt(lookupAppIdDraft, 10) > 0
    ? String(Number.parseInt(lookupAppIdDraft, 10))
    : null;
  const canConfirmLookupAppId = normalizedLookupDraft !== null && normalizedLookupDraft !== lookupAppIdText;
  const canResetLookupAppId = lookupAppIdText !== originalAppIdText || lookupAppIdDraft !== originalAppIdText;
  const resultsControl = (
    <div className="sgdbResultsState" aria-live="polite">
      {tabLoading ? 'Loading' : `${tabAssets.length} ${ASSET_LABEL[assetType].toLowerCase()} results`}
    </div>
  );
  const columnsControl = (
    <div className="sgdbColumnsControl" onFocusCapture={revealToolbar} onMouseEnter={() => setFocusZone('content')}>
      <div className="sgdbColumnsDropdown">
        <Dropdown
          rgOptions={columns}
          selectedOption={columnCount}
          strDefaultLabel={`${columnCount} columns`}
          menuLabel={`${ASSET_LABEL[assetType]} columns`}
          focusable
          onMenuOpened={revealToolbar}
          onChange={(option) => {
            const nextColumns = Number(option.data);
            if (!Number.isFinite(nextColumns)) return;
            setDensityByType((current) => ({ ...current, [assetType]: nextColumns }));
          }}
        />
      </div>
    </div>
  );
  const appIdControls = (
    <div className="sgdbAppIdControls">
      <input
        className="sgdbAppIdInput"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="SteamGridDB lookup App ID"
        value={lookupAppIdDraft}
        onChange={(event) => setLookupAppIdDraft(event.currentTarget.value.replace(/\D/g, ''))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            confirmLookupAppId();
          } else if (event.key === 'Escape') {
            setLookupAppIdDraft(lookupAppIdText);
          }
        }}
      />
      <button
        className="sgdbAppIdAction sgdbTextPill"
        type="button"
        aria-label="Reset lookup App ID"
        title="Reset lookup App ID"
        disabled={!canResetLookupAppId}
        onClick={resetLookupAppId}
      >
        <ResetIdIcon />
      </button>
      <button
        className="sgdbAppIdAction sgdbTextPill"
        type="button"
        aria-label="Confirm lookup App ID"
        title="Confirm lookup App ID"
        disabled={!canConfirmLookupAppId}
        onClick={confirmLookupAppId}
      >
        <ConfirmIdIcon />
      </button>
    </div>
  );

  return (
    <>
      <div ref={tabsRef} className="sgdbManualTabs sgdbGamepadTabs">
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

      <div ref={scrollerRef} className="tabcontents-wrap">
        <div className={`spinnyboi ${!tabLoading || tabAssets.length > 0 ? 'loaded' : ''}`}>
          <img alt="Loading..." src="/images/steam_spinner.png" />
        </div>

        <>
        {isGamepadUI ? (
          <Focusable ref={toolbarRef} className="sgdb-asset-toolbar sgdbTopToolbar" flow-children="row" onGamepadFocus={revealToolbar} onMouseEnter={() => setFocusZone('content')} onButtonDown={handleTabBumper}>
            <div className="sgdbToolbarLeft">
              {resultsControl}
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
              {columnsControl}
            </div>
            <div className="sgdbToolbarCenterGap" aria-hidden="true" />
            <div className="sgdbToolbarRight">
              {appIdControls}
              <Focusable
                className="sgdbResetButton sgdbTextPill"
                onActivate={resetCurrentArtwork}
                onClick={resetCurrentArtwork}
                onGamepadFocus={revealToolbar}
                role="button"
              >
                Reset Artwork
              </Focusable>
            </div>
          </Focusable>
        ) : (
          <div ref={toolbarRef} className="sgdb-asset-toolbar sgdbTopToolbar">
            <div className="sgdbToolbarLeft">
              {resultsControl}
              <div className="filter-buttons">
                <button className={`sgdbFilterMainButton sgdbTextPill ${filtersOpen ? 'selected' : ''}`} type="button" onClick={() => setFiltersOpen((open) => !open)}>
                  Filter
                </button>
              </div>
              {columnsControl}
            </div>
            <div className="sgdbToolbarCenterGap" aria-hidden="true" />
            <div className="sgdbToolbarRight">
              {appIdControls}
              <button className="sgdbResetButton sgdbTextPill" type="button" onClick={resetCurrentArtwork}>Reset Artwork</button>
            </div>
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

        <Focusable key={assetType} id="images-container" className={`sgdbGrid ${assetType} ${canShowMore ? 'hasMore' : ''} ${filtersOpen ? 'filtersOpen' : ''}`} style={tabGridStyle} data-sgdb-fitted-rows={verticalFit?.rows} data-sgdb-vertical-fit={verticalFit?.exact ? 'exact' : verticalFit ? 'bounded' : undefined} flow-children="right" onGamepadFocus={() => setFocusZone('content')} onMouseEnter={() => setFocusZone('content')} onButtonDown={handleTabBumper}>
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
