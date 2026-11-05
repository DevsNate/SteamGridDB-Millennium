// The draft: what the user wants a collection to do to their library. Pure, so every rule here is
// testable without Steam. Each game and artwork type is one row, and its status decides what happens.
import type { CollectionArtwork } from './load';
import type { AppliedArtwork, CustomArtwork, GameMatch } from './library';

export const ARTWORK_TYPES: SGDBAssetType[] = ['grid_p', 'grid_l', 'hero', 'logo', 'icon'];

export type RowStatus =
  | 'checking' // Waiting for the library match or the custom-artwork scan.
  | 'no-target' // No library game to write to.
  | 'leave' // The user chose to leave this type unchanged.
  | 'keep-custom' // Protected: has custom artwork, and replacing wasn't asked for.
  | 'needs-choice' // Several candidates, none chosen.
  | 'collision' // Another game targets the same library game and type.
  | 'ready'
  | 'applied'
  | 'failed'; // Would be ready; the last write failed.

/** An explicit decision. Using an artwork overrides custom-artwork protection for that row. */
export type RowPick = { action: 'use'; artworkId: number } | { action: 'leave' };
/** A write that failed, for the library game it was aimed at. What succeeded is in `applied`. */
export type RowResult = { appid: number; error: string };

export type Draft = {
  assets: CollectionArtwork[];
  matches: ReadonlyMap<number, GameMatch>;
  custom?: CustomArtwork;
  /** What the games show now, read from disk with `custom`, so it survives a restart and follows changes made elsewhere. */
  applied?: AppliedArtwork;
  /** Games in the current review; null means all of them. */
  scope: ReadonlySet<number> | null;
  types: SGDBAssetType[];
  replace: boolean;
  picks: Readonly<Record<string, RowPick>>;
  results: Readonly<Record<string, RowResult>>;
  /** Rows to choose again: what the game shows no longer counts as the choice. */
  rechoose?: ReadonlySet<string>;
};

export type Row = {
  key: string;
  game: { id: number; name: string };
  type: SGDBAssetType;
  candidates: CollectionArtwork[];
  /** The artwork this row uses or would use. */
  artwork: CollectionArtwork;
  /** True when the user or the collection settled on it; false when it's only the first candidate. */
  chosen: boolean;
  match?: GameMatch;
  appid?: number;
  hasCustom: boolean;
  status: RowStatus;
  error?: string;
};

export type GameGroup = { id: number; name: string; assets: CollectionArtwork[] };

export const rowKey = (gameId: number, type: SGDBAssetType) => `${gameId}:${type}`;
export const isRunnable = (row: Row) => row.status === 'ready' || row.status === 'failed';
export const needsAttention = (row: Row) => row.status === 'needs-choice' || row.status === 'collision';

export function gameGroups(assets: CollectionArtwork[]): GameGroup[] {
  const groups = new Map<number, GameGroup>();
  for (const asset of assets) {
    const group = groups.get(asset.game.id) ?? { id: asset.game.id, name: asset.game.name, assets: [] };
    group.assets.push(asset);
    groups.set(asset.game.id, group);
  }
  return [...groups.values()];
}

function baseStatus(
  draft: Draft,
  key: string,
  candidates: number,
  match: GameMatch | undefined,
  hasCustom: boolean,
  shown: number | undefined,
  wanted: number | undefined,
): RowStatus {
  const pick = draft.picks[key];
  if (!match) return 'checking';
  if (match.status !== 'matched') return 'no-target';
  if (pick?.action === 'leave') return 'leave';
  if (!draft.custom) return 'checking';
  if (wanted !== undefined && wanted === shown) return 'applied';
  if (pick?.action === 'use') return 'ready';
  // Choose Again was asked for a game showing this collection's artwork, so there's nothing of theirs to protect.
  if (draft.rechoose?.has(key) && candidates > 1) return 'needs-choice';
  if (hasCustom && !draft.replace) return 'keep-custom';
  return candidates > 1 ? 'needs-choice' : 'ready';
}

export function buildRows(draft: Draft): Row[] {
  const slots = new Map<string, CollectionArtwork[]>();
  for (const asset of draft.assets) {
    if (!draft.types.includes(asset.type) || (draft.scope && !draft.scope.has(asset.game.id))) continue;
    const key = rowKey(asset.game.id, asset.type);
    slots.set(key, [...(slots.get(key) ?? []), asset]);
  }

  const rows = [...slots.entries()].map(([key, candidates]): Row => {
    const { game, type } = candidates[0];
    const match = draft.matches.get(game.id);
    const pick = draft.picks[key];
    const appid = match?.status === 'matched' ? match.appid : undefined;
    const shown = appid ? draft.applied?.[appid]?.[type] : undefined;
    // Without a pick, a game showing one of these artworks is using it, unless the user asked to choose again.
    const wanted = pick?.action === 'use'
      ? pick.artworkId
      : !draft.rechoose?.has(key) && candidates.some(candidate => candidate.id === shown?.id) ? shown?.id : undefined;
    const artwork = candidates.find(candidate => candidate.id === wanted) ?? candidates[0];
    // Artwork a collection put there isn't the user's to protect. Their own file, or a one-off pick, is.
    const hasCustom = Boolean(appid && draft.custom?.[appid]?.includes(type)) && !shown?.collection;
    const status = baseStatus(draft, key, candidates.length, match, hasCustom, shown?.id, wanted);
    // A failure is about the game it was aimed at, which may no longer be the target.
    const failure = draft.results[key]?.appid === appid ? draft.results[key] : undefined;
    return {
      key, game, type, candidates, artwork, match, appid, hasCustom,
      chosen: wanted !== undefined || candidates.length === 1,
      status: status === 'ready' && failure ? 'failed' : status,
      error: failure?.error,
    };
  });

  // Two games aimed at one library game would overwrite each other, so neither runs until that's resolved.
  const targets = new Map<string, Row[]>();
  for (const row of rows) {
    if (!isRunnable(row) && row.status !== 'needs-choice' && row.status !== 'applied') continue;
    const target = rowKey(row.appid!, row.type);
    targets.set(target, [...(targets.get(target) ?? []), row]);
  }
  for (const group of targets.values()) {
    if (group.length < 2) continue;
    for (const row of group) if (row.status !== 'applied') row.status = 'collision';
  }

  // Keep each game's rows together: batches and the review work game by game.
  const order = new Map(gameGroups(draft.assets).map((group, index) => [group.id, index]));
  return rows.sort((a, b) => order.get(a.game.id)! - order.get(b.game.id)!
    || ARTWORK_TYPES.indexOf(a.type) - ARTWORK_TYPES.indexOf(b.type));
}

/** Every row of every game, whatever the current review includes. */
export const allRows = (draft: Draft) => buildRows({ ...draft, scope: null, types: ARTWORK_TYPES });

export function typesIn(assets: CollectionArtwork[], scope: ReadonlySet<number> | null): SGDBAssetType[] {
  return ARTWORK_TYPES.filter(type => assets.some(asset => asset.type === type && (!scope || scope.has(asset.game.id))));
}
