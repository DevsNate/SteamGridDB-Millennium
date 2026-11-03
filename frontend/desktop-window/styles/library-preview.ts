import { defaultAppImageDataUrl } from '../../services/plugin-assets';

// Compatibility sizing adapted from SteamGridDB/decky-steamgriddb, src/styles/style.scss.
// A function, so the CSS picks up the backdrop once the bundled assets have loaded.
export const libraryPreviewStyles = () => `
@layer sgdb-presentation {
  /* Upstream backs icon and logo tiles with /images/defaultappimage.png so
     the chips stay hidden behind them; Steam on Windows doesn't ship it, so
     we embed the Deck's copy. */
  #sgdb-wrap .image-wrap.type-icon > .thumb,
  #sgdb-wrap .image-wrap.type-logo > .thumb {
    background: url('${defaultAppImageDataUrl}') center center / cover !important;
  }

  /* The same missing image leaves other tiles empty, so give them a solid
     base and a soft shimmer until their artwork arrives. */
  #sgdb-wrap .image-wrap {
    background-color: #1b2530 !important;
  }

  #sgdb-wrap .image-wrap > .thumb[data-media-loading="true"] {
    overflow: hidden;
  }

  #sgdb-wrap .image-wrap > .thumb[data-media-loading="true"]::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.07) 50%, transparent 70%);
    transform: translateX(-100%);
    animation: sgdb-tile-shimmer 1.4s linear infinite;
  }

  @keyframes sgdb-tile-shimmer {
    to { transform: translateX(100%); }
  }

  /* Scrolling under a still cursor can leave one tile hovered and another
     focused. They'd tie, and the later one would cover the earlier one's tags. */
  #sgdb-wrap .image-wrap:hover {
    z-index: 10006 !important;
  }

  #sgdb-wrap .chips .chip {
    color: var(--chip-text-color, #fff) !important;
  }

  #sgdb-wrap #local-images-container .asset-wrap-logo > .Panel {
    flex: 1 1 auto !important;
    min-height: 120px !important;
  }

  #sgdb-wrap #local-images-container .asset-wrap-logo .asset {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    min-height: 120px !important;
  }

  #sgdb-wrap #local-images-container .asset-wrap-logo .asset-img {
    box-sizing: border-box !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    padding: 12px !important;
    margin: 0 !important;
    object-fit: contain !important;
    transform: none !important;
  }
}
`;
