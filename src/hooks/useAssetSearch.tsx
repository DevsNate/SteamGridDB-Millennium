import {
  useState,
  createContext,
  FC,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import { showModal } from '@decky/ui';
import { toaster } from '@decky/api';
import isEqual from 'react-fast-compare';

import useSettings from './useSettings';
import { useSGDB } from './useSGDB';
import FiltersModal from '../modals/FiltersModal';
import GameSelectionModal from '../modals/GameSelectionModal';
import MenuIcon from '../components/Icons/MenuIcon';
import log from '../utils/log';
import compareFilterWithDefaults from '../utils/compareFilterWithDefaults';
// Millennium: The first request shouldn't sit through a debounce.
import leadingDebounce from '../utils/leadingDebounce';

export type AssetSearchContextType = {
  loading: boolean;
  assets: any[];
  searchAndSetAssets: (assetType: SGDBAssetType, page: number, filters: any, onSuccess?: () => void) => Promise<void>;
  loadMore: (assetType: SGDBAssetType, onSuccess?: (res: any[]) => void) => Promise<void>;
  externalSgdbData: any;
  openFilters: (assetType: SGDBAssetType) => void;
  games: any[];
  selectedGame: any;
  isFilterActive: boolean;
  moreLoading: boolean;
  endReached: boolean;
}

export const SearchContext = createContext({});

let abortCont: AbortController | null = null;

export const AssetSearchContext: FC<{ children: ReactNode }> = ({ children }) => {
  const { set, get } = useSettings();
  const { appId, searchAssets, searchGames, getSgdbGame, appOverview } = useSGDB();
  const [assets, setAssets] = useState<Array<any>>([]);
  const [currentFilters, setCurrentFilters] = useState();
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<any>();
  const [externalSgdbData, setExternalSgdbData] = useState<any>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [page, setPage] = useState(0);
  const loadingMore = useRef(false);

  const showGameSelection = useCallback(() => {
    showModal(
      <GameSelectionModal
        defaultTerm={appOverview.display_name}
        searchGames={searchGames}
        onSelect={(game: any) => {
          setSelectedGame(game);
          // Millennium: Persist before the page can close rather than waiting for the debounce.
          set(`nonsteam_${appId}`, game, true);
        }}
      />
    );
  }, [appId, appOverview.display_name, searchGames, set]);

  const searchAndSetAssets = useMemo(() => leadingDebounce(async (assetType: SGDBAssetType, page: number, filters: any, onSuccess?: () => void) => {
    if (appOverview?.BIsModOrShortcut() && !selectedGame) return;
    if (abortCont) abortCont?.abort();
    abortCont = new AbortController();

    try {
      setCurrentFilters(filters);
      setIsFilterActive(compareFilterWithDefaults(assetType, filters));
      const resp = await searchAssets(assetType, {
        gameId: selectedGame?.id,
        page,
        filters,
        signal: abortCont.signal,
      });
      log('search resp', assetType, resp);
      setAssets(resp);
      setEndReached(false);
      setPage(page + 1); // set to next page so correct page is requested when loadMore() is used
      onSuccess?.();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log('Search Aborted');
      } else if (err?.status === 404) {
        showGameSelection();
      } else {
        toaster.toast({
          title: 'SteamGridDB API Error',
          body: err.message,
          icon: <MenuIcon fill="#f3171e" />,
        });
        if (selectedGame) {
          set(`nonsteam_${appId}`, false);
        }
      }
    }
  }, 500), [appId, appOverview, searchAssets, showGameSelection, selectedGame, set]) as AssetSearchContextType['searchAndSetAssets'];

  // Millennium: Requests the next page immediately, one at a time, instead of waiting out a debounce.
  const loadMore: AssetSearchContextType['loadMore'] = useMemo(() => async (assetType, onSuccess) => {
    if (appOverview?.BIsModOrShortcut() && !selectedGame) return;
    if (loadingMore.current || assets.length === 0) return;
    loadingMore.current = true;
    if (abortCont) abortCont?.abort();
    abortCont = new AbortController();

    try {
      setMoreLoading(true);
      const resp = await searchAssets(assetType, {
        page,
        gameId: selectedGame?.id,
        filters: currentFilters,
        signal: abortCont.signal,
      });
      log('search load more resp', resp);
      setAssets((assets) => [...assets, ...resp]);
      setMoreLoading(false);
      if (resp.length > 0) {
        setPage((x) => x + 1);
      }
      if (resp.length === 0) {
        setEndReached(true);
      }
      onSuccess?.(resp);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log('Load more aborted');
      } else {
        toaster.toast({
          title: 'SteamGridDB API Error',
          body: err.message,
          icon: <MenuIcon fill="#f3171e" />,
        });
      }
    } finally {
      loadingMore.current = false;
    }
  }, [appOverview, assets.length, currentFilters, page, searchAssets, selectedGame]);

  const handleFiltersSave = useCallback(async (assetType: SGDBAssetType, filters: any, game: any) => {
    const filtersChanged = !isEqual(filters, currentFilters);
    const gameChanged = game?.id !== selectedGame?.id;
    if (filtersChanged) {
      setLoading(true);
      searchAndSetAssets(assetType, 0, filters, () => {
        setLoading(false);
      });
      set(`filters_${assetType}`, filters, true);
      setCurrentFilters(filters);
    }
    if (gameChanged) {
      setSelectedGame(game ?? false);
      // save selected game to reuse for this shortcut
      // Millennium: Shortcut game choices must survive an immediate page reopen.
      set(`nonsteam_${appId}`, game ?? false, true);
    }
    if (filtersChanged || gameChanged) {
      log('filtersChanged');
      setMoreLoading(false);
    }
    setIsFilterActive(compareFilterWithDefaults(assetType, filters));
  }, [currentFilters, selectedGame, searchAndSetAssets, set, appId]);

  const openFilters = useCallback(async (assetType: SGDBAssetType) => {
    log('Open Filters');
    const defaultFilters = await get(`filters_${assetType}`, null);
    showModal((
      <FiltersModal
        assetType={assetType}
        onSave={handleFiltersSave}
        defaultFilters={defaultFilters}
        defaultSelectedGame={selectedGame}
        defaultSearchTerm={selectedGame?.name || appOverview.display_name}
        isNonsteam={appOverview.BIsModOrShortcut()}
        searchGames={searchGames}
      />
    ), window);
  }, [appOverview, get, handleFiltersSave, searchGames, selectedGame]);

  useEffect(() => {
    if (!appOverview) return;
    (async () => {
      setLoading(true);
      const game = await get(`nonsteam_${appId}`, false);
      if (game) {
        setSelectedGame(game);
      } else {
        if (appOverview.BIsModOrShortcut()) {
          const gameRes = await searchGames(appOverview.display_name);
          if (gameRes.length) {
            setSelectedGame(gameRes[0]);
            // Millennium: Remember automatic shortcut matches as well as manual choices.
            set(`nonsteam_${appId}`, gameRes[0], true);
          } else {
            showGameSelection();
          }
        }
      }
      setLoading(false);
    })();
  }, [appOverview, appId, get, searchGames, set, showGameSelection]);

  useEffect(() => {
    if (!selectedGame) return;
    (async () => {
      const sgdbGame = await getSgdbGame(selectedGame);
      setExternalSgdbData(sgdbGame.external_platform_data);
    })();
  }, [getSgdbGame, selectedGame]);

  const value = useMemo(() => ({
    loading,
    assets,
    searchAndSetAssets,
    loadMore,
    selectedGame,
    externalSgdbData,
    openFilters,
    isFilterActive,
    moreLoading,
    endReached,
  }), [loading, assets, searchAndSetAssets, loadMore, selectedGame, externalSgdbData, openFilters, isFilterActive, moreLoading, endReached]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};

export const useAssetSearch = () => useContext(SearchContext) as AssetSearchContextType;

export default useAssetSearch;
