// The user's own collections, plus public ones they added by link or ID.
import { useState } from 'react';
import {
  DialogBody, DialogBodyText, DialogButton, DialogFooter, DialogHeader, Focusable, ModalRoot, TextField, showModal,
} from '@decky/ui';
import { CollectionCard } from './collection-card';
import { collectionId } from './load';
import { PageBar, PageSpinner, PageToolbar, useGridSize, useInitialFocus } from './page-parts';
import { CollectionsState, addCollection, addedCollections, loadList, myCollections, openCollection, removeCollection } from './store';
import { keepColumn } from './nav';

function AddCollectionDialog({ closeModal }: { closeModal?: () => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    setError('');
    try {
      await addCollection(collectionId(link));
      closeModal?.();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setAdding(false);
    }
  };
  return (
    <ModalRoot className="sgdb-collection-dialog" closeModal={closeModal} onCancel={closeModal}>
      <DialogHeader>Add a Collection</DialogHeader>
      <DialogBody>
        <TextField
          label="SteamGridDB Collection Link or ID"
          focusOnMount
          value={link}
          onChange={event => setLink(event.target.value)}
        />
        {error && <DialogBodyText role="alert">{error}</DialogBodyText>}
      </DialogBody>
      <DialogFooter>
        <Focusable className="sgdb-collection-actions" flow-children="row" {...keepColumn}>
          <DialogButton onClick={closeModal}>Cancel</DialogButton>
          <DialogButton disabled={adding || !link.trim()} onClick={add}>{adding ? 'Adding…' : 'Add Collection'}</DialogButton>
        </Focusable>
      </DialogFooter>
    </ModalRoot>
  );
}

export function ListView({ state, opened }: { state: CollectionsState; opened: boolean }) {
  const { account, list } = state;
  const [size, setSize, gridStyle] = useGridSize('grid_l');
  const items = myCollections(state);
  const added = new Set(addedCollections(account).map(item => item.id));
  const takeFocus = useInitialFocus(opened, items.length > 0);
  // Coming back from a collection returns to its card.
  const focusedId = items.some(item => item.id === state.lastCollection) ? state.lastCollection : items[0]?.id;
  return (
    <>
      <PageSpinner loading={Boolean(account) && !list.loaded} />
      <PageToolbar type="grid_l" size={size} onSize={setSize}>
        <DialogButton noFocusRing onClick={() => showModal(<AddCollectionDialog />, window)}>Add Collection</DialogButton>
        <DialogButton noFocusRing disabled={!list.loaded} onClick={() => { void loadList(true); }}>Refresh</DialogButton>
      </PageToolbar>
      <PageBar>My Collections</PageBar>
      {list.error && <div role="alert" className="sgdb-collection-message">{list.error}</div>}
      <Focusable id="images-container" {...keepColumn} style={gridStyle}>
        {items.map(item => (
          <CollectionCard
            key={item.id}
            collection={item}
            focused={takeFocus && item.id === focusedId}
            onOpen={() => { void openCollection(item.id); }}
            onRemove={added.has(item.id) && !list.items.some(own => own.id === item.id)
              ? () => { void removeCollection(item.id); }
              : undefined}
          />
        ))}
        {!account && <div className="sgdb-collection-message">Sign in to Steam to browse your collections.</div>}
        {account && list.loaded && !items.length && !list.error && (
          <div className="sgdb-collection-message">You have no collections yet. Add a public one with its link or ID.</div>
        )}
      </Focusable>
    </>
  );
}
