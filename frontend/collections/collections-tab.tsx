import { useEffect, useRef } from 'react';
import { Focusable } from '@decky/ui';
import t from '../../src/utils/i18n';
import { ChooseView } from './choose-view';
import { GameView } from './game-view';
import { ListView } from './list-view';
import { OverviewView } from './overview-view';
import { ReviewView } from './review-view';
import { CollectionsState, goBack, inFlow, loadList, useCollections } from './store';

// Steam's NoTransform. By default, focusing something mid-slide scrolls to where the slide has it for now, off to
// the right, which drags the whole page sideways and shows a black bar. This scrolls to where it will end up.
// Everything in the tab inherits it, like the contents of Steam's own scrolling panels.
const noSlideScroll = { scrollIntoViewType: 1 } as object;

export type CollectionsTabProps = {
  /** A step of the flow. Steam keeps a step's old page while the next slides in, so each holds on to what it shows. */
  page?: CollectionsState['view'];
  gameId?: number;
  rowKey?: string;
};

export function CollectionsTab({ page, gameId, rowKey }: CollectionsTabProps) {
  const state = useCollections();
  const entered = useRef(false);
  const browsing = useRef(state.view);
  if (!inFlow(state)) browsing.current = state.view;
  const view = page ?? browsing.current;

  // Pages opened from here take focus themselves. Not on entering the tab: Steam is still sliding it
  // in, and taking focus then drags the whole page with it.
  const opened = entered.current || page === 'game';
  const canGoBack = view !== 'list' && !(view === 'overview' && state.run);
  useEffect(() => {
    entered.current = true;
    void loadList();
  }, []);

  return (
    <Focusable
      className="tabcontents-wrap"
      {...noSlideScroll}
      onCancelActionDescription={canGoBack ? t('Button_Back', 'Back', true) : undefined}
      onCancelButton={!canGoBack ? undefined : event => {
        event.stopPropagation();
        goBack();
      }}
    >
      {view === 'list' && <ListView key="list" state={state} opened={opened} />}
      {view === 'overview' && <OverviewView key="overview" state={state} opened={opened} />}
      {view === 'game' && <GameView key={gameId ?? state.gameId} state={state} gameId={gameId ?? state.gameId} opened={opened} />}
      {view === 'review' && <ReviewView key="review" state={state} />}
      {view === 'choose' && <ChooseView key={rowKey} state={state} rowKey={rowKey} />}
    </Focusable>
  );
}
