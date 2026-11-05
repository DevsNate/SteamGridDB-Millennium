// Display text for draft state. Behavior never depends on these strings.
import { SGDB_ASSET_TYPE_READABLE } from '../../src/constants';
import type { Row } from './draft';
import type { GameMatch } from './library';

export const artworkNames = SGDB_ASSET_TYPE_READABLE;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
export const artworkCount = (count: number) => plural(count, 'artwork');
export const gameCount = (count: number) => plural(count, 'game');

/** SteamGridDB and Steam name a game differently, often only by symbols like the ones in LEGO® Batman™. */
const nameKey = (name: string) => name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const sameName = (a: string, b: string) => nameKey(a) === nameKey(b);

export function matchText(match?: GameMatch): string {
  switch (match?.status) {
    case undefined: return 'Checking library match…';
    case 'matched': return 'In my library';
    case 'unlinked': return 'No Steam link. Choose a library game.';
    case 'not-owned': return 'Linked Steam game is not in your library.';
    case 'ambiguous': return 'Several library games match. Choose a target.';
    case 'unavailable': return 'Your saved library match is no longer available.';
    default: return match?.error || 'Could not check this game. Retry matching.';
  }
}

/** The short line under a game's tile. Empty when the game is matched: its page shows the library name. */
export function tileText(match: GameMatch | undefined): string {
  switch (match?.status) {
    case undefined: return 'Checking…';
    case 'matched': return '';
    case 'error': return 'Could not check';
    case 'not-owned': return 'Not in library';
    default: return 'Needs a match';
  }
}

export function rowText(row: Row): string {
  switch (row.status) {
    case 'checking': return 'Checking…';
    case 'no-target': return matchText(row.match);
    case 'leave': return 'Left unchanged.';
    case 'keep-custom': return 'Keeping your custom artwork.';
    case 'needs-choice': return `${row.candidates.length} to choose from.`;
    case 'collision': return 'Another game in this collection targets the same library game. Pick artwork to use this one instead.';
    case 'ready': return row.hasCustom ? 'Replaces your custom artwork.' : 'Ready to apply.';
    // With one version there's nothing for Choose Again to ask, so the tile says why.
    case 'applied': return row.candidates.length === 1 ? 'Only version in this collection.' : 'Applied.';
    case 'failed': return row.error || 'Failed. Apply again to retry.';
  }
}
