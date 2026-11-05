// A grid of one row's candidates. Selecting only updates the draft; Details is what writes right away.
import { CSSProperties, useState } from 'react';
import { DialogButton, Focusable, showModal } from '@decky/ui';
import Asset from '../../src/components/asset/Asset';
import DetailsModal from '../../src/modals/DetailsModal';
import { readSetting } from '../settings/store';
import { isVideoUrl } from './collection-card';
import type { Row } from './draft';
import type { CollectionArtwork } from './load';
import { applyNow, setPick, unselect } from './store';
import { artworkNames } from './text';
import { keepColumn } from './nav';

const PAGE_SIZE = 60;

export function ArtworkPicker({ row, gridStyle, takeFocus, locked, onPicked }: {
  row: Row;
  gridStyle?: CSSProperties;
  takeFocus?: boolean;
  /** A batch is running, so the tiles can be looked at but not chosen. */
  locked?: boolean;
  onPicked?(): void;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const hideAuthors = readSetting('hide_authors', true) === true;
  const inUse = row.chosen && row.status !== 'leave' && row.status !== 'keep-custom';
  // The artwork in use has to be there to get focus, even past the first page.
  const shown = row.candidates.slice(0, Math.max(visible, row.candidates.findIndex(artwork => artwork.id === row.artwork.id) + 1));
  const showDetails = (artwork: CollectionArtwork) => showModal(
    <DetailsModal
      asset={artwork}
      assetType={artwork.type}
      assetProps={{ isAnimated: isVideoUrl(artwork.url) }}
      onAssetChange={() => applyNow(row.game.id, artwork)}
    />,
    window,
  );

  return (
    <Focusable id="images-container" {...keepColumn} style={gridStyle}>
      {shown.map(artwork => {
        const selected = inUse && row.artwork.id === artwork.id;
        return (
          <div className="sgdb-collection-tile" data-selected={selected || undefined} key={artwork.id}>
            <Asset
              assetType={artwork.type}
              autoFocus={takeFocus && artwork.id === row.artwork.id}
              src={artwork.thumb}
              width={artwork.width}
              height={artwork.height}
              author={hideAuthors ? undefined : artwork.author}
              notes={artwork.notes}
              nsfw={artwork.nsfw}
              humor={artwork.humor}
              epilepsy={artwork.epilepsy}
              isAnimated={isVideoUrl(artwork.thumb)}
              onActivate={locked ? undefined : () => {
                if (selected) {
                  unselect(row);
                  return;
                }
                setPick(row.key, { action: 'use', artworkId: artwork.id });
                onPicked?.();
              }}
              onOKActionDescription={locked ? undefined : selected ? 'Unselect' : `Use This ${artworkNames[artwork.type]}`}
              onMenuActionDescription="Details"
              onMenuButton={() => showDetails(artwork)}
              onContextMenu={event => {
                event.preventDefault();
                showDetails(artwork);
              }}
            />
          </div>
        );
      })}
      {row.candidates.length > shown.length && (
        <DialogButton className="sgdb-collection-more" onClick={() => setVisible(shown.length + PAGE_SIZE)}>
          Show More Artwork
        </DialogButton>
      )}
    </Focusable>
  );
}
