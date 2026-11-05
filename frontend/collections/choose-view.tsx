// One decision on one page. The top tab bar holds the games, so LB and RB move between them.
import { useMemo } from 'react';
import { DialogButton, Focusable } from '@decky/ui';
import { ArtworkPicker } from './artwork-picker';
import { buildRows } from './draft';
import { PageBar, PageToolbar, useGridSize } from './page-parts';
import { CollectionsState, closeChoices, goBack, nextChoice, pickFirstForRest, setChoiceFocus, setPick } from './store';
import { artworkNames, rowText } from './text';

// Steam's numbering for its gamepad buttons.
const BUMPER_LEFT = 5;
const BUMPER_RIGHT = 6;

export function ChooseView({ state, rowKey }: { state: CollectionsState; rowKey?: string }) {
  const { draft, choices, choiceFocus } = state;
  const rows = useMemo(() => buildRows(draft), [draft]);
  const row = rows.find(value => value.key === rowKey);
  const [size, setSize, gridStyle] = useGridSize(row?.type ?? 'grid_p');
  if (!row) return null;

  const position = choices.findIndex(choice => choice.key === row.key) + 1;
  // The event carries on to the tab bar. This only notes where focus should land on the next game.
  const onBumper = (event: CustomEvent<{ button: number }>) => {
    if (event.detail.button !== BUMPER_LEFT && event.detail.button !== BUMPER_RIGHT) return;
    setChoiceFocus((event.target as Element).closest('.sgdb-collection-tile') ? 'tile' : 'button');
  };

  return (
    <Focusable flow-children="column" onButtonDown={onBumper}>
      <PageToolbar type={row.type} size={size} onSize={setSize}>
        <DialogButton
          noFocusRing
          autoFocus={choiceFocus === 'button'}
          onClick={() => {
            setPick(row.key, { action: 'leave' });
            nextChoice('button');
          }}
        >
          Leave Unchanged
        </DialogButton>
        {rows.some(value => value.status === 'needs-choice') && (
          <DialogButton
            noFocusRing
            onClick={() => {
              pickFirstForRest(rows);
              closeChoices();
            }}
          >
            Use First for the Rest
          </DialogButton>
        )}
        <DialogButton noFocusRing onClick={closeChoices}>Done</DialogButton>
      </PageToolbar>
      <PageBar onBack={goBack}>{position} of {choices.length} · {row.game.name}: {artworkNames[row.type]}</PageBar>
      {row.status === 'collision' && <div role="status" className="sgdb-collection-message">{rowText(row)}</div>}
      <ArtworkPicker
        row={row}
        gridStyle={gridStyle}
        takeFocus={choiceFocus === 'tile'}
        onPicked={() => nextChoice('tile')}
      />
    </Focusable>
  );
}
