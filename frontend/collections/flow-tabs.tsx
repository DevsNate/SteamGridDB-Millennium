// While a collection is being applied, Steam's top tab bar shows that flow instead of the artwork types.
// LB and RB, their glyphs, the slide and the sound all come with it.
import { useMemo } from 'react';
import { CollectionsTab, CollectionsTabProps } from './collections-tab';
import { buildRows, needsAttention } from './draft';
import {
  CollectionsState, closeReview, goBack, inFlow, openChoices, showChoice, useCollectionsKey,
} from './store';

// Enough to see what's around the current game, without hundreds of tabs on a huge collection.
const MAX_CHOICE_TABS = 31;
const CHOICE_ID = 'choice:';
// Steam opens a tab as soon as it gets focus, so a stray press could leave a page by accident. The steps other than
// the current one are for LB, RB and the mouse, which are always meant.
const notOnFocus = { fnCanTakeFocus: () => false } as object;

type FlowTab = { id: string; title: string } & CollectionsTabProps;

/** Plain data, so the bar only renders again when one of these changes. */
export function describeFlow(state: CollectionsState): { activeTab: string; tabs: FlowTab[] } {
  const { view, choices, choiceKey, gameId, draft, run } = state;
  if (view === 'choose') {
    const at = choices.findIndex(choice => choice.key === choiceKey);
    const count = Math.min(choices.length, MAX_CHOICE_TABS);
    // With fewer choices than the limit this keeps their order. With more, the current one stays in the middle.
    const first = count < choices.length ? at - (count - 1) / 2 + choices.length : 0;
    return {
      activeTab: `${CHOICE_ID}${choiceKey}`,
      tabs: Array.from({ length: count }, (_, offset) => {
        const { key, title } = choices[(first + offset) % choices.length];
        return { id: `${CHOICE_ID}${key}`, title, page: 'choose', rowKey: key };
      }),
    };
  }
  const steps: FlowTab[] = [
    { id: 'collections', title: 'Collection', page: 'overview' },
    { id: 'review', title: 'Review', page: 'review' },
  ];
  if (view === 'game') {
    const title = draft.assets.find(asset => asset.game.id === gameId)?.game.name ?? '';
    return { activeTab: `game:${gameId}`, tabs: [...steps, { id: `game:${gameId}`, title, page: 'game', gameId }] };
  }
  if (!run && buildRows(draft).some(needsAttention)) steps.push({ id: 'choose', title: 'Choose', page: 'choose' });
  return { activeTab: 'review', tabs: steps };
}

const flowKey = (state: CollectionsState) => (inFlow(state) ? JSON.stringify(describeFlow(state)) : '');

function showTab(id: string): void {
  if (id === 'collections') closeReview();
  else if (id === 'review') goBack();
  else if (id === 'choose') openChoices();
  else if (id.startsWith(CHOICE_ID)) showChoice(id.slice(CHOICE_ID.length));
}

/** B on the tab bar goes back like it does on the page. On the first page there's nothing to go back to here. */
const backFromHeader = (event?: Event) => {
  event?.stopPropagation();
  goBack();
};

export function useHeaderBack(onCollections: boolean) {
  // A running batch keeps its collection open, so there's nothing to go back to from there.
  const inside = useCollectionsKey(state => (state.view === 'list' || (state.view === 'overview' && state.run) ? '' : 'inside'));
  return onCollections && inside ? backFromHeader : undefined;
}

/** What the tab bar should show instead of the artwork types, if anything. */
export function useFlowTabs(onCollections: boolean) {
  const key = useCollectionsKey(flowKey);
  const flow = useMemo(() => {
    if (!key) return null;
    const { activeTab, tabs } = JSON.parse(key) as ReturnType<typeof describeFlow>;
    return {
      activeTab,
      onShowTab: showTab,
      onCancelFromTabHeader: backFromHeader,
      // Past the last step isn't the first one. The games being chosen do go around.
      wrapAround: activeTab.startsWith(CHOICE_ID),
      tabs: tabs.map(({ id, title, ...page }) => ({
        id,
        title,
        bTitleAlreadyLocalized: true,
        footer: id === activeTab || id.startsWith(CHOICE_ID) ? undefined : notOnFocus,
        content: <CollectionsTab {...page} />,
      })),
    };
  }, [key]);
  return onCollections ? flow : null;
}
