import { useEffect, useRef, useState } from 'react';
import { Focusable, IconsModule, Menu, MenuItem, showContextMenu } from '@decky/ui';
import { LazyImage } from '../../src/components/asset/LazyImage';
import { CollectionAsset, PublicCollection, SGDBCollection } from '../services/backend';
import { openWebLink } from '../steam/open-web-link';
import { collectionInfo, collectionPage, firstPageType } from './load';
import { artworkCount } from './text';

const PREVIEW_COUNT = 4;

export const isVideoUrl = (url: string) => /\.(webm|mp4)(?:[?#]|$)/i.test(url);

export function CollectionThumbnail({ asset }: { asset: CollectionAsset }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [asset.thumb]);
  if (failed) {
    return (
      <span className="sgdb-collection-media sgdb-collection-media-missing" title="Preview unavailable">
        <IconsModule.Image />
      </span>
    );
  }
  return (
    <LazyImage
      src={asset.thumb}
      isVideo={isVideoUrl(asset.thumb)}
      unloadWhenOutside
      wrapperProps={{ className: 'sgdb-collection-media' }}
      onError={() => setFailed(true)}
      alt=""
    />
  );
}

/** A wide tile showing a few of the collection's artworks. */
export function CollectionCard({ collection, focused, onOpen, onRemove }: {
  collection: SGDBCollection;
  focused: boolean;
  onOpen(): void;
  /** Only for collections added by link. The user's own live on SteamGridDB. */
  onRemove?(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<PublicCollection>();
  const [images, setImages] = useState<CollectionAsset[]>([]);

  // Previews load when a card nears the screen. Opening the card reports any failure.
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const owner = node.ownerDocument.defaultView as typeof window;
    let cancelled = false;
    const load = async () => {
      const overview = await collectionInfo(collection.id);
      if (cancelled) return;
      setInfo(overview);
      const type = firstPageType(overview);
      if (!type) return;
      const page = await collectionPage(collection.id, type, 0);
      if (!cancelled) setImages(page.assets.slice(0, PREVIEW_COUNT));
    };
    const observer = new owner.IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void load().catch(() => {});
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [collection.id]);

  const openMenu = () => {
    if (!root.current) return;
    showContextMenu(
      <Menu label={info?.name ?? collection.name}>
        <MenuItem onSelected={() => { void openWebLink(`https://www.steamgriddb.com/collection/${collection.id}`); }}>
          View Collection on SteamGridDB
        </MenuItem>
        {onRemove && <MenuItem onSelected={onRemove}>Remove from My Collections</MenuItem>}
      </Menu>,
      root.current,
      { bPreferPopLeft: false, bOverlapVertical: true, bShiftToFitWindow: true },
    );
  };

  const total = info ? Object.values(info.counts).reduce((sum, value) => sum + value, 0) : undefined;
  return (
    <div ref={root} className="sgdb-collection-tile">
      <div className="asset-box-wrap">
        <Focusable
          className="image-wrap sgdb-collection-strip"
          autoFocus={focused}
          onActivate={onOpen}
          onOKActionDescription="Open Collection"
          onMenuActionDescription="More"
          onMenuButton={openMenu}
          onContextMenu={event => {
            event.preventDefault();
            openMenu();
          }}
        >
          <div style={{ gridTemplateColumns: `repeat(${Math.max(1, images.length)},minmax(0,1fr))` }}>
            {images.map(asset => <CollectionThumbnail key={asset.id} asset={asset} />)}
          </div>
        </Focusable>
      </div>
      <div className="sgdb-collection-tile-name">{info?.name ?? collection.name}</div>
      {total !== undefined && <div className="sgdb-collection-tile-text">{artworkCount(total)}</div>}
    </div>
  );
}
