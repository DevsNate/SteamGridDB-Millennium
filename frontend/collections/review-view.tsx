// The step before writing: what will change, plus options only when they matter. Progress and results stay
// here too. Leaving during a run keeps it going, and the collection's Apply button shows how far it has got.
import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { DialogButton, DialogCheckbox, Focusable, ProgressBar, ToggleField } from '@decky/ui';
import AdaptiveNavGlyph from '../../src/components/AdaptiveNavGlyph';
import Asset from '../../src/components/asset/Asset';
import { isVideoUrl } from './collection-card';
import { Row, RowStatus, allRows, buildRows, isRunnable, needsAttention, typesIn } from './draft';
import { PageBar, PageToolbar, useGridSize } from './page-parts';
import {
  CollectionsState, applyDraft, cancelRun, chooseAgain, closeReview, excludeGame, includeGame, openChoices, openGame, retryScan, setReplace,
  setTypes,
} from './store';
import { artworkCount, artworkNames, gameCount, rowText } from './text';
import { keepColumn } from './nav';

const PAGE_SIZE = 60;
// Steam's glyph numbering, which differs from GamepadButton.
const Y_GLYPH = 3;
// Steam restores a page's last focus 10 ms after its tab opens, so this has to come after that.
const FOCUS_DELAY = 50;

const CHOICE_SECTION = 'Needs a Choice';
const APPLIED_SECTION = 'Applied';
const SECTIONS: { title: string; statuses: RowStatus[]; closed?: boolean }[] = [
  { title: 'Failed', statuses: ['failed'] },
  { title: CHOICE_SECTION, statuses: ['needs-choice', 'collision'] },
  { title: 'To Apply', statuses: ['ready', 'checking'] },
  { title: APPLIED_SECTION, statuses: ['applied'] },
  { title: 'Not Changing', statuses: ['keep-custom', 'leave'], closed: true },
  { title: 'Not in Your Library', statuses: ['no-target'], closed: true },
];

/** What a game's rows do, in one line. */
const rowsText = (rows: Row[]) => [
  rows.map(row => artworkNames[row.type]).join(', '),
  // Rows of one game in one section usually say the same thing, so it's only said once.
  // The section already says a plain ready row is going to be applied, or that an applied one with a choice was.
  ...new Set(rows
    .filter(row => (row.status !== 'ready' || row.hasCustom) && (row.status !== 'applied' || row.candidates.length === 1))
    .map(row => rowText(row).replace(/\.$/, ''))),
].join(' · ');

function GameTile({ rows, editable, excluded, note, focused }: {
  rows: Row[];
  editable: boolean;
  excluded?: boolean;
  note?: string;
  focused: boolean;
}) {
  const { game } = rows[0];
  const toggleLabel = excluded ? 'Include' : 'Exclude';
  const toggle = () => (excluded ? includeGame(game.id) : excludeGame(game.id));
  // The same capsule the collection's grid shows, when this game has one.
  const artwork = rows.find(row => row.type === 'grid_p')?.artwork ?? rows[0].artwork;
  return (
    <div className="sgdb-collection-tile" data-letterbox={artwork.type !== 'grid_p' || undefined}>
      <Asset
        assetType="grid_p"
        autoFocus={focused}
        src={artwork.thumb}
        width={600}
        height={900}
        isAnimated={isVideoUrl(artwork.thumb)}
        onActivate={editable ? () => openGame(game.id, true) : undefined}
        onOKActionDescription={editable ? 'View Artwork' : undefined}
        onOptionsActionDescription={editable ? toggleLabel : undefined}
        onOptionsButton={editable ? toggle : undefined}
      />
      {/* Steam's footer can be hidden, so the tile says this itself. It also gives a mouse something to click.
          Not a Focusable: the grid would count it as a tile, and left and right would stop on it. */}
      {editable && (
        <div className="sgdb-collection-exclude" onClick={toggle}>
          <AdaptiveNavGlyph button={Y_GLYPH} bAllowKeyboard />
          {toggleLabel}
        </div>
      )}
      <div className="sgdb-collection-tile-name">{game.name}</div>
      {note && <div className="sgdb-collection-tile-text">{note}</div>}
    </div>
  );
}

function Section({ title, rows, closed, editable, excluded, action, gridStyle, focusedGame }: {
  title: string;
  rows: Row[];
  closed?: boolean;
  editable: boolean;
  /** Games out of the review, so what their rows would do doesn't apply. */
  excluded?: boolean;
  /** A button on the section's heading line. */
  action?: ReactNode;
  gridStyle: CSSProperties;
  focusedGame?: number;
}) {
  // A game returned to has to be there to get focus, even if its row moved to a closed section or past the first page.
  const [open, setOpen] = useState(!closed || rows.some(row => row.game.id === focusedGame));
  const [visible, setVisible] = useState(PAGE_SIZE);
  const games = useMemo(() => {
    const byGame = new Map<number, Row[]>();
    for (const row of rows) byGame.set(row.game.id, [...(byGame.get(row.game.id) ?? []), row]);
    return [...byGame.values()];
  }, [rows]);
  // When every game says the same thing, the heading says it once.
  const notes = new Set(games.map(rowsText));
  const shared = !excluded && notes.size === 1 ? [...notes][0] : undefined;
  const shown = games.slice(0, Math.max(visible, games.findIndex(group => group[0].game.id === focusedGame) + 1));
  return (
    <section className="sgdb-collection-section">
      <Focusable className="sgdb-collection-section-head" flow-children="row" {...keepColumn}>
        <h3>{title} ({artworkCount(rows.length)}){shared && <span> · {shared}</span>}</h3>
        {action}
        {closed && <DialogButton onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</DialogButton>}
      </Focusable>
      {open && (
        <Focusable id="images-container" {...keepColumn} style={gridStyle}>
          {shown.map(group => (
            <GameTile
              key={group[0].game.id}
              rows={group}
              editable={editable}
              excluded={excluded}
              note={shared || excluded ? undefined : rowsText(group)}
              focused={group[0].game.id === focusedGame}
            />
          ))}
          {games.length > shown.length && (
            <DialogButton className="sgdb-collection-more" onClick={() => setVisible(shown.length + PAGE_SIZE)}>
              Show More Games
            </DialogButton>
          )}
        </Focusable>
      )}
    </section>
  );
}

export function ReviewView({ state }: { state: CollectionsState }) {
  const { draft, run, scanError, error, loadError, reviewTitle, reviewGame, excluded } = state;
  const [size, setSize, gridStyle] = useGridSize('grid_p');
  const rows = useMemo(() => buildRows(draft), [draft]);
  // Whichever artwork types are ticked, so an excluded game can always be brought back.
  const excludedRows = useMemo(() => allRows(draft).filter(row => excluded.has(row.game.id)), [draft, excluded]);
  const available = useMemo(() => typesIn(draft.assets, draft.scope), [draft.assets, draft.scope]);
  const runnable = rows.filter(isRunnable);
  const attention = rows.filter(needsAttention).length;
  const checking = rows.some(row => row.status === 'checking');
  const applied = rows.filter(row => row.status === 'applied').length;
  const failed = rows.filter(row => row.status === 'failed').length;
  const protectedRows = rows.some(row => row.hasCustom && row.status !== 'applied');
  const games = new Set(runnable.map(row => row.game.id)).size;

  const summary = run
    ? `Applying ${run.done} of ${run.total}. Cancel finishes the games in progress and starts no more`
    : scanError
      ? 'Could not check your existing artwork'
      : checking
        ? 'Checking your library…'
        : applied || failed
          ? `${artworkCount(applied)} applied${failed ? `, ${failed} failed` : ''}`
          : runnable.length
            ? `${artworkCount(runnable.length)} for ${gameCount(games)} will change. This has no undo`
            : 'Nothing to apply yet';

  // Back from a game, focus returns to its tile, in the first section that has it.
  const focusSection = SECTIONS.find(section => rows.some(row => row.game.id === reviewGame && section.statuses.includes(row.status)));
  const focusExcluded = reviewGame !== undefined && excluded.has(reviewGame);
  // Otherwise what to do next gets focus once the page is ready: Choose, or else Apply. A disabled button can't hold
  // it, and Steam would pass it on to whatever comes next. Options changing later never move it.
  const choose = useRef<any>(null);
  const apply = useRef<any>(null);
  useEffect(() => {
    const target = attention ? choose : runnable.length ? apply : null;
    if (!target || checking || run || focusSection || focusExcluded) return undefined;
    const timer = setTimeout(() => target.current?.TakeFocus(), FOCUS_DELAY);
    return () => clearTimeout(timer);
  // Only when checking finishes: options changing afterwards must not move focus (see above).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);
  const toggleType = (type: SGDBAssetType, checked: boolean) => {
    setTypes(checked ? [...draft.types, type] : draft.types.filter(value => value !== type));
  };

  // Says what the tiles can do, since it's otherwise only on the one in focus.
  const showHint = !run && !checking && SECTIONS.some(section => !section.closed && rows.some(row => section.statuses.includes(row.status)));

  return (
    <Focusable className="sgdb-collection-review" flow-children="column">
      <PageToolbar type="grid_p" size={size} onSize={setSize}>
        {!run && protectedRows && (
          <div className="sgdb-collection-replace">
            <ToggleField
              label="Replace My Custom Artwork"
              bottomSeparator="none"
              checked={draft.replace}
              onChange={setReplace}
            />
          </div>
        )}
      </PageToolbar>
      <PageBar onBack={closeReview}>
        <span role="status" aria-live="polite">{reviewTitle} · {summary}</span>
      </PageBar>
      {run && <ProgressBar nProgress={run.total ? (run.done / run.total) * 100 : 0} indeterminate={!run.total} />}
      {(error || loadError) && <div role="alert" className="sgdb-collection-message">{error || loadError}</div>}
      {scanError && (
        <Focusable className="sgdb-collection-actions" flow-children="row" {...keepColumn}>
          <div role="alert">Could not check your existing artwork, so nothing can be applied: {scanError}</div>
          <DialogButton onClick={retryScan}>Retry</DialogButton>
        </Focusable>
      )}
      {!run && !checking && available.length > 1 && (
        <Focusable className="sgdb-collection-options" flow-children="row" {...keepColumn}>
          {available.map(type => (
            <DialogCheckbox
              key={type}
              controlled
              checked={draft.types.includes(type)}
              label={artworkNames[type]}
              onChange={checked => toggleType(type, checked)}
            />
          ))}
        </Focusable>
      )}
      {/* One button throughout, so focus stays on it as a run starts and ends. */}
      <Focusable className="sgdb-collection-apply" {...keepColumn}>
        <DialogButton
          {...({ navRef: apply } as object)}
          disabled={run ? run.stopping : checking || !runnable.length}
          onClick={() => { if (run) cancelRun(); else void applyDraft(); }}
        >
          {run
            ? (run.stopping ? 'Stopping…' : 'Cancel')
            : checking && !scanError ? 'Checking…' : `Apply Artwork${runnable.length === 1 ? '' : 's'} (${runnable.length})`}
        </DialogButton>
      </Focusable>
      {showHint && <PageBar>Press <AdaptiveNavGlyph button={Y_GLYPH} bAllowKeyboard /> to exclude a game</PageBar>}
      {!checking && SECTIONS.map(section => {
        const matching = rows.filter(row => section.statuses.includes(row.status));
        return matching.length > 0 && (
          <Section
            key={section.title}
            title={section.title}
            rows={matching}
            closed={section.closed}
            editable={!run}
            gridStyle={gridStyle}
            focusedGame={section === focusSection ? reviewGame : undefined}
            action={run ? undefined
              : section.title === CHOICE_SECTION
                ? <DialogButton {...({ navRef: choose } as object)} onClick={openChoices}>Choose</DialogButton>
                : section.title === APPLIED_SECTION && matching.some(row => row.candidates.length > 1)
                  ? <DialogButton onClick={() => chooseAgain(matching)}>Choose Again</DialogButton>
                  : undefined}
          />
        );
      })}
      {!checking && excludedRows.length > 0 && (
        <Section
          key="excluded"
          title="Excluded"
          rows={excludedRows}
          excluded
          editable={!run}
          gridStyle={gridStyle}
          focusedGame={focusExcluded ? reviewGame : undefined}
        />
      )}
    </Focusable>
  );
}
