// All Collections state, kept outside React. Dialogs render in their own trees and need live data, the top
// tab bar follows the flow, and a running batch has to outlive the tab, which can unmount.
import { useEffect, useRef, useState } from 'react';
import { toaster } from '@decky/api';
import MenuIcon from '../../src/components/Icons/MenuIcon';
import { artworkWriter } from '../../src/hooks/useSGDB';
import { PublicCollection, SGDBCollection, currentSteamId, deleteSavedCollection, loadCollections, rememberArtwork } from '../services/backend';
import { readSetting, writeSetting } from '../settings/store';
import { Draft, Row, RowPick, buildRows, gameGroups, isRunnable, needsAttention, typesIn } from './draft';
import {
  clearCollectionCache, collectionInfo, CollectionArtwork, forgetCollection, isSavedCurrent, readCollection, saveCollection, SavedCollection, savedCollection,
} from './load';
import { clearGameLinks, customArtwork, GameMatch, libraryApp, matchGame, matchGames, saveGameMatch } from './library';
import { runRows } from './run';
import { artworkCount, artworkNames } from './text';

export type BrowseFilter = 'all' | 'owned' | 'unmatched';

export type CollectionsState = {
  account: string;
  view: 'list' | 'overview' | 'game' | 'review' | 'choose';
  gameId?: number;
  /** The game page was opened from the review, so leaving it goes back there. */
  fromReview: boolean;
  /** The game the review just got back from, whose tile gets focus again. */
  reviewGame?: number;
  /** What the choose page goes through. Fixed when it opens, so a resolved row stays reachable. */
  choices: { key: string; title: string }[];
  choiceKey?: string;
  /** Where focus lands on the next choice, so a repeated action can stay on its button. */
  choiceFocus: 'tile' | 'button';
  list: { loaded: boolean; items: SGDBCollection[]; error: string };
  collectionId?: number;
  info?: PublicCollection;
  complete: boolean;
  loadError: string;
  draft: Draft;
  term: string;
  filter: BrowseFilter;
  selected: ReadonlySet<number>;
  reviewTitle: string;
  /** Games taken out of the current review, which can be put back. */
  excluded: ReadonlySet<number>;
  scanError: string;
  run: { done: number; total: number; stopping: boolean } | null;
  error: string;
  lastGame?: number;
  lastCollection?: number;
};

const emptyDraft = (): Draft => ({
  assets: [], matches: new Map(), scope: null, types: [], replace: false, picks: {}, results: {},
});

const initialState = (account: string): CollectionsState => ({
  account,
  view: 'list',
  fromReview: false,
  choices: [],
  choiceFocus: 'tile',
  list: { loaded: false, items: [], error: '' },
  complete: false,
  loadError: '',
  draft: emptyDraft(),
  term: '',
  filter: 'all',
  selected: new Set(),
  reviewTitle: '',
  excluded: new Set(),
  scanError: '',
  run: null,
  error: '',
});

let state = initialState('');
const listeners = new Set<() => void>();
let session = new AbortController();
let runner: AbortController | undefined;
let matching: AbortSignal | undefined;
let listRequests = 0;
let scanRequests = 0;
// Decisions and failures in collections that were closed, so leaving one and coming back loses nothing until Steam restarts.
const closed = new Map<number, Pick<Draft, 'picks' | 'replace' | 'results'>>();
// What the review was opened as, for when every excluded game is back.
let openedTitle = '';

const BATCH_RUNNING = 'Wait for the current batch to finish.';
const failureText = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure));
const isAbort = (failure: unknown) => failure instanceof Error && failure.name === 'AbortError';

function setState(next: CollectionsState): void {
  state = next;
  listeners.forEach(listener => listener());
}

const update = (patch: Partial<CollectionsState>) => setState({ ...state, ...patch });

const updateDraft = (patch: Partial<Draft>) => update({ draft: { ...state.draft, ...patch } });

/** Steam normally restarts its UI on an account switch; if it doesn't, nothing carries over. */
function syncAccount(): void {
  const account = currentSteamId();
  if (account === state.account) return;
  session.abort();
  runner?.abort();
  clearGameLinks();
  closed.clear();
  session = new AbortController();
  setState(initialState(account));
}

export function useCollections(): CollectionsState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender(count => count + 1);
    listeners.add(listener);
    syncAccount();
    return () => { listeners.delete(listener); };
  }, []);
  return state;
}

/** For parts that only follow one thing: renders again when that value changes, not on every update. */
export function useCollectionsKey(select: (current: CollectionsState) => string): string {
  const [, rerender] = useState(0);
  const shown = useRef('');
  useEffect(() => {
    const listener = () => {
      if (select(state) !== shown.current) rerender(count => count + 1);
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  shown.current = select(state);
  return shown.current;
}

export const setBrowse = (patch: Partial<Pick<CollectionsState, 'term' | 'filter' | 'selected' | 'error'>>) => update(patch);

// List ------------------------------------------------------------------------------------------

export async function loadList(refresh = false): Promise<void> {
  syncAccount();
  if (state.list.loaded && !refresh) return;
  if (refresh) {
    clearCollectionCache();
    clearGameLinks();
  }
  const request = ++listRequests;
  update({ list: { ...state.list, loaded: false, error: '' } });
  try {
    const items = state.account ? await loadCollections() : [];
    if (request === listRequests) update({ list: { loaded: true, items, error: '' } });
  } catch (failure) {
    if (request === listRequests) update({ list: { loaded: true, items: [], error: failureText(failure) } });
  }
}

// Collections added by link. Only the ID and name are saved, so opening one always reads its current contents.
const addedKey = (account: string) => `added_collections_${account}`;

export function addedCollections(account: string): SGDBCollection[] {
  const saved = readSetting(addedKey(account), []);
  return Array.isArray(saved)
    ? saved.filter(item => Number.isSafeInteger(item?.id) && item.id > 0 && typeof item.name === 'string')
    : [];
}

/** Newest first, so a new collection shows up right below the toolbar. A collection you own is only listed once. */
export function myCollections({ account, list }: CollectionsState): SGDBCollection[] {
  const owned = new Set(list.items.map(item => item.id));
  return [...addedCollections(account).filter(item => !owned.has(item.id)), ...list.items];
}

/** Adding reads the collection first, so a wrong link or ID fails here and is never saved. */
export async function addCollection(id: number): Promise<void> {
  syncAccount();
  const { account } = state;
  if (!account) throw Error('Sign in to Steam to add a collection.');
  if (myCollections(state).some(item => item.id === id)) return;
  const { name } = await collectionInfo(id);
  if (currentSteamId() !== account) throw Error('Your Steam account changed.');
  await writeSetting(addedKey(account), [{ id, name }, ...addedCollections(account)]);
  update({});
}

/** Reports its own failure: it runs from a menu, with nowhere else to show it. */
export async function removeCollection(id: number): Promise<void> {
  const { account } = state;
  try {
    await writeSetting(addedKey(account), addedCollections(account).filter(item => item.id !== id));
  } catch (failure) {
    toaster.toast({ title: 'SteamGridDB Collections', body: `Could not remove the collection: ${failureText(failure)}`, icon: <MenuIcon />, duration: 3000 });
    return;
  }
  // A copy left behind is only removed later, with the oldest saved collections.
  void deleteSavedCollection(id).catch(() => undefined);
  update({});
}

// Collection ------------------------------------------------------------------------------------

export async function openCollection(id: number): Promise<void> {
  syncAccount();
  if (state.run) return;
  session.abort();
  session = new AbortController();
  const { signal } = session;
  update({
    view: 'overview',
    collectionId: id,
    info: undefined,
    complete: false,
    loadError: '',
    draft: emptyDraft(),
    term: '',
    filter: 'all',
    selected: new Set(),
    error: '',
    gameId: undefined,
    lastGame: undefined,
  });
  const decisions = closed.get(id);
  if (decisions) {
    closed.delete(id);
    updateDraft(decisions);
  }
  const saved = await savedCollection(id);
  if (signal.aborted) return;
  if (saved) {
    update({ info: saved.info, complete: true, draft: { ...state.draft, assets: saved.assets, picks: currentPicks(saved.assets) } });
    void matchMissing(signal);
    void updateSaved(id, saved, signal);
    return;
  }
  try {
    const contents = await readCollection(id, signal, (info, assets) => {
      if (signal.aborted) return;
      update({ info, draft: { ...state.draft, assets } });
      void matchMissing(signal);
    });
    void saveCollection(id, contents);
    if (!signal.aborted) update({ complete: true, draft: { ...state.draft, picks: currentPicks(contents.assets) } });
  } catch (failure) {
    if (!signal.aborted && !isAbort(failure)) update({ loadError: failureText(failure) });
  }
}

/** Runs behind a collection opened from its saved copy. If this fails, the saved copy simply stays on screen. */
async function updateSaved(id: number, saved: SavedCollection, signal: AbortSignal): Promise<void> {
  try {
    forgetCollection(id);
    const info = await collectionInfo(id);
    if (signal.aborted) return;
    if (isSavedCurrent(saved, info)) {
      update({ info });
      return;
    }
    const contents = await readCollection(id, signal);
    await saveCollection(id, contents);
    if (signal.aborted) return;
    update({ info: contents.info });
    // A running batch keeps what it reviewed. The next open shows the update.
    if (state.run || contents.assets.map(asset => asset.id).join() === saved.assets.map(asset => asset.id).join()) return;
    updateDraft({ assets: contents.assets, picks: currentPicks(contents.assets) });
    void matchMissing(signal);
  } catch { /* See above. */ }
}

/** A pick whose artwork left the collection has to go, or the row would quietly use a different one. */
function currentPicks(assets: CollectionArtwork[]): Draft['picks'] {
  const ids = new Set(assets.map(asset => asset.id));
  return Object.fromEntries(Object.entries(state.draft.picks)
    .filter(([, pick]) => pick.action !== 'use' || ids.has(pick.artworkId)));
}

export function closeCollection(): void {
  if (state.run) return;
  if (state.collectionId) {
    const { picks, replace, results } = state.draft;
    closed.set(state.collectionId, { picks, replace, results });
  }
  session.abort();
  session = new AbortController();
  update({
    view: 'list',
    lastCollection: state.collectionId,
    collectionId: undefined,
    info: undefined,
    draft: emptyDraft(),
    error: '',
  });
}

// One loop per collection. It picks up games from pages that arrive while it runs.
async function matchMissing(signal: AbortSignal): Promise<void> {
  if (matching === signal) return;
  matching = signal;
  try {
    while (!signal.aborted) {
      const missing = gameGroups(state.draft.assets).map(game => game.id).filter(id => !state.draft.matches.has(id));
      if (!missing.length) break;
      await matchGames(missing, state.account, signal, batch => {
        updateDraft({ matches: new Map([...state.draft.matches, ...batch]) });
      });
    }
  } catch (failure) {
    // Without this the games would stay on "Checking" for good.
    if (!signal.aborted) update({ loadError: `Could not check your library: ${failureText(failure)}` });
    return;
  } finally {
    if (matching === signal) matching = undefined;
  }
  // Game sheets show custom-artwork status too, so this doesn't wait for a review.
  if (!signal.aborted) void scanCustom();
}

async function scanCustom(): Promise<void> {
  const request = ++scanRequests;
  update({ scanError: '' });
  try {
    const appids = [...state.draft.matches.values()].flatMap(match => (match.appid ? [match.appid] : []));
    const scan = await customArtwork([...new Set(appids)]);
    if (request === scanRequests) updateDraft(scan);
  } catch (failure) {
    if (request === scanRequests) update({ scanError: failureText(failure) });
  }
}

export const retryScan = () => { void scanCustom(); };

function setMatch(gameId: number, match: GameMatch): void {
  const results = Object.fromEntries(Object.entries(state.draft.results)
    .filter(([key]) => !key.startsWith(`${gameId}:`)));
  updateDraft({ matches: new Map(state.draft.matches).set(gameId, match), results });
  if (state.draft.custom) void scanCustom();
}

/** Saving a match never writes artwork. Null returns the game to automatic matching. */
export async function chooseMatch(gameId: number, appid: number | null): Promise<void> {
  // A running batch keeps what it reviewed, so its games can't change under it.
  if (state.run) throw Error(BATCH_RUNNING);
  await saveGameMatch(state.account, gameId, appid);
  setMatch(gameId, await matchGame(gameId, state.account));
}

export async function retryMatch(gameId: number): Promise<void> {
  if (state.run) return;
  setMatch(gameId, await matchGame(gameId, state.account));
}

// Picks -----------------------------------------------------------------------------------------

export function setPick(key: string, pick: RowPick): void {
  if (state.run) return;
  const { [key]: _edited, ...results } = state.draft.results;
  const picks = { ...state.draft.picks, [key]: pick };
  // Picking artwork for one of the games aimed at one library game settles which of them gets it.
  const rows = buildRows(state.draft);
  const row = rows.find(value => value.key === key);
  if (pick.action === 'use' && row?.status === 'collision') {
    for (const other of rows) {
      if (other.key !== key && other.appid === row.appid && other.type === row.type) picks[other.key] = { action: 'leave' };
    }
  }
  updateDraft({ picks, results });
}

/** Undoes a selection, back to what the row did before it. A row that would still apply, or still shows it, needs an explicit leave. */
export function unselect(row: Row): void {
  if (state.run) return;
  const { [row.key]: _pick, ...picks } = state.draft.picks;
  const [next] = buildRows({ ...state.draft, picks, scope: new Set([row.game.id]), types: [row.type] });
  if (isRunnable(next) || next.status === 'applied') {
    setPick(row.key, { action: 'leave' });
    return;
  }
  const { [row.key]: _edited, ...results } = state.draft.results;
  updateDraft({ picks, results });
}

/** Applied games with more than one artwork go back to needing a choice. Nothing is written until Apply. */
export function chooseAgain(rows: Row[]): void {
  if (state.run) return;
  const keys = rows.filter(row => row.status === 'applied' && row.candidates.length > 1).map(row => row.key);
  if (!keys.length) return;
  const picks = { ...state.draft.picks };
  for (const key of keys) delete picks[key];
  updateDraft({ picks, rechoose: new Set([...(state.draft.rechoose ?? []), ...keys]) });
  openChoices();
}

export function pickFirstForRest(rows: Row[]): void {
  const picks = { ...state.draft.picks };
  for (const row of rows) {
    if (row.status === 'needs-choice') picks[row.key] = { action: 'use', artworkId: row.candidates[0].id };
  }
  updateDraft({ picks });
}

// Review and applying ---------------------------------------------------------------------------

export function openGame(gameId: number, fromReview = false): void {
  update({ view: 'game', gameId, fromReview, lastGame: gameId });
}

export function closeGame(): void {
  update({
    view: state.fromReview ? 'review' : 'overview',
    reviewGame: state.fromReview ? state.gameId : undefined,
    gameId: undefined,
    fromReview: false,
  });
}

/** While a batch runs, this only returns to its progress. */
export function openReview(scope: ReadonlySet<number> | null, title: string): void {
  if (!state.complete) return;
  startReview(scope, title);
  update({ view: 'review', gameId: undefined, fromReview: false, reviewGame: undefined });
}

export function closeReview(): void {
  update({ view: 'overview', gameId: undefined, fromReview: false });
}

export function openChoices(): void {
  const rows = buildRows(state.draft).filter(needsAttention);
  if (!rows.length) return;
  const ofGame = (row: Row) => rows.filter(value => value.game.id === row.game.id).length;
  update({
    view: 'choose',
    choices: rows.map(row => ({
      key: row.key,
      title: ofGame(row) > 1 ? `${row.game.name}: ${artworkNames[row.type]}` : row.game.name,
    })),
    choiceKey: rows[0].key,
    choiceFocus: 'tile',
  });
}

export const showChoice = (choiceKey: string) => update({ choiceKey });

export const closeChoices = () => update({ view: 'review', reviewGame: undefined });

/** On to the next choice. After the last one, back to the review. */
export function nextChoice(choiceFocus: CollectionsState['choiceFocus']): void {
  const next = state.choices[state.choices.findIndex(choice => choice.key === state.choiceKey) + 1];
  if (next) update({ choiceKey: next.key, choiceFocus });
  else closeChoices();
}

export function setChoiceFocus(choiceFocus: CollectionsState['choiceFocus']): void {
  if (choiceFocus !== state.choiceFocus) update({ choiceFocus });
}

/** Whether the top bar shows this flow's steps instead of the artwork types. */
export const inFlow = ({ view, fromReview }: CollectionsState) => (
  view === 'review' || view === 'choose' || (view === 'game' && fromReview)
);

export function goBack(): void {
  if (state.view === 'game') closeGame();
  else if (state.view === 'choose') closeChoices();
  else if (state.view === 'review') closeReview();
  else closeCollection();
}

export function startReview(scope: ReadonlySet<number> | null, title: string): void {
  if (!state.complete || state.run) return;
  openedTitle = title;
  update({ reviewTitle: title, excluded: new Set(), error: '' });
  // The same games keep their artwork types. Replacing stays as it was left, and the page always shows it.
  const { scope: previous, types } = state.draft;
  const sameGames = previous === scope || (previous && scope && previous.size === scope.size && [...scope].every(id => previous.has(id)));
  updateDraft({ scope, types: sameGames && types.length ? types : typesIn(state.draft.assets, scope), custom: undefined });
  if (!matching) void scanCustom();
}

export const setTypes = (types: SGDBAssetType[]) => updateDraft({ types });
export const setReplace = (replace: boolean) => updateDraft({ replace });

function scopeTitle(scope: ReadonlySet<number>): string {
  if (scope.size !== 1) return `Apply ${scope.size} Games`;
  const [only] = scope;
  return `Apply ${gameGroups(state.draft.assets).find(game => game.id === only)?.name ?? '1 Game'}`;
}

export function excludeGame(gameId: number): void {
  const scope = new Set(state.draft.scope ?? gameGroups(state.draft.assets).map(game => game.id));
  scope.delete(gameId);
  update({
    excluded: new Set(state.excluded).add(gameId),
    reviewTitle: scopeTitle(scope),
    draft: { ...state.draft, scope },
  });
}

export function includeGame(gameId: number): void {
  const scope = new Set(state.draft.scope).add(gameId);
  const excluded = new Set(state.excluded);
  excluded.delete(gameId);
  update({
    excluded,
    reviewTitle: excluded.size ? scopeTitle(scope) : openedTitle,
    draft: { ...state.draft, scope },
  });
}

async function writeRow(row: Row, artwork: CollectionArtwork, account: string): Promise<void> {
  if (currentSteamId() !== account) {
    runner?.abort();
    throw Error('Your Steam account changed.');
  }
  const app = libraryApp(row.appid!, true);
  if (!app) throw Error('This game is no longer available in your local library.');
  await artworkWriter(app.appid, app).changeAssetFromUrl(artwork.url, artwork.type);
  await rememberArtwork(app.appid, artwork.type, artwork.id, true);
}

function recordApplied(row: Row, artwork: CollectionArtwork): void {
  const { [row.key]: _failure, ...results } = state.draft.results;
  const { applied } = state.draft;
  updateDraft({
    results,
    applied: { ...applied, [row.appid!]: { ...applied?.[row.appid!], [row.type]: { id: artwork.id, collection: true } } },
  });
}

function recordFailed(row: Row, error: string): void {
  updateDraft({ results: { ...state.draft.results, [row.key]: { appid: row.appid!, error } } });
}

export async function applyDraft(): Promise<void> {
  syncAccount();
  if (state.run || matching) return;
  const account = state.account;
  const controller = new AbortController();
  runner = controller;
  update({ run: { done: 0, total: 0, stopping: false }, error: '' });
  try {
    // The review may be old: artwork added since then is protected again.
    await scanCustom();
    // The review shows this, with its Retry.
    if (state.scanError) return;
    const rows = buildRows(state.draft).filter(isRunnable);
    update({ run: { done: 0, total: rows.length, stopping: false } });
    let applied = 0;
    let failed = 0;
    await runRows(rows, controller.signal, row => writeRow(row, row.artwork, account), (row, error) => {
      if (error) {
        failed++;
        recordFailed(row, error);
      } else {
        applied++;
        recordApplied(row, row.artwork);
      }
      if (state.run) update({ run: { ...state.run, done: applied + failed } });
    });
    const parts = [`${artworkCount(applied)} applied`, ...(failed ? [`${failed} failed`] : [])];
    toaster.toast({ title: state.info?.name ?? 'SteamGridDB Collections', body: parts.join(' · '), icon: <MenuIcon />, duration: 3000 });
  } catch (failure) {
    update({ error: failureText(failure) });
  } finally {
    runner = undefined;
    update({ run: null });
  }
}

export function cancelRun(): void {
  runner?.abort();
  if (state.run) update({ run: { ...state.run, stopping: true } });
}

/** Applies one artwork right away, like the plugin's other tabs, replacing that type on the target game. */
export async function applyNow(gameId: number, artwork: CollectionArtwork): Promise<void> {
  const row = rowsForGame(state.draft, gameId).find(value => value.type === artwork.type);
  const title = row?.game.name ?? artwork.game.name;
  try {
    if (state.run) throw Error(BATCH_RUNNING);
    if (!row?.appid) throw Error('Match this game to a library game first.');
    await writeRow(row, artwork, state.account);
    setPick(row.key, { action: 'use', artworkId: artwork.id });
    recordApplied(row, artwork);
    toaster.toast({ title, body: `${artworkNames[artwork.type]} applied.`, icon: <MenuIcon />, duration: 1500 });
  } catch (failure) {
    toaster.toast({ title, body: failureText(failure), icon: <MenuIcon />, duration: 3000 });
  }
}

/** Every type of one game, whatever the current review includes. */
export function rowsForGame(draft: Draft, gameId: number): Row[] {
  return buildRows({ ...draft, scope: new Set([gameId]), types: typesIn(draft.assets, new Set([gameId])) });
}
