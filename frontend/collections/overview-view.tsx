// One collection, as a grid of its games. Looks and works like an artwork tab.
import { useMemo, useRef, useState } from 'react';
import {
  DialogBody, DialogButton, DialogFooter, DialogHeader, Dropdown, Field, Focusable, Menu, MenuItem, ModalRoot, TextField,
  showContextMenu, showModal,
} from '@decky/ui';
import Asset from '../../src/components/asset/Asset';
import { openWebLink } from '../steam/open-web-link';
import { isVideoUrl } from './collection-card';
import { GameGroup, Row, allRows, gameGroups } from './draft';
import { libraryApp } from './library';
import { MatchDialog } from './library-picker';
import { PageBar, PageSpinner, PageToolbar, useGridSize, useInitialFocus } from './page-parts';
import { BrowseFilter, CollectionsState, closeCollection, openCollection, openGame, openReview, setBrowse, useCollections } from './store';
import { artworkCount, gameCount, tileText } from './text';
import { keepColumn } from './nav';

const PAGE_SIZE = 60;
const FILTERS: { data: BrowseFilter; label: string }[] = [
  { data: 'all', label: 'All Games' },
  { data: 'owned', label: 'In My Library' },
  { data: 'unmatched', label: 'Needs a Match' },
];

function FilterDialog({ closeModal }: { closeModal?: () => void }) {
  const { term, filter } = useCollections();
  return (
    <ModalRoot className="sgdb-collection-dialog" closeModal={closeModal} onCancel={closeModal}>
      <DialogHeader>Filter Games</DialogHeader>
      <DialogBody>
        <TextField
          label="Game Name"
          focusOnMount
          value={term}
          onChange={event => setBrowse({ term: event.target.value })}
        />
        <Field label="Show" childrenContainerWidth="max">
          <Dropdown
            menuLabel="Show"
            selectedOption={filter}
            rgOptions={FILTERS}
            onChange={option => setBrowse({ filter: option.data })}
          />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Focusable className="sgdb-collection-actions" flow-children="row" {...keepColumn}>
          <DialogButton
            disabled={!term && filter === 'all'}
            onClick={() => setBrowse({ term: '', filter: 'all' })}
          >
            Clear
          </DialogButton>
          <DialogButton onClick={closeModal}>Done</DialogButton>
        </Focusable>
      </DialogFooter>
    </ModalRoot>
  );
}

const openFilter = () => showModal(<FilterDialog />, window);

function GameTile({ group, rows, state, focused }: {
  group: GameGroup;
  rows: Row[];
  state: CollectionsState;
  focused: boolean;
}) {
  const tile = useRef<HTMLDivElement>(null);
  const match = state.draft.matches.get(group.id);
  const app = match?.appid ? libraryApp(match.appid, true) : null;
  const selected = state.selected.has(group.id);
  const applied = rows.length > 0 && rows.every(row => row.status === 'applied');
  const failed = rows.some(row => row.status === 'failed');
  // The tile shows the capsule the game would get.
  const capsule = rows.find(row => row.type === 'grid_p')?.artwork ?? group.assets[0];

  const toggleSelected = () => {
    const next = new Set(state.selected);
    if (selected) next.delete(group.id);
    else next.add(group.id);
    setBrowse({ selected: next });
  };
  const openMenu = () => {
    if (!tile.current) return;
    showContextMenu(
      <Menu label={group.name}>
        <MenuItem onSelected={toggleSelected}>{selected ? 'Unselect Game' : 'Select Game'}</MenuItem>
        {state.selected.size > (selected ? 1 : 0) && (
          <MenuItem onSelected={() => setBrowse({ selected: new Set() })}>Clear Selection</MenuItem>
        )}
        {!state.run && (
          <MenuItem onSelected={() => showModal(<MatchDialog game={group} />, window)}>
            {app ? 'Change Library Match…' : 'Match to Library Game…'}
          </MenuItem>
        )}
        {app && !state.run && (
          <MenuItem onSelected={() => openReview(new Set([group.id]), `Apply ${group.name}`)}>
            Apply This Game…
          </MenuItem>
        )}
        <MenuItem onSelected={() => { void openWebLink(`https://www.steamgriddb.com/collection/${state.info!.id}`); }}>
          View Collection on SteamGridDB
        </MenuItem>
      </Menu>,
      tile.current,
      { bPreferPopLeft: false, bOverlapVertical: true, bShiftToFitWindow: true },
    );
  };

  const status = applied ? 'Applied' : failed ? 'Failed. Apply again to retry.' : tileText(match);
  return (
    <div
      ref={tile}
      className="sgdb-collection-tile"
      data-selected={selected || undefined}
      data-dimmed={(match && !app) || undefined}
      data-letterbox={capsule.type !== 'grid_p' || undefined}
    >
      <Asset
        assetType="grid_p"
        autoFocus={focused}
        src={capsule.thumb}
        width={600}
        height={900}
        isAnimated={isVideoUrl(capsule.thumb)}
        onActivate={() => openGame(group.id)}
        onOKActionDescription="View Artwork"
        onSecondaryActionDescription="Filter"
        onSecondaryButton={openFilter}
        onOptionsActionDescription={selected ? 'Unselect' : 'Select'}
        onOptionsButton={toggleSelected}
        onMenuActionDescription="More"
        onMenuButton={openMenu}
        onContextMenu={event => {
          event.preventDefault();
          openMenu();
        }}
      />
      <div className="sgdb-collection-tile-name">{group.name}</div>
      {status && <div className="sgdb-collection-tile-text">{status}</div>}
    </div>
  );
}

export function OverviewView({ state, opened }: { state: CollectionsState; opened: boolean }) {
  const { info, draft, complete, loadError, term, filter, selected, run } = state;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [size, setSize, gridStyle] = useGridSize('grid_p');
  const groups = useMemo(() => gameGroups(draft.assets), [draft.assets]);
  const rows = useMemo(() => {
    const byGame = new Map<number, Row[]>();
    for (const row of allRows(draft)) byGame.set(row.game.id, [...(byGame.get(row.game.id) ?? []), row]);
    return byGame;
  }, [draft]);
  const filtered = useMemo(() => {
    const query = term.trim().toLocaleLowerCase();
    return groups.filter(group => {
      const match = draft.matches.get(group.id);
      return group.name.toLocaleLowerCase().includes(query) && (filter === 'all'
        || (filter === 'owned' && match?.status === 'matched')
        || (filter === 'unmatched' && match && match.status !== 'matched'));
    });
  }, [groups, draft.matches, term, filter]);
  const filtering = Boolean(term.trim()) || filter !== 'all';
  const takeFocus = useInitialFocus(opened, filtered.length > 0);
  // Coming back from a game returns to its tile.
  const focusedId = filtered.some(group => group.id === state.lastGame) ? state.lastGame : filtered[0]?.id;
  // A game returned to has to be there to get focus, even past the first page.
  const shown = filtered.slice(0, Math.max(visible, filtered.findIndex(group => group.id === focusedId) + 1));
  const checking = groups.length - groups.filter(group => draft.matches.has(group.id)).length;

  const facts = [
    info?.name ?? 'Opening collection…',
    ...(info?.author ? [`by ${info.author.name}`] : []),
    artworkCount(draft.assets.length),
    filtering ? `${filtered.length} of ${gameCount(groups.length)} shown` : gameCount(groups.length),
    ...(selected.size ? [`${selected.size} selected`] : []),
    ...(!complete && !loadError ? ['Loading…'] : checking ? [`Checking your library: ${groups.length - checking} of ${groups.length}`] : []),
  ];
  const reviewLabel = selected.size
    ? `Apply ${selected.size} Game${selected.size === 1 ? '' : 's'}`
    : 'Apply to My Library';

  return (
    <>
      <PageSpinner loading={!draft.assets.length && !complete && !loadError} />
      <PageToolbar type="grid_p" size={size} onSize={setSize}>
        <DialogButton noFocusRing onClick={openFilter}>Filter</DialogButton>
        <DialogButton
          noFocusRing
          data-collection-apply
          disabled={!complete || !draft.assets.length || checking > 0}
          onClick={() => openReview(
            selected.size ? new Set(selected) : null,
            reviewLabel,
          )}
        >
          {run ? `Applying ${run.done} of ${run.total}…` : reviewLabel}
        </DialogButton>
      </PageToolbar>
      {/* A running batch keeps the collection open. Its Apply button leads back to the progress. */}
      <PageBar onBack={run ? undefined : closeCollection}>{facts.join(' · ')}</PageBar>
      {state.error && <div role="alert" className="sgdb-collection-message">{state.error}</div>}
      {loadError && (
        <div role="alert" className="sgdb-collection-message">
          {loadError}
          <DialogButton onClick={() => { void openCollection(state.collectionId!); }}>Retry</DialogButton>
        </div>
      )}
      <Focusable id="images-container" {...keepColumn} style={gridStyle}>
        {shown.map(group => (
          <GameTile
            key={group.id}
            group={group}
            rows={rows.get(group.id) ?? []}
            state={state}
            focused={takeFocus && group.id === focusedId}
          />
        ))}
        {complete && !filtered.length && (
          <div className="sgdb-collection-message">
            {groups.length ? 'No games match this filter.' : 'This collection has no artwork.'}
          </div>
        )}
        {filtered.length > shown.length && (
          <DialogButton className="sgdb-collection-more" onClick={() => setVisible(shown.length + PAGE_SIZE)}>
            Show More Games
          </DialogButton>
        )}
      </Focusable>
    </>
  );
}
