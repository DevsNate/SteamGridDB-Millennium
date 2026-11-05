// One game's artwork: a page like the artwork tabs, where selecting a tile decides what gets applied.
import { useMemo, useState } from 'react';
import { DialogButton, Focusable, showModal } from '@decky/ui';
import { ArtworkPicker } from './artwork-picker';
import { MatchDialog } from './library-picker';
import { libraryApp } from './library';
import { PageBar, PageToolbar, useGridSize, useInitialFocus } from './page-parts';
import { CollectionsState, goBack, openReview, retryMatch, rowsForGame } from './store';
import { artworkNames, matchText, rowText, sameName } from './text';
import { keepColumn } from './nav';

// The tab bar holds on to the game it opened with, so sliding out it doesn't lose its content.
export function GameView({ state, gameId = state.gameId, opened }: { state: CollectionsState; gameId?: number; opened: boolean }) {
  const { draft, scanError } = state;
  const rows = useMemo(() => rowsForGame(draft, gameId!), [draft, gameId]);
  const [type, setType] = useState(rows[0]?.type);
  const row = rows.find(value => value.type === type) ?? rows[0];
  const [size, setSize, gridStyle] = useGridSize(row?.type ?? 'grid_p');
  const takeFocus = useInitialFocus(opened, Boolean(row));
  if (!row) return null;

  const { game, match } = row;
  const app = match?.appid ? libraryApp(match.appid, true) : null;
  const shownName = app && !sameName(game.name, app.display_name) ? `${game.name} → ${app.display_name}` : game.name;
  const target = match?.manual ? `${shownName} (your match)` : shownName;
  return (
    <>
      <PageToolbar type={row.type} size={size} onSize={setSize}>
        <DialogButton noFocusRing disabled={Boolean(state.run)} onClick={() => showModal(<MatchDialog game={game} />, window)}>
          {app ? 'Change Match' : 'Match to Library'}
        </DialogButton>
        {match?.status === 'error' && (
          <DialogButton noFocusRing disabled={Boolean(state.run)} onClick={() => { void retryMatch(game.id); }}>Retry Matching</DialogButton>
        )}
        {!state.fromReview && (
          <DialogButton
            noFocusRing
            disabled={!app || !state.complete || Boolean(state.run)}
            onClick={() => openReview(new Set([game.id]), `Apply ${game.name}`)}
          >
            Apply This Game
          </DialogButton>
        )}
      </PageToolbar>
      <PageBar onBack={goBack}>{target}</PageBar>
      {rows.length > 1 && (
        <Focusable className="sgdb-collection-types" flow-children="row" {...keepColumn}>
          {rows.map(value => (
            <DialogButton
              key={value.type}
              noFocusRing
              aria-pressed={value.type === row.type}
              onClick={() => setType(value.type)}
            >
              {artworkNames[value.type]} ({value.candidates.length})
            </DialogButton>
          ))}
        </Focusable>
      )}
      <div role="status" className="sgdb-collection-message">
        {scanError ? `Could not check your existing artwork: ${scanError}` : app ? rowText(row) : matchText(match)}
      </div>
      <ArtworkPicker key={row.key} row={row} gridStyle={gridStyle} takeFocus={takeFocus} locked={Boolean(state.run)} />
    </>
  );
}
